//
//  HPPadCacheController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadCacheController.h"

// #define UPDATE_SNIPPETS 1

#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>

#import <GoogleToolbox/GTMOAuthAuthentication.h>
#import <TestFlight/TestFlight.h>
#import <AppleSampleCode/Reachability.h>

#if UPDATE_SNIPPETS
#import <UIKit/UIKit.h>
#endif

static NSString * const ClientVarsLastEditedDateKey = @"clientVarsLastEditedDate";
static NSString * const HasMissedChangesKey = @"hasMissedChanges";
static NSString * const LastEditedDateKey = @"lastEditedDate";

static NSString * const LastEditedDateHeader = @"X-Hackpad-LastEditedDate";

// #define UPDATE_SEARCH_TEXT 1

typedef void(^cache_action_block)(id, NSError *);

@interface HPPadCacheController () <NSFetchedResultsControllerDelegate, HPPadWebControllerCollabClientDelegate>

@property (nonatomic, strong) HPCoreDataStack *coreDataStack;
@property (nonatomic, strong) HPPadWebController *padWebController;
@property (nonatomic, strong) NSFetchedResultsController *results;
@property (nonatomic, strong) NSManagedObjectContext *managedObjectContext;
@property (nonatomic, strong) NSMutableSet *badPads;
@property (nonatomic, strong) NSCountedSet *editingPads;
@property (nonatomic, strong) NSMutableSet *ignoredPads;
@property (nonatomic, strong) NSURLRequest *request;
@property (nonatomic, copy) cache_action_block missedChangesHandler;
@property (nonatomic, strong) id reachabilityObserver;
@property (nonatomic, strong) id saveObserver;
@property (nonatomic, strong) id signInObserver;
@property (nonatomic, assign) NSUInteger currentRequestID;
@property (nonatomic, assign) BOOL requestPending;
@property (nonatomic, assign) BOOL rebuildPredicateWhenIdle;

- (void)queueRequest;

@end

@implementation HPPadCacheController

@synthesize disabled = _disabled;

+ (id)sharedPadCacheController
{
    static HPPadCacheController *cacheController;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        cacheController = [[self alloc] init];
    });
    return cacheController;
}

- (id)init
{
    self = [super init];
    if (self) {
        _badPads = [NSMutableSet set];
        _editingPads = [NSCountedSet set];
        _ignoredPads = [NSMutableSet set];
        _disabled = YES;
    }
    return self;
}

- (void)dealloc
{
    if (_signInObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_signInObserver];
    }
    if (_saveObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_saveObserver];
    }
    if (_reachabilityObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_reachabilityObserver];
    }
}

+ (NSPredicate *)invalidPadIDPredicate
{
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithBlock:^BOOL(HPPad *pad, NSDictionary *bindings) {
            return pad.padID && ![NSURL URLWithString:pad.padID];
        }];
    });
    return predicate;
}

+ (NSPredicate *)needsPadIDPredicate
{
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithFormat:@"padID == nil"];
    });
    return predicate;
}

+ (NSPredicate *)hasMissedChangesPredicate
{
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithFormat:@"hasMissedChanges == YES"];
    });
    return predicate;
}

+ (NSPredicate *)needsRevisionsPredicate
{
    // 413316657 = 2014-02-05 18:10:57 +0000
    // authorLastEditedDate will be 0, but we don't want to force everyone to
    // update everything when upgrading, so just do pads in the last week.
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithFormat:@"(authorName == nil && authorNames == nil) OR (authorPic == nil && snippetUserPics == nil) OR (authorLastEditedDate < lastEditedDate && lastEditedDate > %@)", [NSDate dateWithTimeIntervalSinceReferenceDate:413316657]];
    });
    return predicate;
}

+ (NSPredicate *)needsClientVarsPredicate
{
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithFormat:@"editor == nil OR editor.clientVarsLastEditedDate == nil OR editor.clientVarsLastEditedDate < lastEditedDate"];
    });
    return predicate;
}

#if UPDATE_SEARCH_TEXT
+ (NSPredicate *)needsSearchTextPredicate
{
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithFormat:@"search == nil"];
    });
    return predicate;
}
#endif

