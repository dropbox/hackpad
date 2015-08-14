//
//  HPInvitationTableDataSource.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPPad;
@class HPInvitationTableViewDataSource;

@interface HPInvitationController : NSObject <UITableViewDelegate, UISearchDisplayDelegate, UISearchBarDelegate>

@property (nonatomic, strong) HPPad *pad;
@property (nonatomic, strong) HPInvitationTableViewDataSource *dataSource;
@property (nonatomic, weak) IBOutlet UIViewController *viewController;
@property (nonatomic, weak) IBOutlet UIBarButtonItem *inviteItem;
@end
