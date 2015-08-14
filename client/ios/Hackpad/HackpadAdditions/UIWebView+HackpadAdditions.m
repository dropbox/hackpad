//
//  UIWebView+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "UIWebView+HackpadAdditions.h"

#import "NSString+HackpadAdditions.h"

@implementation UIWebView (HackpadAdditions)

+ (NSString *)hp_defaultUserAgentString
{
    static NSString * const lock = @"";
    static NSString *userAgent;
    BOOL needsUserAgent;
    @synchronized (lock) {
        needsUserAgent = !userAgent;
    }
    if (needsUserAgent) {
        NSString * __block tmpUserAgent;
        dispatch_block_t block = ^{
            NSDate *date = [NSDate new];
            tmpUserAgent = [[UIWebView new] stringByEvaluatingJavaScriptFromString:@"navigator.userAgent"];
            NSTimeInterval delta = -date.timeIntervalSinceNow;
            if (delta > .1) {
                HPLog(@"Took %.3fs to get user agent.", delta);
            }
        };
        if ([NSThread isMainThread]) {
            block();
        } else {
            dispatch_sync(dispatch_get_main_queue(), block);
        }
        @synchronized (lock) {
            if (!userAgent) {
                userAgent = tmpUserAgent;
            }
        }
    }
    return userAgent;
}

- (NSString *)hp_clientVarValueForKey:(NSString *)key
{
    NSString *str = [NSString stringWithFormat:@"clientVars.%@", key];
    return [self stringByEvaluatingJavaScriptFromString:str];
}

- (NSString *)hp_stringByEvaluatingJavaScriptNamed:(NSString *)name
{
    return [self stringByEvaluatingJavaScriptFromString:[NSString hp_stringNamed:name]];
}

@end
