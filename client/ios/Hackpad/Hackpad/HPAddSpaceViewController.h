//
//  HPAddSpaceViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@protocol HPAddSpaceViewControllerDelegate;

@interface HPAddSpaceViewController : UITableViewController

@property (weak, nonatomic) id <HPAddSpaceViewControllerDelegate> delegate;

@end

@protocol HPAddSpaceViewControllerDelegate <NSObject>

- (void)addSpaceViewController:(HPAddSpaceViewController *)viewController didFinishWithSpaceName:(NSString *)name;
- (void)addSpaceViewControllerDidCancel:(HPAddSpaceViewController *)viewController;
// Return NO if the user has no spaces and needs to add one before proceeding.
- (BOOL)addSpaceViewControllerCanCancel:(HPAddSpaceViewController *)viewController;

@end
