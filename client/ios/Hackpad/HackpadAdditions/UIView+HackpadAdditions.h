//
//  UIView+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface UIView (HackpadAdditions)

- (UIView *)hp_firstResponderSubview;
- (UIView *)hp_subviewThatCanBecomeFirstResponder;
- (void)hp_setAlphaWithUserInteractionEnabled:(BOOL)userInteractionEnabled;
- (void)hp_setHidden:(BOOL)hidden
            animated:(BOOL)animated;
@end
