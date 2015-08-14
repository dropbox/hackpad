/* Copyright (c) 2010 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// HMAC digest
#import <CommonCrypto/CommonHMAC.h>

// RSA SHA-1 signing
#if GTL_OAUTH_SUPPORTS_RSASHA1_SIGNING
#include <openssl/sha.h>
#include <openssl/pem.h>
#include <openssl/err.h>
#endif

#define GTMOAUTHAUTHENTICATION_DEFINE_GLOBALS 1
#import "GTMOAuthAuthentication.h"

// standard OAuth keys
static NSString *const kOAuthConsumerKey          = @"oauth_consumer_key";
static NSString *const kOAuthTokenKey             = @"oauth_token";
static NSString *const kOAuthCallbackKey          = @"oauth_callback";
static NSString *const kOAuthCallbackConfirmedKey = @"oauth_callback_confirmed";
static NSString *const kOAuthTokenSecretKey       = @"oauth_token_secret";
static NSString *const kOAuthSignatureMethodKey   = @"oauth_signature_method";
static NSString *const kOAuthSignatureKey         = @"oauth_signature";
static NSString *const kOAuthTimestampKey         = @"oauth_timestamp";
static NSString *const kOAuthNonceKey             = @"oauth_nonce";
static NSString *const kOAuthVerifierKey          = @"oauth_verifier";
static NSString *const kOAuthVersionKey           = @"oauth_version";

// GetRequestToken extensions
static NSString *const kOAuthDisplayNameKey       = @"xoauth_displayname";
static NSString *const kOAuthScopeKey             = @"scope";

// AuthorizeToken extensions
static NSString *const kOAuthDomainKey            = @"domain";
static NSString *const kOAuthHostedDomainKey      = @"hd";
static NSString *const kOAuthIconURLKey           = @"iconUrl";
static NSString *const kOAuthLanguageKey          = @"hl";
static NSString *const kOAuthMobileKey            = @"btmpl";

// additional persistent keys
static NSString *const kServiceProviderKey        = @"serviceProvider";
static NSString *const kUserEmailKey              = @"email";
static NSString *const kUserEmailIsVerifiedKey    = @"isVerified";

@interface GTMOAuthAuthentication (PrivateMethods)

- (void)addAuthorizationHeaderToRequest:(NSMutableURLRequest *)request
                                forKeys:(NSArray *)keys;
- (void)addParamsForKeys:(NSArray *)keys
               toRequest:(NSMutableURLRequest *)request;

+ (NSString *)paramStringForParams:(NSArray *)params
                            joiner:(NSString *)joiner
                       shouldQuote:(BOOL)shouldQuote
                        shouldSort:(BOOL)shouldSort;

- (NSString *)normalizedRequestURLStringForRequest:(NSURLRequest *)request;

- (NSString *)signatureForParams:(NSMutableArray *)params
                         request:(NSURLRequest *)request;

@end

// OAuthParameter is a local class that exists just to make it easier to
// sort descriptor pairs by name and encoded value
@interface OAuthParameter : NSObject {
@private
  NSString *name_;
  NSString *value_;
}

@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *value;

+ (OAuthParameter *)parameterWithName:(NSString *)name
                                value:(NSString *)value;

+ (NSArray *)sortDescriptors;
@end

@implementation GTMOAuthAuthentication

@synthesize realm = realm_;
@synthesize privateKey = privateKey_;
@synthesize shouldUseParamsToAuthorize = shouldUseParamsToAuthorize_;
@synthesize userData = userData_;

// create an authentication object, with hardcoded values for installed apps
// of HMAC-SHA1 as signature method, and "anonymous" as the consumer key and
// consumer secret (private key)
+ (GTMOAuthAuthentication *)authForInstalledApp {
  // installed apps have fixed parameters
  return [[[self alloc] initWithSignatureMethod:@"HMAC-SHA1"
                                    consumerKey:@"anonymous"
                                     privateKey:@"anonymous"] autorelease];
}

// create an authentication object, specifying the consumer key and
// private key (both "anonymous" for installed apps) and the signature method
// ("HMAC-SHA1" for installed apps)
//
// for signature method "RSA-SHA1", a proper consumer key and private key
// must be supplied
- (id)initWithSignatureMethod:(NSString *)signatureMethod
                  consumerKey:(NSString *)consumerKey
                   privateKey:(NSString *)privateKey {
  
  self = [super init];
  if (self != nil) {
    paramValues_ = [[NSMutableDictionary alloc] init];
    
    [self setConsumerKey:consumerKey];
    [self setSignatureMethod:signatureMethod];
    [self setPrivateKey:privateKey];
    
    [self setVersion:@"1.0"];
  }
  return self;
}

- (void)dealloc {
  [paramValues_ release];
  [realm_ release];
  [privateKey_ release];
  [timestamp_ release];
  [nonce_ release];
  [userData_ release];
  [super dealloc];
}

#pragma mark -

- (NSMutableArray *)paramsForKeys:(NSArray *)keys
                          request:(NSURLRequest *)request {
  // this is the magic routine that collects the parameters for the specified
  // keys, and signs them
  NSMutableArray *params = [NSMutableArray array];
  
  for (NSString *key in keys) {
    NSString *value = [paramValues_ objectForKey:key];
    if ([value length] > 0) {
      [params addObject:[OAuthParameter parameterWithName:key
                                                    value:value]];
    }
  }
  
  // nonce and timestamp are generated on-the-fly by the getters
  if ([keys containsObject:kOAuthNonceKey]) {
    NSString *nonce = [self nonce];
    [params addObject:[OAuthParameter parameterWithName:kOAuthNonceKey
                                                  value:nonce]];
  }
  
  if ([keys containsObject:kOAuthTimestampKey]) {
    NSString *timestamp = [self timestamp];
    [params addObject:[OAuthParameter parameterWithName:kOAuthTimestampKey
                                                  value:timestamp]];
  }
  
  // finally, compute the signature, if requested; the params
  // must be complete for this
  if ([keys containsObject:kOAuthSignatureKey]) {
    NSString *signature = [self signatureForParams:params
                                           request:request];
    [params addObject:[OAuthParameter parameterWithName:kOAuthSignatureKey
                                                  value:signature]];
  }
  
  return params;
}

+ (void)addQueryString:(NSString *)query
              toParams:(NSMutableArray *)array {
  // make param objects from the query parameters, and add them
  // to the supplied array
  
  // look for a query like foo=cat&bar=dog
  if ([query length] > 0) {
    // the standard test cases insist that + in the query string
    // be encoded as " " - http://wiki.oauth.net/TestCases
    query = [query stringByReplacingOccurrencesOfString:@"+"
                                             withString:@" "];
    
    // separate and step through the query parameter assignments
    NSArray *items = [query componentsSeparatedByString:@"&"];
    
    for (NSString *item in items) {
      NSString *name = nil;
      NSString *value = @"";
      
      NSRange equalsRange = [item rangeOfString:@"="];
      if (equalsRange.location != NSNotFound) {
        // the parameter has at least one '='
        name = [item substringToIndex:equalsRange.location];
        
        if (equalsRange.location + 1 < [item length]) {
          // there are characters after the '='
          value = [item substringFromIndex:(equalsRange.location + 1)];
          
          // remove percent-escapes from the parameter value; they'll be
          // added back by OAuthParameter
          value = [self unencodedOAuthParameterForString:value];
        } else {
          // no characters after the '='
        }
      } else {
        // the parameter has no '='
        name = item;
      }
      
      // remove percent-escapes from the parameter name; they'll be
      // added back by OAuthParameter
      name = [self unencodedOAuthParameterForString:name];
      
      OAuthParameter *param = [OAuthParameter parameterWithName:name
                                                          value:value];
      [array addObject:param];
    }
  }
}

+ (void)addQueryFromRequest:(NSURLRequest *)request
                   toParams:(NSMutableArray *)array {
  // get the query string from the request
  NSString *query = [[request URL] query];
  [self addQueryString:query toParams:array];
}

+ (void)addBodyFromRequest:(NSURLRequest *)request
                  toParams:(NSMutableArray *)array {
  // add non-GET form parameters to the array of param objects
  NSString *method = [request HTTPMethod];
  if (method != nil && ![method isEqual:@"GET"]) {
    NSString *type = [request valueForHTTPHeaderField:@"Content-Type"];
    if ([type hasPrefix:@"application/x-www-form-urlencoded"]) {
      NSData *data = [request HTTPBody];
      if ([data length] > 0) {
        NSString *str = [[[NSString alloc] initWithData:data
                                               encoding:NSUTF8StringEncoding] autorelease];
        if ([str length] > 0) {
          [[self class] addQueryString:str toParams:array];
        }
      }
    }
  }
}

- (NSString *)signatureForParams:(NSMutableArray *)params
                         request:(NSURLRequest *)request {
  // construct signature base string per
  // http://oauth.net/core/1.0a/#signing_process
  NSString *requestURLStr = [self normalizedRequestURLStringForRequest:request];
  NSString *method = [[request HTTPMethod] uppercaseString];
  if ([method length] == 0) {
    method = @"GET";
  }
  
  // the signature params exclude the signature
  NSMutableArray *signatureParams = [NSMutableArray arrayWithArray:params];
  
  // add request query parameters
  [[self class] addQueryFromRequest:request toParams:signatureParams];
  
  // add parameters from the POST body, if any
  [[self class] addBodyFromRequest:request toParams:signatureParams];
  
  NSString *paramStr = [[self class] paramStringForParams:signatureParams
                                                   joiner:@"&"
                                              shouldQuote:NO
                                               shouldSort:YES];
  
  // the base string includes the method, normalized request URL, and params
  NSString *requestURLStrEnc = [[self class] encodedOAuthParameterForString:requestURLStr];
  NSString *paramStrEnc = [[self class] encodedOAuthParameterForString:paramStr];
  
  NSString *sigBaseString = [NSString stringWithFormat:@"%@&%@&%@",
                             method, requestURLStrEnc, paramStrEnc];
  
  NSString *privateKey = [self privateKey];
  NSString *signatureMethod = [self signatureMethod];
  NSString *signature = nil;
  
#if GTL_DEBUG_OAUTH_SIGNING
  NSLog(@"signing request: %@\n", request);
  NSLog(@"signing params: %@\n", params);
#endif
  
  if ([signatureMethod isEqual:kGTMOAuthSignatureMethodHMAC_SHA1]) {
    NSString *tokenSecret = [self tokenSecret];
    signature = [[self class] HMACSHA1HashForConsumerSecret:privateKey
                                                tokenSecret:tokenSecret
                                                       body:sigBaseString];
#if GTL_DEBUG_OAUTH_SIGNING
    NSLog(@"hashing: %@&%@",
          privateKey ? privateKey : @"",
          tokenSecret ? tokenSecret : @"");
    NSLog(@"base string: %@", sigBaseString);
    NSLog(@"signature: %@", signature);
#endif
  }
  
#if GTL_OAUTH_SUPPORTS_RSASHA1_SIGNING
  else if ([signatureMethod isEqual:kGTMOAuthSignatureMethodRSA_SHA1]) {
    signature = [[self class] RSASHA1HashForString:sigBaseString
                               privateKeyPEMString:privateKey];
  }
#endif
  
  return signature;
}

+ (NSString *)paramStringForParams:(NSArray *)params
                            joiner:(NSString *)joiner
                       shouldQuote:(BOOL)shouldQuote
                        shouldSort:(BOOL)shouldSort {
  // create a string by joining the supplied param objects
  
  if (shouldSort) {
    // sort params by name and value
    NSArray *descs = [OAuthParameter sortDescriptors];
    params = [params sortedArrayUsingDescriptors:descs];
  }
  
  // make an array of the encoded name=value items
  NSArray *encodedArray;
  if (shouldQuote) {
    encodedArray = [params valueForKey:@"quotedEncodedParam"];
  } else {
    encodedArray = [params valueForKey:@"encodedParam"];
  }
  
  // join the items
  NSString *result = [encodedArray componentsJoinedByString:joiner];
  return result;
}

- (NSString *)normalizedRequestURLStringForRequest:(NSURLRequest *)request {
  // http://oauth.net/core/1.0a/#anchor13
  
  NSURL *url = [[request URL] absoluteURL];
  
  NSString *scheme = [[url scheme] lowercaseString];
  NSString *host = [[url host] lowercaseString];
  int port = [[url port] intValue];
  
  // NSURL's path method has an unfortunate side-effect of unescaping the path,
  // but CFURLCopyPath does not
  CFStringRef cfPath = CFURLCopyPath((CFURLRef)url);
  NSString *path = [NSMakeCollectable(cfPath) autorelease];
  
  // include only non-standard ports for http or https
  NSString *portStr;
  if (port == 0
      || ([scheme isEqual:@"http"] && port == 80)
      || ([scheme isEqual:@"https"] && port == 443)) {
    portStr = @"";
  } else {
    portStr = [NSString stringWithFormat:@":%u", port];
  }
  
  if ([path length] == 0) {
    path = @"/";
  }
  
  NSString *result = [NSString stringWithFormat:@"%@://%@%@%@",
                      scheme, host, portStr, path];
  return result;
}

+ (NSArray *)tokenRequestKeys {
  // keys for obtaining a request token, http://oauth.net/core/1.0a/#auth_step1
  NSArray *keys = [NSArray arrayWithObjects:
                   kOAuthConsumerKey,
                   kOAuthSignatureMethodKey,
                   kOAuthSignatureKey,
                   kOAuthTimestampKey,
                   kOAuthNonceKey,
                   kOAuthVersionKey,
                   kOAuthCallbackKey,
                   // extensions
                   kOAuthDisplayNameKey,
                   kOAuthScopeKey,
                   nil];
  return keys;
}

+ (NSArray *)tokenAuthorizeKeys {
  // keys for opening the authorize page, http://oauth.net/core/1.0a/#auth_step2
  NSArray *keys = [NSArray arrayWithObjects:
                   kOAuthTokenKey,
                   // extensions
                   kOAuthDomainKey,
                   kOAuthHostedDomainKey,
                   kOAuthLanguageKey,
                   kOAuthMobileKey,
                   kOAuthScopeKey,
                   nil];
  return keys;
}

+ (NSArray *)tokenAccessKeys {
  // keys for obtaining an access token, http://oauth.net/core/1.0a/#auth_step3
  NSArray *keys = [NSArray arrayWithObjects:
                   kOAuthConsumerKey,
                   kOAuthTokenKey,
                   kOAuthSignatureMethodKey,
                   kOAuthSignatureKey,
                   kOAuthTimestampKey,
                   kOAuthNonceKey,
                   kOAuthVersionKey,
                   kOAuthVerifierKey, nil];
  return keys;
}

+ (NSArray *)tokenResourceKeys {
  // keys for accessing a protected resource,
  // http://oauth.net/core/1.0a/#anchor12
  NSArray *keys = [NSArray arrayWithObjects:
                   kOAuthConsumerKey,
                   kOAuthTokenKey,
                   kOAuthSignatureMethodKey,
                   kOAuthSignatureKey,
                   kOAuthTimestampKey,
                   kOAuthNonceKey,
                   kOAuthVersionKey, nil];
  return keys;
}

#pragma mark -

- (void)setKeysForResponseDictionary:(NSDictionary *)dict {
  NSString *token = [dict objectForKey:kOAuthTokenKey];
  if (token) {
    [self setToken:token];
  }
  
  NSString *secret = [dict objectForKey:kOAuthTokenSecretKey];
  if (secret) {
    [self setTokenSecret:secret];
  }
  
  NSString *callbackConfirmed = [dict objectForKey:kOAuthCallbackConfirmedKey];
  if (callbackConfirmed) {
    [self setCallbackConfirmed:callbackConfirmed];
  }
  
  NSString *verifier = [dict objectForKey:kOAuthVerifierKey];
  if (verifier) {
    [self setVerifier:verifier];
  }
  
  NSString *provider = [dict objectForKey:kServiceProviderKey];
  if (provider) {
    [self setServiceProvider:provider];
  }
  
  NSString *email = [dict objectForKey:kUserEmailKey];
  if (email) {
    [self setUserEmail:email];
  }
  
  NSString *verified = [dict objectForKey:kUserEmailIsVerifiedKey];
  if (verified) {
    [self setUserEmailIsVerified:verified];
  }
}

- (void)setKeysForResponseData:(NSData *)data {
  NSDictionary *dict = [[self class] dictionaryWithResponseData:data];
  [self setKeysForResponseDictionary:dict];
}

- (void)setKeysForResponseString:(NSString *)str {
  NSDictionary *dict = [[self class] dictionaryWithResponseString:str];
  [self setKeysForResponseDictionary:dict];
}

#pragma mark -

//
// Methods for adding OAuth parameters either to queries or as a request header
//

- (void)addRequestTokenHeaderToRequest:(NSMutableURLRequest *)request {
  // add request token params to the request's header
  NSArray *keys = [[self class] tokenRequestKeys];
  [self addAuthorizationHeaderToRequest:request
                                forKeys:keys];
}

- (void)addRequestTokenParamsToRequest:(NSMutableURLRequest *)request {
  // add request token params to the request URL (not to the header)
  NSArray *keys = [[self class] tokenRequestKeys];
  [self addParamsForKeys:keys toRequest:request];
}

- (void)addAuthorizeTokenHeaderToRequest:(NSMutableURLRequest *)request {
  // add authorize token params to the request's header
  NSArray *keys = [[self class] tokenAuthorizeKeys];
  [self addAuthorizationHeaderToRequest:request
                                forKeys:keys];
}

- (void)addAuthorizeTokenParamsToRequest:(NSMutableURLRequest *)request {
  // add authorize token params to the request URL (not to the header)
  NSArray *keys = [[self class] tokenAuthorizeKeys];
  [self addParamsForKeys:keys toRequest:request];
}

- (void)addAccessTokenHeaderToRequest:(NSMutableURLRequest *)request {
  // add access token params to the request's header
  NSArray *keys = [[self class] tokenAccessKeys];
  [self addAuthorizationHeaderToRequest:request
                                forKeys:keys];
}

- (void)addAccessTokenParamsToRequest:(NSMutableURLRequest *)request {
  // add access token params to the request URL (not to the header)
  NSArray *keys = [[self class] tokenAccessKeys];
  [self addParamsForKeys:keys toRequest:request];
}

- (void)addResourceTokenHeaderToRequest:(NSMutableURLRequest *)request {
  // add resource access token params to the request's header
  NSArray *keys = [[self class] tokenResourceKeys];
  [self addAuthorizationHeaderToRequest:request
                                forKeys:keys];
}

- (void)addResourceTokenParamsToRequest:(NSMutableURLRequest *)request {
  // add resource access token params to the request URL (not to the header)
  NSArray *keys = [[self class] tokenResourceKeys];
  [self addParamsForKeys:keys toRequest:request];
}

//
// underlying methods for constructing query parameters or request headers
//

- (void)addParams:(NSArray *)params toRequest:(NSMutableURLRequest *)request {
  NSString *paramStr = [[self class] paramStringForParams:params
                                                   joiner:@"&"
                                              shouldQuote:NO
                                               shouldSort:NO];
  NSURL *oldURL = [request URL];
  NSString *query = [oldURL query];
  if ([query length] > 0) {
    query = [query stringByAppendingFormat:@"&%@", paramStr];
  } else {
    query = paramStr;
  }

  NSString *portStr = @"";
  NSString *oldPort = [[oldURL port] stringValue];
  if ([oldPort length] > 0) {
    portStr = [@":" stringByAppendingString:oldPort];
  }

  NSString *qMark = [query length] > 0 ? @"?" : @"";
  NSString *newURLStr = [NSString stringWithFormat:@"%@://%@%@%@%@%@",
                         [oldURL scheme], [oldURL host], portStr,
                         [oldURL path], qMark, query];
  
  [request setURL:[NSURL URLWithString:newURLStr]];
}

- (void)addParamsForKeys:(NSArray *)keys toRequest:(NSMutableURLRequest *)request {
  // For the specified keys, add the keys and values to the request URL.
  
  NSMutableArray *params = [self paramsForKeys:keys request:request];
  [self addParams:params toRequest:request];
}

- (void)addAuthorizationHeaderToRequest:(NSMutableURLRequest *)request
                                forKeys:(NSArray *)keys {
  // make all the parameters, including a signature for all
  NSMutableArray *params = [self paramsForKeys:keys request:request];
  
  // split the params into "oauth_" params which go into the Auth header
  // and others which get added to the query
  NSMutableArray *oauthParams = [NSMutableArray array];
  NSMutableArray *extendedParams = [NSMutableArray array];
  
  for (OAuthParameter *param in params) {
    NSString *name = [param name];
    BOOL hasPrefix = [name hasPrefix:@"oauth_"];
    if (hasPrefix) {
      [oauthParams addObject:param];
    } else {
      [extendedParams addObject:param];
    }
  }
  
  NSString *paramStr = [[self class] paramStringForParams:oauthParams
                                                   joiner:@", "
                                              shouldQuote:YES
                                               shouldSort:NO];
  
  // include the realm string, if any, in the auth header
  // http://oauth.net/core/1.0a/#auth_header
  NSString *realmParam = @"";
  NSString *realm = [self realm];
  if ([realm length] > 0) {
    NSString *encodedVal = [[self class] encodedOAuthParameterForString:realm];
    realmParam = [NSString stringWithFormat:@"realm=\"%@\", ", encodedVal];
  }
  
  // set the parameters for "oauth_" keys and the realm
  // in the authorization header
  NSString *authHdr = [NSString stringWithFormat:@"OAuth %@%@",
                       realmParam, paramStr];
  [request setValue:authHdr forHTTPHeaderField:@"Authorization"];
  
  // add any other params as URL query parameters
  if ([extendedParams count] > 0) {
    [self addParams:extendedParams toRequest:request];
  }
  
#if GTL_DEBUG_OAUTH_SIGNING
  NSLog(@"adding auth header: %@", authHdr);
  NSLog(@"final request: %@", request);
#endif
}

// general entry point for GTL library
- (BOOL)authorizeRequest:(NSMutableURLRequest *)request {
  NSString *token = [self token];
  if ([token length] == 0) {
    return NO;
  } else {
    if ([self shouldUseParamsToAuthorize]) {
      [self addResourceTokenParamsToRequest:request];
    } else {
      [self addResourceTokenHeaderToRequest:request];
    }
    return YES;
  }
}

- (BOOL)canAuthorize {
  // this method's is just a higher-level version of hasAccessToken
  return [self hasAccessToken];
}

#pragma mark GTMFetcherAuthorizationProtocol Methods

// Implementation of GTMFetcherAuthorizationProtocol methods

- (void)authorizeRequest:(NSMutableURLRequest *)request
                delegate:(id)delegate
       didFinishSelector:(SEL)sel {
  // Authorization entry point with callback for OAuth 2
  NSError *error = nil;
  if (![self authorizeRequest:request]) {
    // failed
    error = [NSError errorWithDomain:kGTMOAuthErrorDomain
                                code:-1
                            userInfo:nil];
  }

  if (delegate && sel) {
    NSMethodSignature *sig = [delegate methodSignatureForSelector:sel];
    NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:sig];
    [invocation setSelector:sel];
    [invocation setTarget:delegate];
    [invocation setArgument:&self atIndex:2];
    [invocation setArgument:&request atIndex:3];
    [invocation setArgument:&error atIndex:4];
    [invocation invoke];
  }
}

- (void)stopAuthorization {
  // nothing to do, since OAuth 1 authorization is synchronous
}

- (void)stopAuthorizationForRequest:(NSURLRequest *)request {
  // nothing to do, since OAuth 1 authorization is synchronous
}

- (BOOL)isAuthorizingRequest:(NSURLRequest *)request {
  // OAuth 1 auth is synchronous, so authorizations are never pending
  return NO;
}

- (BOOL)isAuthorizedRequest:(NSURLRequest *)request {
  if ([self shouldUseParamsToAuthorize]) {
    // look for query parameter authorization
    NSString *query = [[request URL] query];
    NSDictionary *dict = [[self class] dictionaryWithResponseString:query];
    NSString *token = [dict valueForKey:kOAuthTokenKey];
    return ([token length] > 0);
  } else {
    // look for header authorization
    NSString *authStr = [request valueForHTTPHeaderField:@"Authorization"];
    return ([authStr length] > 0);
  }
}

#pragma mark Persistence Response Strings

- (void)setKeysForPersistenceResponseString:(NSString *)str {
  // all persistence keys map directly to keys in paramValues_
  [self setKeysForResponseString:str];
}

// this returns a "response string" that can be passed later to
// setKeysForResponseString: to reuse an old access token in a new auth object
- (NSString *)persistenceResponseString {
  // make an array of OAuthParameters for the actual parameters we're
  // persisting
  NSArray *persistenceKeys = [NSArray arrayWithObjects:
                              kOAuthTokenKey,
                              kOAuthTokenSecretKey,
                              kServiceProviderKey,
                              kUserEmailKey,
                              kUserEmailIsVerifiedKey,
                              nil];
  
  NSMutableArray *params = [self paramsForKeys:persistenceKeys request:nil];
  
  NSString *responseStr = [[self class] paramStringForParams:params
                                                      joiner:@"&"
                                                 shouldQuote:NO
                                                  shouldSort:NO];
  return responseStr;
}

- (void)reset {
  [self setHasAccessToken:NO];
  [self setToken:nil];
  [self setTokenSecret:nil];
  [self setUserEmail:nil];
  [self setUserEmailIsVerified:nil];
}

#pragma mark Accessors

- (NSString *)scope {
  return [paramValues_ objectForKey:kOAuthScopeKey];
}

- (void)setScope:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthScopeKey];
}

- (NSString *)displayName {
  return [paramValues_ objectForKey:kOAuthDisplayNameKey];
}

- (void)setDisplayName:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthDisplayNameKey];
}

- (NSString *)hostedDomain {
  return [paramValues_ objectForKey:kOAuthHostedDomainKey];
}

- (void)setHostedDomain:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthHostedDomainKey];
}

- (NSString *)domain {
  return [paramValues_ objectForKey:kOAuthDomainKey];
}

- (void)setDomain:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthDomainKey];
}

- (NSString *)iconURLString {
  return [paramValues_ objectForKey:kOAuthIconURLKey];
}

- (void)setIconURLString:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthIconURLKey];
}

- (NSString *)language {
  return [paramValues_ objectForKey:kOAuthLanguageKey];
}

- (void)setLanguage:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthLanguageKey];
}

- (NSString *)mobile {
  return [paramValues_ objectForKey:kOAuthMobileKey];
}

- (void)setMobile:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthMobileKey];
}

- (NSString *)signatureMethod {
  return [paramValues_ objectForKey:kOAuthSignatureMethodKey];
}

- (void)setSignatureMethod:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthSignatureMethodKey];
}

- (NSString *)consumerKey {
  return [paramValues_ objectForKey:kOAuthConsumerKey];
}

- (void)setConsumerKey:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthConsumerKey];
}

- (NSString *)token {
  return [paramValues_ objectForKey:kOAuthTokenKey];
}

- (void)setToken:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthTokenKey];
}

- (NSString *)callback {
  return [paramValues_ objectForKey:kOAuthCallbackKey];
}


- (void)setCallback:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthCallbackKey];
}

- (NSString *)verifier {
  return [paramValues_ objectForKey:kOAuthVerifierKey];
}

- (void)setVerifier:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthVerifierKey];
}

- (NSString *)serviceProvider {
  return [paramValues_ objectForKey:kServiceProviderKey];
}

- (void)setServiceProvider:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kServiceProviderKey];
}

- (NSString *)userEmail {
  return [paramValues_ objectForKey:kUserEmailKey];
}

- (void)setUserEmail:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kUserEmailKey];
}

- (NSString *)userEmailIsVerified {
  return [paramValues_ objectForKey:kUserEmailIsVerifiedKey];
}

- (void)setUserEmailIsVerified:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kUserEmailIsVerifiedKey];
}

- (NSString *)tokenSecret {
  return [paramValues_ objectForKey:kOAuthTokenSecretKey];
}

- (void)setTokenSecret:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthTokenSecretKey];
}

- (NSString *)callbackConfirmed {
  return [paramValues_ objectForKey:kOAuthCallbackConfirmedKey];
}

- (void)setCallbackConfirmed:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthCallbackConfirmedKey];
}

- (NSString *)version {
  return [paramValues_ objectForKey:kOAuthVersionKey];
}

- (void)setVersion:(NSString *)str {
  [paramValues_ setValue:[[str copy] autorelease]
                  forKey:kOAuthVersionKey];
}

- (NSString *)timestamp {
  
  if (timestamp_) return timestamp_; // for testing only
  
  NSTimeInterval timeInterval = [[NSDate date] timeIntervalSince1970];
  unsigned long long timestampVal = (unsigned long long) timeInterval;
  NSString *timestamp = [NSString stringWithFormat:@"%qu", timestampVal];
  return timestamp;
}

- (void)setTimestamp:(NSString *)str {
  // set a fixed timestamp, for testing only
  [timestamp_ autorelease];
  timestamp_ = [str copy];
}

- (NSString *)nonce {
  
  if (nonce_) return nonce_; // for testing only
  
  // make a random 64-bit number
  unsigned long long nonceVal = ((unsigned long long) arc4random()) << 32
  | (unsigned long long) arc4random();
  
  NSString *nonce = [NSString stringWithFormat:@"%qu", nonceVal];
  return nonce;
}

- (void)setNonce:(NSString *)str {
  // set a fixed nonce, for testing only
  [nonce_ autorelease];
  nonce_ = [str copy];
}

// to avoid the ambiguity between request and access flavors of tokens,
// we'll provide accessors solely for access tokens
- (BOOL)hasAccessToken {
  return hasAccessToken_ && ([[self token] length] > 0);
}

- (void)setHasAccessToken:(BOOL)flag {
  hasAccessToken_ = flag;
}

- (NSString *)accessToken {
  if (hasAccessToken_) {
    return [self token];
  } else {
    return nil;
  }
}

- (void)setAccessToken:(NSString *)str {
  [self setToken:str];
  [self setHasAccessToken:YES];
}

#pragma mark Utility Routines

+ (NSString *)encodedOAuthParameterForString:(NSString *)str {
  // http://oauth.net/core/1.0a/#encoding_parameters
  
  CFStringRef originalString = (CFStringRef) str;
  
  CFStringRef leaveUnescaped = CFSTR("ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                                     "abcdefghijklmnopqrstuvwxyz"
                                     "-._~");
  CFStringRef forceEscaped =  CFSTR("%!$&'()*+,/:;=?@");
  
  CFStringRef escapedStr = NULL;
  if (str) {
    escapedStr = CFURLCreateStringByAddingPercentEscapes(kCFAllocatorDefault,
                                                         originalString,
                                                         leaveUnescaped,
                                                         forceEscaped,
                                                         kCFStringEncodingUTF8);
    [(id)CFMakeCollectable(escapedStr) autorelease];
  }
  
  return (NSString *)escapedStr;
}

+ (NSString *)unencodedOAuthParameterForString:(NSString *)str {
  NSString *plainStr = [str stringByReplacingPercentEscapesUsingEncoding:NSUTF8StringEncoding];
  return plainStr;
}

+ (NSDictionary *)dictionaryWithResponseString:(NSString *)responseStr {
  // build a dictionary from a response string of the form
  // "foo=cat&bar=dog".  Missing or empty values are considered
  // empty strings; keys and values are percent-decoded.
  if (responseStr == nil) return nil;
  
  NSMutableDictionary *responseDict = [NSMutableDictionary dictionary];
  
  NSArray *items = [responseStr componentsSeparatedByString:@"&"];
  for (NSString *item in items) {
    NSScanner *scanner = [NSScanner scannerWithString:item];
    NSString *key;
    
    [scanner setCharactersToBeSkipped:nil];
    if ([scanner scanUpToString:@"=" intoString:&key]) {
      // if there's an "=", then scan the value, too, if any
      NSString *value = @"";
      if ([scanner scanString:@"=" intoString:nil]) {
        // scan the rest of the string
        [scanner scanUpToString:@"&" intoString:&value];
      }
      NSString *plainKey = [[self class] unencodedOAuthParameterForString:key];
      NSString *plainValue = [[self class] unencodedOAuthParameterForString:value];
      
      [responseDict setObject:plainValue
                       forKey:plainKey];
    }
  }
  return responseDict;
}

+ (NSDictionary *)dictionaryWithResponseData:(NSData *)data {
  NSString *responseStr = [[[NSString alloc] initWithData:data
                                                 encoding:NSUTF8StringEncoding] autorelease];
  NSDictionary *dict = [self dictionaryWithResponseString:responseStr];
  return dict;
}

+ (NSString *)scopeWithStrings:(NSString *)str, ... {
  // concatenate the strings, joined by a single space
  NSString *result = @"";
  NSString *joiner = @"";
  if (str) {
    va_list argList;
    va_start(argList, str);
    while (str) {
      result = [result stringByAppendingFormat:@"%@%@", joiner, str];
      joiner = @" ";
      str = va_arg(argList, id);
    }
    va_end(argList);
  }
  return result;
}

#pragma mark Signing Methods

+ (NSString *)HMACSHA1HashForConsumerSecret:(NSString *)consumerSecret
                                tokenSecret:(NSString *)tokenSecret
                                       body:(NSString *)body {
  NSString *encodedConsumerSecret = [self encodedOAuthParameterForString:consumerSecret];
  NSString *encodedTokenSecret = [self encodedOAuthParameterForString:tokenSecret];
  
  NSString *key = [NSString stringWithFormat:@"%@&%@",
                   encodedConsumerSecret ? encodedConsumerSecret : @"",
                   encodedTokenSecret ? encodedTokenSecret : @""];
  
  NSMutableData *sigData = [NSMutableData dataWithLength:CC_SHA1_DIGEST_LENGTH];
  
  CCHmac(kCCHmacAlgSHA1,
         [key UTF8String], [key length],
         [body UTF8String], [body length],
         [sigData mutableBytes]);
  
  NSString *signature = [self stringWithBase64ForData:sigData];
  return signature;
}

#if GTL_OAUTH_SUPPORTS_RSASHA1_SIGNING
+ (NSString *)RSASHA1HashForString:(NSString *)source
               privateKeyPEMString:(NSString *)key  {
  if (source == nil || key == nil) return nil;
  
  OpenSSL_add_all_algorithms();
  // add EVP_cleanup
  
  NSString *signature = nil;
  
  // make a SHA-1 digest of the source string
  const char* sourceChars = [source UTF8String];
  
  unsigned char digest[SHA_DIGEST_LENGTH];
  SHA1((const unsigned char *)sourceChars, strlen(sourceChars), digest);
  
  // get an RSA from the private key PEM, and use it to sign the digest
  const char* keyChars = [key UTF8String];
  BIO* keyBio = BIO_new_mem_buf((char *) keyChars, -1); // -1 = use strlen()
  
  
  if (keyBio != NULL) {
    //    BIO_set_flags(keyBio, BIO_FLAGS_BASE64_NO_NL);
    RSA *rsa_key = NULL;
    
    rsa_key = PEM_read_bio_RSAPrivateKey(keyBio, NULL, NULL, NULL);
    if (rsa_key != NULL) {
      
      unsigned int sigLen = 0;
      unsigned char *sigBuff = malloc(RSA_size(rsa_key));
      
      int result = RSA_sign(NID_sha1, digest, (unsigned int) sizeof(digest),
                            sigBuff, &sigLen, rsa_key);
      
      if (result != 0) {
        NSData *sigData = [NSData dataWithBytes:sigBuff length:sigLen];
        signature = [self stringWithBase64ForData:sigData];
      }
      
      free(sigBuff);
      
      RSA_free(rsa_key);
    }
    BIO_free(keyBio);
  }
  
  return signature;
}
#endif // GTL_OAUTH_SUPPORTS_RSASHA1_SIGNING

+ (NSString *)stringWithBase64ForData:(NSData *)data {
  // Cyrus Najmabadi elegent little encoder from
  // http://www.cocoadev.com/index.pl?BaseSixtyFour
  if (data == nil) return nil;
  
  const uint8_t* input = [data bytes];
  NSUInteger length = [data length];
  
  NSUInteger bufferSize = ((length + 2) / 3) * 4;
  NSMutableData* buffer = [NSMutableData dataWithLength:bufferSize];
  
  uint8_t* output = [buffer mutableBytes];
  
  static char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  
  for (NSUInteger i = 0; i < length; i += 3) {
    NSInteger value = 0;
    for (NSUInteger j = i; j < (i + 3); j++) {
      value <<= 8;
      
      if (j < length) {
        value |= (0xFF & input[j]);
      }
    }
    
    NSInteger idx = (i / 3) * 4;
    output[idx + 0] =                    table[(value >> 18) & 0x3F];
    output[idx + 1] =                    table[(value >> 12) & 0x3F];
    output[idx + 2] = (i + 1) < length ? table[(value >> 6)  & 0x3F] : '=';
    output[idx + 3] = (i + 2) < length ? table[(value >> 0)  & 0x3F] : '=';
  }
  
  NSString *result = [[[NSString alloc] initWithData:buffer
                                            encoding:NSASCIIStringEncoding] autorelease];
  return result;
}

#pragma mark Unit Test Entry Points

+ (NSString *)normalizeQueryString:(NSString *)str {
  // unit testing method
  
  // convert the string of parameters to sortable param objects
  NSMutableArray *params = [NSMutableArray array];
  [self addQueryString:str toParams:params];
  
  // sort and join the param objects
  NSString *paramStr = [self paramStringForParams:params
                                           joiner:@"&"
                                      shouldQuote:NO
                                       shouldSort:YES];
  return paramStr;
}

@end

// This class represents key-value pairs so they can be sorted by both
// name and encoded value
@implementation OAuthParameter

@synthesize name = name_;
@synthesize value = value_;

+ (OAuthParameter *)parameterWithName:(NSString *)name
                                value:(NSString *)value {
  OAuthParameter *obj = [[[self alloc] init] autorelease];
  [obj setName:name];
  [obj setValue:value];
  return obj;
}

- (void)dealloc {
  [name_ release];
  [value_ release];
  [super dealloc];
}

- (NSString *)encodedValue {
  NSString *value = [self value];
  NSString *result = [GTMOAuthAuthentication encodedOAuthParameterForString:value];
  return result;
}

- (NSString *)encodedName {
  NSString *name = [self name];
  NSString *result = [GTMOAuthAuthentication encodedOAuthParameterForString:name];
  return result;
}

- (NSString *)encodedParam {
  NSString *str = [NSString stringWithFormat:@"%@=%@",
                   [self encodedName], [self encodedValue]];
  return str;
}

- (NSString *)quotedEncodedParam {
  NSString *str = [NSString stringWithFormat:@"%@=\"%@\"",
                   [self encodedName], [self encodedValue]];
  return str;
}

- (NSString *)description {
  return [self encodedParam];
}

+ (NSArray *)sortDescriptors {
  // sort by name and value
  SEL sel = @selector(compare:);
  
  NSSortDescriptor *desc1, *desc2;
  desc1 = [[[NSSortDescriptor alloc] initWithKey:@"name"
                                       ascending:YES
                                        selector:sel] autorelease];
  desc2 = [[[NSSortDescriptor alloc] initWithKey:@"encodedValue"
                                       ascending:YES
                                        selector:sel] autorelease];
  
  NSArray *sortDescriptors = [NSArray arrayWithObjects:desc1, desc2, nil];
  return sortDescriptors;
}

@end
