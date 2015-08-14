//
//  HPAPI.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPAPI.h"

#import "HackpadKit.h"
#import "HackpadAdditions.h"
#import "HPReachability.h"

#import "GTMOAuthAuthentication.h"
#import "GTMNSString+HTML.h"
#import "KeychainItemWrapper.h"
#import <TestFlight/TestFlight.h>

#import <stdlib.h>

//#define DEBUG_COOKIES 1

NSString * const HPAPIDidRequireUserActionNotification = @"HPAPIDidRequireUserActionNotification";
NSString * const HPAPIDidFailToSignInNotification = @"HPAPIDidFailToSignInNotification";
NSString * const HPAPIDidSignInNotification = @"HPAPIDidSignInNotification";
NSString * const HPAPIDidSignOutNotification = @"HPAPIDidSignOutNotification";

NSString * const HPAPINewUserIDKey = @"HPAPINewUserIDKey";
NSString * const HPAPISignInErrorKey = @"HPAPISignInErrorKey";

NSString * const HPAPIXSRFTokenParam = @"xsrf";

static NSString * const HPAPIKeyPath = @"/ep/account/api-key";
static NSString * const HPSessionSignInPath = @"/ep/account/session-sign-in";
static NSString * const HPSignInPath = @"/ep/account/sign-in";
static NSString * const SignedInPath = @"/ep/iOS/x-HackpadKit-signed-in";

static NSString * const SuccessKey = @"success";
static NSString * const ErrorKey = @"error";
static NSString * const KeyKey = @"key";
static NSString * const SecretKey = @"secret";

static NSString * const TrackingCookieName = @"ET";

static NSMutableDictionary *APIs;
static NSData * deviceTokenData;

@interface HPAPI () <NSURLConnectionDataDelegate>  {
    NSURLRequest * __weak _authenticationRequest;
    KeychainItemWrapper *_keychainItem;
    id _reachabilityObserver;
    NSUInteger reconnectAttempts;
    NSUInteger reconnectID;
    HPAuthenticationState _authenticationState;
    GTMOAuthAuthentication *_pendingOAuth;
    NSOperationQueue *operationQueue;
    NSUInteger _sessionID;
}

@property (nonatomic, strong) NSCondition *signInAsCond;
@property (nonatomic, strong) NSMutableURLRequest *signInAsRequest;
@property (nonatomic, strong) id signInAsSignInObserver;
@property (nonatomic, strong) id signInAsSignOutObserver;

- (id)initWithURL:(NSURL *)URL;

- (void)requestAPISecret;
- (void)ensureAPISession;

- (BOOL)loadOAuthFromKeychain;
- (void)savePendingOAuthToKeychain;

- (void)updateAuthenticationStateValue:(HPAuthenticationState)authenticationState;
- (void)postSignInNotificationWithError:(NSError *)error;
- (id)addReachabilityObserver;
- (void)scheduleReconnect;
- (void)cancelReconnect;
@end

@implementation HPAPI

+ (NSData *)sharedDeviceTokenData
{
    NSAssert([NSThread isMainThread], @"%s called on non-main thread.", __PRETTY_FUNCTION__);
    return deviceTokenData;
}

+ (void)setSharedDeviceTokenData:(NSData *)tokenData
{
    NSAssert([NSThread isMainThread], @"%s called on non-main thread.", __PRETTY_FUNCTION__);
    deviceTokenData = tokenData;
}

+ (NSDictionary *)sharedDeviceTokenParams
{
    static NSString * const IOSDeviceTokenParam = @"iosDeviceToken";
    static NSString * const IOSAppIDParam= @"iosAppId";
    return deviceTokenData
        ? @{IOSDeviceTokenParam: deviceTokenData.hp_hexEncodedString,
            IOSAppIDParam: [[NSBundle mainBundle] bundleIdentifier]}
        : @{};
}

#pragma mark - Object Initialization

- (id)init
{
    NSAssert(NO, @"This object must be instantiated with initWithURL:");
    return nil;
}

- (id)initWithURL:(NSURL *)URL
{
    NSParameterAssert([URL isKindOfClass:[NSURL class]]);
    NSParameterAssert(URL.host.length);
    self = [super init];
    if (self) {
        _URL = URL;
        _keychainItem = [[KeychainItemWrapper alloc] initWithIdentifier:URL.absoluteString
                                                            accessGroup:nil];
        _reachability = [HPReachability reachabilityForInternetConnection];
        _reachabilityObserver = [self addReachabilityObserver];
        operationQueue = [[NSOperationQueue alloc] init];
        // We @synchronize everything anyway...
        operationQueue.maxConcurrentOperationCount = 1;
        operationQueue.name = [URL.host stringByAppendingString:@" API Queue"];
    }
    return self;
}

