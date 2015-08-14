//
//  UIViewController+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "UIViewController+HackpadAdditions.h"

@implementation UIViewController (HackpadAdditions)

- (void)hp_setNonSearchViewsHidden:(BOOL)hidden
                          animated:(BOOL)animated
{
    [UIView animateWithDuration:animated ? 0.25 : 0
                     animations:^{
                         [self.view.subviews enumerateObjectsUsingBlock:^(UIView *view, NSUInteger idx, BOOL *stop) {
                             if (view == self.searchDisplayController.searchBar || view == self.searchDisplayController.searchResultsTableView) {
                                 return;
                             }
                             view.alpha = !hidden;
                         }];
                     }];
}

@end
