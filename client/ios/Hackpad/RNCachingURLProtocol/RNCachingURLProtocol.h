//
//  RNCachingURLProtocol.h
//
//  Created by Robert Napier on 1/10/12.
//  Copyright (c) 2012 Rob Napier. All rights reserved.
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

// RNCachingURLProtocol is a simple shim for the HTTP protocol (that’s not
// nearly as scary as it sounds). Anytime a URL is download, the response is
// cached to disk. Anytime a URL is requested, if we’re online then things
// proceed normally. If we’re offline, then we retrieve the cached version.
//
// The point of RNCachingURLProtocol is mostly to demonstrate how this is done.
// The current implementation is extremely simple. In particular, it doesn’t
// worry about cleaning up the cache. The assumption is that you’re caching just
// a few simple things, like your “Latest News” page (which was the problem I
// was solving). It caches all HTTP traffic, so without some modifications, it’s
// not appropriate for an app that has a lot of HTTP connections (see
// MKNetworkKit for that). But if you need to cache some URLs and not others,
// that is easy to implement.
//
// You should also look at [AFCache](https://github.com/artifacts/AFCache) for a
// more powerful caching engine that is currently integrating the ideas of
// RNCachingURLProtocol.
//
// A quick rundown of how to use it:
//
// 1. To build, you will need the Reachability code from Apple (included). That requires that you link with
//    `SystemConfiguration.framework`.
//
// 2. At some point early in the program (application:didFinishLaunchingWithOptions:),
//    call the following:
//
//      `[NSURLProtocol registerClass:[RNCachingURLProtocol class]];`
//
// 3. There is no step 3.
//
// For more details see
//    [Drop-in offline caching for UIWebView (and NSURLProtocol)](http://robnapier.net/blog/offline-uiwebview-nsurlprotocol-588).

#import <Foundation/Foundation.h>

@interface RNCachingURLProtocol : NSURLProtocol

- (NSString *)cachePathForRequest:(NSURLRequest *)aRequest;
- (BOOL) useCache;
- (BOOL) allowNetwork;

@end
