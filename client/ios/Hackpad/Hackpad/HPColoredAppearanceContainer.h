//
//  HPColoredAppearanceContainer.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@protocol HPColoredAppearanceContainer <UIAppearanceContainer>
+ (UIImage *)coloredBackgroundImage;
+ (UIColor *)coloredBarTintColor;
+ (UIColor *)coloredTintColor;
+ (UIColor *)navigationTitleColor;
@end
