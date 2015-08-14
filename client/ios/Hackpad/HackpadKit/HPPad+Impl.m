//
//  HPPad+Impl.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPad+Impl.h"

#import "HackpadKit.h"
#import "HackpadUIAdditions.h"

#import <FacebookSDK/FacebookSDK.h>
#import <TestFlight/TestFlight.h>
#import "GTMOAuthAuthentication.h"

NSString * const HPPadDidGetGlobalPadIDNotification = @"HPPadDidGetGlobalPadIDNotification";
NSString * const HPGlobalPadIDKey = @"HPGlobalPadID";

NSString * const HPLimitParam = @"limit";
NSString * const HPPadIdParam = @"padId";
NSString * const HPUserIdParam = @"userId";

NSString * const HPPadClientVarsPath = @"/ep/pad/client-vars";

static NSString * const HPDeletePadPath = @"/ep/padlist/delete";
static NSString * const HPEmailInvitePath = @"/ep/pad/emailinvite";
static NSString * const HPFacebookInvitePath = @"/ep/pad/facebookinvite";
static NSString * const HPFollowPadPath = @"/ep/pad/follow";
static NSString * const HPHackpadInvitePath = @"/ep/pad/hackpadinvite";
static NSString * const HPNewPadPath = @"/api/1.0/pad/create";
static NSString * const HPPadAPIPath = @"/api/1.0/pad";
static NSString * const HPPadApplyMissedChangesPath = @"/ep/pad/apply-missed-changes";
static NSString * const HPPadInviteesPathComponent = @"invitees";
static NSString * const HPPadRemoveUserPath = @"/ep/pad/removeuser";

static NSString * const AjaxParam = @"ajax";
static NSString * const FollowPrefParam = @"followPref";
static NSString * const HPEncryptedUserIdParam = @"encryptedUserId";
static NSString * const HPFacebookPostIdParam = @"facebookPostId";
static NSString * const HPFriendIdParam = @"friend_id";
static NSString * const HPFriendNameParam = @"friendName";
static NSString * const HPGlobalPadIdParam = @"globalPadId";
static NSString * const HPPadIdToDeleteParam = @"padIdToDelete";
static NSString * const HPToAddressParam = @"toAddress";

static NSString * const ClientVarsKey = @"clientVars";
static NSString * const ClientVarsLastEditedDateKey = @"clientVarsLastEditedDate";
static NSString * const CollabClientVarsKey = @"collab_client_vars";
static NSString * const CommittedChangesetKey = @"committedChangeset";
static NSString * const FurtherChangesetKey = @"furtherChangeset";
static NSString * const HTMLDiffKey = @"htmlDiff";
static NSString * const MissedChangesKey = @"missedChanges";
static NSString * const PadIDKey = @"padID";
static NSString * const PadTitleKey = @"padTitle";
static NSString * const RequestKey = @"request";
static NSString * const RevKey = @"rev";

static NSString * const MissedChangesParam = @"missedChanges";

static NSString * const FeatureHelpPadID = @"mlZvEsJykI5";
static NSString * const PrivacyPolicyPadID = @"RpTWPko6ER2";
static NSString * const TermsOfServicePadID = @"83netTWokps";
static NSString * const WelcomePadID = @"AWELCOMEPAD";
#if TARGET_IPHONE_SIMULATOR
static NSString * const DevServerKey = @"devServer";
static NSString * const DevWelcomePadID = @"ElgHCg3Ej0r";
#endif

static NSString * const ContentPathComponent = @"content.txt";
static NSString * const RevisionsPathComponent = @"revisions";

static NSString * const LastEditedDateHeader = @"X-Hackpad-LastEditedDate";

static NSString * const SnippetHTMLFormat =
@"<!DOCTYPE html>\n<html><head><title>Title</title><style type='text/css'>"
"  * { font-size:14px!important; line-height:21px!important; }"
"  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin:0px; }"
"  div { border-left-width:0px!important; padding-left:0px!important; }"
"  .author-diff-header { display: none; }"
"  ul, ol { padding-left:0px!important; margin-left:0px!important; }"
"</style></head><body>%@</body></html>";

@implementation HPPad (Impl)

