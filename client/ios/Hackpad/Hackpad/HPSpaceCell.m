//
//  HPSpaceCell.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPSpaceCell.h"

@implementation HPSpaceCell

- (void)layoutSubviews
{
    [super layoutSubviews];
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        return;
    }
    // Hack to center chevrons under gear
    CGRect frame = self.accessoryView.frame;
    frame.origin.x = CGRectGetWidth(self.bounds) - CGRectGetWidth(frame);
    self.accessoryView.frame = frame;
}

@end
