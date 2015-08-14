//
//  HPPadWebController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadWebController.h"

#import "HPPadAutocompleteTableViewDataSource.h"

#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>
#import <HackpadAdditions/HackpadUIAdditions.h>

#import <GoogleToolbox/GTMOAuthAuthentication.h>
#import <TestFlight/TestFlight.h>
#import <vocaro.com/UIImage+Resize.h>
#import <WebViewJavascriptBridge/WebViewJavascriptBridge.h>

static NSString * const AutocompleteHandler = @"autocomplete";
static NSString * const CanUndoRedoHandler = @"canUndoRedo";
static NSString * const CollabClientDidConnectHandler = @"collabClientDidConnect";
static NSString * const CollabClientDidDisconnectHandler = @"collabClientDidDisconnect";
static NSString * const CollabClientDidSynchronizeHandler = @"collabClientDidSynchronize";
static NSString * const ConnectionTroubleHandler = @"connectionTrouble";
static NSString * const DocumentDidFailLoadHandler = @"documentDidFailLoad";
static NSString * const DoDeleteKeyHandler = @"doDeleteKey";
static NSString * const DoToolbarClickHandler = @"doToolbarClick";
static NSString * const DoReturnKeyHandler = @"doReturnKey";
static NSString * const DoUndoRedoHandler = @"doUndoRedo";
static NSString * const GetClientVarsAndTextHandler = @"getClientVarsAndText";
static NSString * const GetViewportWidthHandler = @"getViewportWidth";
static NSString * const InsertImageHandler = @"insertImage";
static NSString * const InsertTextHandler = @"insertText";
static NSString * const LogHandler = @"log";
static NSString * const OpenLinkHandler = @"openLink";
static NSString * const QuickCamHandler = @"quickCam";
static NSString * const ReconnectCollabClientHandler = @"reconnectCollabClient";
static NSString * const SetHasNetworkActivityHandler = @"setHasNetworkActivity";
static NSString * const SetSharingOptionsHandler = @"setSharingOptions";
static NSString * const SetTitleHandler = @"setTitle";
static NSString * const SetVisibleEditorHeight = @"setVisibleEditorHeight";
static NSString * const SignInHandler = @"signIn";
static NSString * const UserInfoHandler = @"userInfo";
static NSString * const UpdateNetworkActivityHandler = @"updateNetworkActivity";
static NSString * const UpdateViewportWidthHandler = @"updateViewportWidth";

static NSString * const AddUserKey = @"addUser";
static NSString * const ArgumentsKey = @"arguments";
static NSString * const AttachmentIDKey = @"attachmentId";
static NSString * const ChannelStateKey = @"channelState";
static NSString * const ClientVarsKey = @"clientVars";
static NSString * const CollabClientVarsKey = @"collab_client_vars";
static NSString * const CollabStateKey = @"collabState";
static NSString * const DataKey = @"data";
static NSString * const DebugMessagesKey = @"debugMessages";
static NSString * const ErrorKey = @"error";
static NSString * const FailedURLsKey = @"failedURLs";
static NSString * const FinishKey = @"finish";
static NSString * const GlobalPadIdKey = @"globalPadId";
static NSString * const GuestPolicyKey = @"guestPolicy";
static NSString * const HrefKey = @"href";
static NSString * const InvitedUserInfosKey = @"invitedUserInfos";
static NSString * const IsModeratedKey = @"isModerated";
static NSString * const LoadedKey = @"loaded";
static NSString * const MessageKey = @"message";
static NSString * const MethodKey = @"method";
static NSString * const PadIdKey = @"padId";
static NSString * const RedoKey = @"redo";
static NSString * const SelectedKey = @"selected";
static NSString * const SelectedIndexKey = @"selectedIndex";
static NSString * const StatusKey = @"status";
static NSString * const TextKey = @"text";
static NSString * const UndoKey = @"undo";
static NSString * const UserIDKey = @"userId";
static NSString * const UserInfoKey = @"userInfo";

static NSString * const PadEditorPath = @"/ep/pad/editor";

static NSString * const ConnectedStatus = @"connected";

static NSString * const AboutBlank = @"about:blank";

static CGFloat const MaxImageSize = 800.0;

@interface HPPadWebController () <UIScrollViewDelegate>
@property (nonatomic, strong, readwrite) HPPad *pad;
@property (nonatomic, strong, readwrite) HPSpace *space;
@property (nonatomic, strong, readwrite) UIWebView *webView;
@property (nonatomic, assign, readwrite, getter = hasNetworkActivity) BOOL networkActivity;
@property (nonatomic, strong, readwrite) HPPadAutocompleteTableViewDataSource *autocompleteDataSource;
@property (nonatomic, strong, readwrite) HPUserInfoCollection *userInfos;

@property (nonatomic, strong) HPAPI *API;
@property (nonatomic, strong) WebViewJavascriptBridge *bridge;
@property (nonatomic, strong) NSError *onloadError;
@property (nonatomic, strong) NSOperation *clientVarsOperation;
@property (nonatomic, strong) NSOperation *webViewLoadOperation;
@property (nonatomic, strong) NSOperation *loadCallbackOperation;
@property (nonatomic, strong) NSString *globalPadID;
@property (nonatomic, strong) NSString *userID;
@property (nonatomic, strong) NSData *insertingImageData;
@property (nonatomic, strong) UIRefreshControl *refreshControl;
@property (nonatomic, assign) NSInteger loadingFrameCount;
@property (nonatomic, strong) id signInObserver;
@property (nonatomic, assign, readwrite, getter = isLoading) BOOL loading;
@property (nonatomic, assign, readwrite, getter = isLoaded) BOOL loaded;
@end