- (void)addSignInAsObserversWithAPI:(HPAPI *)API
{
    HPLog(@"[%@] Deferring signInAs until %@ has signed in (or out).",
          self.URL.host, API.URL.host);
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    self.signInAsSignInObserver = [nc addObserverForName:HPAPIDidSignInNotification
                                                  object:API
                                                   queue:[NSOperationQueue mainQueue]
                                              usingBlock:^(NSNotification *note)
                                   {
                                       @synchronized (self) {
                                           [self removeSignInAsObservers];
                                           if (self.authenticationState != HPSignInAsAuthenticationState) {
                                               return;
                                           }
                                           [self signInAs];
                                       }
                                   }];
    self.signInAsSignOutObserver = [nc addObserverForName:HPAPIDidSignOutNotification
                                                   object:API
                                                    queue:[NSOperationQueue mainQueue]
                                               usingBlock:^(NSNotification *note)
                                    {
                                        @synchronized (self) {
                                            [self removeSignInAsObservers];
                                            if (self.authenticationState != HPSignInAsAuthenticationState) {
                                                return;
                                            }
                                            self.authenticationState = HPSignInPromptAuthenticationState;
                                        }
                                    }];
}

- (void)removeSignInAsObservers
{
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    if (self.signInAsSignInObserver) {
        [nc removeObserver:self.signInAsSignInObserver];
        self.signInAsSignInObserver = nil;
    }
    if (self.signInAsSignOutObserver) {
        [nc removeObserver:self.signInAsSignOutObserver];
        self.signInAsSignOutObserver = nil;
    }
}

- (void)dealloc
{
    if (_reachabilityObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_reachabilityObserver];
    }
    [_reachability stopNotifier];
    [self removeSignInAsObservers];
}

- (id)addReachabilityObserver
{
    NSParameterAssert(!_reachabilityObserver);
    HPAPI * __weak weakSelf = self;
    return [[NSNotificationCenter defaultCenter] addObserverForName:kReachabilityChangedNotification
                                                             object:_reachability
                                                              queue:operationQueue
                                                         usingBlock:^(NSNotification *note)
            {
                HPAPI *blockSelf = weakSelf;
                NetworkStatus status = [note.object currentReachabilityStatus];
                HPLog(@"[%@] Going %@.", blockSelf.URL.host, status ? @"online" : @"offline");
                @synchronized (blockSelf) {
                    if (status) {
                        if (!blockSelf->_authenticationRequest) {
                            switch (blockSelf.authenticationState) {
                            case HPSignInAsAuthenticationState:
                                [blockSelf signInAs];
                                break;
                            case HPRequestAPISecretAuthenticationState:
                                [blockSelf requestAPISecret];
                                break;
                            case HPReconnectAuthenticationState:
                                [blockSelf ensureAPISession];
                                break;
                            default:
                                break;
                            }
                        }
                    } else {
                        // Cancel any requests since we're offline.
                        blockSelf->_authenticationRequest = nil;
                    };
                }
            }];
}

#pragma mark - Public API

+ (id)APIWithURL:(NSURL *)URL
{
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        APIs = [NSMutableDictionary dictionary];
    });
    HPAPI *API;
    URL = [[NSURL URLWithString:@"/"
                  relativeToURL:URL] absoluteURL];
    @synchronized (APIs) {
        API = APIs[URL];
        if (!API) {
            API = [[self alloc] initWithURL:URL];
            APIs[URL] = API;
        }
    }
    return API;
}

+ (void)removeAPIWithURL:(NSURL *)URL
{
    URL = [[NSURL URLWithString:@"/"
                  relativeToURL:URL] absoluteURL];
    HPAPI *API;
    @synchronized (APIs) {
        API = APIs[URL];
        [APIs removeObjectForKey:URL];
    }
    API.authenticationState = HPInactiveAuthenticationState;
}

+ (NSString *)stringWithAuthenticationState:(HPAuthenticationState)authenticationState
{
#define CASE(_x) case (_x): return @#_x
    switch (authenticationState) {
    CASE(HPNotInitializedAuthenticationState);
    CASE(HPRequiresSignInAuthenticationState);
    CASE(HPSignInPromptAuthenticationState);
    CASE(HPSignInAsAuthenticationState);
    CASE(HPRequestAPISecretAuthenticationState);
    CASE(HPReconnectAuthenticationState);
    CASE(HPChangedUserAuthenticationState);
    CASE(HPSignedInAuthenticationState);
    CASE(HPSigningOutAuthenticationState);
    CASE(HPInactiveAuthenticationState);
    default:
        return nil;
    }
#undef CASE
}

