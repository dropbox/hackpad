//
//  HPDrawerController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPDrawerController.h"

@interface HPDrawerController ()
@property (nonatomic, strong) NSArray *leftConstraints;
@property (nonatomic, strong) NSArray *rightConstraints;
@property (nonatomic, strong) NSArray *panConstraints;
@end

@implementation HPDrawerController

@synthesize leftViewController = _leftViewController;
@synthesize rightViewController = _rightViewController;

- (void)viewDidLoad
{
    [super viewDidLoad];
    self.leftView.hidden = YES;
    self.rightView.hidden = YES;
}

- (void)setLeftViewController:(UIViewController *)leftViewController
{
    _leftViewController = leftViewController;
    self.leftView.hidden = YES;
    NSDictionary *views = @{@"leftView":self.leftView,
                            @"mainView":self.mainView,
                            @"view":self.view};
    self.leftConstraints = [NSLayoutConstraint constraintsWithVisualFormat:@"|[leftView][mainView(==view)]"
                                                                   options:0
                                                                   metrics:nil
                                                                     views:views];

}

- (void)setRightViewController:(UIViewController *)rightViewController
{
    _rightViewController = rightViewController;
    self.rightView.hidden = YES;
    NSDictionary *views = @{@"mainView":self.mainView,
                            @"rightView":self.rightView,
                            @"view":self.view};
    self.rightConstraints = [NSLayoutConstraint constraintsWithVisualFormat:@"[mainView(==view)][rightView]|"
                                                                    options:0
                                                                    metrics:nil
                                                                      views:views];
}

- (void)prepareForSegue:(UIStoryboardSegue *)segue
                 sender:(id)sender
{
    if ([segue.identifier isEqualToString:@"mainSegue"]) {
        self.mainViewController = segue.destinationViewController;
    } else if ([segue.identifier isEqualToString:@"leftDrawerSegue"]) {
        self.leftViewController = segue.destinationViewController;
    } else if ([segue.identifier isEqualToString:@"rightDrawerSegue"]) {
        self.rightViewController = segue.destinationViewController;
    }
}

- (UIViewController *)mainViewController
{
    [self view];
    return _mainViewController;
}

- (UIViewController *)leftViewController
{
    [self view];
    return _leftViewController;
}

- (UIViewController *)rightViewController
{
    [self view];
    return _rightViewController;
}

- (UIViewController *)effectiveMainViewController
{
    return [self.mainViewController isKindOfClass:[UINavigationController class]]
        ? [(UINavigationController *)self.mainViewController topViewController]
        : self.mainViewController;
}


- (void)setPanConstraints:(NSArray *)panConstraints
{
    if (_panConstraints) {
        [self.view removeConstraints:_panConstraints];
    }
    _panConstraints = panConstraints;
    if (panConstraints) {
        [self.view addConstraints:panConstraints];
    }
}

- (void)setDrawerShown:(BOOL)shown
{
    self.panGesture.enabled = shown;
}

- (void)showMainWithAnimated:(BOOL)animated
{
    [self setDrawerShown:NO];

    self.panConstraints = nil;
    if (self.leftConstraints) {
        [self.view removeConstraints:self.leftConstraints];
    }
    if (self.rightConstraints) {
        [self.view removeConstraints:self.rightConstraints];
    }
    [self.view addConstraint:self.mainLeadingConstraint];
    [self.view addConstraint:self.mainTrailingConstraint];

    [UIView animateWithDuration:animated ? 0.25 : 0
                     animations:^{
                         [self.view layoutIfNeeded];
                     } completion:^(BOOL finished) {
                         self.leftView.hidden = YES;
                         self.rightView.hidden = YES;
                     }];
}

- (void)showDrawerView:(UIView *)view
           constraints:(NSArray *)constraints
              animated:(BOOL)animated
{
    [self setDrawerShown:YES];
    self.panConstraints = nil;
    view.hidden = NO;
    [self.view removeConstraint:self.mainLeadingConstraint];
    [self.view removeConstraint:self.mainTrailingConstraint];
    [self.view addConstraints:constraints];
    [UIView animateWithDuration:animated ? 0.25 : 0
                     animations:^{
                         [self.view layoutIfNeeded];
                     }];

}

- (void)setLeftDrawerShown:(BOOL)leftDrawerShown
                  animated:(BOOL)animated
{
    if (!leftDrawerShown) {
        if ([self.delegate respondsToSelector:@selector(drawerController:willHideLeftDrawerAnimated:)]) {
            [self.delegate drawerController:self
                 willHideLeftDrawerAnimated:animated];
        }
        [self showMainWithAnimated:animated];
        return;
    }

    NSAssert(!self.isRightDrawerShown, @"Can't show both drawers.");
    if ([self.delegate respondsToSelector:@selector(drawerController:willShowLeftDrawerAnimated:)]) {
        [self.delegate drawerController:self
             willShowLeftDrawerAnimated:animated];
    }
    [self showDrawerView:self.leftView
             constraints:self.leftConstraints
                animated:animated];
}

