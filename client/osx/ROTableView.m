//
//  ROTableView.m
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//

#import <Carbon/Carbon.h>

#import "ROTableView.h"
#import "SeparatorCell.h"
#import "PanelController.h"

@implementation ROTableView

@synthesize searching = _searching;


- (void)awakeFromNib
{
    [[self window] makeFirstResponder:self];
    trackingArea = [[NSTrackingArea alloc] initWithRect:[self frame] options:(NSTrackingActiveInActiveApp | NSTrackingMouseEnteredAndExited | NSTrackingMouseMoved) owner:self userInfo:nil];
    [self addTrackingArea:trackingArea];
	mouseOverView = NO;
	mouseOverRow = -1;

}

- (void)dealloc
{
	[self removeTrackingArea:trackingArea];
    trackingArea = nil;
	[super dealloc];
}

- (void)mouseEntered:(NSEvent*)theEvent
{
	mouseOverView = YES;
}

- (void)keyDown:(NSEvent *)theEvent
{
    switch ([theEvent keyCode])
    {
        case kVK_UpArrow:
            [self.delegate performSelector:@selector(selectPreviousRow)];
            break;
        case kVK_DownArrow:
            [self.delegate performSelector:@selector(selectNextRow)];
            break;
        case kVK_Return:
            [self.delegate performSelector:@selector(selectPadForSelectedRow)];
            break;
        default:
            break;
    }
}

- (void)setSearching:(BOOL)searching
{
    _searching = searching;
    if(searching)
    {
        [self selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];
        [self setNeedsDisplayInRect:[self rectOfRow:0]];
    }
}


- (void)mouseMoved:(NSEvent*)theEvent
{
	if (mouseOverView)
    {
		mouseOverRow = [self rowAtPoint:[self convertPoint:[theEvent locationInWindow] fromView:nil]];

        if([self.delegate tableView:self shouldSelectRow:mouseOverRow])
        {
            [self selectRowIndexes:[NSIndexSet indexSetWithIndex:mouseOverRow] byExtendingSelection:NO];
            [self setNeedsDisplayInRect:[self rectOfRow:mouseOverRow]];
        }
        else
        {
            [self deselectAll:self];
        }
	}
}

- (void)mouseExited:(NSEvent *)theEvent
{
    mouseOverView = NO;
	[self setNeedsDisplayInRect:[self rectOfRow:mouseOverRow]];
	mouseOverRow = -1;
}

- (NSInteger)mouseOverRow
{
	return mouseOverRow;
}

-(void)resetCursorRects
{
    [super resetCursorRects];
    [self removeTrackingArea:trackingArea];
    trackingArea = [[NSTrackingArea alloc] initWithRect:[self frame] options:(NSTrackingActiveInActiveApp | NSTrackingMouseEnteredAndExited | NSTrackingMouseMoved) owner:self userInfo:nil];
    [self addTrackingArea:trackingArea];
}

@end