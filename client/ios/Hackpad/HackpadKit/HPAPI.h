//
//  HPAPI.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

FOUNDATION_EXTERN NSString * const HPAPIDidRequireUserActionNotification;
FOUNDATION_EXTERN NSString * const HPAPIDidFailToSignInNotification;
FOUNDATION_EXTERN NSString * const HPAPIDidSignInNotification;
FOUNDATION_EXTERN NSString * const HPAPIDidSignOutNotification;

FOUNDATION_EXTERN NSString * const HPAPINewUserIDKey;
FOUNDATION_EXTERN NSString * const HPAPISignInErrorKey;

FOUNDATION_EXTERN NSString * const HPAPIXSRFTokenParam;

/*
 Auth:
     Add new space
         enable guest mode
     sign in to space
         display sign in view controller, cont = special url
         on success:
             disable guest mode
             hide sign in view
             request api key
             if fails
                 enable guest mode
             if user id differs from previous
                 remove pads & collections from core data
             bind space to user id
             save creds in keychain
         on cancel:
             remove pads & collections from core data
             enable guest mode
     Reconnect to existing space
         ensure session
         fails:
             enable guest mode
         success:
             signed in!
 */

typedef NS_ENUM(NSUInteger, HPAuthenticationState) {
    HPNotInitializedAuthenticationState,
    HPRequiresSignInAuthenticationState,
    HPSignInAsAuthenticationState,
    HPSignInPromptAuthenticationState,
    HPRequestAPISecretAuthenticationState,
    HPReconnectAuthenticationState,
    HPChangedUserAuthenticationState,
    HPSignedInAuthenticationState,
    HPSigningOutAuthenticationState,
    HPInactiveAuthenticationState
};

typedef NS_ENUM(NSUInteger, HPURLType) {
    HPUnknownURLType,

    HPExternalURLType,

    HPSpaceURLType,
    HPCollectionURLType,
    HPPadURLType,
    HPUserProfileURLType,
    HPSearchURLType
};

@class GTMOAuthAuthentication;
@class Reachability;

@interface HPAPI : NSObject

@property (copy, atomic, readonly) NSURL *URL;

@property (assign, atomic) HPAuthenticationState authenticationState;
@property (assign, atomic, readonly, getter = isSignedIn) BOOL signedIn;
@property (copy, atomic) NSString *userID;
@property (strong, atomic) GTMOAuthAuthentication *oAuth;
@property (strong, atomic, readonly) Reachability *reachability;
@property (assign, atomic, readonly) NSUInteger sessionID;

+ (id)APIWithURL:(NSURL *)URL;
+ (void)removeAPIWithURL:(NSURL *)URL;
+ (NSString *)stringWithAuthenticationState:(HPAuthenticationState)authenticationState;
+ (NSString *)XSRFTokenForURL:(NSURL *)URL;

+ (id)JSONObjectWithResponse:(NSURLResponse *)response
                        data:(NSData *)data
                 JSONOptions:(NSJSONReadingOptions)opts
                     request:(NSURLRequest *)request
                       error:(NSError *__autoreleasing *)error;

+ (NSOperationQueue *)sharedAPIQueue;
+ (HPURLType)URLTypeWithURL:(NSURL *)URL;

- (void)signInEvenIfSignedIn:(BOOL)force;
+ (NSData *)sharedDeviceTokenData;
+ (void)setSharedDeviceTokenData:(NSData *)tokenData;
+ (NSDictionary *)sharedDeviceTokenParams;

- (BOOL)isSignInRequiredForRequest:(NSURLRequest *)request
                          response:(NSURLResponse *)response
                             error:(NSError * __autoreleasing *)error;

- (id)parseJSONResponse:(NSURLResponse *)response
                   data:(NSData *)data
                request:(NSURLRequest *)request
                  error:(NSError * __autoreleasing *)error;

- (void)hasGoneOnline;
- (BOOL)loadOAuthFromKeychain;

@end