+ (NSPredicate *)needsImagesUploadedPredicate
{
    static NSPredicate *predicate;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        predicate = [NSPredicate predicateWithFormat:@"ANY imageUploads.attachmentID != nil"];
    });
    return predicate;
}

- (void)buildPredicateAndPerformFetch
{
    NSPredicate *predicate;
    predicate = [NSCompoundPredicate orPredicateWithSubpredicates:@[[self.class hasMissedChangesPredicate],
                                                                    [self.class needsClientVarsPredicate],
                                                                    [self.class needsRevisionsPredicate],
#if UPDATE_SEARCH_TEXT
                                                                    [self.class needsSearchTextPredicate]
#endif
                                                                    ]];
    NSPredicate *editing = [NSPredicate predicateWithFormat:@"NOT SELF IN %@", self.editingPads];
    predicate = [NSCompoundPredicate andPredicateWithSubpredicates:@[editing, predicate]];
    predicate = [NSCompoundPredicate orPredicateWithSubpredicates:@[[self.class needsPadIDPredicate],
                                                                    [self.class needsImagesUploadedPredicate],
                                                                    predicate]];
    self.results.fetchRequest.predicate = predicate;
    NSSet *pads = [self.badPads setByAddingObjectsFromSet:self.ignoredPads];
    if (pads.count) {
        NSArray *subpredicates = @[[NSPredicate predicateWithFormat:@"NOT SELF IN %@", pads],
                                   self.results.fetchRequest.predicate];
        self.results.fetchRequest.predicate = [NSCompoundPredicate andPredicateWithSubpredicates:subpredicates];
    }
    self.rebuildPredicateWhenIdle = NO;
    NSError *__autoreleasing error;
    if ([self.results performFetch:&error]) {
        [self queueRequest];
    } else {
        TFLog(@"Could not initialize cache: %@", error);
    }
}

- (void)setCoreDataStack:(HPCoreDataStack *)coreDataStack
{
    NSParameterAssert([[NSOperationQueue currentQueue] isEqual:[NSOperationQueue mainQueue]]);
    NSAssert(!_managedObjectContext, @"coreDataStack already set.");

    _coreDataStack = coreDataStack;
    self.managedObjectContext = coreDataStack.mainContext;

    HPPadCacheController * __weak weakSelf = self;
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    self.signInObserver = [nc addObserverForName:HPAPIDidSignInNotification
                                          object:nil
                                           queue:nil
                                      usingBlock:^(NSNotification *note)
                           {
                               HPPadCacheController *strongSelf = weakSelf;
                               if (strongSelf) {
                                   [strongSelf->_managedObjectContext performBlock:^{
                                       NSPredicate *pred = [NSPredicate predicateWithBlock:^BOOL(NSManagedObjectID *objectID, NSDictionary *bindings) {
                                           HPPad *pad = (HPPad *)[strongSelf->_managedObjectContext existingObjectWithID:objectID
                                                                                                                   error:nil];
                                           if (pad.space.API == note.object) {
                                               strongSelf->_rebuildPredicateWhenIdle = YES;
                                               return NO;
                                           }
                                           return YES;
                                       }];
                                       [strongSelf->_badPads filterUsingPredicate:pred];
                                       [strongSelf queueRequest];
                                   }];
                               }
                           }];
    self.reachabilityObserver = [nc addObserverForName:kReachabilityChangedNotification
                                                object:nil
                                                 queue:nil
                                            usingBlock:^(NSNotification *note)
                                 {
                                     HPPadCacheController *strongSelf = weakSelf;
                                     Reachability *reachability = note.object;
                                     if (reachability.currentReachabilityStatus && strongSelf) {
                                         [strongSelf->_managedObjectContext performBlock:^{
                                             NSPredicate *pred = [NSPredicate predicateWithBlock:^BOOL(NSManagedObjectID *objectID, NSDictionary *bindings) {
                                                 HPPad *pad = (HPPad *)[strongSelf->_managedObjectContext existingObjectWithID:objectID
                                                                                                                         error:nil];
                                                 if (pad.space.API.reachability == reachability) {
                                                     strongSelf->_rebuildPredicateWhenIdle = YES;
                                                     return NO;
                                                 }
                                                 return YES;
                                             }];
                                             [strongSelf->_badPads filterUsingPredicate:pred];
                                             [strongSelf queueRequest];
                                         }];
                                     }
                                 }];

    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetch.fetchBatchSize = 12;
    fetch.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:HasMissedChangesKey
                                                            ascending:NO],
                              [NSSortDescriptor sortDescriptorWithKey:LastEditedDateKey
                                                            ascending:NO]];
    fetch.shouldRefreshRefetchedObjects = YES;
    _results = [[NSFetchedResultsController alloc] initWithFetchRequest:fetch
                                                   managedObjectContext:_managedObjectContext
                                                     sectionNameKeyPath:nil
                                                              cacheName:nil];
    _results.delegate = self;
    [self buildPredicateAndPerformFetch];
}

