//
//  MenuTableColumn.m
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//

#import "MenuTableColumn.h"
#import "SeparatorCell.h"

@implementation MenuTableColumn
@synthesize delegate;

- (id)init
{
    self = [super init];
    if (self) {
        // Initialization code here.
    }

    return self;
}


- (id)dataCellForRow:(NSInteger)row {
    id foo = [[self.delegate arrangedObjects]objectAtIndex:row];
    if ([[foo objectForKey:@"type"] isEqualToString: @"separator"]) {
        return [[[SeparatorCell alloc]init] autorelease];
    }
    if ([[foo objectForKey:@"type"] isEqualToString:@"text"]) {
        NSTextFieldCell* cell = [[[NSTextFieldCell alloc] initTextCell:[foo objectForKey:@"title"]] autorelease];
        [cell setTextColor:[NSColor grayColor]];
        return cell;
    }
    //    [self
  //  NSMutableDictionary *data = [self.tableView. tableView:self.tableView objectValueForTableColumn:self row:row];

    //    NSCell *foo = [self.tableView preparedCellAtColumn:0 row:row];
//    NSLog([[foo representedObject] stringRepresentation]);
    return [self dataCell];

    //return [[[SeparatorCell alloc]init] autorelease];
}



@end
