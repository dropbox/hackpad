//
//  HPStaticCachingURLProtocol.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPStaticCachingURLProtocol.h"

#import "HackpadAdditions.h"
#import "HPError.h"

#import "HPReachability.h"

#define CACHE_PROFILE_PICS 1

#if 0
#define d(x) x
#else
#define d(x)
#endif

// Defined by super.
static NSString * const RNCachingURLHeader = @"X-RNCache";
static NSString * const FromCacheHeader = @"X-HPFromCache";
static NSString * const DoNotCacheHeader = @"X-HPK-DoNotCacheIfOnline";

@interface RNCachingURLProtocol (HackpadAdditions)
- (void)connectionDidFinishLoading:(NSURLConnection *)connection;
- (NSURLRequest *)connection:(NSURLConnection *)connection
             willSendRequest:(NSURLRequest *)request
            redirectResponse:(NSURLResponse *)response;
@property (nonatomic, readwrite, strong) NSURLResponse *response;
@end

@interface RNCachedData : NSObject <NSCoding>
@property (nonatomic, readwrite, strong) NSData *data;
@property (nonatomic, readwrite, strong) NSURLResponse *response;
@property (nonatomic, readwrite, strong) NSURLRequest *redirectRequest;
@end

@implementation HPStaticCachingURLProtocol

+ (BOOL)canInitWithRequest:(NSURLRequest *)request
{
#define ACCEPT d(HPLog(@"[%@] $$$ %@", request.URL.host, request.URL.hp_fullPath)); return YES
#define REJECT d(HPLog(@"[%@] XXX %@ (%@)", request.URL.host, request.URL.hp_fullPath, request.URL.pathExtension)); return NO

    // Set by super to mark download requests.
    if ([request valueForHTTPHeaderField:RNCachingURLHeader]) {
        return NO;
    }

    if (![request.URL.scheme isEqualToString:@"http"] &&
        ![request.URL.scheme isEqualToString:@"https"]) {
        REJECT;
    }

    if (request.URL.hp_isHackpadURL) {
        if ([request.URL.path isEqualToString:@"/"] ||
            [request.URL.path hasPrefix:@"/api/"] ||
            ([request.URL.path hasPrefix:@"/comet/"] && ![request.URL.pathExtension isEqualToString:@"js"]) ||
            ([request.URL.path hasPrefix:@"/ep/"] &&
             !([request.URL.path isEqualToString:@"/ep/pad/editor"] ||
               [request.URL.path isEqualToString:@"/ep/sheet"]))) {
            REJECT;
        }
        ACCEPT;
    } else if ([request.URL.host isEqualToString:@"__cdn_hostname__"] ||
               [request.URL.pathExtension isEqualToString:@"js"] ||
               [request.URL.pathExtension isEqualToString:@"css"]) {
        ACCEPT;
#if CACHE_PROFILE_PICS
    } else if (([request.URL.host isEqualToString:@"fbcdn-profile-a.akamaihd.net"] &&
                ([request.URL.pathExtension isEqualToString:@"jpg"] ||
                 [request.URL.pathExtension isEqualToString:@"gif"])) ||
               ([request.URL.host isEqualToString:@"graph.facebook.com"] &&
                [request.URL.path hasSuffix:@"/picture"]) ||
               ([request.URL.host hasPrefix:@"profile-"] &&
                [request.URL.host hasSuffix:@".xx.fbcdn.net"]) ||
               ([request.URL.host isEqualToString:@"www.gravatar.com"] &&
                ([request.URL.path hasPrefix:@"/avatar.php"] ||
                 [request.URL.path hasPrefix:@"/avatar/"])) ||
               ([request.URL.host isEqualToString:@"i2.wp.com"] &&
                [request.URL.path hasPrefix:@"/hackpad.com/"]) ) {
        ACCEPT;
#endif
    }

    REJECT;
#undef ACCEPT
#undef REJECT
}

+ (NSString *)cachePath
{
    NSString *cachesPath = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) lastObject];
    return [cachesPath stringByAppendingPathComponent:@"StaticURLCache"];
}

+ (BOOL)removeCacheWithError:(NSError * __autoreleasing *)error
{
    return [[NSFileManager defaultManager] removeItemAtPath:[self cachePath]
                                                      error:error];
}

