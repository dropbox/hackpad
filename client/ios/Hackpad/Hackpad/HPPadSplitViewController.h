//
//  HPPadViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPPadListViewController;

@interface HPPadSplitViewController : UISplitViewController <UISplitViewControllerDelegate, UINavigationControllerDelegate>
@property (nonatomic, strong) UIBarButtonItem *padListItem;
@property (nonatomic, weak) IBOutlet HPPadListViewController *padListViewController;
@end