@implementation HPPadWebController

+ (id)sharedPadWebControllerWithPad:(HPPad *)pad
{
    return [self sharedPadWebControllerWithPad:pad
                              padWebController:nil];
}

+ (id)sharedPadWebControllerWithPad:(HPPad *)pad
                   padWebController:(HPPadWebController *)preloadedPadWebController
{
    static NSMapTable *pads;

    NSParameterAssert(pad.objectID);
    NSParameterAssert(!pad.objectID.isTemporaryID);
    if (preloadedPadWebController) {
        NSParameterAssert(pad.space == preloadedPadWebController.space);
        NSParameterAssert(!preloadedPadWebController.pad);
    }

    if (!pads) {
        pads = [NSMapTable strongToWeakObjectsMapTable];
    }

    HPPadWebController *padWebController;
    padWebController = [pads objectForKey:pad.objectID];
    if (padWebController) {
        return padWebController;
    }
    if (preloadedPadWebController) {
        padWebController = preloadedPadWebController;
        padWebController.pad = pad;
    } else {
        padWebController = [[self alloc] initWithPad:pad
                                               frame:CGRectMake(0, 0, 320, 420)];
    }
    [pads setObject:padWebController
             forKey:pad.objectID];
    return padWebController;
}

- (id)initWithPad:(HPPad *)pad
            frame:(CGRect)frame
{
    self = [self initWithSpace:pad.space
                         frame:frame];
    if (!self) {
        return self;
    }
    self.pad = pad;
    return self;
}

- (id)initWithSpace:(HPSpace *)space
              frame:(CGRect)frame
{
    self = [super init];
    if (!self) {
        return self;
    }
    self.space = space;
    self.webView = [[UIWebView alloc] initWithFrame:frame];
    self.webView.scrollView.decelerationRate = UIScrollViewDecelerationRateNormal;
    [self buildBridge];
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    [nc addObserver:self
           selector:@selector(saveClientVarsAndTextWithNotification:)
               name:UIApplicationDidEnterBackgroundNotification
             object:nil];
    self.API = space.API;
    [nc addObserver:self
           selector:@selector(APIDidSignInWithNotification:)
               name:HPAPIDidSignInNotification
             object:self.API];
    [nc addObserver:self
           selector:@selector(managedObjectContextDidSaveWithNotification:)
               name:NSManagedObjectContextDidSaveNotification
             object:space.managedObjectContext];

    return self;
}

- (void)dealloc
{
    self.webView.scrollView.delegate = nil;
    self.webView.delegate = nil;
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)setSearchBar:(UISearchBar *)searchBar
{
    if (_searchBar == searchBar) {
        return;
    }
    if (_searchBar) {
        [_searchBar removeFromSuperview];
    }
    _searchBar = searchBar;
    if (!searchBar) {
        return;
    }
    CGRect frame = searchBar.bounds;
    if (HP_SYSTEM_MAJOR_VERSION() >= 7) {
        [self.webView.scrollView.subviews enumerateObjectsUsingBlock:^(UIView *view, NSUInteger idx, BOOL *stop) {
            if ([view isKindOfClass:[UIRefreshControl class]]) {
                return;
            }
            CGRect frame = view.frame;
            frame.origin.y = CGRectGetHeight(searchBar.bounds);
            view.frame = frame;
        }];
    } else {
        frame.origin.y = -CGRectGetHeight(frame);
        self.webView.scrollView.scrollIndicatorInsets = UIEdgeInsetsMake(CGRectGetHeight(frame), 0, 0, 0);
    }
    searchBar.frame = frame;
    [self.webView.scrollView addSubview:searchBar];
    [self.webView.scrollView layoutIfNeeded];
    self.webView.scrollView.delegate = self;
}

#pragma mark - Loading

- (void)setPad:(HPPad *)pad
{
    _pad = pad;
    if (!pad || !self.isLoading) {
        return;
    }
    [self loadPad];
}

- (void)loadPad
{
    NSParameterAssert(self.pad);

    HPPadWebController * __weak weakSelf = self;
    if (!self.pad.padID) {
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(padDidGetGlobalPadIDWithNotification:)
                                                     name:HPPadDidGetGlobalPadIDNotification
                                                   object:self.pad];
    }
    if (self.pad.hasClientVars || !self.pad.padID) {
        [[NSOperationQueue mainQueue] addOperation:self.clientVarsOperation];
        HPLog(@"Adding clientVars operation.");
    } else {
        [self.pad requestClientVarsWithRefresh:NO
                                    completion:^(HPPad *pad, NSError *error)
         {
             HPLog(@"Adding clientVars operation.");
             [[NSOperationQueue mainQueue] addOperation:weakSelf.clientVarsOperation];
             if (error && !weakSelf.onloadError) {
                 weakSelf.onloadError = error;
             }
         }];
    }
}

- (void)loadWithCompletion:(void (^)(NSError *))handler
{
    [self loadWithCachePolicy:NSURLRequestReturnCacheDataElseLoad
                   completion:handler];
}

