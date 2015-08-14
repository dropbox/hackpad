//
//  UIWebView+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface UIWebView (HackpadAdditions)

+ (NSString *)hp_defaultUserAgentString;

- (NSString *)hp_clientVarValueForKey:(NSString *)key;
- (NSString *)hp_stringByEvaluatingJavaScriptNamed:(NSString *)name;

@end