+ (BOOL)removeCacheWithHost:(NSString *)host
                      error:(NSError *__autoreleasing *)error
{
    return [[NSFileManager defaultManager] removeItemAtPath:[[self cachePath] stringByAppendingPathComponent:host]
                                                      error:error];
}

+ (BOOL)removeCacheWithURLRequest:(NSURLRequest *)request
                            error:(NSError *__autoreleasing *)error
{
    HPLog(@"[%@] Removing item %@ (%@)", request.URL.host,
          request.URL.hp_fullPath,
          [self cachePathForRequest:request]);
    return [[NSFileManager defaultManager] removeItemAtPath:[self cachePathForRequest:request]
                                                      error:error];
}

+ (NSString *)cachePathForRequest:(NSURLRequest *)aRequest
{
    NSString *cachePath = [self.class.cachePath stringByAppendingPathComponent:aRequest.URL.host];
    [[NSFileManager defaultManager] createDirectoryAtPath:cachePath
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];
    NSURL *URL = aRequest.URL;
    if (URL.fragment.length) {
        URL = [NSURL URLWithString:URL.path
                     relativeToURL:URL];
    }
    return [cachePath stringByAppendingPathComponent:[URL.absoluteString hp_SHA1Digest]];
}

- (NSString *)cachePathForRequest:(NSURLRequest *)aRequest
{
    return [self.class cachePathForRequest:aRequest];
}

+ (Reachability *)sharedInternetReachability
{
    static Reachability *internetConnectionReachability;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        internetConnectionReachability = [HPReachability reachabilityForInternetConnection];
        [internetConnectionReachability startNotifier];
    });
    return internetConnectionReachability;
}

- (BOOL)allowNetwork
{
    return self.request.cachePolicy != NSURLRequestReturnCacheDataDontLoad;
}

- (BOOL)useCache
{
    d(NSDate *date);
    switch (self.request.cachePolicy) {
    case NSURLRequestReturnCacheDataDontLoad:
        d(HPLog(@"[%@] useCache: YES (forced) %@", self.request.URL.host,
                self.request.URL.hp_fullPath));
        return YES;
    case NSURLRequestReloadIgnoringCacheData:
    case NSURLRequestReloadIgnoringLocalAndRemoteCacheData:
        d(HPLog(@"[%@] useCache: NO (reload ignoring) %@", self.request.URL.host,
                self.request.URL.hp_fullPath));
        return NO;
    default:
#if 0
        @try {
            if ([NSKeyedUnarchiver unarchiveObjectWithFile:[self cachePathForRequest:[self request]]]) {
                d(HPLog(@"[%@] useCache: YES (found cache) %@", self.request.URL.host,
                        self.request.URL.hp_fullPath));
                return YES;
            }
        }
        @catch (NSException *exception) { }
        // fall through...
#endif
        if (self.request.allHTTPHeaderFields[DoNotCacheHeader] &&
            [self.class sharedInternetReachability].currentReachabilityStatus) {
            d(HPLog(@"[%@] useCache: NO (header override) %@", self.request.URL.host,
                    self.request.URL.hp_fullPath));
            return NO;
        }
        d(HPLog(@"[%@] useCache: YES (try cache: %lu) %@", self.request.URL.host,
                (unsigned long)self.request.cachePolicy,
                self.request.URL.hp_fullPath));
        return YES;
    case NSURLRequestReloadRevalidatingCacheData:
        d(date = [NSDate date]);
        if ([self.class sharedInternetReachability].currentReachabilityStatus) {
            d(HPLog(@"[%@] useCache: NO (loading) %@ (%.3f)", self.request.URL.host,
                    self.request.URL.hp_fullPath,
                    -date.timeIntervalSinceNow));
            return NO;
        }
        d(HPLog(@"[%@] useCache: NO (offline) %@ (%.3f)", self.request.URL.host,
                self.request.URL.hp_fullPath, -date.timeIntervalSinceNow));
        return YES;
    }
}

+ (void)doNotCacheRequestIfOnline:(NSMutableURLRequest *)request
{
    [request addValue:@""
   forHTTPHeaderField:DoNotCacheHeader];
}

- (BOOL)shouldCacheResponse:(NSURLResponse *)response
{
    return [response isKindOfClass:[NSHTTPURLResponse class]] && [(NSHTTPURLResponse *)response statusCode] / 100 == 2;
}

