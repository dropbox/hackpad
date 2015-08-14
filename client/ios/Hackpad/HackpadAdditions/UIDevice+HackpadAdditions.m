//
//  UIDevice+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "UIDevice+HackpadAdditions.h"

@implementation UIDevice (HackpadAdditions)

- (NSInteger)hp_systemMajorVersion
{
    static NSInteger version = 0;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        version = [[[UIDevice currentDevice].systemVersion componentsSeparatedByString:@"."][0] integerValue];
    });
    return version;
}

@end
