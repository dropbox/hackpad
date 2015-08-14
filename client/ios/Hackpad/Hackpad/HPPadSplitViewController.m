//
//  HPPadViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadSplitViewController.h"

#import <HackpadKit/HackpadKit.h>

#import "HPDrawerController.h"
#import "HPPadListViewController.h"

static NSInteger const PadListItemTag = 0x3000;

@implementation HPPadSplitViewController

#pragma mark - private methods

- (UINavigationController *)editorsController
{
    return (UINavigationController *)self.viewControllers[1];
}

- (void)updateLeftBarButtonItemsWithViewController:(UIViewController *)viewController
                                          animated:(BOOL)animated
{
    UINavigationItem *navigationItem = viewController.navigationItem;
    NSUInteger i = navigationItem.leftBarButtonItems
        ? [navigationItem.leftBarButtonItems indexOfObjectPassingTest:^BOOL(UIBarButtonItem *item,
                                                                            NSUInteger idx,
                                                                            BOOL *stop)
           {
               return item.tag == PadListItemTag ? (*stop = YES) : NO;
           }]
        : NSNotFound;

    NSMutableArray *items;
    if (i == NSNotFound && self.padListItem) {
        items = [NSMutableArray arrayWithObject:self.padListItem];
        if (navigationItem.leftBarButtonItems) {
            [items addObjectsFromArray:navigationItem.leftBarButtonItems];
        }
    } else if (i != NSNotFound && !self.padListItem) {
        items = [navigationItem.leftBarButtonItems mutableCopy];
        [items removeObjectAtIndex:i];
    } else {
        return;
    }
    [navigationItem setLeftBarButtonItems:items
                                 animated:animated];
}

- (void)updateLeftBarButtonItems
{
    [self updateLeftBarButtonItemsWithViewController:self.editorsController.topViewController
                                            animated:YES];
}

#pragma mark - UIViewController implementation

- (void)viewDidLoad
{
    [super viewDidLoad];

    if (self.padListItem) {
        [self updateLeftBarButtonItems];
    }
}

#if __IPHONE_OS_VERSION_MAX_ALLOWED > __IPHONE_6_1
- (UIStatusBarStyle)preferredStatusBarStyle
{
    return UIStatusBarStyleDefault;
}
#endif

#pragma mark - Split view delegate

- (void)splitViewController:(UISplitViewController *)splitController
     willHideViewController:(UIViewController *)viewController
          withBarButtonItem:(UIBarButtonItem *)barButtonItem
       forPopoverController:(UIPopoverController *)popoverController
{
    static NSString * const MenuImageName = @"menu";
    barButtonItem.tag = PadListItemTag;
    self.padListItem = barButtonItem;
    barButtonItem.image = [UIImage imageNamed:MenuImageName];
    [self updateLeftBarButtonItems];
    self.padListViewController.masterPopoverController = popoverController;
}

- (void)splitViewController:(UISplitViewController *)splitController
     willShowViewController:(UIViewController *)viewController
  invalidatingBarButtonItem:(UIBarButtonItem *)barButtonItem
{
    if (barButtonItem == self.padListItem) {
        self.padListItem = nil;
        [self updateLeftBarButtonItems];
        self.padListViewController.masterPopoverController = nil;
    }
}

#if 0
- (BOOL)splitViewController:(UISplitViewController *)svc
   shouldHideViewController:(UIViewController *)vc
              inOrientation:(UIInterfaceOrientation)orientation
{
    return YES;
}
#endif

- (void)splitViewController:(UISplitViewController *)svc
          popoverController:(UIPopoverController *)pc
  willPresentViewController:(UIViewController *)aViewController
{
    [(HPDrawerController *)aViewController setLeftDrawerShown:NO];
}

#pragma mark - Navigation controller delegate

- (void)navigationController:(UINavigationController *)navigationController
      willShowViewController:(UIViewController *)viewController
                    animated:(BOOL)animated
{
    [self updateLeftBarButtonItemsWithViewController:viewController
                                            animated:animated];
}

@end
