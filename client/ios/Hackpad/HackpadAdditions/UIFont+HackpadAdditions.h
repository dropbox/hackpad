//
//  UIFont+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface UIFont (HackpadAdditions)

+ (UIFont *)hp_padTextFontOfSize:(CGFloat)size;
+ (UIFont *)hp_UITextFontOfSize:(CGFloat)size;
+ (UIFont *)hp_prioritizedUITextFontOfSize:(CGFloat)size;
+ (UIFont *)hp_padTitleFontOfSize:(CGFloat)size;

@end