- (void)connectionDidFinishLoading:(NSURLConnection *)connection
{
    BOOL shouldCache = [self shouldCacheResponse:[self response]];
    if (shouldCache) {
        NSHTTPURLResponse *HTTPResponse = (NSHTTPURLResponse *)self.response;
        NSMutableDictionary *allHeaderFields = HTTPResponse.allHeaderFields.mutableCopy;
        allHeaderFields[FromCacheHeader] = @"YES";
        self.response = [[NSHTTPURLResponse alloc] initWithURL:HTTPResponse.URL
                                                    statusCode:HTTPResponse.statusCode
                                                   HTTPVersion:@"HTTP/1.1"
                                                  headerFields:allHeaderFields];
    }
    [super connectionDidFinishLoading:connection];
    if (!shouldCache) {
        [self.class removeCacheWithURLRequest:[self request]
                                        error:NULL];
    }
}

+ (BOOL)isCachedResponse:(NSURLResponse *)response
{
    return [response isKindOfClass:[NSHTTPURLResponse class]] &&
        [[(NSHTTPURLResponse *)response allHeaderFields][FromCacheHeader] boolValue];
}

- (NSURLRequest *)connection:(NSURLConnection *)connection
             willSendRequest:(NSURLRequest *)request
            redirectResponse:(NSURLResponse *)response
{
    NSURLRequest *ret = [super connection:connection
                          willSendRequest:request
                         redirectResponse:response];
    if (response) {
        [self.class removeCacheWithURLRequest:[self request]
                                        error:NULL];
    }
    return ret;
}

+ (void)logCacheWithHost:(NSString *)host
{
    NSString *path = [[self cachePath] stringByAppendingPathComponent:host];
    for (NSString *file in [[NSFileManager defaultManager] enumeratorAtPath:path]) {
        if ([file isEqualToString:@".DS_Store"]) {
            continue;
        }
        id cache;
        @try {
            cache = [NSKeyedUnarchiver unarchiveObjectWithFile:[path stringByAppendingPathComponent:file]];
        } @catch (NSException *exception) {
            HPLog(@"[%@] Invalid archive: %@", host, file);
            continue;
        }
        NSURLResponse *response = [cache response];
        if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
#if DEBUG
            NSHTTPURLResponse *HTTPResponse = (NSHTTPURLResponse *)response;
#endif
            HPLog(@"[%@] %@: %@ -> %ld %d %@ %@", host, file, HTTPResponse.URL, (long)HTTPResponse.statusCode, (int)HTTPResponse.expectedContentLength, HTTPResponse.MIMEType, HTTPResponse.allHeaderFields);
        } else {
            HPLog(@"[%@] %@: %@ -> %d %@", host, file, response.URL, (int)response.expectedContentLength, response.MIMEType);
        }
    }
}

+ (NSData *)cachedDataWithRequest:(NSURLRequest *)request
                returningResponse:(NSURLResponse *__autoreleasing *)response
                            error:(NSError *__autoreleasing *)error
{
    RNCachedData *cachedData;
    @try {
        cachedData = [NSKeyedUnarchiver unarchiveObjectWithFile:[self cachePathForRequest:request]];
    }
    @catch (NSException *exception) {
        if (error) {
            NSMutableDictionary *dict = [NSMutableDictionary dictionaryWithDictionary:exception.userInfo];
            dict[NSLocalizedDescriptionKey] = exception.reason;
            *error = [NSError errorWithDomain:HPHackpadErrorDomain
                                         code:HPFailedRequestError
                                     userInfo:dict];
        }
        return nil;
    }
    if (!cachedData) {
        if (error) {
            *error = [NSError errorWithDomain:HPHackpadErrorDomain
                                         code:HPFailedRequestError
                                     userInfo:@{NSLocalizedDescriptionKey:@"Request not found in cache."}];
        }
    } else if (cachedData.redirectRequest) {
        return [self cachedDataWithRequest:cachedData.redirectRequest
                         returningResponse:response
                                     error:error];
    } else if (response) {
        *response = cachedData.response;
    }
    return cachedData.data;
}

+ (void)cacheResponse:(NSURLResponse *)response
                 data:(NSData *)data
              request:(NSURLRequest *)request
{
    NSString *cachePath = [self cachePathForRequest:request];
    RNCachedData *cacheData = [RNCachedData new];
    cacheData.response = response;
    cacheData.data = data;
    [NSKeyedArchiver archiveRootObject:cacheData
                                toFile:cachePath];
}

@end