- (void)setDisabled:(BOOL)disabled
{
    HPLog(@"Setting cache controller disabled: %d", (int)disabled);
    @synchronized (self) {
        _disabled = disabled;
        if (!_disabled) {
            __weak HPPadCacheController *weakSelf = self;
            [_managedObjectContext performBlock:^{
                [weakSelf queueRequest];
            }];
        }
    }
}

- (BOOL)isDisabled
{
    BOOL ret;
    @synchronized (self) {
        ret = _disabled;
    }
    return ret;
}

- (void)setPad:(HPPad *)pad
       editing:(BOOL)editing
{
    NSManagedObjectID *objectID = pad.objectID;
    [self.managedObjectContext performBlock:^{
        if (editing) {
            [_editingPads addObject:objectID];
        } else {
            [_editingPads removeObject:objectID];
        }
        [self buildPredicateAndPerformFetch];
    }];
}

- (HPPad *)firstSignedInPad
{
    NSUInteger idx = [_results.fetchedObjects indexOfObjectPassingTest:^BOOL(HPPad *pad, NSUInteger idx, BOOL *stop) {
        return pad.space.API.isSignedIn &&
            ![_badPads member:pad.objectID] &&
            ![_ignoredPads member:pad.objectID];
    }];
    return idx == NSNotFound ? nil : [_results.fetchedObjects objectAtIndex:idx];
}

- (void)addBadPad:(HPPad *)pad
            error:(NSError *)error
{
    TFLog(@"[%@] Adding bad pad %@: %@", pad.URL.host, pad.padID, error);
    [_badPads addObject:pad.objectID];
    _rebuildPredicateWhenIdle = YES;
}

- (void)applyMissedChangesWithPad:(HPPad *)pad
                       completion:(cache_action_block)handler
{
    TFLog(@"[%@] Applying offline changes for %@...", pad.URL.host, pad.padID);
    self.missedChangesHandler = handler;
    self.padWebController = [HPPadWebController sharedPadWebControllerWithPad:pad];
    self.padWebController.collabClientDelegate = self;
    [self.padWebController loadWithCompletion:^(NSError *error) {
        if (error) {
            handler(nil, error);
        }
    }];
}

- (void)uploadImagesWithPad:(HPPad *)pad
                 completion:(cache_action_block)handler
{
    static NSString * const HTTPSecureScheme = @"https";
    static NSString * const HackpadAttachmentsCloudfrontHost = @"dchtm6r471mui.cloudfront.net";

    HPImageUpload *image = [pad.imageUploads anyObject];
    TFLog(@"[%@] Uploading attachment %@ to %@...", pad.URL.host,
          image.attachmentID, image.URL);

    // When the upload is complete, the image will be deleted, so save these;
    NSString *attachmentID = image.attachmentID;
    NSURL *URL = image.URL;
    NSString *key = image.key;
    NSString *contentType = image.contentType;
    NSData *imageData = image.image;

    HPPadCacheController * __weak weakSelf = self;
    [image uploadWithCompletion:^(NSError *error) {
        if (error) {
            TFLog(@"[%@] Could not upload image %@: %@", pad.URL.host,
                  image.attachmentID, error);
            handler(nil, error);
            return;
        }
        weakSelf.padWebController = [HPPadWebController sharedPadWebControllerWithPad:pad];
        [weakSelf.padWebController loadWithCompletion:^(NSError *error) {
            if (error) {
                weakSelf.padWebController = nil;
                handler(nil, error);
                    return;
            }
            NSURL *cacheURL = [[NSURL alloc] initWithScheme:HTTPSecureScheme
                                                       host:HackpadAttachmentsCloudfrontHost
                                                       path:URL.path];
            NSURLRequest *request = [NSURLRequest requestWithURL:cacheURL];
            NSURLResponse *response = [[NSURLResponse alloc] initWithURL:cacheURL
                                                                MIMEType:contentType
                                                   expectedContentLength:imageData.length
                                                        textEncodingName:nil];
            [HPStaticCachingURLProtocol cacheResponse:response
                                                 data:imageData
                                              request:request];
            [weakSelf.padWebController updateAttachmentWithID:attachmentID
                                                          URL:URL
                                                          key:key
                                                   completion:^{
                                                       handler(nil, nil);
                                                   }];
        }];
    }];
}

