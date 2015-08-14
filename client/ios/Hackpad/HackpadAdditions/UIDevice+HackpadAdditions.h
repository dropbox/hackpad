//
//  UIDevice+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

#define HP_SYSTEM_MAJOR_VERSION() ([[UIDevice currentDevice] hp_systemMajorVersion])

@interface UIDevice (HackpadAdditions)

- (NSInteger)hp_systemMajorVersion;

@end