- (void)loadWithCachePolicy:(NSURLRequestCachePolicy)cachePolicy
                 completion:(void (^)(NSError *))handler
{
    if (self.isLoaded) {
        if (!handler) {
            return;
        }
        handler(self.onloadError);
        return;
    }

    HPPadWebController * __weak weakSelf = self;
    if (!self.isLoading) {
        self.onloadError = nil;
        self.webViewLoadOperation = [NSBlockOperation blockOperationWithBlock:^{
            HPLog(@"webViewLoadOperation called.");
        }];
        self.loadCallbackOperation = [NSBlockOperation blockOperationWithBlock:^{
            HPLog(@"loadCallbackOperation called.");
            weakSelf.loaded = YES;
            weakSelf.loading = NO;
        }];
        [self.loadCallbackOperation addDependency:self.webViewLoadOperation];
        HPLog(@"Adding loadCallbackOperation.");
        [[NSOperationQueue mainQueue] addOperation:self.loadCallbackOperation];
    }

    if (handler) {
        NSOperation *operation = [NSBlockOperation blockOperationWithBlock:^{
            HPLog(@"Callback operation called.");
            handler(weakSelf.onloadError);
        }];
        [operation addDependency:self.loadCallbackOperation];
        [[NSOperationQueue mainQueue] addOperation:operation];
        HPLog(@"Adding callback operation.");
    }

    if (self.isLoading) {
        return;
    }

    self.loading = YES;
    NSURL *URL = [NSURL URLWithString:PadEditorPath
                        relativeToURL:self.space.URL];
    self.clientVarsOperation = [NSBlockOperation blockOperationWithBlock:^{
        HPLog(@"clientVars operation called.");
        if (weakSelf.onloadError) {
            return;
        }
        [weakSelf addPadClientVars];
    }];
    if (self.pad) {
        [self loadPad];
    }
    [self.loadCallbackOperation addDependency:self.clientVarsOperation];
    [self.clientVarsOperation addDependency:self.webViewLoadOperation];

    self.userInfos = [[HPUserInfoCollection alloc] initWithArray:@[]];
    /*
     * UIWebView will (correctly) use the cachePolicy of the initial request for
     * everything, but that's not what we want in this case (we just want to
     * refresh /ep/pad/editor). So use a hack.
     */
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL];
    switch (cachePolicy) {
        case NSURLRequestReloadIgnoringLocalCacheData:
        case NSURLRequestReloadIgnoringLocalAndRemoteCacheData:
        case NSURLRequestReloadRevalidatingCacheData:
            [HPStaticCachingURLProtocol doNotCacheRequestIfOnline:request];
            break;
        default:
            break;
    }
    [self.webView loadRequest:request];
}

- (void)reloadDiscardingChanges:(BOOL)discardChanges
                    cachePolicy:(NSURLRequestCachePolicy)cachePolicy
                     completion:(void (^)(NSError *))handler
{
    if (self.isLoading) {
        return;
    }
    self.loaded = NO;
    HPPadWebController * __weak weakSelf = self;
    void (^load)(void) = ^{
        [weakSelf loadWithCachePolicy:cachePolicy
                           completion:handler];
    };
    if (discardChanges) {
        load();
    } else {
        [self saveClientVarsAndTextWithCompletion:load];
    }
}

- (void)refresh:(id)sender
{
    [self reloadDiscardingChanges:NO
                      cachePolicy:NSURLRequestReloadRevalidatingCacheData
                       completion:nil];
}

- (void)addClientVars:(NSDictionary *)clientVars
{
    static NSString * const AddClientVarsHandler = @"addClientVars";
    static NSString * const SuccessKey = @"success";

    NSOperation *deferred = [NSOperation new];
    [self.loadCallbackOperation addDependency:deferred];

    HPPadWebController * __weak weakSelf = self;
    [self.bridge callHandler:AddClientVarsHandler
                        data:clientVars
            responseCallback:^(NSDictionary *data)
     {
         [[NSOperationQueue mainQueue] addOperation:deferred];
         if (weakSelf.onloadError) {
             return;
         }
         if (![data isKindOfClass:[NSDictionary class]] ||
             ![data[SuccessKey] isKindOfClass:[NSNumber class]] ||
             ![data[SuccessKey] boolValue]) {
             TFLog(@"[%@ %@] Could not initialize client vars: %@",
                   weakSelf.webView.request.URL, weakSelf.pad.padID, data);
             weakSelf.onloadError = [NSError errorWithDomain:HPHackpadErrorDomain
                                                        code:HPPadInitializationError
                                                    userInfo:nil];
         }
     }];
}

- (void)addPadClientVars
{
    NSParameterAssert(self.pad);

    NSDictionary *clientVars = self.pad.clientVars;
    [self addClientVars:clientVars];
    if (!clientVars) {
        return;
    }

    static NSString * const InvitedUserInfosKey = @"invitedUserInfos";
    static NSString * const StatusKey = @"status";
    static NSString * const ConnectedStatus = @"connected";

    NSArray *userInfos = clientVars[InvitedUserInfosKey];
    NSString *userID = clientVars[UserIDKey];
    if (![userInfos isKindOfClass:[NSArray class]]) {
        self.userInfos = nil;
        return;
    }
    [userInfos enumerateObjectsUsingBlock:^(NSDictionary *userInfo, NSUInteger idx, BOOL *stop) {
        if (![userInfo isKindOfClass:[NSDictionary class]]) {
            return;
        }
        if ([userInfo[UserIDKey] isEqualToString:userID]) {
            NSMutableDictionary *tmpUserInfo = [userInfo mutableCopy];
            tmpUserInfo[StatusKey] = ConnectedStatus;
            userInfo = tmpUserInfo;
        }
        [self.userInfos addUserInfo:[[HPUserInfo alloc] initWithDictionary:userInfo]];
    }];
    if (![self.delegate respondsToSelector:@selector(padWebControllerDidUpdateUserInfo:)]) {
        return;
    }
    [self.delegate padWebControllerDidUpdateUserInfo:self];
}

#pragma mark - JS Bridge

