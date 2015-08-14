//
//  HPPadScopeTableVIewDataSource.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>
#import <CoreData/CoreData.h>

@interface HPPadScopeTableViewDataSource : NSObject <UITableViewDataSource, NSFetchedResultsControllerDelegate>
@property (nonatomic, weak) IBOutlet UITableView *tableView;
@property (nonatomic, strong) NSManagedObjectContext *managedObjectContext;
- (id)objectAtIndexPath:(NSIndexPath *)indexPath;
@end
