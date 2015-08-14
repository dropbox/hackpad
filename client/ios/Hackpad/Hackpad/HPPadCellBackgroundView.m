//
//  HPPadCellBackgroundView.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadCellBackgroundView.h"

@implementation HPPadCellBackgroundView

- (void)drawRect:(CGRect)rect
{
    static NSUInteger const HPadding = 8;
    static NSUInteger const VPadding = 6;

    CGContextRef ctx = UIGraphicsGetCurrentContext();

    [[UIColor hp_lightGreenGrayColor] setFill];
    CGContextFillRect(ctx, self.bounds);

    [[UIColor whiteColor] setFill];
    CGContextFillRect(ctx, CGRectMake(HPadding, 0,
                                      self.bounds.size.width - 2 * HPadding,
                                      self.bounds.size.height - VPadding));
}

@end
