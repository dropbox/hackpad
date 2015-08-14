//
//  UIFont+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "UIFont+HackpadAdditions.h"

@implementation UIFont (HackpadAdditions)

+ (UIFont *)hp_padTextFontOfSize:(CGFloat)size
{
    return [UIFont fontWithName:@"ProximaNova-Light"
                           size:size];
}

+ (UIFont *)hp_UITextFontOfSize:(CGFloat)size
{
    return [UIFont fontWithName:@"ProximaNova-Semibold"
                           size:size];
}

+ (UIFont *)hp_prioritizedUITextFontOfSize:(CGFloat)size
{
    return [UIFont fontWithName:@"ProximaNova-Extrabld"
                           size:size];
}

+ (UIFont *)hp_padTitleFontOfSize:(CGFloat)size
{
    return [UIFont fontWithName:@"ProximaNova-Bold"
                           size:size];
}

@end
