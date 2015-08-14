//
//  HPPadSharingViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPSharingOptions;
@class HPUserInfoCollection;

@protocol HPPadSharingViewControllerDelegate;

@interface HPPadSharingViewController : UITableViewController

@property (nonatomic, strong) HPSharingOptions *sharingOptions;

@property (nonatomic, strong) IBOutlet UITableViewCell *linkCell;
@property (nonatomic, strong) IBOutlet UITableViewCell *denyCell;
@property (nonatomic, strong) IBOutlet UITableViewCell *allowCell;
@property (nonatomic, strong) IBOutlet UITableViewCell *domainCell;
@property (nonatomic, strong) IBOutlet UITableViewCell *anonymousCell;
@property (nonatomic, strong) IBOutlet UITableViewCell *friendsCell;
@property (nonatomic, strong) IBOutlet UITableViewCell *askCell;

@property (nonatomic, weak) IBOutlet UITableViewCell *moderateCell;
@property (nonatomic, weak) IBOutlet UISwitch *moderateSwitch;

@property (nonatomic, strong) IBOutlet UIBarButtonItem *doneItem;
@property (nonatomic, strong) HPUserInfoCollection *userInfos;

@property (nonatomic, assign) id<HPPadSharingViewControllerDelegate> delegate;

- (IBAction)toggleModerated:(id)sender;
- (IBAction)share:(id)sender;
- (IBAction)done:(id)sender;
@end

@protocol HPPadSharingViewControllerDelegate <NSObject>
@optional
- (void)padSharingViewControllerDidFinish:(HPPadSharingViewController *)padSharingViewController;
@end
