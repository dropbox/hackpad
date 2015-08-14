//
//  ROTableView.h
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//


@interface ROTableView : NSTableView
{
    NSTrackingArea* trackingArea;
	BOOL mouseOverView;
	NSInteger mouseOverRow;
    BOOL _searching;
}

@property (readwrite,assign,nonatomic) BOOL searching;

@end