- (void)setLeftDrawerShown:(BOOL)drawerShown
{
    [self setLeftDrawerShown:drawerShown
                    animated:NO];
}

- (BOOL)isLeftDrawerShown
{
    return self.leftView && !self.leftView.hidden;
}

- (void)setRightDrawerShown:(BOOL)rightDrawerShown
                   animated:(BOOL)animated
{
    if (!rightDrawerShown) {
        if ([self.delegate respondsToSelector:@selector(drawerController:willHideRightDrawerAnimated:)]) {
            [self.delegate drawerController:self
                 willHideRightDrawerAnimated:animated];
        }
        [self showMainWithAnimated:animated];
        return;
    }

    NSAssert(!self.isLeftDrawerShown, @"Can't show both drawers.");
    if ([self.delegate respondsToSelector:@selector(drawerController:willShowRightDrawerAnimated:)]) {
        [self.delegate drawerController:self
             willShowRightDrawerAnimated:animated];
    }
    [self showDrawerView:self.rightView
             constraints:self.rightConstraints
                animated:animated];
}

- (void)setRightDrawerShown:(BOOL)rightDrawerShown
{
    [self setRightDrawerShown:rightDrawerShown
                     animated:NO];
}

- (BOOL)isRightDrawerShown
{
    return self.rightView && !self.rightView.hidden;
}

- (IBAction)handlePan:(id)sender
{
    UIPanGestureRecognizer *panGesture = sender;
    CGPoint point = [panGesture locationInView:self.view];

    switch (panGesture.state) {
    case UIGestureRecognizerStateChanged: {
        NSDictionary *views = @{@"mainView":self.mainView,
                                @"view":self.view};

        if (self.leftConstraints) {
            [self.view removeConstraints:self.leftConstraints];
        }
        if (self.rightConstraints) {
            [self.view removeConstraints:self.rightConstraints];
        }

        if (self.leftDrawerShown) {
            CGFloat offset = MIN(point.x, CGRectGetWidth(self.leftView.bounds));
            self.panConstraints = [NSLayoutConstraint constraintsWithVisualFormat:@"|-offset-[mainView(==view)]"
                                                                          options:0
                                                                          metrics:@{@"offset":@(offset)}
                                                                            views:views];
        } else if (self.rightDrawerShown) {
            //CGFloat offset = MAX(point.x - self.rightView.bounds.size.width - self.rightView.frame.origin.x, -self.rightView.bounds.size.width);
        }
        [self.view layoutIfNeeded];
        break;
    }
    case UIGestureRecognizerStateEnded: {
        self.panConstraints = nil;
        if (self.leftDrawerShown) {
            if (point.x < CGRectGetMidX(self.leftView.frame)) {
                [self setLeftDrawerShown:NO
                                animated:YES];
                return;
            } else {
                [self.view addConstraints:self.leftConstraints];
            }
        } else if (self.rightDrawerShown) {
            if (point.x > CGRectGetMidX(self.rightView.frame)) {
                [self setRightDrawerShown:NO
                                 animated:YES];
                return;
            } else {
                [self.view addConstraints:self.rightConstraints];
            }
        }
        [UIView animateWithDuration:0.25
                         animations:^{
                             [self.view layoutIfNeeded];
                         }];
        break;
    }
    default:
        break;
    }
}

- (void)encodeRestorableStateWithCoder:(NSCoder *)coder
{
    [super encodeRestorableStateWithCoder:coder];
    [coder encodeObject:self.mainViewController
                 forKey:@"MainViewController"];
    [coder encodeObject:self.leftViewController
                 forKey:@"LeftViewController"];
    [coder encodeObject:self.rightViewController
                 forKey:@"RightViewController"];
}

- (void)decodeRestorableStateWithCoder:(NSCoder *)coder
{
    [super decodeRestorableStateWithCoder:coder];
    // OK this is magic.
    [coder decodeObjectForKey:@"MainViewController"];
    if ([coder containsValueForKey:@"LeftViewController"]) {
        [coder decodeObjectForKey:@"LeftViewController"];
    }
    if ([coder containsValueForKey:@"RightViewController"]) {
        [coder decodeObjectForKey:@"RightViewController"];
    }
}

- (NSUInteger)supportedInterfaceOrientations
{
    return self.effectiveMainViewController.supportedInterfaceOrientations;
}

- (UIInterfaceOrientation)interfaceOrientation
{
    return self.effectiveMainViewController.interfaceOrientation;
}

@end