- (void)buildBridge
{
    static NSString * const FinishMethod = @"finish";
    static NSString * const UploadImageHandler = @"uploadImage";
    static NSString * const DeletePadHandler = @"deletePad";
    static NSString * const FreakOutHandler = @"freakOut";

    Class WVJB = [WebViewJavascriptBridge class];
    HPPadWebController * __weak weakSelf = self;
    self.bridge = [WVJB bridgeForWebView:self.webView
                         webViewDelegate:self
                                 handler:^(id data, WVJBResponseCallback responseCallback) {}];

    // Please keep these sorted alphabetically by handler.
    [self.bridge registerHandler:AutocompleteHandler
                         handler:^(NSDictionary *data,
                                   WVJBResponseCallback responseCallback)
     {
         if (![data isKindOfClass:[NSDictionary class]]) {
             return;
         }

         if ([data[MethodKey] isEqual:FinishMethod]) {
             if (![weakSelf.delegate respondsToSelector:@selector(padWebControllerDidFinishAutocomplete:)]) {
                 return;
             }
             [weakSelf.delegate padWebControllerDidFinishAutocomplete:weakSelf];
             weakSelf.autocompleteDataSource = nil;
             return;
         }

         if (![data[DataKey] isKindOfClass:[NSArray class]]) {
             return;
         }

         if (weakSelf.autocompleteDataSource) {
             weakSelf.autocompleteDataSource.autocompleteData = data[DataKey];
             if (![weakSelf.delegate respondsToSelector:@selector(padWebControllerDidUpdateAutocomplete:)]) {
                 return;
             }
             [weakSelf.delegate padWebControllerDidUpdateAutocomplete:weakSelf];
             return;
         }

         weakSelf.autocompleteDataSource = [HPPadAutocompleteTableViewDataSource new];
         weakSelf.autocompleteDataSource.autocompleteData = data[DataKey];
         if (![weakSelf.delegate respondsToSelector:@selector(padWebControllerDidBeginAutocomplete:)]) {
             return;
         }
         [weakSelf.delegate padWebControllerDidBeginAutocomplete:weakSelf];
     }];

    [self.bridge registerHandler:CollabClientDidConnectHandler
                         handler:^(id data, WVJBResponseCallback responseCallback)
     {
         [weakSelf.API hasGoneOnline];
         if (![weakSelf.collabClientDelegate respondsToSelector:@selector(padWebControllerCollabClientDidConnect:)]) {
             return;
         }
         [weakSelf.collabClientDelegate padWebControllerCollabClientDidConnect:weakSelf];
     }];

    [self.bridge registerHandler:CollabClientDidDisconnectHandler
                         handler:^(NSNumber *hasUncommittedChanges, WVJBResponseCallback responseCallback)
     {
         if (![hasUncommittedChanges isKindOfClass:[NSNumber class]]) {
             TFLog(@"[%@ %@] hasUncommittedChanges is not a number: %@",
                   weakSelf.webView.request.URL.host, weakSelf.pad.padID,
                   NSStringFromClass(hasUncommittedChanges.class));
             return;
         }
         if (hasUncommittedChanges.boolValue) {
             @synchronized (weakSelf.API) {
                 if (weakSelf.API.isSignedIn) {
                     weakSelf.API.authenticationState = HPReconnectAuthenticationState;
                 }
             }
         }
         if (![weakSelf.collabClientDelegate respondsToSelector:@selector(padWebController:collabClientDidDisconnectWithUncommittedChanges:)]) {
             return;
         }
         [weakSelf.collabClientDelegate padWebController:weakSelf
         collabClientDidDisconnectWithUncommittedChanges:hasUncommittedChanges.boolValue];
     }];

    [self.bridge registerHandler:CollabClientDidSynchronizeHandler
                         handler:^(id data, WVJBResponseCallback responseCallback)
    {
        if (![weakSelf.collabClientDelegate respondsToSelector:@selector(padWebControllerCollabClientDidSynchronize:)]) {
            return;
        }
        [weakSelf.collabClientDelegate padWebControllerCollabClientDidSynchronize:weakSelf];
    }];

    [self.bridge registerHandler:ConnectionTroubleHandler
                         handler:^(NSDictionary *data,
                                   WVJBResponseCallback responseCallback)
     {
         TFLog(@"[%@ %@] Connection trouble for: %@: %@",
               weakSelf.space.URL.host, weakSelf.pad.padID,
               data[MessageKey], data[DebugMessagesKey]);
#if 0
         [[[UIAlertView alloc] initWithTitle:@"Connection Trouble"
                                     message:data
                                    delegate:nil
                           cancelButtonTitle:nil
                           otherButtonTitles:@"OK", nil] show];
#endif
     }];

    [self.bridge registerHandler:DocumentDidFailLoadHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         TFLog(@"[%@ %@] Failed to load page.", weakSelf.space.URL.host,
               weakSelf.pad.padID);
     }];

    [self.bridge registerHandler:FreakOutHandler
                         handler:^(id data, WVJBResponseCallback responseCallback)
     {
         if (![weakSelf.delegate respondsToSelector:@selector(padWebControllerDidFreakOut:)]) {
             return;
         }
         [weakSelf.delegate padWebControllerDidFreakOut:weakSelf];
     }];

    [self.bridge registerHandler:GetViewportWidthHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         responseCallback([UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPad
                          ? [NSNumber numberWithInt:CGRectGetWidth(weakSelf.webView.frame)]
                          : [NSNull null]);
     }];

    [self.bridge registerHandler:LogHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         if (![data isKindOfClass:[NSDictionary class]] ||
             ![data[ArgumentsKey] isKindOfClass:[NSArray class]]) {
             return;
         }
         NSMutableString *s = [NSMutableString stringWithFormat:@"[%@ %@] JavaScript:",
                               weakSelf.webView.request.URL.host, weakSelf.pad.padID];
         for (id obj in data[ArgumentsKey]) {
             [s appendString:@" "];
             [s appendString:[obj description]];
         }
         NSNumber *isError = data[ErrorKey];
         if ([isError isKindOfClass:[NSNumber class]] && [isError boolValue]) {
             TFLog(@"%@", s);
         } else {
             HPLog(@"%@", s);
         }
     }];

    [self.bridge registerHandler:OpenLinkHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         NSString *URLString = data[HrefKey];
         if (![URLString isKindOfClass:[NSString class]] ||
             ![weakSelf.delegate respondsToSelector:@selector(padWebController:didOpenURL:)]) {
             return;
         }
         NSURL *URL = [NSURL URLWithString:URLString
                             relativeToURL:weakSelf.webView.request.URL];
         [weakSelf.delegate padWebController:weakSelf
                                  didOpenURL:URL];
     }];

    [self.bridge registerHandler:SetHasNetworkActivityHandler
                         handler:^(NSNumber *hasNetworkActivity,
                                   WVJBResponseCallback responseCallback)
    {
        if (![hasNetworkActivity isKindOfClass:[NSNumber class]]) {
            TFLog(@"[%@ %@] hasNetworkAcvitity is not a number: %@",
                  weakSelf.webView.request.URL.host, weakSelf.pad.padID,
                  NSStringFromClass(hasNetworkActivity.class));
            return;
        }
        weakSelf.networkActivity = hasNetworkActivity.boolValue;
    }];

    [self.bridge registerHandler:SetSharingOptionsHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         [weakSelf.pad.sharingOptions hp_performBlock:^(HPSharingOptions *sharingOptions,
                                                        NSError *__autoreleasing *error)
          {
              if (![data isKindOfClass:[NSDictionary class]]) {
                  return;
              }
              NSString *guestPolicy = data[GuestPolicyKey];
              if ([guestPolicy isKindOfClass:[NSString class]]) {
                  sharingOptions.sharingType = [HPSharingOptions sharingTypeWithString:guestPolicy];
              }
              NSNumber *isModerated = data[IsModeratedKey];
              if ([isModerated isKindOfClass:[NSNumber class]]) {
                  sharingOptions.moderated = [isModerated boolValue];
              }
          } completion:^(HPSharingOptions *sharingOptions, NSError *error) {
              if (error) {
                  TFLog(@"[%@ %@] Couldn't save sharing options: %@",
                        weakSelf.space.URL.host, weakSelf.pad.padID, error);
              }
          }];
     }];

    [self.bridge registerHandler:SetTitleHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         if (![data isKindOfClass:[NSString class]]) {
             return;
         }
         [weakSelf.pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
             pad.title = data;
         } completion:^(HPPad *pad, NSError *error) {
             if (error) {
                 TFLog(@"[%@ %@] Couldn't save title change: %@",
                       weakSelf.space.URL.host, weakSelf.pad.padID, error);
             }
         }];
     }];

    [self.bridge registerHandler:SignInHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         [weakSelf.API signInEvenIfSignedIn:YES];
     }];

    [self.bridge registerHandler:UpdateNetworkActivityHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         if (![weakSelf.delegate respondsToSelector:@selector(padWebController:didUpdateChannelState:collabState:)] ||
             ![data isKindOfClass:[NSDictionary class]] ||
             ![data[ChannelStateKey] isKindOfClass:[NSString class]] ||
             ![data[CollabStateKey] isKindOfClass:[NSString class]]) {
             return;
         }
         [weakSelf.delegate padWebController:weakSelf
                       didUpdateChannelState:data[ChannelStateKey]
                                 collabState:data[CollabStateKey]];
     }];

    [self.bridge registerHandler:UploadImageHandler
                         handler:^(NSDictionary *data, WVJBResponseCallback responseCallback)
     {
         if (![data isKindOfClass:[NSDictionary class] ] ||
             ![data[AttachmentIDKey] isKindOfClass:[NSString class]] ||
             !weakSelf.insertingImageData) {
             return;
         }
         NSData *imageData = weakSelf.insertingImageData;
         NSManagedObjectID * __block objectID;
         [weakSelf.pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
             static NSString * const ImageJPEGContentType = @"image/jpeg";
             static NSString * const DefaultFileName = @"photo.jpg";
             static NSString * const RootURLKey = @"rootURL";
             HPImageUpload *imageUpload = [NSEntityDescription insertNewObjectForEntityForName:HPImageUploadEntity
                                                                        inManagedObjectContext:pad.managedObjectContext];
             imageUpload.image = imageData;
             imageUpload.contentType = ImageJPEGContentType;
             imageUpload.fileName = DefaultFileName;
             imageUpload.attachmentID = data[AttachmentIDKey];
             imageUpload.rootURL = data[RootURLKey];
             if (![pad.managedObjectContext obtainPermanentIDsForObjects:@[imageUpload]
                                                                   error:error]) {
                 [pad.managedObjectContext deleteObject:imageUpload];
             }
             [pad addImageUploadsObject:imageUpload];
             // Trigger HPPadCacheController's FRC to refresh the pad object
             pad.padID = pad.padID;
             objectID = imageUpload.objectID;
         } completion:^(HPPad *pad, NSError *error) {
             weakSelf.insertingImageData = nil;
             NSURL *URL = [[NSURL alloc] initWithScheme:HPImageUploadScheme
                                                   host:objectID.URIRepresentation.host
                                                   path:objectID.URIRepresentation.path];
             [weakSelf updateAttachmentWithID:data[AttachmentIDKey]
                                          URL:URL
                                          key:@""
                                   completion:nil];
         }];
     }];

    [self.bridge registerHandler:UserInfoHandler
                         handler:^(id data,
                                   WVJBResponseCallback responseCallback)
     {
         if (![data isKindOfClass:[NSDictionary class]]) {
             return;
         }
         NSDictionary *userInfoDictionary = data[UserInfoKey];
         NSNumber *addUser = data[AddUserKey];
         if (![userInfoDictionary isKindOfClass:[NSDictionary class]] ||
             ![addUser isKindOfClass:[NSNumber class]]) {
             return;
         }
         HPUserInfo *userInfo = [[HPUserInfo alloc] initWithDictionary:userInfoDictionary];
         [weakSelf.userInfos removeUserInfo:userInfo];
         if (addUser.boolValue) {
             [weakSelf.userInfos addUserInfo:userInfo];
         }
         if (![weakSelf.delegate respondsToSelector:@selector(padWebControllerDidUpdateUserInfo:)]) {
             return;
         }
         [weakSelf.delegate padWebControllerDidUpdateUserInfo:weakSelf];
     }];

     [self.bridge registerHandler:DeletePadHandler
                          handler:^(id data, WVJBResponseCallback responseCallback)
      {
          if (weakSelf.pad.deleting) {
              return;
          }
          NSString * host = weakSelf.pad.URL.host;
          [[[UIAlertView alloc] initWithTitle:weakSelf.pad.title
                                      message:@"This pad has been deleted."
                                     delegate:nil
                            cancelButtonTitle:nil
                            otherButtonTitles:@"OK", nil] show];
          [weakSelf.pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
              [pad.managedObjectContext deleteObject:pad];
          } completion:^(HPPad *pad, NSError *error) {
              if (!error) {
                  return;
              }
              TFLog(@"[%@ %@] Could not delete pad: %@", host, pad.padID, error);
          }];
      }];
}

