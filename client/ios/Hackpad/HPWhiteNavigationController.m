//
//  HPWhiteNavigationController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPWhiteNavigationController.h"

#import <HackpadAdditions/HackpadAdditions.h>

@implementation HPWhiteNavigationController

+ (UIImage *)coloredBackgroundImage
{
    return [UIImage imageNamed:@"darkgreenbg"];
}

+ (UIColor *)coloredBarTintColor
{
    return HP_SYSTEM_MAJOR_VERSION() >= 7 ? [UIColor whiteColor] : [UIColor hp_darkGreenColor];
}

+ (UIColor *)coloredTintColor
{
    return HP_SYSTEM_MAJOR_VERSION() >= 7 ? [UIColor hp_darkGreenColor] : [UIColor whiteColor];
}

+ (UIColor *)navigationTitleColor
{
    return HP_SYSTEM_MAJOR_VERSION() >= 7 ? [UIColor hp_reallyDarkGrayColor] : [UIColor whiteColor];
}

#if __IPHONE_OS_VERSION_MAX_ALLOWED > __IPHONE_6_1
- (UIStatusBarStyle)preferredStatusBarStyle
{
    return UIStatusBarStyleDefault;
}
- (void)viewDidLoad
{
    [super viewDidLoad];
    // Translucent bars -> black search bars on iOS 7?
    self.navigationBar.translucent = NO;
}
#endif

@end
