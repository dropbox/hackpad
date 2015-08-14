//
//  HPStaticCachingURLProtocol.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "RNCachingURLProtocol.h"

@interface HPStaticCachingURLProtocol : RNCachingURLProtocol

+ (BOOL)removeCacheWithError:(NSError * __autoreleasing *)error;
+ (BOOL)removeCacheWithHost:(NSString *)host
                      error:(NSError * __autoreleasing *)error;
+ (BOOL)removeCacheWithURLRequest:(NSURLRequest *)request
                            error:(NSError * __autoreleasing *)error;
+ (void)logCacheWithHost:(NSString *)host;
+ (NSData *)cachedDataWithRequest:(NSURLRequest *)request
                 returningResponse:(NSURLResponse * __autoreleasing *)response
                            error:(NSError * __autoreleasing *)error;
+ (BOOL)isCachedResponse:(NSURLResponse *)response;
+ (void)cacheResponse:(NSURLResponse *)response
                 data:(NSData *)data
              request:(NSURLRequest *)request;
+ (void)doNotCacheRequestIfOnline:(NSMutableURLRequest *)request;
@end