- (void)reconnectCollabClient
{
    [self.bridge callHandler:ReconnectCollabClientHandler];
}

- (void)updateViewportWidth
{
    if ([UIDevice currentDevice].userInterfaceIdiom != UIUserInterfaceIdiomPad) {
        return;
    }
    [self.bridge callHandler:UpdateViewportWidthHandler
                        data:@(CGRectGetWidth(self.webView.frame))];
}

- (void)quickCam
{
    [self.bridge callHandler:QuickCamHandler];
}

// These can't use the bridge as they need to block
- (BOOL)saveFocus
{
    return [self.webView stringByEvaluatingJavaScriptFromString:@"hackpadKit.saveFocus()"].boolValue;
}

- (void)restoreFocus
{
    [self.webView stringByEvaluatingJavaScriptFromString:@"hackpadKit.restoreFocus()"];
}

- (void)clickToolbarWithCommand:(NSString *)command
{
    [self.bridge callHandler:DoToolbarClickHandler
                        data:command];
}

- (void)insertImage:(UIImage *)image
{
    @autoreleasepool {
        if (MAX(image.size.width, image.size.height) > MaxImageSize) {
            image = [image resizedImageWithContentMode:UIViewContentModeScaleAspectFit
                                                bounds:CGSizeMake(MaxImageSize, MaxImageSize)
                                  interpolationQuality:kCGInterpolationHigh];
        }
        self.insertingImageData = UIImageJPEGRepresentation(image, 0.85);
    }
    [self.bridge callHandler:InsertImageHandler];
}

