//
//  HPUserInfosViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPUserInfoCollection;
@class HPPad;

@interface HPUserInfosViewController : UITableViewController

@property (nonatomic, strong) IBOutlet UIBarButtonItem *doneItem;
@property (nonatomic, strong) HPPad *pad;
@property (nonatomic, strong) HPUserInfoCollection *userInfos;

- (IBAction)done:(id)sender;

@end
