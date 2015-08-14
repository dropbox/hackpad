//
//  HPPadSourceViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPPadScope;
@class HPPadScopeTableViewDataSource;

@interface HPPadScopeViewController : UITableViewController

@property (strong, nonatomic) HPPadScope *padScope;
@property (nonatomic, strong) IBOutlet HPPadScopeTableViewDataSource *dataSource;
@property (nonatomic, strong) IBOutlet UIBarButtonItem *accountsItem;

- (IBAction)addSpace:(id)sender;
- (IBAction)showHiddenSpaces:(id)sender;
- (IBAction)editAccounts:(id)sender;

@end
