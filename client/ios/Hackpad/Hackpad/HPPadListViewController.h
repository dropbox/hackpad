//
//  HPPadListViewController.h
//  Hackpad
//
//
//  Copyright (c) 2012 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>
#import <CoreData/CoreData.h>

@class HPPadScope;
@class HPPadEditorViewController;
@class HPPadTableViewDataSource;

@interface HPPadListViewController : UITableViewController <UISearchDisplayDelegate>

@property(strong, nonatomic) IBOutlet HPPadTableViewDataSource *dataSource;

@property (strong, nonatomic) HPPadScope *padScope;
@property (strong, nonatomic) NSManagedObjectContext *managedObjectContext;

@property (strong, nonatomic) IBOutlet HPPadEditorViewController *editorViewController;
@property (strong, nonatomic) IBOutlet UIBarButtonItem *signInButtonItem;
@property (strong, nonatomic) IBOutlet UIBarButtonItem *composeButtonItem;
@property (nonatomic, strong) UIPopoverController *masterPopoverController;

- (IBAction)createPad:(id)sender;
- (IBAction)signIn:(id)sender;
- (IBAction)toggleDrawer:(id)sender;

@end
