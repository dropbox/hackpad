//
//  HPCancelFreeSearchDisplayController.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPCancelFreeSearchDisplayController.h"

@implementation HPCancelFreeSearchDisplayController

- (void)setActive:(BOOL)visible
         animated:(BOOL)animated;
{
    [super setActive:visible
            animated:animated];
    self.searchBar.showsCancelButton = NO;
}

@end