+ (id)padWithID:(NSString *)padID
          title:(NSString *)title
        inSpace:(HPSpace *)space
          error:(NSError *__autoreleasing *)error
{
    if (padID) {
        NSParameterAssert(padID.length);
    }
    NSParameterAssert(space);

    HPPad *pad;

    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetch.predicate = [NSPredicate predicateWithFormat:@"(padID == %@) AND (space == %@)",
                       padID, space];
    fetch.fetchLimit = 1;
    NSArray *pads = [space.managedObjectContext executeFetchRequest:fetch
                                                              error:error];
    if (!pads) {
        return nil;
    }
    if (pads.count) {
        return pads[0];
    }
    pad = [NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                        inManagedObjectContext:space.managedObjectContext];
    pad.space = space;
    pad.padID = padID;
    pad.title = title;

    return pad;
}

+ (id)padWithID:(NSString *)padID
        inSpace:(HPSpace *)space
          error:(NSError *__autoreleasing *)error
{
    return [self padWithID:padID
                     title:@"Untitled"
                   inSpace:space
                     error:error];
}

+ (id)padWithID:(NSString *)padID
          title:(NSString *)title
       spaceURL:(NSURL *)URL
managedObjectContext:(NSManagedObjectContext *)managedObjectContext
          error:(NSError * __autoreleasing *)error
{
    NSParameterAssert([URL isKindOfClass:[NSURL class]]);
    NSError * __autoreleasing localError;

    HPSpace *space = [HPSpace spaceWithURL:URL
                    inManagedObjectContext:managedObjectContext
                                     error:&localError];
    if (localError) {
        if (error) {
            *error = localError;
        }
        return nil;
    }

    if (!space) {
        space = [HPSpace insertSpaceWithURL:URL
                                       name:nil
                       managedObjectContext:managedObjectContext];
    }

    return [self padWithID:padID
                     title:title
                   inSpace:space
                     error:error];
}

+ (NSString *)padIDWithURL:(NSURL *)URL
{
    if (!URL.hp_isHackpadURL) {
        return nil;
    }
    static NSString * const prettyPattern = @"^\\/[^\\/]+-([a-zA-Z0-9]{11})$";
    static NSString * const padIDPattern = @"^\\/([^\\/]+)$";
    NSString * __block padID;
    NSString *path = URL.path;
    [@[prettyPattern, padIDPattern] enumerateObjectsUsingBlock:^(NSString *pattern, NSUInteger idx, BOOL *stop) {
        NSError * __autoreleasing error;
        NSRegularExpression *regExp = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                                options:0
                                                                                  error:&error];
        if (!regExp) {
            TFLog(@"[%@] Invalid regexp for pattern %@: %@", URL.host, pattern, error);
            return;
        }
        NSTextCheckingResult *match = [regExp firstMatchInString:path
                                                         options:0
                                                           range:NSMakeRange(0, path.length)];
        if (match) {
            NSRange range = [match rangeAtIndex:1];
            if (range.location != NSNotFound) {
                padID = [path substringWithRange:range];
                *stop = YES;
            }
        }
    }];
    return padID;
}

+ (id)padWithURL:(NSURL *)URL
managedObjectContext:(NSManagedObjectContext *)managedObjectContext
           error:(NSError * __autoreleasing *)error
{
    NSString *padID = [self padIDWithURL:URL];
    if (padID) {
        return [self padWithID:padID
                         title:@"Untitled"
                      spaceURL:URL
          managedObjectContext:managedObjectContext
                         error:error];
    } else if (error) {
        *error = [NSError errorWithDomain:HPHackpadErrorDomain
                                     code:HPInvalidURLError
                                 userInfo:@{NSLocalizedDescriptionKey:@"The URL is not a valid Hackpad URL",
                                            NSURLErrorFailingURLErrorKey:URL}];
    }
    return nil;
}

+ (id)welcomePadInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                 error:(NSError *__autoreleasing *)error
{
    NSString *padID = WelcomePadID;
#if TARGET_IPHONE_SIMULATOR
    if ([[NSUserDefaults standardUserDefaults] boolForKey:DevServerKey]) {
        padID = DevWelcomePadID;
    }
#endif
    return [self padWithID:padID
                     title:@"Welcome to Hackpad"
                  spaceURL:[NSURL hp_sharedHackpadURL]
      managedObjectContext:managedObjectContext
                     error:error];
}