+ (NSOperationQueue *)sharedAPIQueue
{
    static NSOperationQueue *operationQueue;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        operationQueue = [NSOperationQueue new];
        operationQueue.maxConcurrentOperationCount = 1;
        operationQueue.name = @"HPAPI sharedAPIQueue";
    });
    return operationQueue;
}

+ (HPURLType)URLTypeWithURL:(NSURL *)URL
{
    static NSString * const HPPadSearchPath = @"/ep/search";
    static NSString * const ProfilePath = @"/ep/profile/";
    static NSString * const GroupPath = @"/ep/group/";
    static NSString * const CollectionPath = @"/collection/";

    if (!URL.hp_isHackpadURL) {
        return HPExternalURLType;
    }
    if (!URL.path.length || [URL.path isEqualToString:@"/"]) {
        return HPSpaceURLType;
    }
    if ([HPPad padIDWithURL:URL]) {
        return HPPadURLType;
    }
    if ([URL.path isEqualToString:HPPadSearchPath]) {
        return HPSearchURLType;
    }
    if ([URL.path hasPrefix:ProfilePath] && URL.pathComponents.count == 4) {
        return HPUserProfileURLType;
    }
    if (([URL.path hasPrefix:GroupPath] && URL.pathComponents.count == 4) ||
        ([URL.path hasPrefix:CollectionPath] && URL.pathComponents.count == 3)) {
        return HPCollectionURLType;
    }
    return HPUnknownURLType;
}

- (BOOL)isSignInRequiredForRequest:(NSURLRequest *)request
                          response:(NSURLResponse *)response
                             error:(NSError *__autoreleasing *)error
{
    @synchronized(self) {
        if (self.authenticationState == HPInactiveAuthenticationState) {
            HPLog(@"[%@] Ignoring response for removed space: %@",
                  self.URL.host, response.URL.hp_fullPath);
            return YES;
        }

        NSHTTPURLResponse *HTTPResponse;
        if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
            HTTPResponse = (NSHTTPURLResponse *)response;
        }

        if (error &&
            [[*error domain] isEqualToString:NSURLErrorDomain] &&
            [*error code] == NSURLErrorUserCancelledAuthentication) {
            // "No oAuth token sent" -> need to reauth.
        } else if (HTTPResponse.statusCode != 200 ||
                   ![response.URL.path hasPrefix:HPSignInPath]) {
#if 0
            if (HTTPResponse.statusCode == 200 &&
                self.authenticationState == HPReconnectAuthenticationState &&
                !_authenticationRequest &&
                ![HPStaticCachingURLProtocol isCachedResponse:response]) {
                [self ensureAPISession];
            }
#endif
            return NO;
        }

        if (error) {
            NSMutableDictionary *userInfo = [NSMutableDictionary dictionaryWithObjectsAndKeys:
                                             @"Sign in is required.", NSLocalizedDescriptionKey,
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
                                         code:HPSignInRequired
                                     userInfo:userInfo];
        }
        [self signInEvenIfSignedIn:YES];
    }
    return YES;
}

- (id)parseJSONResponse:(NSURLResponse *)response
                   data:(NSData *)data
                request:(NSURLRequest *)request
                  error:(NSError *__autoreleasing *)error
{
    return [self isSignInRequiredForRequest:request
                                   response:response
                                      error:error]
        ? nil : [self.class JSONObjectWithResponse:response
                                              data:data
                                       JSONOptions:0
                                           request:request
                                             error:error];
}

+ (NSString *)XSRFTokenForURL:(NSURL *)URL
{
    NSHTTPCookieStorage *jar = [NSHTTPCookieStorage sharedHTTPCookieStorage];
    NSString * __block tokenValue = @"";
    [[jar cookiesForURL:URL] enumerateObjectsUsingBlock:^(NSHTTPCookie *cookie, NSUInteger idx, BOOL *stop) {
        if (![cookie.name isEqualToString:TrackingCookieName]) {
            return;
        }
        tokenValue = cookie.value;
        *stop = YES;
    }];
    return tokenValue;
}

#pragma mark - State machine

- (BOOL)isSignedIn
{
    return self.authenticationState == HPSignedInAuthenticationState;
}

