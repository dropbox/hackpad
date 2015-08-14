//
//  HPPopoverLayoutFixTableView.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPPopoverLayoutFixTableView.h"

@implementation HPPopoverLayoutFixTableView

- (void)setFrame:(CGRect)frame
{
    if (HP_SYSTEM_MAJOR_VERSION() >= 7 && frame.origin.y == 44) {
        frame.origin.y += 20;
        frame.size.height -= 20;
    }
    [super setFrame:frame];
}

@end
