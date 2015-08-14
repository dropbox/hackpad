//
//  UIViewController+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface UIViewController (HackpadAdditions)

- (void)hp_setNonSearchViewsHidden:(BOOL)hidden
                          animated:(BOOL)animated;
@end