- (void)setVisibleEditorHeight:(CGFloat)visibleEditorHeight
{
    _visibleEditorHeight = visibleEditorHeight;
    [self.bridge callHandler:SetVisibleEditorHeight
                        data:@(visibleEditorHeight)];
}

- (void)insertString:(NSString *)text
{
    [self.bridge callHandler:InsertTextHandler
                        data:text];
}

- (void)insertNewLine
{
    [self.bridge callHandler:DoReturnKeyHandler];
}

- (void)deleteText
{
    [self.bridge callHandler:DoDeleteKeyHandler];
}

- (void)selectAutocompleteData:(NSString *)selectedData
                       atIndex:(NSUInteger)index
{
    NSDictionary *data = @{SelectedKey:selectedData,
                           SelectedIndexKey:@(index)};
    [self.bridge callHandler:AutocompleteHandler
                        data:data];
}

- (void)canUndoOrRedoWithCompletion:(void (^)(BOOL, BOOL))handler
{
    [self.bridge callHandler:CanUndoRedoHandler
                        data:nil
            responseCallback:^(NSDictionary *data)
     {
         if (![data isKindOfClass:[NSDictionary class]] ||
             ![data[UndoKey] isKindOfClass:[NSNumber class]] ||
             ![data[RedoKey] isKindOfClass:[NSNumber class]]) {
             handler(NO, NO);
         }
         handler([data[UndoKey] boolValue], [data[RedoKey] boolValue]);
     }];
}

- (void)undo
{
    [self.bridge callHandler:DoUndoRedoHandler
                        data:UndoKey];
}

- (void)redo
{
    [self.bridge callHandler:DoUndoRedoHandler
                        data:RedoKey];
}

- (void)updateAttachmentWithID:(NSString *)attachmentID
                           URL:(NSURL *)URL
                           key:(NSString *)key
                    completion:(void (^)(void))handler
{
    static NSString * const SetAttachmentURLHandler = @"setAttachmentURL";
    static NSString * const KeyKey = @"key";
    static NSString * const URLKey = @"url";

    NSDictionary *data = @{AttachmentIDKey:attachmentID,
                           URLKey:URL.absoluteString,
                           KeyKey:key};
    [self.bridge callHandler:SetAttachmentURLHandler
                        data:data
            responseCallback:^(id responseData) {
                if (handler) {
                    handler();
                }
            }];
}