- (void)signInEvenIfSignedIn:(BOOL)force
{
    @synchronized (self) {
        switch (self.authenticationState) {
            case HPSignedInAuthenticationState:
                if (!force) {
                    break;
                }
                self.authenticationState = HPReconnectAuthenticationState;
                break;
            case HPRequiresSignInAuthenticationState:
                self.authenticationState = HPSignInAsAuthenticationState;
                break;
            default:
                TFLog(@"[%@] Ignoring sign in request while in state %@",
                      self.URL.host,
                      [self.class stringWithAuthenticationState:self.authenticationState]);
        }
    }
}

- (void)updateAuthenticationStateValue:(HPAuthenticationState)authenticationState
{
    HPLog(@"[%@] authenticationState %@ -> %@", self.URL.host,
          [self.class stringWithAuthenticationState:_authenticationState],
          [self.class stringWithAuthenticationState:authenticationState]);

    if (_authenticationState == HPSignInAsAuthenticationState) {
        [self removeSignInAsObservers];
    }

    BOOL changeSignedIn = (_authenticationState == HPSignedInAuthenticationState ||
                           authenticationState == HPSignedInAuthenticationState);
    BOOL wasSigningOut = _authenticationState == HPSigningOutAuthenticationState;

    if (changeSignedIn) {
        [self willChangeValueForKey:@"sessionID"];
        [self willChangeValueForKey:@"signedIn"];
    }
    [self willChangeValueForKey:@"authenticationState"];

    _authenticationState = authenticationState;
    if (changeSignedIn) {
        ++_sessionID;
    }

    [self didChangeValueForKey:@"authenticationState"];
    if (changeSignedIn) {
        [self didChangeValueForKey:@"signedIn"];
    }
    if (_authenticationState == HPSignedInAuthenticationState) {
        [self didChangeValueForKey:@"sessionID"];
    }

    if (!changeSignedIn && !wasSigningOut) {
        return;
    }
    NSString *name = self.isSignedIn
        ? HPAPIDidSignInNotification
        : HPAPIDidSignOutNotification;
    HPLog(@"[%@] Posting %@", self.URL.host, name);
    dispatch_async(dispatch_get_main_queue(), ^{
        [[NSNotificationCenter defaultCenter] postNotificationName:name
                                                            object:self];
    });
}

- (void)setAuthenticationState:(HPAuthenticationState)authenticationState
{
#define ASSERT_STATE(x) NSAssert((x), @"Illegal state transition: %@ to %@", \
    [self.class stringWithAuthenticationState:_authenticationState], \
    [self.class stringWithAuthenticationState:authenticationState])
    @synchronized (self) {
        [self cancelReconnect];

        if (_authenticationState == authenticationState) {
            return;
        }

        if (_authenticationState == HPNotInitializedAuthenticationState) {
            [_reachability startNotifier];
        }

        _authenticationRequest = nil;
        BOOL needsUserAction = NO;
        NSMutableDictionary *userInfo = [NSMutableDictionary dictionary];

        switch (authenticationState) {
        case HPNotInitializedAuthenticationState:
            ASSERT_STATE(authenticationState != HPNotInitializedAuthenticationState);
            break;

        case HPRequiresSignInAuthenticationState:
            // This is always allowed.
            [_keychainItem resetKeychainItem];
            _pendingOAuth = nil;
            _oAuth = nil;
            self.userID = nil;
            break;

        case HPSignInAsAuthenticationState:
            ASSERT_STATE(_authenticationState == HPNotInitializedAuthenticationState ||
                         _authenticationState == HPRequiresSignInAuthenticationState);
            [self updateAuthenticationStateValue:authenticationState];
            [self signInAs];
            return;

        case HPSignInPromptAuthenticationState:
            ASSERT_STATE(_authenticationState == HPNotInitializedAuthenticationState ||
                         _authenticationState == HPRequiresSignInAuthenticationState ||
                         _authenticationState == HPSignInAsAuthenticationState ||
                         _authenticationState == HPReconnectAuthenticationState);
            needsUserAction = YES;
            break;

        case HPRequestAPISecretAuthenticationState:
            ASSERT_STATE(_authenticationState == HPSignInPromptAuthenticationState ||
                         _authenticationState == HPSignInAsAuthenticationState);
            [self requestAPISecret];
            break;

        case HPReconnectAuthenticationState:
            ASSERT_STATE(_authenticationState == HPNotInitializedAuthenticationState ||
                         _authenticationState == HPSignedInAuthenticationState);
            if (!self.oAuth && ![self loadOAuthFromKeychain]) {
                HPLog(@"[%@] Cannot reconnect without credentials.", self.URL.host);
                [self updateAuthenticationStateValue:authenticationState];
                self.authenticationState = HPSignInPromptAuthenticationState;
                return;
            }
            if (_authenticationState == HPSignedInAuthenticationState) {
                [self scheduleReconnect];
            } else {
                [self ensureAPISession];
            }
            break;

        case HPChangedUserAuthenticationState:
            ASSERT_STATE(_authenticationState == HPRequestAPISecretAuthenticationState ||
                         _authenticationState == HPReconnectAuthenticationState);
            [userInfo setObject:_pendingOAuth.consumerKey
                         forKey:HPAPINewUserIDKey];
            needsUserAction = YES;
            break;

        case HPSignedInAuthenticationState:
            ASSERT_STATE(_authenticationState == HPNotInitializedAuthenticationState ||
                         _authenticationState == HPRequestAPISecretAuthenticationState ||
                         _authenticationState == HPReconnectAuthenticationState ||
                         _authenticationState == HPChangedUserAuthenticationState);
            if (_pendingOAuth) {
                [self savePendingOAuthToKeychain];
            }
            if (!self.oAuth && ![self loadOAuthFromKeychain]) {
                HPLog(@"[%@] Cannot reconnect without credentials.", self.URL.host);
                [self updateAuthenticationStateValue:authenticationState];
                self.authenticationState = HPSignInAsAuthenticationState;
                return;
            }
            //reconnectAttempts = 0;
            break;

        case HPSigningOutAuthenticationState:
#if 0
            ASSERT_STATE(_authenticationState == HPRequestAPISecretAuthenticationState ||
                         _authenticationState == HPSignInPromptAuthenticationState ||
                         _authenticationState == HPReconnectAuthenticationState ||
                         _authenticationState == HPSignedInAuthenticationState);
#endif
            // Always permitted?
            break;

        case HPInactiveAuthenticationState:
            // Always permitted.
            break;

        default:
            ASSERT_STATE(authenticationState > HPNotInitializedAuthenticationState &&
                         authenticationState <= HPInactiveAuthenticationState);
            return;
        }

        [self updateAuthenticationStateValue:authenticationState];

        if (needsUserAction) {
            HPLog(@"[%@] posting notification: %@", self.URL.host, HPAPIDidRequireUserActionNotification);
            [[NSNotificationCenter defaultCenter] postNotificationName:HPAPIDidRequireUserActionNotification
                                                                object:self
                                                              userInfo:userInfo];
        }
    }
