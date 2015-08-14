//
//  HPGrayNavigationController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPGrayNavigationController.h"

@implementation HPGrayNavigationController
+ (UIImage *)coloredBackgroundImage
{
    return [UIImage imageNamed:@"graybg"];
}

+ (UIColor *)coloredBarTintColor
{
    return [UIColor hp_darkGrayColor];
}
+ (UIColor *)coloredTintColor
{
    return [UIColor hp_lightGreenGrayColor];
}
+ (UIColor *)navigationTitleColor
{
    return [UIColor hp_mediumGreenGrayColor];
}

- (BOOL)disablesAutomaticKeyboardDismissal
{
    if (self.modalPresentationStyle != UIModalPresentationFormSheet) {
        return [super disablesAutomaticKeyboardDismissal];
    }
    // http://stackoverflow.com/questions/3372333/ipad-keyboard-will-not-dismiss-if-modal-view-controller-presentation-style-is-ui/3386768#3386768
    return NO;
}

// For sign in view controller
- (NSUInteger)supportedInterfaceOrientations
{
    return self.topViewController.supportedInterfaceOrientations;
}

- (UIInterfaceOrientation)interfaceOrientation
{
    return self.topViewController.interfaceOrientation;
}

#if __IPHONE_OS_VERSION_MAX_ALLOWED > __IPHONE_6_1
- (UIStatusBarStyle)preferredStatusBarStyle
{
    return UIStatusBarStyleLightContent;
}
- (void)viewDidLoad
{
    [super viewDidLoad];
    self.navigationBar.translucent = YES;
}
#endif

@end