+ (id)privacyPolicyPadInObjectContext:(NSManagedObjectContext *)managedObjectContext
                                error:(NSError *__autoreleasing *)error
{
    return [self padWithID:PrivacyPolicyPadID
                     title:@"Hackpad Privacy Policy"
                  spaceURL:[NSURL hp_sharedHackpadURL]
      managedObjectContext:managedObjectContext
                     error:error];
}

+ (id)termsOfServicePadInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                        error:(NSError *__autoreleasing *)error
{
    return [self padWithID:TermsOfServicePadID
                     title:@"Hackpad Terms of Service"
                  spaceURL:[NSURL hp_sharedHackpadURL]
      managedObjectContext:managedObjectContext
                     error:error];
}

+ (id)featureHelpPadInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                     error:(NSError *__autoreleasing *)error
{
    return [self padWithID:FeatureHelpPadID
                     title:@"Hackpad Feature Help"
                  spaceURL:[NSURL hp_sharedHackpadURL]
      managedObjectContext:managedObjectContext
                     error:error];
}

- (NSURL *)URL
{
    return [NSURL URLWithString:self.padID
                  relativeToURL:self.space.URL];
}

- (NSURL *)APIURL
{
    return [NSURL URLWithString:[HPPadAPIPath stringByAppendingPathComponent:self.padID]
                  relativeToURL:self.space.URL];
}

- (void)deleteWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    if (!self.padID) {
        [self hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
            [pad.managedObjectContext deleteObject:pad];
        } completion:handler];
        return;
    }
    [self hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
        pad.deleting = YES;
    } completion:^(HPPad *pad, NSError *error) {
        NSURL *URL = [NSURL URLWithString:HPDeletePadPath
                            relativeToURL:pad.space.URL];
        NSDictionary *params = @{HPPadIdToDeleteParam:pad.padID,
                                 HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
        NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                     HTTPMethod:@"POST"
                                                     parameters:params];
        [pad hp_sendAsynchronousRequest:request
                                  block:^(HPPad *pad,
                                          NSURLResponse * response,
                                          NSData *data,
                                          NSError *__autoreleasing *error)
         {
             if (![pad.space.API parseJSONResponse:response
                                              data:data
                                           request:request
                                             error:error]) {
                 pad.deleting = NO;
                 return;
             }
             [pad.managedObjectContext deleteObject:pad];
         } completion:handler];
     }];
}

- (void)setFollowed:(BOOL)followed
         completion:(void (^)(HPPad *, NSError *))handler
{
    NSParameterAssert(self.padID);
    if (self.followed == followed) {
        if (handler) {
            handler(self, nil);
        }
        return;
    }

    NSURL *URL = [NSURL URLWithString:[HPFollowPadPath stringByAppendingPathComponent:self.padID]
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{FollowPrefParam: followed ? @"2" : @"1",
                             AjaxParam: @"true",
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         if (![pad.space.API parseJSONResponse:response
                                          data:data
                                       request:request
                                         error:error]) {
             return;
         }
         pad.followed = followed;
     }
                          completion:handler];
}

- (BOOL)isFeatureHelpPad
{
    return [self.padID isEqualToString:FeatureHelpPadID] && self.space.URL.hp_isToplevelHackpadURL;
}

- (BOOL)isPrivacyPolicyPad
{
    return [self.padID isEqualToString:PrivacyPolicyPadID] && self.space.URL.hp_isToplevelHackpadURL;
}

- (BOOL)isTermsOfServicePad
{
    return [self.padID isEqualToString:TermsOfServicePadID] && self.space.URL.hp_isToplevelHackpadURL;
}

- (BOOL)isWelcomePad
{
    NSString *padID = WelcomePadID;
#if TARGET_IPHONE_SIMULATOR
    if ([[NSUserDefaults standardUserDefaults] boolForKey:DevServerKey]) {
        padID = DevWelcomePadID;
    }
#endif
    return [self.padID isEqualToString:padID] && self.space.URL.hp_isToplevelHackpadURL;
}

- (BOOL)isCreator
{
    static NSString * const IsCreatorKey = @"isCreator";
    NSDictionary *clientVars = self.clientVars;
    if (![clientVars isKindOfClass:[NSDictionary class]] ||
        ![clientVars[IsCreatorKey] isKindOfClass:[NSNumber class]]) {
        return NO;
    }
    return [clientVars[IsCreatorKey] boolValue];
}