#undef ASSERT_STATE
}

- (HPAuthenticationState)authenticationState
{
    HPAuthenticationState ret;
    @synchronized (self) {
        ret = _authenticationState;
    }
    return ret;
}

- (NSUInteger)sessionID
{
    NSUInteger ret;
    @synchronized (self) {
        ret = _sessionID;
    }
    return ret;
}

- (void)signInAs
{
    static NSString * const SignInAsPath = @"/ep/account/as";
    static NSString * const ContKey = @"cont";

    if (!self.URL.hp_isHackpadSubdomain) {
        self.authenticationState = HPSignInPromptAuthenticationState;
        return;
    }

    if (![_reachability currentReachabilityStatus]) {
        HPLog(@"[%@] Deferring signInAs while offline.", self.URL.host);
        return;
    }

    NSURL *URL = [NSURL hp_sharedHackpadURL];
    HPAPI *API = [self.class APIWithURL:URL];
    GTMOAuthAuthentication *oAuth;
    @synchronized (API) {
        if (API.oAuth || [API loadOAuthFromKeychain]) {
            oAuth = API.oAuth;
        } else if (API.authenticationState != HPRequiresSignInAuthenticationState &&
                   API.authenticationState != HPInactiveAuthenticationState) {
            NSAssert(API.authenticationState != HPSignedInAuthenticationState,
                     @"Root API is signed in, so it should have oAuth information");
            [self addSignInAsObserversWithAPI:API];
            return;
        }
    }
    if (!oAuth) {
        TFLog(@"[%@] Can't sign in as since parent domain %@ has no oAuth",
              self.URL.host, API.URL.host);
        self.authenticationState = HPSignInPromptAuthenticationState;
        return;
    }

    HPAPI * __weak weakSelf = self;
    [[self.class sharedAPIQueue] addOperationWithBlock:^{
        HPAPI *strongSelf = weakSelf;
        if (!strongSelf) {
            return;
        }
        NSURL *URL = [NSURL URLWithString:SignInAsPath
                            relativeToURL:strongSelf.URL];
        NSDictionary *params = @{ContKey:SignedInPath};
        strongSelf.signInAsRequest = [NSMutableURLRequest hp_requestWithURL:URL
                                                                 HTTPMethod:@"POST"
                                                                 parameters:params];
        [oAuth addResourceTokenHeaderToRequest:strongSelf.signInAsRequest];
        strongSelf->_authenticationRequest = strongSelf.signInAsRequest;

        self.signInAsCond = [NSCondition new];
        [self.signInAsCond lock];

        NSDate * __block date;
        [[NSOperationQueue mainQueue] addOperationWithBlock:^{
            NSURLConnection *conn = [NSURLConnection connectionWithRequest:strongSelf.signInAsRequest
                                                                  delegate:self];
            date = [NSDate date];
            [conn start];
        }];
        while (strongSelf.signInAsRequest) {
            [self.signInAsCond wait];
        }
        HPLog(@"[%@] Request %@ took %.3f seconds", URL.host, URL.hp_fullPath,
              -date.timeIntervalSinceNow);
        [self.signInAsCond unlock];
        self.signInAsCond = nil;
    }];
}

