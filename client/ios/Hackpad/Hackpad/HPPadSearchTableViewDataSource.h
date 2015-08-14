//
//  HPPadSearchTableViewDataSource.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@class HPPad;
@class HPPadScope;

@interface HPPadSearchTableViewDataSource : NSObject <UITableViewDataSource>
@property (nonatomic, weak) IBOutlet UITableView *tableView;
@property (nonatomic, weak) IBOutlet UITableView *prototypeTableView;
@property (nonatomic, strong) HPPadScope *padScope;
@property (nonatomic, strong) NSManagedObjectContext *managedObjectContext;
@property (nonatomic, copy) NSString *searchText;
- (HPPad *)padAtIndexPath:(NSIndexPath *)indexPath;
@end
