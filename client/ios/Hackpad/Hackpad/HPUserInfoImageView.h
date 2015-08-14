//
//  HPUserInfoImageView.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPUserInfo;

@interface HPUserInfoImageView : UIView

@property (nonatomic, strong, readonly) UIImageView *imageView;
@property (nonatomic, assign, getter = isStack) BOOL stack;

- (void)setURL:(NSURL *)URL
     connected:(BOOL)connected
      animated:(BOOL)animated;

- (void)setURL:(NSURL *)URL
     connected:(BOOL)connected
 animatedBlock:(BOOL (^)(void))animated;

@end