- (void)requestAPISecret
{
    if (![_reachability currentReachabilityStatus]) {
        HPLog(@"[%@] Deferring requestAPISecret while offline.", self.URL.host);
        return;
    }
    NSURL *URL = [NSURL URLWithString:HPAPIKeyPath
                        relativeToURL:self.URL];
    NSMutableDictionary *params = [[self.class sharedDeviceTokenParams] mutableCopy];
    params[HPAPIXSRFTokenParam] = [HPAPI XSRFTokenForURL:URL];
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    _authenticationRequest = request;
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:operationQueue
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         @synchronized(self) {
             if (_authenticationRequest != request) {
                 HPLog(@"[%@] Ignoring canceled request: %@", self.URL.host,
                       request.URL.hp_fullPath);
                 return;
             }

             NSAssert(_authenticationState == HPRequestAPISecretAuthenticationState,
                      @"[%@] Unexpected state %lu; expected: %lu",
                      self.URL.host, (unsigned long)_authenticationState,
                      (unsigned long)HPRequestAPISecretAuthenticationState);

             id JSON = [self parseJSONResponse:response
                                          data:data
                                       request:request
                                         error:&error];

             if (error) {
                 [self postSignInNotificationWithError:error];
                 self.authenticationState = HPRequiresSignInAuthenticationState;
                 return;
             }

             NSString *consumerKey = JSON[KeyKey];
             NSString *privateKey = JSON[SecretKey];
             _pendingOAuth = [GTMOAuthAuthentication alloc];
             _pendingOAuth = [_pendingOAuth initWithSignatureMethod:kGTMOAuthSignatureMethodHMAC_SHA1
                                                        consumerKey:consumerKey
                                                         privateKey:privateKey];
             _pendingOAuth.tokenSecret = @"";

             if ((self.userID && ![self.userID isEqualToString:_pendingOAuth.consumerKey]) ||
                 (self.oAuth && ![self.oAuth.consumerKey isEqualToString:_pendingOAuth.consumerKey])) {
                 self.authenticationState = HPChangedUserAuthenticationState;
             } else {
                 self.authenticationState = HPSignedInAuthenticationState;
             }
         }
     }];
}

