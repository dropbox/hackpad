//
//  HPGroupedToolbar.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

UIKIT_EXTERN NSTimeInterval const HPGroupedToolbarDefaultAnimationDuration;

@interface HPGroupedToolbar : UIView
@property (nonatomic, weak) UIToolbar *toolbar;
@property (nonatomic, strong) NSArray *groups;
@property (nonatomic, strong) UIColor *selectedGroupTintColor;
@property (nonatomic, strong) UIColor *selectedGroupBackgroundColor;
@property (nonatomic, assign) NSTimeInterval animationDuration;
- (void)showRootToolbarAnimated:(BOOL)animated;
@end
