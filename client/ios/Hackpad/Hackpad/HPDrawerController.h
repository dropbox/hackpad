//
//  HPDrawerController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@protocol HPDrawerControllerDelegate;

@interface HPDrawerController : UIViewController

@property (strong, nonatomic) UIViewController *mainViewController;
@property (strong, nonatomic) UIViewController *leftViewController;
@property (nonatomic, strong) UIViewController *rightViewController;

@property (strong, nonatomic) IBOutlet UIView *mainView;
@property (strong, nonatomic) IBOutlet UIView *leftView;
@property (nonatomic, strong) IBOutlet UIView *rightView;

@property (nonatomic, strong) IBOutlet NSLayoutConstraint *mainLeadingConstraint;
@property (nonatomic, strong) IBOutlet NSLayoutConstraint *mainTrailingConstraint;

@property (strong, nonatomic) IBOutlet UIPanGestureRecognizer *panGesture;

@property (assign, nonatomic, getter = isLeftDrawerShown) BOOL leftDrawerShown;
@property (nonatomic, assign, getter = isRightDrawerShown) BOOL rightDrawerShown;

@property (nonatomic, assign) id<HPDrawerControllerDelegate> delegate;

- (void)setLeftDrawerShown:(BOOL)leftDrawerShown
                  animated:(BOOL)animated;

- (void)setRightDrawerShown:(BOOL)rightDrawerShown
                   animated:(BOOL)animated;

- (IBAction)handlePan:(id)sender;

@end

@protocol HPDrawerControllerDelegate <NSObject>
@optional

- (void)drawerController:(HPDrawerController *)drawerController
willShowLeftDrawerAnimated:(BOOL)animated;

- (void)drawerController:(HPDrawerController *)drawerController
willHideLeftDrawerAnimated:(BOOL)animated;

- (void)drawerController:(HPDrawerController *)drawerController
willShowRightDrawerAnimated:(BOOL)animated;

- (void)drawerController:(HPDrawerController *)drawerController
willHideRightDrawerAnimated:(BOOL)animated;

@end