- (void)sendInvitationWithRequest:(NSURLRequest *)request
                       completion:(void (^)(HPPad *, NSError *))handler
{
    NSParameterAssert(self.padID);

    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         [pad.space.API isSignInRequiredForRequest:request
                                           response:response
                                              error:error];
     }
                          completion:handler];
}

- (void)sendInvitationWithUserId:(NSString *)userId
                      completion:(void (^)(HPPad *, NSError *))handler
{
    NSURL *URL = [NSURL URLWithString:HPHackpadInvitePath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPEncryptedUserIdParam: userId,
                             HPPadIdParam: self.padID,
                             HPAPIXSRFTokenParam: [HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self sendInvitationWithRequest:request
                         completion:handler];
}

- (void)sendInvitationWithEmail:(NSString *)email
                     completion:(void (^)(HPPad *, NSError *))handler
{
    NSURL *URL = [NSURL URLWithString:HPEmailInvitePath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPToAddressParam: email,
                             HPPadIdParam: self.padID,
                             HPAPIXSRFTokenParam: [HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self sendInvitationWithRequest:request
                         completion:handler];
}

- (void)sendInvitationWithFacebookID:(NSString *)friendID
                                name:(NSString *)friendName
                              postID:(NSString *)postID
                          completion:(void (^)(HPPad *, NSError *))handler
{
    NSURL *URL = [NSURL URLWithString:HPFacebookInvitePath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPFriendIdParam:friendID,
                             HPFriendNameParam:friendName,
                             HPPadIdParam:self.padID,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    if (postID) {
        NSMutableDictionary *tmp = [params mutableCopy];
        tmp[HPFacebookPostIdParam] = postID;
    }
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self sendInvitationWithRequest:request
                         completion:handler];

}

- (void)sendInvitationWithFacebookID:(NSString *)friendID
                                name:(NSString *)friendName
                          completion:(void (^)(HPPad *, NSError *))handler
{
    [self sendInvitationWithFacebookID:friendID
                                  name:friendName
                                postID:nil
                            completion:^(HPPad *pad, NSError *error)
    {
        if (error) {
            [FBWebDialogs presentRequestsDialogModallyWithSession:[FBSession activeSession]
                                                          message:[NSString stringWithFormat:@"Come hack '%@' with me.", self.title]
                                                            title:@"Send Private Hackpad Invite"
                                                       parameters:@{@"to":friendID, @"data":self.padID}
                                                          handler:^(FBWebDialogResult result,
                                                                    NSURL *resultURL,
                                                                    NSError *error)
             {
                 if (!error && result == FBWebDialogResultDialogCompleted) {
                     [self sendInvitationWithFacebookID:friendName
                                                   name:friendName
                                                 postID:[resultURL.query hp_dictionaryByParsingURLParameters][RequestKey]
                                             completion:handler];
                 } else {
                     if (handler) {
                         handler(pad, error);
                     }
                 }
             }];
        } else if (handler) {
            handler(pad, nil);
        }
    }];
}

- (void)removeUserWithId:(NSString *)userID
              completion:(void (^)(HPPad *, NSError *))handler
{
    NSParameterAssert(self.padID);
    NSURL *URL = [NSURL URLWithString:HPPadRemoveUserPath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPPadIdParam:self.padID,
                             HPUserIdParam:userID,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];

    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         [pad.space.API parseJSONResponse:response
                                     data:data
                                  request:request
                                    error:error];
     }
                          completion:handler];
}

- (NSString *)searchTextWithClientVars:(NSDictionary *)clientVars
{
    static NSString * const InitialAttributedTextKey = @"initialAttributedText";
    static NSString * const TextKey = @"text";

    NSDictionary *collabClientVars = clientVars[CollabClientVarsKey];
    if (![collabClientVars isKindOfClass:[NSDictionary class]]) {
        return nil;
    }

    NSDictionary *initialAttributedText = collabClientVars[InitialAttributedTextKey];
    if (![initialAttributedText isKindOfClass:[NSDictionary class]]) {
        return nil;
    }
    NSString *text = initialAttributedText[TextKey];
    if (![text isKindOfClass:[NSString class]]) {
        return nil;
    }
    return [text.hp_stringByReplacingPercentEscapes stringByReplacingOccurrencesOfString:@"\n*"
                                                                              withString:@"\n"];
}