- (BOOL)performCacheActionWithPad:(HPPad *)pad
                        predicate:(NSPredicate *)predicate
                            block:(void (^)(cache_action_block))handler
{
    if (![predicate evaluateWithObject:pad]) {
        return NO;
    }
    NSUInteger request = ++_currentRequestID;
    _requestPending = YES;
    HPPadCacheController * __weak weakSelf = self;
    handler(^(id result, NSError *error) {
        HPPadCacheController *strongSelf = weakSelf;
        if (!strongSelf) {
            return;
        }
        BOOL evaluated = [predicate evaluateWithObject:pad];
        if (strongSelf->_currentRequestID == request) {
            if (error || evaluated) {
                [strongSelf addBadPad:pad
                                error:error];
            }
            strongSelf->_requestPending = NO;
            [strongSelf queueRequest];
        }
    });
    return YES;
}

- (void)queueRequest
{
    if (_requestPending) {
        return;
    }
    @synchronized (self) {
        if (_disabled) {
            return;
        }
    }
    HPPad * __block pad;
    HPPadCacheController * __weak weakSelf = self;
    NSArray *predicates = @[[[self class] invalidPadIDPredicate],
                            [[self class] needsPadIDPredicate],
                            [[self class] needsImagesUploadedPredicate],
                            [[self class] hasMissedChangesPredicate],
                            [[self class] needsClientVarsPredicate],
                            [[self class] needsRevisionsPredicate],
#if UPDATE_SEARCH_TEXT
                            [[self class] needsSearchTextPrefix]
#endif
                            ];
    NSArray *blocks = @[
                        ^(cache_action_block completion) {
                            TFLog(@"[%@] Deleting invalid pad: %@", pad.space.URL.host, pad.padID);
                            [pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
                                [pad.managedObjectContext deleteObject:pad];
                            } completion:completion];
                        },
                         ^(cache_action_block completion) {
                             [pad getPadIDWithCompletion:completion];
                         },
                         ^(cache_action_block completion) {
                             [weakSelf uploadImagesWithPad:pad
                                                completion:completion];
                         },
                         ^(cache_action_block completion) {
                             //[pad applyMissedChangesWithCompletion:completion];
                             [weakSelf applyMissedChangesWithPad:pad
                                                      completion:completion];
                         },
                         ^(cache_action_block completion) {
                             [pad requestClientVarsWithRefresh:YES
                                                    completion:completion];
                         },
                         ^(cache_action_block completion) {
                             [pad requestAuthorsWithCompletion:completion];
                         },
#if UPDATE_SEARCH_TEXT
                         ^(cache_action_block completion) {
                             [pad requestContentWithCompletion:completion];
                         }
#endif
                         ];
    while ((pad = [self firstSignedInPad])) {
        for (NSUInteger i = 0; i < predicates.count; i++) {
            if ([self performCacheActionWithPad:pad
                                      predicate:predicates[i]
                                          block:blocks[i]]) {
                return;
            }
        }
        if (![_ignoredPads member:pad.objectID]) {
            TFLog(@"[%@] Ignoring pad: %@", pad.URL.host, pad.debugDescription);
            [_ignoredPads addObject:pad.objectID];
        }
        _rebuildPredicateWhenIdle = YES;
    }
    if (_rebuildPredicateWhenIdle) {
        [self buildPredicateAndPerformFetch];
    }
}

