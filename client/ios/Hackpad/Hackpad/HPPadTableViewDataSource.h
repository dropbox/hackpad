//
//  HPPadTableViewDataSource.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>
#import <CoreData/CoreData.h>

@class HPPad;
@class HPPadScope;

@interface HPPadTableViewDataSource : NSObject <UITableViewDataSource>
@property (nonatomic, weak) IBOutlet UITableView *tableView;
@property (nonatomic, strong) HPPadScope *padScope;
@property (nonatomic, strong) NSManagedObjectContext *managedObjectContext;
- (HPPad *)padAtIndexPath:(NSIndexPath *)indexPath;
- (NSIndexPath *)indexPathForPad:(HPPad *)pad;
@end