- (void)setClientVars:(NSDictionary *)clientVars
       lastEditedDate:(NSTimeInterval)lastEditedDate
{
    NSDictionary *collabClientVars = clientVars[CollabClientVarsKey];
    if (![collabClientVars isKindOfClass:[NSDictionary class]]) {
        return;
    }

    id oldRev = self.clientVars[CollabClientVarsKey][RevKey];
    id newRev = collabClientVars[RevKey];

    if (![newRev isKindOfClass:[NSNumber class]]) {
        TFLog(@"[%@] %@.clientVars not updating to rev %@, as we already have rev %@.",
              self.URL.host, self.padID, newRev, oldRev);
        return;
    }

    if ([newRev integerValue] < [oldRev integerValue]) {
        TFLog(@"[%@] %@.clientVars rolling back from revision %@ to %@",
              self.URL.host, self.padID, oldRev, newRev);
    }

    NSDictionary *missedChanges = collabClientVars[MissedChangesKey];
    self.hasMissedChanges = [missedChanges isKindOfClass:[NSDictionary class]] &&
        ([missedChanges[CommittedChangesetKey] isKindOfClass:[NSString class]] ||
         [missedChanges[FurtherChangesetKey] isKindOfClass:[NSString class]]);

    if (self.hasMissedChanges || ![oldRev isEqual:newRev]) {
        self.lastEditedDate = lastEditedDate;
#if 0
        self.snippetUserPics = nil;
        self.authorNames = nil;
#endif
    }

    if (!self.editor) {
        self.editor = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass([HPPadEditor class])
                                                    inManagedObjectContext:self.managedObjectContext];
    }
    self.editor.clientVars = nil;
    NSError * __autoreleasing error;
    self.editor.clientVarsJSON = [NSJSONSerialization dataWithJSONObject:clientVars
                                                                 options:0
                                                                   error:&error];
    if (!self.editor.clientVarsJSON) {
        TFLog(@"[%@ %@] Error serializing clientVars: %@", self.URL.host,
              self.padID, error);
    }
    self.editor.clientVarsLastEditedDate = lastEditedDate;
    self.title = clientVars[PadTitleKey];

    if (!self.search) {
        self.search = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass([HPPadSearch class])
                                                    inManagedObjectContext:self.managedObjectContext];
    }
    self.search.content = [self searchTextWithClientVars:clientVars];
    self.search.lastEditedDate = lastEditedDate;
}

- (void)requestClientVarsWithRefresh:(BOOL)refresh
                          completion:(void (^)(HPPad *, NSError *))handler
{
    static NSString * const UserAgentHeader = @"User-Agent";

    if (!refresh && self.hasClientVars) {
        if (handler) {
            handler(self, nil);
        }
        return;
    }
    NSParameterAssert(self.padID);
    NSParameterAssert(!self.hasMissedChanges);

    NSMutableURLRequest *request;
    request = [NSMutableURLRequest hp_requestWithURL:[NSURL URLWithString:HPPadClientVarsPath
                                                            relativeToURL:self.space.URL]
                                          HTTPMethod:@"GET"
                                          parameters:@{HPPadIdParam:self.padID}];
    [request addValue:[UIWebView hp_defaultUserAgentString]
   forHTTPHeaderField:UserAgentHeader];
    request.cachePolicy = refresh
        ? NSURLRequestReloadIgnoringCacheData
        : NSURLRequestReturnCacheDataElseLoad;
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];

    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         id JSON = [pad.space.API parseJSONResponse:response
                                               data:data
                                            request:request
                                              error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[ClientVarsKey] isKindOfClass:[NSDictionary class]]) {
             return;
         }

         NSDictionary *headers = [(NSHTTPURLResponse *)response allHeaderFields];
         NSTimeInterval clientVarsLastEditedDate = [headers[LastEditedDateHeader] longLongValue] - NSTimeIntervalSince1970;

#if 0
         HPLog(@"[%@ %@] Last edit date: %f headers: %f, cached request headers: %@",
               request.URL.host, pad.padID, pad.lastEditedDate,
               clientVarsLastEditedDate, headers);
#endif

         [pad setClientVars:JSON[ClientVarsKey]
             lastEditedDate:clientVarsLastEditedDate];
     } completion:handler];
}