- (void)ensureAPISession
{
    if (![_reachability currentReachabilityStatus]) {
        HPLog(@"[%@] Deferring ensureAPISession while offline.", self.URL.host);
        return;
    }
    NSAssert(self.oAuth, @"[%@] Cannot ensure API session without credentials.", self.URL.host);
    NSURL *URL = [NSURL URLWithString:HPSessionSignInPath
                        relativeToURL:self.URL];

    NSMutableURLRequest *request = [NSMutableURLRequest hp_requestWithURL:URL
                                                               HTTPMethod:@"POST"
                                                               parameters:[self.class sharedDeviceTokenParams]];
    request.cachePolicy = NSURLRequestReloadIgnoringCacheData;
    [self.oAuth addResourceTokenHeaderToRequest:request];

    _authenticationRequest = request;

    [[self.class sharedAPIQueue] addOperationWithBlock:^{
        @synchronized (self) {
            if (_authenticationRequest != request) {
                HPLog(@"[%@] Ignoring canceled request: %@", self.URL.host,
                      request.URL.hp_fullPath);
                return;
            }
        }
#if DEBUG_COOKIES
        [request.URL hp_dumpCookies];
#endif
        NSURLResponse *response;
        NSError *error;
#if DEBUG
        NSDate *date = [NSDate date];
#endif
        NSData *data = [NSURLConnection sendSynchronousRequest:request
                                             returningResponse:&response
                                                         error:&error];
        HPLog(@"[%@] Request %@ took %.3f seconds", request.URL.host,
              request.URL.hp_fullPath, -date.timeIntervalSinceNow);
#if DEBUG_COOKIES
        HPLog(@"[%@] Headers for %@: %@", request.URL.host,
              request.URL.hp_fullPath,
              [(NSHTTPURLResponse *)response allHeaderFields]);
        [request.URL hp_dumpCookies];
#endif

        @synchronized(self) {
            if (_authenticationRequest != request) {
                HPLog(@"[%@] Ignoring canceled request: %@", self.URL.host,
                      request.URL.hp_fullPath);
                return;
            }

            NSAssert(self.authenticationState == HPReconnectAuthenticationState,
                     @"[%@] Unexpected state %d; expected: %d",
                     self.URL.host, (int)self.authenticationState, (int)HPReconnectAuthenticationState);

            if ([error.domain isEqualToString:NSURLErrorDomain] &&
                error.code == NSURLErrorUserCancelledAuthentication) {
                // This means we got a 401, because the signature was invalid.
                // The token may have been changed, the account deleted, etc.
                TFLog(@"[%@] Session sign in failed, prompting for credentials: %@",
                      self.URL.host, error);
                self.authenticationState = HPSignInPromptAuthenticationState;
                return;
            } else if (error) {
                // Other errors here (can) mean a network error. we shouldn't
                // sign out and delete cached pads just yet, in case they are in
                // a forest.
                // FIXME: just what should we do, though?
                TFLog(@"[%@] Ignoring sign-in network error: %@", self.URL.host, error);
                [self scheduleReconnect];
                return;
            }

            if ([HPAPI JSONObjectWithResponse:response
                                         data:data
                                  JSONOptions:0
                                      request:request
                                        error:&error]) {
                self.authenticationState = HPSignedInAuthenticationState;
            } else if (error) {
                if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                    NSInteger statusCode = [(NSHTTPURLResponse *)response statusCode];
                    if (statusCode / 100 == 5) {
                        TFLog(@"[%@] Ignoring server error %ld: %@", self.URL.host, (long)statusCode,
                              [NSHTTPURLResponse localizedStringForStatusCode:statusCode]);
                        [self scheduleReconnect];
                        return;
                    }
                }
                [self postSignInNotificationWithError:error];
                self.authenticationState = HPRequiresSignInAuthenticationState;
            }
        }
    }];
}

- (void)scheduleReconnect
{
    NSUInteger attemptID = ++reconnectID;
    double delayInSeconds = 1 + arc4random_uniform(1 << MIN(reconnectAttempts++, 8));
    HPLog(@"[%@] Attempting API reconnect %lu in %.0fs", self.URL.host, (unsigned long)reconnectAttempts, delayInSeconds);
    dispatch_time_t popTime = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delayInSeconds * NSEC_PER_SEC));
    dispatch_after(popTime, dispatch_get_main_queue(), ^{
        @synchronized (self) {
            if (reconnectID == attemptID) {
                [self ensureAPISession];
            }
        }
    });
}

- (void)cancelReconnect
{
    reconnectID++;
}

- (void)hasGoneOnline
{
    @synchronized(self) {
        if (_authenticationState == HPReconnectAuthenticationState && !_authenticationRequest) {
            [self ensureAPISession];
        }
    }
}

- (void)postSignInNotificationWithError:(NSError *)error
{
    [[NSNotificationCenter defaultCenter] postNotificationName:HPAPIDidFailToSignInNotification
                                                        object:self
                                                      userInfo:[NSDictionary dictionaryWithObject:error
                                                                                           forKey:HPAPISignInErrorKey]];
}

#pragma mark - Keychain access

- (BOOL)loadOAuthFromKeychain
{
    NSString *consumeKey = [_keychainItem objectForKey:(__bridge NSString *)kSecAttrAccount];
    NSString *privateKey = [_keychainItem objectForKey:(__bridge NSString *)kSecValueData];

    if (!consumeKey.length || !privateKey.length) {
        return NO;
    }

    GTMOAuthAuthentication *oAuth = [GTMOAuthAuthentication alloc];
    self.oAuth = [oAuth initWithSignatureMethod:kGTMOAuthSignatureMethodHMAC_SHA1
                                    consumerKey:consumeKey
                                     privateKey:privateKey];
    return YES;
}

- (void)savePendingOAuthToKeychain
{
    [_keychainItem setObject:_pendingOAuth.consumerKey
                      forKey:(__bridge NSString *)kSecAttrAccount];
    [_keychainItem setObject:_pendingOAuth.privateKey
                      forKey:(__bridge NSString *)kSecValueData];
    self.oAuth = _pendingOAuth;
    _pendingOAuth = nil;
    self.userID = self.oAuth.consumerKey;
}

