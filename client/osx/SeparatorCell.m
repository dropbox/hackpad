//
//  SeparatorCell.m
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//

#import "SeparatorCell.h"

@implementation SeparatorCell

- (id)init
{
    self = [super init];
    if (self) {
        // Initialization code here.
        [self setSelectable:false];
    }

    return self;
}
- (BOOL)isSelectable {
    return false;
}
- (void)setPlaceholderString:(NSString *)string{


}
- (void)drawWithFrame:(NSRect)cellFrame inView:(NSView *)controlView
{
  //  return [super  drawWithFrame:cellFrame inView:controlView];

    NSGraphicsContext* theContext = [NSGraphicsContext currentContext];
    [theContext saveGraphicsState];

    NSBezierPath* aPath = [NSBezierPath bezierPath];
    [aPath setLineWidth:1.0];
    [aPath moveToPoint:NSMakePoint(cellFrame.origin.x-21, cellFrame.origin.y + cellFrame.size.height/2 + 0.5)];
    [aPath lineToPoint:NSMakePoint(cellFrame.origin.x+21 + cellFrame.size.width, cellFrame.origin.y + cellFrame.size.height/2 +0.5)];
    [[NSColor lightGrayColor] set];
    [aPath stroke];

    [theContext restoreGraphicsState];

}
@end