- (void)getPadIDWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    // FIXME: need to make sure this is only called once per pad
    NSParameterAssert(!self.padID);
    NSURL *URL = [NSURL URLWithString:HPNewPadPath
                        relativeToURL:self.space.URL];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL
                                                           cachePolicy:NSURLRequestReloadIgnoringCacheData
                                                       timeoutInterval:60];
    request.HTTPMethod = @"POST";
    request.HTTPBody = [@"\n\n\n" dataUsingEncoding:NSUTF8StringEncoding];
    [request setValue:@"text/plain"
   forHTTPHeaderField:@"Content-Type"];
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];

    NSString * __block globalPadID;
    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         id JSON = [pad.space.API parseJSONResponse:response
                                                data:data
                                             request:request
                                               error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[HPPadIdParam] isKindOfClass:[NSString class]] ||
             ![JSON[HPGlobalPadIdParam] isKindOfClass:[NSString class]]) {
             return;
         }
         pad.padID = JSON[HPPadIdParam];
         globalPadID = JSON[HPGlobalPadIdParam];
         NSMutableDictionary *clientVars = pad.clientVars.mutableCopy;
         if (!clientVars) {
             return;
         }
         if ([clientVars[CollabClientVarsKey] isKindOfClass:[NSDictionary class]]) {
             NSMutableDictionary *collabClientVars = [clientVars[CollabClientVarsKey] mutableCopy];
             collabClientVars[HPGlobalPadIdParam] = globalPadID;
             collabClientVars[HPPadIdParam] = pad.padID;
             clientVars[CollabClientVarsKey] = collabClientVars;
         }
         clientVars[HPGlobalPadIdParam] = globalPadID;
         clientVars[HPPadIdParam] = pad.padID;
         [pad setClientVars:clientVars
             lastEditedDate:pad.editor.clientVarsLastEditedDate];
     } completion:^(HPPad *pad, NSError *error) {
         if (pad && globalPadID) {
             [[NSNotificationCenter defaultCenter] postNotificationName:HPPadDidGetGlobalPadIDNotification
                                                                 object:pad
                                                               userInfo:@{HPGlobalPadIDKey:globalPadID}];
         }
         if (handler) {
             handler(pad, error);
         }
     }];
}

+ (NSString *)fullSnippetHTMLWithSnippetHTML:(NSString *)snippetHTML
{
    return [NSString stringWithFormat:SnippetHTMLFormat, snippetHTML.length ? snippetHTML : @""];
}

- (NSString *)fullSnippetHTML
{
    return [self.class fullSnippetHTMLWithSnippetHTML:self.snippetHTML];
}

- (void)requestAuthorsWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    static NSString * const AuthorPicsKey = @"authorPics";
    static NSString * const AuthorsKey = @"authors";
    static NSString * const TimestampKey = @"timestamp";

    NSParameterAssert(self.padID);
    NSMutableURLRequest *request;
    request = [NSMutableURLRequest hp_requestWithURL:[self.APIURL URLByAppendingPathComponent:RevisionsPathComponent]
                                          HTTPMethod:@"GET"
                                          parameters:@{HPLimitParam:@"1"}];
    if (!request.URL) {
        TFLog(@"[%@] Invalid pad URL: %@", self.space.URL.host, self.padID);
        handler(nil, nil);
        return;
    }
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         id JSON = [pad.space.API parseJSONResponse:response
                                                data:data
                                             request:request
                                               error:error];
         if (![JSON isKindOfClass:[NSArray class]] ||
             ![JSON count] ||
             ![JSON[0] isKindOfClass:[NSDictionary class]]) {
             return;
         }
         NSDictionary *revision = JSON[0];
         NSArray *authors = revision[AuthorsKey];
         pad.authorName = [authors isKindOfClass:[NSArray class]] &&
             [authors.firstObject isKindOfClass:[NSString class]]
             ? authors[0] : @"Someone";
         authors = revision[AuthorPicsKey];
         pad.authorPic = [authors isKindOfClass:[NSArray class]] &&
              [authors.firstObject isKindOfClass:[NSString class]]
              ? authors[0] : @"/static/img/nophoto.png";
         pad.snippetHTML = nil; // JSON[0][HTMLDiffKey];
         if ([revision[TimestampKey] isKindOfClass:[NSNumber class]]) {
             pad.authorLastEditedDate = [revision[TimestampKey] longLongValue] - NSTimeIntervalSince1970;
         } else {
             pad.authorLastEditedDate = pad.lastEditedDate;
         }
     } completion:handler];
}