#pragma mark - Fetched results delegate

- (void)controller:(NSFetchedResultsController *)controller
   didChangeObject:(NSManagedObject *)anObject
       atIndexPath:(NSIndexPath *)indexPath
     forChangeType:(NSFetchedResultsChangeType)type
      newIndexPath:(NSIndexPath *)newIndexPath
{
//    HPLog(@"%s", __PRETTY_FUNCTION__);
    switch (type) {
    case NSFetchedResultsChangeDelete:
        if ([_badPads member:anObject.objectID]) {
            [_badPads removeObject:anObject.objectID];
            _rebuildPredicateWhenIdle = YES;
        }
        // fall through
    case NSFetchedResultsChangeUpdate:
    case NSFetchedResultsChangeMove:
        if ([_ignoredPads member:anObject.objectID]) {
            [_ignoredPads removeObject:anObject.objectID];
            _rebuildPredicateWhenIdle = YES;
        }
        break;
    }
}

- (void)controllerDidChangeContent:(NSFetchedResultsController *)controller
{
//    HPLog(@"%s", __PRETTY_FUNCTION__);
    if (_rebuildPredicateWhenIdle) {
        [self buildPredicateAndPerformFetch];
    } else {
        [self queueRequest];
    }
}

#pragma mark - Web view delegate
#if UPDATE_SNIPPETS
- (void)webViewDidFinishLoad:(UIWebView *)webView
{
    CGFloat expandedHeight = 0;
    CGFloat height = 0;
    for (UIView *view in webView.scrollView.subviews) {
        if ([view isKindOfClass:[UIImageView class]]) {
            continue;
        }
        [view layoutIfNeeded];
        height = expandedHeight = view.frame.size.height;
        if (height > 160) {
            height = [webView hp_stringByEvaluatingJavaScriptNamed:@"GetSnippetHeight.js"].floatValue;
        }
        break;
    }

    [managedObjectContext performBlock:^{
        NSAssert(snippetPad, @"No snippet pad available.");
        if (height) {
            snippetPad.expandedSnippetHeight = expandedHeight;
            snippetPad.snippetHeight = height;
            HPLog(@"[%@] %@ %@ -> %f, %f", snippetPad.URL.host,
                  snippetPad.padID, snippetPad.title,
                  (double)snippetPad.snippetHeight,
                  (double)snippetPad.expandedSnippetHeight);
        }
        if (snippetHTML) {
            snippetPad.snippetHTML = snippetHTML;
            snippetPad.snippetUserPics = snippetUserPics;
        }
        NSError * __autoreleasing error;
        if (![managedObjectContext save:&error]) {
            TFLog(@"[%@] Could not save snippet for %@: %@",
                  snippetPad.URL.host, snippetPad.padID, error);
            abort();
        }

        _request = nil;
        snippetHTML = nil;
        snippetUserPics = nil;
        snippetPad = nil;

        [self queueRequest];
    }];
}
#endif

#pragma mark - Pad Web Controller Collab Client delegate

- (void)padWebControllerCollabClientDidSynchronize:(HPPadWebController *)padWebController
{
    TFLog(@"[%@] Offline synchronization for %@ succeeded, saving changes.",
          padWebController.pad.URL.host, padWebController.pad.padID);
    HPPadCacheController * __weak weakSelf = self;
    [padWebController saveClientVarsAndTextWithCompletion:^{
        TFLog(@"[%@] Offline synchronization for %@ complete.",
              padWebController.pad.URL.host, padWebController.pad.padID);
        padWebController.delegate = nil;
        weakSelf.padWebController = nil;
        weakSelf.missedChangesHandler(nil, nil);
    }];
}

- (void)padWebController:(HPPadWebController *)padWebController
collabClientDidDisconnectWithUncommittedChanges:(BOOL)hasUncommittedChanges
{
    TFLog(@"[%@] Offline synchronization for %@ failed.",
          padWebController.pad.URL.host, padWebController.pad.padID);
    padWebController.delegate = nil;
    self.padWebController = nil;
    self.missedChangesHandler(nil, nil);
}

@end
