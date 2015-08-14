//
//  UIView+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "UIView+HackpadAdditions.h"

@implementation UIView (HackpadAdditions)

- (UIView *)hp_firstResponderSubview
{
    if (self.isFirstResponder) {
        return self;
    }
    for (UIView *subview in self.subviews) {
        UIView *view = [subview hp_firstResponderSubview];
        if (view) {
            return view;
        }
    }
    return nil;
}

- (UIView *)hp_subviewThatCanBecomeFirstResponder
{
    if (self.canBecomeFirstResponder) {
        return self;
    }
    for (UIView *subview in self.subviews) {
        UIView *view = [subview hp_subviewThatCanBecomeFirstResponder];
        if (view) {
            return view;
        }
    }
    return nil;
}

- (void)hp_setAlphaWithUserInteractionEnabled:(BOOL)userInteractionEnabled
{
    self.userInteractionEnabled = userInteractionEnabled;
    self.alpha = userInteractionEnabled ? 1 : 0.33;
}

- (void)hp_setHidden:(BOOL)hidden
            animated:(BOOL)animated
{
    if (hidden == self.hidden) {
        return;
    }
    if (!hidden) {
        self.alpha = 0;
        self.hidden = hidden;
    }
    [UIView animateWithDuration:animated ? 0.25 : 0
                     animations:^{
                         self.alpha = !hidden;
                     } completion:^(BOOL finished) {
                         if (!finished) {
                             return;
                         }
                         self.hidden = hidden;
                     }];
}

@end