#pragma mark - Client vars

- (void)getClientVarsAndTextWithCompletion:(void (^)(NSDictionary *, NSString *))handler
{
    NSString * const InvalidClientVarsDataCheckpoint = @"InvalidClientVarsData";
    NSParameterAssert(self.pad);
    NSParameterAssert(handler);
    HPPadWebController * __weak weakSelf = self;
    [self.bridge callHandler:GetClientVarsAndTextHandler
                        data:self.pad.clientVars
            responseCallback:^(NSDictionary *data) {
                if (![data isKindOfClass:[NSDictionary class]] ||
                    ![data[ClientVarsKey] isKindOfClass:[NSDictionary class]] ||
                    ![data[TextKey] isKindOfClass:[NSString class]]) {
                    [TestFlight passCheckpoint:InvalidClientVarsDataCheckpoint];
                    TFLog(@"[%@ %@] Invalid data from %@: %@",
                          weakSelf.webView.request.URL.host,
                          weakSelf.pad.padID,
                          GetClientVarsAndTextHandler,
                          data);
                    handler(nil, nil);
                    return;
                }
                handler(data[ClientVarsKey], data[TextKey]);
            }];
}

- (void)saveClientVarsAndTextWithCompletion:(void (^)(void))handler
{
    [self getClientVarsAndTextWithCompletion:^(NSDictionary *clientVars, NSString *text) {
        if (!clientVars) {
            if (handler) {
                handler();
            }
            return;
        }
        // Use strong reference to self here so we don't get released before saving state.
        [self.pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
            [pad setClientVars:clientVars
                lastEditedDate:[NSDate date].timeIntervalSinceReferenceDate];
            if (!pad.search) {
                pad.search = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass([HPPadSearch class])
                                                           inManagedObjectContext:pad.managedObjectContext];
            }
            // setting clientVars updates search text, but that doesn't account
            // for offline edits, so still set it here.
            pad.search.content = text;
            pad.search.lastEditedDate = pad.editor.clientVarsLastEditedDate;
        } completion:^(HPPad *pad, NSError *error) {
            if (!handler) {
                return;
            }
            handler();
        }];
    }];
}

#pragma mark - Notifications

- (void)APIDidSignInWithNotification:(NSNotification *)note
{
    if (!self.isLoaded) {
        return;
    }
    [self reconnectCollabClient];
}

- (void)padDidGetGlobalPadIDWithNotification:(NSNotification *)note
{
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:HPPadDidGetGlobalPadIDNotification
                                                  object:self.pad];
    HPPadWebController * __weak weakSelf = self;
    NSOperation *op = [NSBlockOperation blockOperationWithBlock:^{

        NSDictionary *clientVars = @{PadIdKey:weakSelf.pad.padID,
                                     GlobalPadIdKey:note.userInfo[HPGlobalPadIDKey],
                                     CollabClientVarsKey:@{
                                             PadIdKey:weakSelf.pad.padID,
                                             GlobalPadIdKey:note.userInfo[HPGlobalPadIDKey]
                                             }
                                     };
        [weakSelf addClientVars:clientVars];
    }];
    [self.loadCallbackOperation addDependency:op];
    [op addDependency:self.clientVarsOperation];
    [[NSOperationQueue mainQueue] addOperation:op];
}

- (void)saveClientVarsAndTextWithNotification:(NSNotification *)note
{
    if (!self.pad) {
        return;
    }
    [self saveClientVarsAndTextWithCompletion:nil];
}

- (void)managedObjectContextDidSaveWithNotification:(NSNotification *)note
{
    if (!self.pad || ![note.userInfo[NSDeletedObjectsKey] member:self.pad]) {
        return;
    }
    HPLog(@"[%@] Pad was deleted, unloading web view.", self.pad.URL.host);
    self.webView.delegate = nil;
    [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:AboutBlank]]];

    if ([self.delegate respondsToSelector:@selector(padWebControllerDidDeletePad:)]) {
        [self.delegate padWebControllerDidDeletePad:self];
    }

    if (![self.collabClientDelegate respondsToSelector:@selector(padWebController:collabClientDidDisconnectWithUncommittedChanges:)]) {
        return;
    }
    [self.collabClientDelegate padWebController:self
collabClientDidDisconnectWithUncommittedChanges:NO];
    self.pad = nil;
}

#pragma mark - Web view delegate

- (BOOL)webView:(UIWebView *)webView
shouldStartLoadWithRequest:(NSURLRequest *)request
 navigationType:(UIWebViewNavigationType)navigationType
{
    NSParameterAssert(request);
    HPLog(@"[%@] shouldStartLoading? %@", self.space.URL.host, request.URL);
    if (![self.delegate respondsToSelector:@selector(webView:shouldStartLoadWithRequest:navigationType:)]) {
        return YES;
    }
    return [self.delegate webView:webView
       shouldStartLoadWithRequest:request
                   navigationType:navigationType];
}

- (void)webViewDidStartLoad:(UIWebView *)webView
{
    ++self.loadingFrameCount;
    if (![self.delegate respondsToSelector:@selector(webViewDidStartLoad:)]) {
        return;
    }
    [self.delegate webViewDidStartLoad:webView];
}