- (void)requestContentWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    NSParameterAssert(self.padID);
    NSMutableURLRequest *request;
    request = [NSMutableURLRequest requestWithURL:[self.APIURL URLByAppendingPathComponent:ContentPathComponent]];
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];

    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         if ([pad.space.API isSignInRequiredForRequest:request
                                              response:response
                                                 error:error] ||
             ![response isKindOfClass:[NSHTTPURLResponse class]]) {
             return;
         }
         NSHTTPURLResponse *HTTPResponse = (NSHTTPURLResponse *)response;
         if (HTTPResponse.statusCode / 100 != 2) {
             if (!error) {
                 return;
             }
             NSMutableDictionary *userInfo = [NSMutableDictionary dictionaryWithObjectsAndKeys:
                                              @"The server sent an invalid response",
                                              NSLocalizedDescriptionKey,
                                              request.URL, NSURLErrorFailingURLErrorKey,
                                              request.URL.absoluteString, NSURLErrorFailingURLStringErrorKey,
                                              request.HTTPMethod, HPURLErrorFailingHTTPMethod,
                                              nil];
             if (HTTPResponse) {
                 userInfo[HPURLErrorFailingHTTPStatusCode] = @(HTTPResponse.statusCode);
             }
             if (*error) {
                 userInfo[NSUnderlyingErrorKey] = *error;
             }
             *error = [NSError errorWithDomain:HPHackpadErrorDomain
                                          code:HPFailedRequestError
                                      userInfo:userInfo];
             return;
         }
         if (!pad.search) {
             pad.search = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass([HPPadSearch class])
                                                        inManagedObjectContext:pad.managedObjectContext];
         }
         pad.search.content = [[NSString alloc] initWithData:data
                                                    encoding:NSUTF8StringEncoding];
     }
                          completion:handler];
}

- (void)applyMissedChangesWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    NSParameterAssert(self.padID);
    NSParameterAssert(self.hasMissedChanges);
    NSURL *URL = [NSURL URLWithString:HPPadApplyMissedChangesPath
                        relativeToURL:self.URL];
    NSDictionary *collabClientVars = self.clientVars[CollabClientVarsKey];
    NSError * __autoreleasing error;
    NSData *missedChanges = [NSJSONSerialization dataWithJSONObject:collabClientVars[MissedChangesKey]
                                                            options:0
                                                              error:&error];
    if (!missedChanges) {
        TFLog(@"[%@] Could not serialize apool: %@", URL.host, error);
        if (handler) {
            handler(nil, error);
        }
        return;
    }
    NSDictionary *params = @{MissedChangesKey:[[NSString alloc] initWithData:missedChanges
                                                                    encoding:NSUTF8StringEncoding],
                             HPPadIdParam:self.padID};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];

    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![pad.space.API parseJSONResponse:response
                                          data:data
                                       request:request
                                         error:error]) {
             return;
         }
         pad.hasMissedChanges = NO;
     }
                          completion:handler];
}

- (void)requestAccessWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    static NSString * const RequestAccessPath = @"/ep/account/guest/guest-request-access";

    NSParameterAssert(self.padID);
    NSURL *URL = [NSURL URLWithString:RequestAccessPath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPPadIdParam:self.padID,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];

    [self hp_sendAsynchronousRequest:request
                               block:^(HPPad *pad,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         [pad.space.API parseJSONResponse:response
                                     data:data
                                  request:request
                                    error:error];
     } completion:handler];
}

- (void)discardMissedChangesWithCompletion:(void (^)(HPPad *, NSError *))handler
{
    [self hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
        NSMutableDictionary *clientVars = pad.clientVars.mutableCopy;
        NSMutableDictionary *collabClientVars = [clientVars[CollabClientVarsKey] mutableCopy];
        [collabClientVars removeObjectForKey:MissedChangesKey];
        clientVars[CollabClientVarsKey] = collabClientVars;
        [pad setClientVars:clientVars
            lastEditedDate:pad.editor.clientVarsLastEditedDate];
        pad.hasMissedChanges = NO;
    } completion:handler];
}

- (NSDictionary *)clientVars
{
    return self.editor.clientVarsJSON
        ? [NSJSONSerialization JSONObjectWithData:self.editor.clientVarsJSON
                                          options:0
                                            error:nil]
        : self.editor.clientVars;
}

- (BOOL)hasClientVars
{
    return self.editor.clientVarsJSON || self.editor.clientVars;
}

@end
