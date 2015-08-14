//
//  RNCachingURLProtocol.m
//
//  Created by Robert Napier on 1/10/12.
//  Copyright (c) 2012 Rob Napier.
//
//  This code is licensed under the MIT License:
//
//  Permission is hereby granted, free of charge, to any person obtaining a
//  copy of this software and associated documentation files (the "Software"),
//  to deal in the Software without restriction, including without limitation
//  the rights to use, copy, modify, merge, publish, distribute, sublicense,
//  and/or sell copies of the Software, and to permit persons to whom the
//  Software is furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//  DEALINGS IN THE SOFTWARE.
//

#import "RNCachingURLProtocol.h"
#import "Reachability.h"

#define WORKAROUND_MUTABLE_COPY_LEAK 1

#if WORKAROUND_MUTABLE_COPY_LEAK
// required to workaround http://openradar.appspot.com/11596316
@interface NSURLRequest(MutableCopyWorkaround)

- (id) mutableCopyWorkaround;

@end
#endif

@interface RNCachedData : NSObject <NSCoding>
@property (nonatomic, readwrite, strong) NSData *data;
@property (nonatomic, readwrite, strong) NSURLResponse *response;
@property (nonatomic, readwrite, strong) NSURLRequest *redirectRequest;
@end

static NSString *RNCachingURLHeader = @"X-RNCache";

@interface RNCachingURLProtocol () // <NSURLConnectionDelegate, NSURLConnectionDataDelegate> iOS5-only
@property (nonatomic, readwrite, strong) NSURLConnection *connection;
@property (nonatomic, readwrite, strong) NSMutableData *data;
@property (nonatomic, readwrite, strong) NSURLResponse *response;
- (void)appendData:(NSData *)newData;
@end

@implementation RNCachingURLProtocol
@synthesize connection = connection_;
@synthesize data = data_;
@synthesize response = response_;


+ (BOOL)canInitWithRequest:(NSURLRequest *)request
{
  // only handle http requests we haven't marked with our header.
  if ([[[request URL] scheme] isEqualToString:@"http"] &&
      ([request valueForHTTPHeaderField:RNCachingURLHeader] == nil)) {
    return YES;
  }
  return NO;
}

+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request
{
  return request;
}

- (NSString *)cachePathForRequest:(NSURLRequest *)aRequest
{
  // This stores in the Caches directory, which can be deleted when space is low, but we only use it for offline access
  NSString *cachesPath = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) lastObject];
  return [cachesPath stringByAppendingPathComponent:[NSString stringWithFormat:@"%lx",
                                                     (unsigned long)[[[aRequest URL] absoluteString] hash]]];
}

- (void)startLoading
{
  RNCachedData *cache;
  if ([self useCache]) {
    @try {
      cache = [NSKeyedUnarchiver unarchiveObjectWithFile:[self cachePathForRequest:[self request]]];
    } @catch (NSException *e) { }
  }
  if (!cache && [self allowNetwork]) {
    NSMutableURLRequest *connectionRequest =
#if WORKAROUND_MUTABLE_COPY_LEAK
      [[self request] mutableCopyWorkaround];
#else
      [[self request] mutableCopy];
#endif
    // we need to mark this request with our header so we know not to handle it in +[NSURLProtocol canInitWithRequest:].
    [connectionRequest setValue:@"" forHTTPHeaderField:RNCachingURLHeader];
    NSURLConnection *connection = [NSURLConnection connectionWithRequest:connectionRequest
                                                                delegate:self];
    [self setConnection:connection];
  }
  else {
    if (cache) {
      NSData *data = [cache data];
      NSURLResponse *response = [cache response];
      NSURLRequest *redirectRequest = [cache redirectRequest];
      if (redirectRequest) {
        [[self client] URLProtocol:self wasRedirectedToRequest:redirectRequest redirectResponse:response];
      } else {
          
        [[self client] URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed]; // we handle caching ourselves.
        [[self client] URLProtocol:self didLoadData:data];
        [[self client] URLProtocolDidFinishLoading:self];
      }
    }
    else {
      [[self client] URLProtocol:self didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorCannotConnectToHost userInfo:nil]];
    }
  }
}

- (void)stopLoading
{
  [[self connection] cancel];
}

// NSURLConnection delegates (generally we pass these on to our client)