- (void)webViewDidFinishLoad:(UIWebView *)webView
{
    static NSString * const TypeofClientVarsKey = @"typeofClientVars";
    static NSString * const TypeofJQueryKey = @"typeofJQuery";

    static NSString * const TypeofUndefined = @"undefined";

    if ([self.delegate respondsToSelector:@selector(webViewDidFinishLoad:)]) {
        [self.delegate webViewDidFinishLoad:webView];
    }
    HPLog(@"%ld (%@ - %@)", (long)(self.loadingFrameCount - 1),
          [webView stringByEvaluatingJavaScriptFromString:@"document.readyState"],
          [webView stringByEvaluatingJavaScriptFromString:@"typeof $"]);
    if (--self.loadingFrameCount) {
        return;
    }
    if (self.refreshControl.isRefreshing) {
        [self.refreshControl endRefreshing];
    }
    // Quick check to see if we've already run the Hackpad script.
    // This could be part of the script, but this can be called multiple times
    // while the script is only run once per page.
    if (!webView.request.URL.hp_isHackpadURL ||
        [webView stringByEvaluatingJavaScriptFromString:@"'hackpadKit' in window"].boolValue) {
        return;
    }

    //self.networkActivityState = self.networkActivityState & ~DownloadingMask;

    NSString *JSONString = [webView hp_stringByEvaluatingJavaScriptNamed:@"Hackpad.js"];
    NSError * __autoreleasing error;
    NSDictionary *JSON = [NSJSONSerialization JSONObjectWithData:[JSONString dataUsingEncoding:NSUTF8StringEncoding]
                                                         options:0
                                                           error:&error];
    if (!JSONString.length) {
        TFLog(@"[%@ %@] Hackpad.js returned an empty string.",
              self.space.URL.host, self.pad.padID);
    } else if (error) {
        TFLog(@"[%@ %@] Could not parse Hackpad.js result: %@",
              self.space.URL.host, self.pad.padID, error);
        self.onloadError = error;
    } else if (![JSON isKindOfClass:[NSDictionary class]]) {
        TFLog(@"[%@ %@] Hackpad.js returned non-dictionary: %@",
              self.space.URL.host, self.pad.padID,
              NSStringFromClass([JSON class]));
        self.onloadError = [NSError errorWithDomain:HPHackpadErrorDomain
                                               code:HPPadInitializationError
                                           userInfo:nil];
    } else if (![JSON[LoadedKey] isKindOfClass:[NSNumber class]] || ![JSON[LoadedKey] boolValue]) {
        self.onloadError = [NSError errorWithDomain:HPHackpadErrorDomain
                                               code:HPPadInitializationError
                                           userInfo:nil];
        if ([TypeofUndefined isEqual:JSON[TypeofJQueryKey]]) {
            TFLog(@"[%@ %@] jQuery failed to load.", self.space.URL.host,
                  self.pad.padID);
        } else if ([TypeofUndefined isEqual:JSON[TypeofClientVarsKey]]) {
            TFLog(@"[%@ %@] clientVars wasn't set.", self.space.URL.host,
                  self.pad.padID);
        } else if ([JSON[FailedURLsKey] isKindOfClass:[NSArray class]] && [JSON[FailedURLsKey] count]) {
            TFLog(@"[%@ %@] CSS failed to load: %@", self.space.URL.host,
                  self.pad.padID, JSON[FailedURLsKey]);
        } else {
            TFLog(@"[%@ %@] Not sure why page failed to load.",
                  self.space.URL.host, self.pad.padID);
        }
    } else {
        // Loaded OK so far! Force-load this now instead of waiting for everything.
        [webView hp_stringByEvaluatingJavaScriptNamed:@"WebViewJavascriptBridge.js.txt"];
    }
    if (self.webViewLoadOperation.isFinished ||
        [[[NSOperationQueue mainQueue] operations] containsObject:self.webViewLoadOperation]) {
        return;
    }
    [[NSOperationQueue mainQueue] addOperation:self.webViewLoadOperation];
    HPLog(@"Adding webViewLoad operation");
}

- (void)webView:(UIWebView *)webView
didFailLoadWithError:(NSError *)error
{
    --self.loadingFrameCount;
    TFLog(@"[%@ %@] Content failed to load: %@", self.space.URL.host,
          self.pad.padID, error);
    if (![self.delegate respondsToSelector:@selector(webView:didFailLoadWithError:)]) {
        return;
    }
    [self.delegate webView:webView
      didFailLoadWithError:error];
}

- (void)setSearchBarScrolledOffScreen:(BOOL)scrolledOffScreen
                             animated:(BOOL)animated
{
    CGFloat offset = scrolledOffScreen ? CGRectGetHeight(self.searchBar.bounds) : 0;
    offset -= self.webView.scrollView.contentInset.top;
    [self.webView.scrollView setContentOffset:CGPointMake(0, offset)
                                     animated:animated];
}

- (void)maybeScrollSearchBarOffScreen
{
    if (!self.searchBar) {
        return;
    }

    CGFloat offset = self.webView.scrollView.contentOffset.y + self.webView.scrollView.contentInset.top;
    CGFloat height = CGRectGetHeight(self.searchBar.bounds);
    if (offset >= height) {
        return;
    }
    [self.webView.scrollView bringSubviewToFront:self.searchBar];
    [self setSearchBarScrolledOffScreen:offset > height / 3
                               animated:YES];
}

- (void)scrollViewDidEndDragging:(UIScrollView *)scrollView
                  willDecelerate:(BOOL)decelerate
{
    if (decelerate) {
        return;
    }
    [self maybeScrollSearchBarOffScreen];
}

- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView
{
    [self maybeScrollSearchBarOffScreen];
}

@end
