//
//  HPPadSynchronizer.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPPadSynchronizer.h"

#import <HackpadKit/HackpadKit.h>

#import <TestFlight/TestFlight.h>

static NSString * const TitleKey = @"title";

@interface HPPadSynchronizer ()
@property (nonatomic, assign) HPPadSynchronizerMode padSynchronizerMode;
@property (nonatomic, strong) HPSpace *space;
@property (nonatomic, copy) NSString *padIDKey;
@end

@implementation HPPadSynchronizer

- (id)initWithSpace:(HPSpace *)space
           padIDKey:(NSString *)padIDKey
padSynchronizerMode:(HPPadSynchronizerMode)padSynchronizerMode
{
    NSParameterAssert(space);
    NSParameterAssert(padIDKey);
    NSParameterAssert(padSynchronizerMode >= HPDefaultPadSynchronizerMode &&
                      padSynchronizerMode <= HPCollectionInfoPadSynchronizer);
    if (!(self = [super init])) {
        return nil;
    }
    self.space = space;
    self.padIDKey = padIDKey;
    self.padSynchronizerMode = padSynchronizerMode;
    return self;
}

- (NSFetchRequest *)fetchRequestWithObjects:(NSArray *)objects
                                      error:(NSError *__autoreleasing *)error
{
    static NSString * const PadIDKey = @"padID";

    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetchRequest.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:PadIDKey
                                                                   ascending:YES]];
    fetchRequest.fetchBatchSize = 64;

    switch (self.padSynchronizerMode) {
        case HPFollowedPadsPadSynchronizerMode:
        case HPCollectionInfoPadSynchronizer:
            fetchRequest.predicate = [NSPredicate predicateWithFormat:@"space == %@ && padID != nil", self.space];
            break;

        case HPDefaultPadSynchronizerMode: {
            NSMutableSet *padIDs = [NSMutableSet setWithCapacity:objects.count];
            [objects enumerateObjectsUsingBlock:^(NSDictionary *pad, NSUInteger idx, BOOL *stop) {
                if ([pad isKindOfClass:[NSDictionary class]]) {
                    [padIDs addObject:pad[self.padIDKey]];
                }
            }];
            fetchRequest.predicate = [NSPredicate predicateWithFormat:@"space == %@ && padID IN %@", self.space, padIDs];
            break;
        }
        default:
            return nil;
    }
    return fetchRequest;
}

- (NSArray *)objectsSortDescriptors
{
    return @[[NSSortDescriptor sortDescriptorWithKey:self.padIDKey
                                           ascending:YES]];
}

- (NSComparisonResult)compareObject:(NSDictionary *)object
                     existingObject:(HPPad *)existingObject
{
    if (!existingObject.padID) {
        return NSOrderedAscending;
    }
    if (![object isKindOfClass:[NSDictionary class]]) {
        return NSOrderedDescending;
    }
    NSString *padID = object[self.padIDKey];
    if (![padID isKindOfClass:[NSString class]]) {
        return NSOrderedDescending;
    }
    // HPLog(@"obj %@ (%@) / existing %@ (%@)...", padID, object[TitleKey], existingObject.padID, existingObject.title);
    return [padID compare:existingObject.padID];
}

- (BOOL)updateExistingObject:(HPPad *)pad
                      object:(NSDictionary *)JSONPad
{
    static NSString * const LastEditedDateKey = @"lastEditedDate";
    static NSString * const FollowedKey = @"followed";
    static NSString * const EditorKey = @"editor";

    if (![JSONPad isKindOfClass:[NSDictionary class]]) {
        return NO;
    }
    NSString *padID = JSONPad[self.padIDKey];
    // Some pad IDs exist with non-encoded URIs; skip them since
    // we can't actually access them anyway.
    if (![NSURL URLWithString:padID]) {
        TFLog(@"[%@ %@] Ignoring invalid padID", self.space.URL.host, padID);
        [pad.managedObjectContext deleteObject:pad];
        return NO;
    }

    NSTimeInterval lastEdited = [JSONPad[LastEditedDateKey] longLongValue] - NSTimeIntervalSince1970;
    if (lastEdited > pad.lastEditedDate) {
        pad.lastEditedDate = lastEdited;
    }

    NSString *title = JSONPad[TitleKey];
    if (!title) {
        title = @"Untitled";
    }
    if (![title isEqualToString:pad.title]) {
        pad.title = title;
    }
    if (self.padSynchronizerMode == HPFollowedPadsPadSynchronizerMode) {
        NSNumber *val = JSONPad[FollowedKey];
        BOOL followed = [val isKindOfClass:[NSNumber class]] && val.boolValue;
        if (pad.followed != followed) {
            pad.followed = followed;
        }
    }
    if (self.editorNames) {
        NSNumber *editor = JSONPad[EditorKey];
        if ([editor isKindOfClass:[NSNumber class]]) {
            if (editor.unsignedIntegerValue < self.editorNames.count) {
                NSString *editorName = self.editorNames[editor.unsignedIntegerValue];
                if (![pad.authorName isEqual:editorName]) {
                    pad.authorName = editorName;
                    pad.authorLastEditedDate = pad.lastEditedDate;
                }
            }
            if (editor.unsignedIntegerValue < self.editorPics.count) {
                NSString *editorPic = self.editorPics[editor.unsignedIntegerValue];
                if (![editorPic isKindOfClass:[NSString class]]) {
                    editorPic = @"/static/img/nophoto.png";
                }
                if (![pad.authorPic isEqual:editorPic]) {
                    pad.authorPic = editorPic;
                    pad.authorLastEditedDate = pad.lastEditedDate;
                }
            }
        }
    } else {
        if (pad.authorNames) {
            pad.authorName = [pad.authorNames firstObject];
            if (!pad.authorName) {
                pad.authorName = @"Someone";
            }
            pad.authorNames = nil;
        }
        if (pad.snippetUserPics) {
            pad.authorPic = [[pad.snippetUserPics firstObject] absoluteString];
            if (!pad.authorPic) {
                pad.authorPic = @"/static/img/nophoto.png";
            }
            pad.snippetUserPics = nil;
        }
    }
    if (pad.padID) {
        return YES;
    }

    pad.padID = padID;
    pad.space = self.space;
    return YES;
}

- (void)existingObjectNotFound:(HPPad *)pad
{
    if (self.padSynchronizerMode != HPFollowedPadsPadSynchronizerMode) {
        return;
    }
    pad.followed = NO;
}

@end