- (NSURLRequest *)connection:(NSURLConnection *)connection willSendRequest:(NSURLRequest *)request redirectResponse:(NSURLResponse *)response
{
// Thanks to Nick Dowell https://gist.github.com/1885821
  if (response != nil) {
      NSMutableURLRequest *redirectableRequest =
#if WORKAROUND_MUTABLE_COPY_LEAK
      [request mutableCopyWorkaround];
#else
      [request mutableCopy];
#endif
    // We need to remove our header so we know to handle this request and cache it.
    // There are 3 requests in flight: the outside request, which we handled, the internal request,
    // which we marked with our header, and the redirectableRequest, which we're modifying here.
    // The redirectable request will cause a new outside request from the NSURLProtocolClient, which 
    // must not be marked with our header.
    [redirectableRequest setValue:nil forHTTPHeaderField:RNCachingURLHeader];

    NSString *cachePath = [self cachePathForRequest:[self request]];
    RNCachedData *cache = [RNCachedData new];
    [cache setResponse:response];
    [cache setData:[self data]];
    [cache setRedirectRequest:redirectableRequest];
    [NSKeyedArchiver archiveRootObject:cache toFile:cachePath];
    [[self client] URLProtocol:self wasRedirectedToRequest:redirectableRequest redirectResponse:response];
    return redirectableRequest;
  } else {
    return request;
  }
}

- (void)connection:(NSURLConnection *)connection didReceiveData:(NSData *)data
{
  [[self client] URLProtocol:self didLoadData:data];
  [self appendData:data];
}

- (void)connection:(NSURLConnection *)connection didFailWithError:(NSError *)error
{
  [[self client] URLProtocol:self didFailWithError:error];
  [self setConnection:nil];
  [self setData:nil];
  [self setResponse:nil];
}

- (void)connection:(NSURLConnection *)connection didReceiveResponse:(NSURLResponse *)response
{
  [self setResponse:response];
  [[self client] URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];  // We cache ourselves.
}

- (void)connectionDidFinishLoading:(NSURLConnection *)connection
{
  [[self client] URLProtocolDidFinishLoading:self];

  NSString *cachePath = [self cachePathForRequest:[self request]];
  RNCachedData *cache = [RNCachedData new];
  [cache setResponse:[self response]];
  [cache setData:[self data]];
  [NSKeyedArchiver archiveRootObject:cache toFile:cachePath];

  [self setConnection:nil];
  [self setData:nil];
  [self setResponse:nil];
}

- (BOOL) useCache 
{
    BOOL reachable = (BOOL) [[Reachability reachabilityWithHostName:[[[self request] URL] host]] currentReachabilityStatus] != NotReachable;
    return !reachable;
}

- (BOOL) allowNetwork
{
    return ![self useCache];
}

- (void)appendData:(NSData *)newData
{
  if ([self data] == nil) {
    [self setData:[newData mutableCopy]];
  }
  else {
    [[self data] appendData:newData];
  }
}

@end

static NSString *const kDataKey = @"data";
static NSString *const kResponseKey = @"response";
static NSString *const kRedirectRequestKey = @"redirectRequest";

@implementation RNCachedData
@synthesize data = data_;
@synthesize response = response_;
@synthesize redirectRequest = redirectRequest_;

- (void)encodeWithCoder:(NSCoder *)aCoder
{
  [aCoder encodeObject:[self data] forKey:kDataKey];
  [aCoder encodeObject:[self response] forKey:kResponseKey];
  [aCoder encodeObject:[self redirectRequest] forKey:kRedirectRequestKey];
}

- (id)initWithCoder:(NSCoder *)aDecoder
{
  self = [super init];
  if (self != nil) {
    [self setData:[aDecoder decodeObjectForKey:kDataKey]];
    [self setResponse:[aDecoder decodeObjectForKey:kResponseKey]];
    [self setRedirectRequest:[aDecoder decodeObjectForKey:kRedirectRequestKey]];
  }

  return self;
}

@end

#if WORKAROUND_MUTABLE_COPY_LEAK
@implementation NSURLRequest(MutableCopyWorkaround)

- (id) mutableCopyWorkaround {
    NSMutableURLRequest *mutableURLRequest = [[NSMutableURLRequest alloc] initWithURL:[self URL]
                                                                          cachePolicy:[self cachePolicy]
                                                                      timeoutInterval:[self timeoutInterval]];
    [mutableURLRequest setAllHTTPHeaderFields:[self allHTTPHeaderFields]];
    return mutableURLRequest;
}

@end
#endif