+ (id)JSONObjectWithResponse:(NSURLResponse *)response
                        data:(NSData *)data
                 JSONOptions:(NSJSONReadingOptions)opts
                     request:(NSURLRequest *)request
                       error:(NSError *__autoreleasing *)error
{
    id obj;
    NSString *message = @"The server could not be contacted.";
    if (data) {
        message = @"The server sent an invalid response.";
        obj = [NSJSONSerialization JSONObjectWithData:data
                                              options:opts
                                                error:error];
    }
    if ([obj isKindOfClass:[NSDictionary class]] &&
        obj[SuccessKey] && ![obj[SuccessKey] boolValue]) {
        message = obj[ErrorKey];
        if (!message) {
            message = @"An unknown error occured.";
        }
        obj = nil;
    }
    if (!obj && error) {
        NSMutableDictionary *userInfo = [NSMutableDictionary dictionaryWithObjectsAndKeys:
                                         message, NSLocalizedDescriptionKey,
                                         request.URL, NSURLErrorFailingURLErrorKey,
                                         request.URL.absoluteString, NSURLErrorFailingURLStringErrorKey,
                                         request.HTTPMethod, HPURLErrorFailingHTTPMethod,
                                         nil];
        if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
            userInfo[HPURLErrorFailingHTTPStatusCode] = @([(NSHTTPURLResponse *)response statusCode]);
        }
        if (*error) {
            userInfo[NSUnderlyingErrorKey] = *error;
        }
        *error = [NSError errorWithDomain:HPHackpadErrorDomain
                                     code:HPFailedRequestError
                                 userInfo:userInfo];

    }
#if 0
    HPLog(@"[%@] <<< %@: %@", response.URL.host, response.URL.hp_fullPath,
          [[NSString alloc] initWithBytes:data.bytes
                                   length:data.length
                                 encoding:NSUTF8StringEncoding]);
#endif
    return obj;
}

#pragma mark - NSURLConnection delegate

- (void)connection:(NSURLConnection *)connection
  didFailWithError:(NSError *)error
{
    [self.signInAsCond lock];
    @try {
        @synchronized (self) {
            if (!self.signInAsRequest || _authenticationRequest != self.signInAsRequest) {
                return;
            }
            TFLog(@"[%@] Sign In As request failed: %@",
                  connection.currentRequest.URL.host, error);
            self.signInAsRequest = nil;
            self.authenticationState = HPSignInPromptAuthenticationState;
        }
        self.signInAsRequest = nil;
        [self.signInAsCond signal];
    }
    @finally {
        [self.signInAsCond unlock];
    }
}

- (NSURLRequest *)connection:(NSURLConnection *)connection
             willSendRequest:(NSURLRequest *)request
            redirectResponse:(NSURLResponse *)response
{
    [self.signInAsCond lock];
    @try {
        @synchronized (self) {
            if (!self.signInAsRequest || _authenticationRequest != self.signInAsRequest) {
                [connection cancel];
                return nil;
            }
            if (!request.URL.hp_isHackpadURL) {
                TFLog(@"[%@] Sign In As redirected to external URL: %@",
                      connection.originalRequest.URL.host,
                      request.URL);
                self.authenticationState = HPSignInPromptAuthenticationState;
            } else if ([request.URL.path isEqualToString:HPSignInPath]) {
                HPLog(@"[%@] Sign In As failed (redirected to %@",
                      request.URL.host, request.URL.hp_fullPath);
                self.authenticationState = HPSignInPromptAuthenticationState;
            } else if ([request.URL.path isEqualToString:SignedInPath]) {
                self.authenticationState = HPRequestAPISecretAuthenticationState;
            } else {
                return request;
            }
        }
        [connection cancel];
        self.signInAsRequest = nil;
        [self.signInAsCond signal];
    }
    @finally {
        [self.signInAsCond unlock];
    }
    return nil;
}

- (void)connection:(NSURLConnection *)connection
didReceiveResponse:(NSURLResponse *)response
{
    [self.signInAsCond lock];
    @try {
        @synchronized (self) {
            if (!self.signInAsRequest || _authenticationRequest != self.signInAsRequest) {
                return;
            }
            TFLog(@"[%@] Sign In As received a response: %@",
                  connection.currentRequest.URL.host, response);
            self.authenticationState = HPSignInPromptAuthenticationState;
        }
        [connection cancel];
        self.signInAsRequest = nil;
        [self.signInAsCond signal];
    }
    @finally {
        [self.signInAsCond unlock];
    }
}

@end
