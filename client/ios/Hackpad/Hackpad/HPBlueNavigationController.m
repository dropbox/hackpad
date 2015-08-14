//
//  HPBlueNavigationController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPBlueNavigationController.h"

@implementation HPBlueNavigationController
+ (UIImage *)coloredBackgroundImage
{
    return [UIImage imageNamed:@"bluebg.png"];
}

+ (UIColor *)coloredBarTintColor
{
    return [UIColor colorWithRed:0x61/255.0
                           green:0x88/255.0
                            blue:0xcc/255.0
                           alpha:1.0];
}
+ (UIColor *)coloredTintColor
{
    return [UIColor whiteColor];
}
+ (UIColor *)navigationTitleColor
{
    return [UIColor whiteColor];
}

#if __IPHONE_OS_VERSION_MAX_ALLOWED > __IPHONE_6_1
- (UIStatusBarStyle)preferredStatusBarStyle
{
    return UIStatusBarStyleLightContent;
}
- (void)viewDidLoad
{
    [super viewDidLoad];
    self.navigationBar.translucent = NO;
}
#endif

@end
