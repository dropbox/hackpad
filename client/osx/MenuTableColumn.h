//
//  MenuTableColumn.h
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//



@interface MenuTableColumn : NSTableColumn
{
    id delegate;
}

@property (assign) id delegate;

@end
