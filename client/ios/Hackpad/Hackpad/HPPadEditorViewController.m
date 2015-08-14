//
//  HPPadEditorViewController.m
//  Hackpad
//
//
//  Copyright (c) 2012 Hackpad. All rights reserved.
//

#import "HPPadEditorViewController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadUIAdditions.h"

#import "HPActionSheetBlockDelegate.h"
#import "HPAlertViewBlockDelegate.h"
#import "HPBrowserViewController.h"
#import "HPDrawerController.h"
#import "HPGroupedToolbar.h"
#import "HPInvitationController.h"
#import "HPPadAutocompleteTableViewDataSource.h"
#import "HPPadCollectionViewController.h"
#import "HPPadSearchTableViewDataSource.h"
#import "HPPadSharingViewController.h"
#import "HPUserInfoCollection.h"
#import "HPUserInfoImageView.h"
#import "HPUserInfosViewController.h"

#import <MessageUI/MessageUI.h>

#import <AddressBookUI/AddressBookUI.h>
#import <AppleSampleCode/Reachability.h>
#import <MBProgressHUD/MBProgressHUD.h>
#import <TestFlight/TestFlight.h>
#import "Flurry.h"

static NSString * const AboutBlank = @"about:blank";
static NSString * const BrowserSegue = @"BrowserSegue";
static NSString * const OpenPadSegue = @"OpenPad";

static NSString * const DataKey = @"data";

@interface HPPadEditorViewController () <HPBrowserViewControllerDelegate,
                                         HPPadWebControllerDelegate,
                                         HPPadSharingViewControllerDelegate,
                                         MFMailComposeViewControllerDelegate,
                                         UIActionSheetDelegate,
                                         UIImagePickerControllerDelegate,
                                         UINavigationControllerDelegate,
                                         UIPopoverControllerDelegate>
@property (nonatomic, strong) NSDate *creationDate;
@property (nonatomic, strong) NSURLRequest *photoRequest;
@property (nonatomic, readonly) UISearchDisplayController *currentSearchDisplayController;
@property (nonatomic, strong) UIPopoverController *autocompleteDataPopover;
@property (nonatomic, strong) UIActionSheet *imageSheet;
@property (nonatomic, strong) UIStoryboardPopoverSegue *popoverSegue;
@property (nonatomic, strong) HPPadSearchTableViewDataSource *searchDataSource;
@property (nonatomic, strong) HPGroupedToolbar *groupedToolbar;
@property (nonatomic, strong) id signInObserver;
@property (nonatomic, strong) id signOutObserver;
@property (nonatomic, assign) CGFloat keyboardOrigin;
@property (nonatomic, assign) BOOL restoringFocus;
@property (nonatomic, assign, getter = isFreakingOut) BOOL freakingOut;
@end

@implementation HPPadEditorViewController

#pragma mark - Managing the detail item

- (void)setPad:(HPPad *)pad
{
    if (self.padWebController.delegate == self) {
        self.padWebController.delegate = nil;
    }
    [self.padWebController saveClientVarsAndTextWithCompletion:nil];

    _pad = pad;

    if (self.isViewLoaded && self.padWebController.webView.superview == self.view) {
        [self.padWebController.webView removeFromSuperview];
    }

    if (!pad) {
        self.padWebController = nil;
        return;
    }

    self.padWebController = [HPPadWebController sharedPadWebControllerWithPad:pad];

    if (!self.isViewLoaded) {
        return;
    }
    [self configureView];
    [self addWebView];
    [self loadWebView];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        [self showEditingToolbar:NO
                        animated:YES];
    }
}

- (void)addWebView
{
    if (self.padWebController.webView.superview == self.view) {
        return;
    }
    self.padWebController.delegate = self;

    self.padWebController.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.padWebController.webView.keyboardDisplayRequiresUserAction = NO;

    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        [self.view addSubview:self.padWebController.webView];
    } else {
        [self.view insertSubview:self.padWebController.webView
                    belowSubview:self.autocompleteTableView];
    }

    NSDictionary *views;
    NSArray *cn;
    if (HP_SYSTEM_MAJOR_VERSION() >= 7) {
        views = @{@"webView":self.padWebController.webView,
                  @"topGuide":self.topLayoutGuide};
        cn = [NSLayoutConstraint constraintsWithVisualFormat:@"V:[topGuide][webView]|"
                                                     options:0
                                                     metrics:nil
                                                       views:views];
        [self.view addConstraints:cn];
    } else {
        views = @{@"webView":self.padWebController.webView};
        cn = [NSLayoutConstraint constraintsWithVisualFormat:@"V:|[webView]|"
                                                     options:0
                                                     metrics:nil
                                                       views:views];
        [self.view addConstraints:cn];
    }
    cn = [NSLayoutConstraint constraintsWithVisualFormat:@"|[webView]|"
                                                 options:0
                                                 metrics:nil
                                                   views:views];
    [self.view addConstraints:cn];
    [self.view layoutIfNeeded];
}

- (void)goBack
{
    self.pad = nil;
    if (self.navigationController.viewControllers.firstObject == self ||
        self.navigationController.topViewController != self) {
        return;
    }
    [self.navigationController popViewControllerAnimated:YES];
}

- (void)openSupportMail
{
    static NSString * const IOSSupportAtHackpad = @"support+ios@example.com";
    static NSString * const MessageBodyFormat = @""
    "\n"
    "-- Please leave the following information --\n"
    "Pad URL: %@\n";

    MFMailComposeViewController *mailer = [[MFMailComposeViewController alloc] init];
    [mailer setToRecipients:@[IOSSupportAtHackpad]];
    [mailer setSubject:[NSString stringWithFormat:@"Error loading pad %@", self.pad.padID]];
    [mailer setMessageBody:[NSString stringWithFormat:MessageBodyFormat, self.pad.URL.absoluteString]
                    isHTML:NO];
    mailer.mailComposeDelegate = self;
    [self presentViewController:mailer
                       animated:YES
                     completion:nil];
}

- (void)discardChanges
{
    HPPadEditorViewController * __weak weakSelf = self;
    HPActionSheetBlockDelegate *delegate = [[HPActionSheetBlockDelegate alloc] initWithBlock:^(UIActionSheet *actionSheet, NSInteger button) {
        if (button == actionSheet.cancelButtonIndex) {
            return;
        }
        [weakSelf.pad discardMissedChangesWithCompletion:^(HPPad *pad, NSError *error) {
            [weakSelf loadWebView];
        }];
    }];
    [[[UIActionSheet alloc] initWithTitle:@"Your unsaved changes will be lost. This cannot be undone."
                                 delegate:delegate
                        cancelButtonTitle:@"Cancel"
                   destructiveButtonTitle:@"Discard Changes"
                        otherButtonTitles:nil] showInView:self.view];
}

- (void)reloadAfterSignedIn
{
    BOOL goBack = NO;
    BOOL reloadWebView = NO;
    HPPadEditorViewController * __weak weakSelf = self;
    HPAPI *API = self.pad.space.API;
    @synchronized (API) {
        switch (self.pad.space.API.authenticationState) {
            case HPRequiresSignInAuthenticationState:
                goBack = YES;
                break;
            case HPSignedInAuthenticationState:
                reloadWebView = YES;
                break;
            default: {
                NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
                self.signInObserver = [nc addObserverForName:HPAPIDidSignInNotification
                                                      object:API
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note)
                                       {
                                           [weakSelf removeReloadObservers];
                                           [weakSelf reloadWebView];
                                       }];
                self.signOutObserver = [nc addObserverForName:HPAPIDidSignOutNotification
                                                       object:API
                                                        queue:[NSOperationQueue mainQueue]
                                                   usingBlock:^(NSNotification *note)
                                        {
                                            [weakSelf removeReloadObservers];
                                            [weakSelf goBack];
                                        }];
            }
        }
    }
    // Don't need to do these while @synchronized
    if (goBack) {
        [self goBack];
    }
    if (reloadWebView) {
        [self reloadWebView];
    }
}

- (void)handleWebViewLoadError:(NSError *)error
{
    TFLog(@"[%@ %@] Could not load pad web view: %@",
          self.pad.space.URL.host, self.pad.padID, error);
    BOOL padNotFound = NO;
    if ([error.domain isEqualToString:HPHackpadErrorDomain]) {
        switch (error.code) {
            case HPSignInRequired:
                [self reloadAfterSignedIn];
                return;
            case HPFailedRequestError: {
                NSURL *failingURL = error.userInfo[NSURLErrorFailingURLErrorKey];
                NSNumber *statusCode = error.userInfo[HPURLErrorFailingHTTPStatusCode];
                padNotFound = [failingURL.path isEqualToString:HPPadClientVarsPath] && statusCode.integerValue == 404;
                break;
            }
            default:
                break;
        }
    }
    NSString *message = padNotFound
        ? @"The pad does not exist, or you don't have access to it."
        : @"The pad could not be loaded. If this continues,"
          " please contact support.";
    UIAlertView *alertView = [[UIAlertView alloc] initWithTitle:@"Oops"
                                                        message:message
                                                       delegate:nil
                                              cancelButtonTitle:@"Cancel"
                                              otherButtonTitles:nil];
    NSInteger mailButton = -1;
    NSInteger discardButton = -1;
    NSInteger requestAccessButton = -1;
    if (padNotFound) {
        requestAccessButton = [alertView addButtonWithTitle:@"Request Access"];
    } else {
        if ([MFMailComposeViewController canSendMail]) {
            mailButton = [alertView addButtonWithTitle:@"Contact Support"];
        }
        if (self.pad.hasMissedChanges) {
            discardButton = [alertView addButtonWithTitle:@"Discard Changes"];
        }
    }
    HPPadEditorViewController * __weak weakSelf = self;
    HPAlertViewBlockDelegate *delegate = [[HPAlertViewBlockDelegate alloc] initWithBlock:^(UIAlertView *alertView, NSInteger button) {
        if (button == alertView.cancelButtonIndex) {
            [weakSelf goBack];
        } else if (button == mailButton) {
            [weakSelf openSupportMail];
        } else if (button == discardButton) {
            [weakSelf discardChanges];
        } else if (button == requestAccessButton) {
            MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:weakSelf.view
                                                      animated:YES];
            [weakSelf.pad requestAccessWithCompletion:^(HPPad *pad, NSError *error) {
                // This request always sends an error, so ignore it for now.
                [HUD hide:YES];
                [weakSelf goBack];
                [[[UIAlertView alloc] initWithTitle:@"Cool"
                                            message:@"We've sent the owner of the pad an email requesting access for you."
                                           delegate:nil
                                  cancelButtonTitle:nil
                                  otherButtonTitles:@"OK", nil] show];
            }];
        }
    }];
    alertView.delegate = delegate;
    [alertView show];
}

- (void (^)(NSError *))webViewLoadCompletion
{
    HPPadEditorViewController * __weak weakSelf = self;
    return ^(NSError *error) {
        if (!weakSelf || weakSelf.padWebController.delegate != weakSelf) {
            return;
        }
        if (error) {
            [weakSelf handleWebViewLoadError:error];
            return;
        }
        [weakSelf updatePeoplePhoto];
    };
}

- (void)loadWebView
{
    [self.padWebController loadWithCompletion:self.webViewLoadCompletion];
}

- (void)reloadWebView
{
    [self.padWebController reloadDiscardingChanges:NO
                                       cachePolicy:NSURLRequestReloadRevalidatingCacheData
                                        completion:self.webViewLoadCompletion];
}

- (void)setFollowedButtonIsFollowed:(BOOL)followed
                           animated:(BOOL)animated
{
    if (!self.pad.space) {
        [self.navigationItem setRightBarButtonItem:nil
                                          animated:YES];
        return;
    }
    if (followed) {
        [self.navigationItem setRightBarButtonItem:self.photoItem
                                          animated:animated];
        return;
    }
    UIBarButtonItem *spacer = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFixedSpace
                                                                            target:nil
                                                                            action:nil];
    spacer.width = HP_SYSTEM_MAJOR_VERSION() >= 7 ? 16 : 0;
    [self.navigationItem setRightBarButtonItems:@[self.photoItem, spacer, self.followedItem]
                                       animated:animated];
}

- (void)configureView
{
    if (!self.pad) {
        return;
    }
    BOOL enabled = !!self.pad.space.API.reachability.currentReachabilityStatus;
    self.followedItem.enabled = enabled;
    self.photoItem.enabled = enabled;
    [self setFollowedButtonIsFollowed:self.pad.followed
                             animated:YES];
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    [Flurry logEvent:HPPadViewedEventKey timed:YES];

    self.followedItem.possibleTitles = [NSSet setWithObjects:@"Follow", @"Unfollow", nil];

    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];

    [center addObserver:self
               selector:@selector(contextDidSave:)
                   name:NSManagedObjectContextDidSaveNotification
                 object:nil];
    [center addObserver:self
               selector:@selector(reachabilityDidChangeWithNotification:)
                   name:kReachabilityChangedNotification
                 object:nil];

    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        self.navigationItem.leftItemsSupplementBackButton = YES;
        self.groupedToolbar = (HPGroupedToolbar *)self.navigationItem.titleView;
        self.groupedToolbar.selectedGroupBackgroundColor = [UIColor hp_lightGreenGrayColor];
        self.editorAccessoryToolbar.frame = self.groupedToolbar.bounds;
        [self initializeGroupedToolbarWithBackgroundImage:nil
                                     groupBackgroundImage:nil];
        [self showEditingToolbar:NO
                        animated:NO];
        [center addObserver:self
                   selector:@selector(keyboardWillChangeFrameWithNotification:)
                       name:UIKeyboardWillChangeFrameNotification
                     object:nil];
    } else {
        if (HP_SYSTEM_MAJOR_VERSION() >= 7) {
            self.view.backgroundColor = self.navigationController.navigationBar.barTintColor;
        } else {
            self.searchBarConstraint.constant = 0;
        }

        [center addObserver:self
                   selector:@selector(keyboardWillHideWithNotification:)
                       name:UIKeyboardWillHideNotification
                     object:nil];
        [center addObserver:self
                   selector:@selector(keyboardWillShowWithNotification:)
                       name:UIKeyboardWillShowNotification
                     object:nil];
        [center addObserver:self
                   selector:@selector(keyboardDidShowWithNotification:)
                       name:UIKeyboardDidShowNotification
                     object:nil];
        self.navigationItem.leftBarButtonItems = @[self.backItem, self.searchItem];
    }

    [self configureView];
    if (self.pad) {
        [self addWebView];
        [self loadWebView];
    }
}

- (IBAction)goBack:(id)sender
{
    [self.navigationController popViewControllerAnimated:YES];
}

- (void)removeObservers
{
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    [center removeObserver:self
                      name:NSManagedObjectContextDidSaveNotification
                    object:nil];
    [center removeObserver:self
                      name:kReachabilityChangedNotification
                    object:nil];
    if ([[UIDevice currentDevice] userInterfaceIdiom] == UIUserInterfaceIdiomPhone) {
        [center removeObserver:self
                          name:UIKeyboardWillShowNotification
                        object:nil];
        [center removeObserver:self
                          name:UIKeyboardDidShowNotification
                        object:nil];
        [center removeObserver:self
                          name:UIKeyboardWillHideNotification
                        object:nil];
    } else {
        [center removeObserver:self
                          name:UIKeyboardWillChangeFrameNotification
                        object:nil];
    }
    [self removeReloadObservers];
}

- (void)removeReloadObservers
{
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    if (self.signInObserver) {
        [center removeObserver:self.signInObserver];
        self.signInObserver = nil;
    }
    if (self.signOutObserver) {
        [center removeObserver:self.signOutObserver];
        self.signOutObserver = nil;
    }
}

- (void)viewWillAppear:(BOOL)animated
{
    [super viewWillAppear:animated];
    if (!self.padWebController.webView) {
        return;
    }
    // In case the user has opened this pad linked from another pad, and is now
    // going back through the navigation stack
    [self addWebView];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        return;
    }
    [self showEditingToolbar:NO
                    animated:NO];
}

- (void)viewWillDisappear:(BOOL)animated
{
    [super viewWillDisappear:animated];
    if ([self.navigationController.viewControllers indexOfObject:self] != NSNotFound) {
        return;
    }
    // This means we're going back.
    self.pad = nil;
    [UIApplication sharedApplication].networkActivityIndicatorVisible = NO;
    [Flurry endTimedEvent:HPPadViewedEventKey withParameters:nil];
}

- (void)dealloc
{
    [self hideDialogs];
    [self removeObservers];
    self.padWebController.delegate = nil;
}

- (void)contextDidSave:(NSNotification *)note
{
    NSManagedObjectContext *managedObjectContext = note.object;
    if (managedObjectContext.concurrencyType == NSMainQueueConcurrencyType) {
        if (self.pad.managedObjectContext != managedObjectContext ||
            ![[note.userInfo objectForKey:NSUpdatedObjectsKey] member:self.pad]) {
            return;
        }
        [self configureView];
    }
}

- (void)didRotateFromInterfaceOrientation:(UIInterfaceOrientation)fromInterfaceOrientation
{
    [self.padWebController updateViewportWidth];
}

- (IBAction)toggleUserInfos:(id)sender
{
    if (![self shouldPerformSegueWithIdentifier:@"EditSharing"
     sender:sender]) {
        return;
    }
    UIStoryboardPopoverSegue *segue = [[UIStoryboardPopoverSegue alloc] initWithIdentifier:@"EditSharing"
                                                                                    source:self
                                                                               destination:[self.storyboard instantiateViewControllerWithIdentifier:@"EditSharingNavigationController"]];
    [self prepareForSegue:segue
                   sender:sender];
    [segue.popoverController presentPopoverFromBarButtonItem:self.photoItem
                                    permittedArrowDirections:UIPopoverArrowDirectionAny
                                                    animated:YES];
}

- (void)hideDialogs
{
    // Delegate is called for action sheets, so no need to unset.
    [_imageSheet dismissWithClickedButtonIndex:_imageSheet.cancelButtonIndex
                                      animated:YES];

    // Delegate *isn't* called for popovers, so unset;
#if 0
    [_searchPopover dismissPopoverAnimated:YES];
    _searchPopover.delegate = nil;
    _searchPopover = nil;
#endif

    [_popoverSegue.popoverController dismissPopoverAnimated:YES];
    _popoverSegue.popoverController.delegate = nil;
    _popoverSegue = nil;

    [self.autocompleteDataPopover dismissPopoverAnimated:YES];
    self.autocompleteDataPopover.delegate = nil;
    self.autocompleteDataPopover = nil;

    [self.autocompleteTableView hp_setHidden:YES
                                    animated:YES];
}

- (IBAction)createPad:(id)sender
{
    HPPadEditorViewController * __weak weakSelf = self;
    [(self.pad.space ?: self.defaultSpace) blankPadWithTitle:@"Untitled"
                                                    followed:YES
                                                  completion:^(HPPad *pad, NSError *error)
     {
         if (!pad) {
             if (error) {
                 TFLog(@"[%@] Could not create pad: %@",
                       weakSelf.pad.URL.host, error);
             }
             return;
         }
         if (weakSelf.pad) {
             [weakSelf performSegueWithIdentifier:OpenPadSegue
                                           sender:pad];
         } else {
             self.pad = pad;
         }
     }];
}


#pragma mark - Notifications

- (void)reachabilityDidChangeWithNotification:(NSNotification *)note
{
    [[NSOperationQueue mainQueue] addOperationWithBlock:^{
        if (note.object == self.pad.space.API.reachability) {
            [self configureView];
        }
    }];
}

- (void)keyboardWillHideWithNotification:(NSNotification *)note
{
    UIView *firstResponder = [self.padWebController.webView hp_firstResponderSubview];
    if (!firstResponder) {
        return;
    }
    if (self.restoringFocus) {
        HPLog(@"[%@] (ignoring hide triggered by restoring focus)",
              self.pad.space.URL.host);
        self.restoringFocus = NO;
        return;
    }
    [self.autocompleteTableView hp_setHidden:YES
                                    animated:YES];
    self.padWebController.visibleEditorHeight = 0;
    [self.navigationController setNavigationBarHidden:NO
                                             animated:YES];
}

- (UIToolbar *)findToolbarInAccessoryView:(UIView *)accessoryView
{
    UIToolbar * __block toolbar;
    [accessoryView.subviews enumerateObjectsUsingBlock:^(UIView *subview, NSUInteger idx, BOOL *stop) {
        [subview.subviews enumerateObjectsUsingBlock:^(UIView *subview, NSUInteger idx, BOOL *stop) {
            if ([subview isKindOfClass:[UIToolbar class]]) {
                toolbar = (UIToolbar *)subview;
                *stop = YES;
            }
        }];
        if (toolbar) {
            *stop = YES;
        }
    }];
    return toolbar;
}

- (void)initializeGroupedToolbarWithBackgroundImage:(UIImage *)backgroundImage
                               groupBackgroundImage:(UIImage *)groupBackgroundImage
{
    self.groupedToolbar.toolbar = self.editorAccessoryToolbar;
    if (backgroundImage) {
        [self.groupedToolbar.toolbar setBackgroundImage:backgroundImage
                                     forToolbarPosition:UIBarPositionAny
                                             barMetrics:UIBarMetricsDefault];
        [self.groupedToolbar.toolbar setShadowImage:[UIImage new]
                                 forToolbarPosition:UIBarPositionAny];
    }
    self.groupedToolbar.groups = @[self.formattingToolbar, self.listsToolbar,
                                   self.insertToolbar, [NSNull null], [NSNull null],
                                   [NSNull null]];
    if (!groupBackgroundImage) {
        return;
    }
    [self.groupedToolbar.groups enumerateObjectsUsingBlock:^(UIToolbar *toolbar, NSUInteger idx, BOOL *stop) {
        if (![toolbar isKindOfClass:[UIToolbar class]]) {
            return;
        }
        [toolbar setBackgroundImage:groupBackgroundImage
                 forToolbarPosition:UIBarPositionAny
                         barMetrics:UIBarMetricsDefault];
        [toolbar setShadowImage:[UIImage new]
             forToolbarPosition:UIBarPositionAny];
    }];
}

- (void)keyboardWillShowWithNotification:(NSNotification *)note
{
    static NSString * const EditorBackgroundName = @"editorbg";
    static NSString * const GroupBackgroundName = @"groupbg";
    static NSInteger const ToolbarPadding6 = 12;
    static NSInteger const ToolbarPadding7 = 16;

    [Flurry logEvent:HPPadEditedEventKey];

    UIView *firstResponder = [self.padWebController.webView hp_firstResponderSubview];
    if (!firstResponder) {
        return;
    }
    if (self.creationDate) {
        TFLog(@"[%@] ^^^ Took %.3fs to create pad.\n\n", self.pad.space.URL.host,
              -self.creationDate.timeIntervalSinceNow);
        self.creationDate = nil;
    }

    // Swap in our toolbar.
    if (firstResponder.superview != self.padWebController.webView.scrollView) {
        return;
    }

    if (self.groupedToolbar) {
        [self.groupedToolbar showRootToolbarAnimated:NO];
        return;
    }

    // Clear padding
    self.leftPaddingItem.width = self.rightPaddingItem.width = -(HP_SYSTEM_MAJOR_VERSION() >= 7
                                                                 ? ToolbarPadding7
                                                                 : ToolbarPadding6);

    UIToolbar *toolbar = [self findToolbarInAccessoryView:firstResponder.inputAccessoryView];
    toolbar.items = nil;
    toolbar.opaque = YES;
    toolbar.translucent = NO;

    self.groupedToolbar = [[HPGroupedToolbar alloc] initWithFrame:toolbar.bounds];
    self.groupedToolbar.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.groupedToolbar.selectedGroupTintColor = [UIColor whiteColor];
    self.editorAccessoryToolbar.autoresizingMask = UIViewAutoresizingFlexibleHeight | UIViewAutoresizingFlexibleWidth;
    self.editorAccessoryToolbar.bounds = self.groupedToolbar.bounds;
    [self initializeGroupedToolbarWithBackgroundImage:[UIImage imageNamed:EditorBackgroundName]
                                 groupBackgroundImage:[UIImage imageNamed:GroupBackgroundName]];

    [toolbar addSubview:self.groupedToolbar];

    self.focusWorkaroundTextField.inputAccessoryView = firstResponder.inputAccessoryView;
}

- (void)keyboardDidShowWithNotification:(NSNotification *)note
{
    UIView *firstResponder = [self.padWebController.webView hp_firstResponderSubview];
    if (!firstResponder) {
        return;
    }
    [self.navigationController setNavigationBarHidden:YES
                                             animated:YES];
    CGRect frame = [note.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    frame = [self.navigationController.view convertRect:frame
                                               fromView:nil];
    self.keyboardOrigin = frame.origin.y - self.padWebController.webView.frame.origin.y;
    self.padWebController.visibleEditorHeight = self.keyboardOrigin;
}

- (void)keyboardWillChangeFrameWithNotification:(NSNotification *)note
{
    UIView *firstResponder = [self.padWebController.webView hp_firstResponderSubview];
    if (!firstResponder) {
        if (self.navigationItem.rightBarButtonItems.count == self.editorAccessoryToolbar.items.count) {
            [self showEditingToolbar:NO
                            animated:YES];
        }
        return;
    }

    CGRect kframe = [note.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    [self showEditingToolbar:CGRectIntersectsRect(kframe, self.view.frame)
                    animated:YES];
}

#pragma mark - Main Toolbar actions

- (void)showEditingToolbar:(BOOL)editing
                  animated:(BOOL)animated
{
    BOOL showBar = self.pad && editing;
    if (showBar && self.navigationItem.titleView.isHidden) {
        self.navigationItem.titleView.alpha = 0;
        self.navigationItem.titleView.hidden = NO;
    }
    [UIView animateWithDuration:animated ? 0.25 : 0
                     animations:^{
                         self.navigationItem.titleView.alpha = showBar;
                     } completion:^(BOOL finished) {
                         self.navigationItem.titleView.hidden = !showBar;
                     }];
}

- (IBAction)togglePadFollowed:(id)sender
{
    HPPadEditorViewController * __weak weakSelf = self;
    [UIApplication sharedApplication].networkActivityIndicatorVisible = YES;
    BOOL followed = !self.pad.followed;
    [self setFollowedButtonIsFollowed:followed
                             animated:YES];
    [self.pad setFollowed:followed
               completion:^(HPPad *pad, NSError *error)
     {
         [UIApplication sharedApplication].networkActivityIndicatorVisible = NO;
         if (error) {
             TFLog(@"[%@ %@] Error toggling pad: %@", pad.URL.host, pad.padID,
                   error);
         }
         [weakSelf setFollowedButtonIsFollowed:weakSelf.pad.followed
                                      animated:YES];
     }];
}

- (IBAction)signIn:(id)sender
{
    [self.pad.space.API signInEvenIfSignedIn:NO];
}

- (void)updatePeoplePhoto
{
    HPUserInfoCollection *userInfos = self.padWebController.userInfos;
    HPUserInfo *userInfo = userInfos.userInfos.firstObject;
    _userInfoImageView.stack = userInfos.userInfos.count > 1;
    if (userInfo) {
        [_userInfoImageView setURL:userInfo.userPicURL
                         connected:userInfo.status == HPConnectedUserInfoStatus
                          animated:YES];
    } else {
        [_userInfoImageView setURL:nil
                         connected:NO
                          animated:YES];
    }
}

- (void)searchPads:(id)sender
{
    self.searchDisplayController.searchBar.hidden = NO;
    [self.searchDisplayController.searchBar becomeFirstResponder];
}

#pragma mark - Keyboard toolbar actions

- (void)clickToolbarAction:(PadEditorAction)action
             barButtonItem:(UIBarButtonItem *)barButtonItem
{
    BOOL showRootToolbar = YES;
    [self hideDialogs];

    NSString *command;

    switch (action) {
    case BoldEditorAction:
        command = @"bold";
        break;
    case ItalicsEditorAction:
        command = @"italic";
        break;
    case UnderlineEditorAction:
        command = @"underline";
        break;
    case StrikethroughEditorAction:
        command = @"strikethrough";
        break;

    case Heading1EditorAction:
        command = @"heading1";
        break;
    case Heading2EditorAction:
        command = @"heading2";
        break;
    case Heading3EditorAction:
        command = @"heading3";
        break;

    case BulletedListEditorAction:
        command = @"insertunorderedlist";
        showRootToolbar = NO;
        break;
    case NumberedListEditorAction:
        command = @"insertorderedlist";
        showRootToolbar = NO;
        break;
    case TaskListEditorAction:
        command = @"inserttasklist";
        showRootToolbar = NO;
        break;
    case CommentEditorAction:
        command = @"insertcomment";
        break;

    case IndentEditorAction:
        command = @"indent";
        showRootToolbar = NO;
        break;
    case OutdentEditorAction:
        command = @"outdent";
        showRootToolbar = NO;
        break;

    case LinkEditorAction:
        command = @"linkinsert";
        break;
    case InsertTableAction:
        command = @"tableinsert";
        break;
    case TagEditorAction:
        [self.padWebController insertString:@"#"];
        [self.groupedToolbar showRootToolbarAnimated:YES];
        return;
    case InsertPhotoAction:
        [[self.padWebController.webView hp_firstResponderSubview] resignFirstResponder];
        if ([UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypeCamera]) {
            _imageSheet = [[UIActionSheet alloc] initWithTitle:@"Insert Image"
                                                      delegate:self
                                             cancelButtonTitle:@"Cancel"
                                        destructiveButtonTitle:nil
                                             otherButtonTitles:@"Take Photo", @"Choose Existing", nil];
            if ([UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPhone) {
                [_imageSheet showInView:self.view];
            } else {
                [_imageSheet showFromBarButtonItem:barButtonItem
                                          animated:YES];
            }
        } else {
            [self showImagePickerForSourceType:UIImagePickerControllerSourceTypePhotoLibrary];
        }
        [self.groupedToolbar showRootToolbarAnimated:YES];
        return;

    default:
        TFLog(@"[%@ %@] Unhandled toolbar action: %lu", self.pad.space.URL.host,
              self.pad.padID, (unsigned long)action);
        return;
    }

    [self.padWebController clickToolbarWithCommand:command];
    if (showRootToolbar) {
        [self.groupedToolbar showRootToolbarAnimated:YES];
    }
}

- (IBAction)toolbarEditorAction:(id)sender
{
    [self clickToolbarAction:[sender tag]
               barButtonItem:sender];
}

- (IBAction)keyboardDone:(id)sender
{
    [self.focusWorkaroundTextField resignFirstResponder];
    [[self.padWebController.webView hp_firstResponderSubview] resignFirstResponder];
}

#pragma mark - Action Sheet delegate

- (void)imageSheetDidDismissWithButtonIndex:(NSInteger)buttonIndex
{
    UIActionSheet *actionSheet = _imageSheet;
    _imageSheet.delegate = nil;
    _imageSheet = nil;

    if (buttonIndex == actionSheet.cancelButtonIndex) {
        return;
    }

    UIImagePickerControllerSourceType sourceType;
    sourceType = buttonIndex == actionSheet.firstOtherButtonIndex
        ? UIImagePickerControllerSourceTypeCamera
        : UIImagePickerControllerSourceTypePhotoLibrary;

    [self showImagePickerForSourceType:sourceType];
}

- (void)actionSheet:(UIActionSheet *)actionSheet
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
    if (actionSheet == _imageSheet) {
        [self imageSheetDidDismissWithButtonIndex:buttonIndex];
    }
}

#pragma mark - Popover controller delegate

- (void)popoverControllerDidDismissPopover:(UIPopoverController *)popoverController
{
    if (popoverController == _popoverSegue.popoverController) {
        _popoverSegue.popoverController.delegate = nil;
        _popoverSegue = nil;
#if 0
    }
    if (popoverController == _searchPopover) {
        _searchPopover.delegate = nil;
        _searchPopover = nil;
#endif
    } else if(popoverController == self.autocompleteDataPopover) {
        self.autocompleteDataPopover.delegate = nil;
        self.autocompleteDataPopover = nil;
    }
}

#pragma Segues

- (BOOL)shouldPerformSegueWithIdentifier:(NSString *)identifier
                                  sender:(id)sender
{
    if ([identifier isEqualToString:_popoverSegue.identifier] &&
        _popoverSegue.popoverController.isPopoverVisible) {
        [self hideDialogs];
        return NO;
    }
    if ([identifier isEqualToString:OpenPadSegue]) {
        [self hideDialogs];
        return sender != self.pad;
    }
    return YES;
}

- (void)openPadWithURL:(NSURL *)URL
{
    HPPadEditorViewController * __weak weakSelf = self;
    NSManagedObjectID * __block objectID;
    [self.pad.managedObjectContext.hp_stack saveWithBlock:^(NSManagedObjectContext *localContext) {
        NSError * __autoreleasing error;
        HPPad *pad = [HPPad padWithURL:URL
                  managedObjectContext:localContext
                                 error:&error];
        if (!pad) {
            TFLog(@"[%@] Could not create pad object for URL: %@", URL.host,
                  URL.hp_fullPath);
            return;
        }
        if (![pad.managedObjectContext obtainPermanentIDsForObjects:@[pad]
                                                              error:&error]) {
            TFLog(@"[%@] Could not obtain permanent object ID for URL: %@",
                  URL.host, URL.hp_fullPath);
            return;
        }
        objectID = pad.objectID;
    } completion:^(NSError *error) {
        // avoid double-tap, see -padWebController:didOpenURL:
        weakSelf.view.userInteractionEnabled = YES;
        if (!objectID) {
            return;
        }
        HPPad *pad = (HPPad *)[weakSelf.pad.managedObjectContext existingObjectWithID:objectID
                                                                                error:&error];
        if (!pad) {
            TFLog(@"[%@] Could not find pad with ID %@: %@", URL.host, objectID, error);
            return;
        }
        [weakSelf performSegueWithIdentifier:OpenPadSegue
                                      sender:pad];
    }];
}

// iPhone -> show detail
- (void)prepareForSegue:(UIStoryboardSegue *)segue
                 sender:(id)sender
{
    HPLog(@"[%@] Make way for segue: %@ -> %@", self.pad.space.URL.host,
          segue.identifier, segue.destinationViewController);
    if ([segue isKindOfClass:[UIStoryboardPopoverSegue class]]) {
        [self hideDialogs];
        _popoverSegue = (UIStoryboardPopoverSegue *)segue;
        _popoverSegue.popoverController.delegate = self;
    }
    if ([segue.identifier isEqualToString:@"EditCollections"]) {
        UIViewController *vc = [segue.destinationViewController topViewController];
        HPPadCollectionViewController *collections = (HPPadCollectionViewController *)vc;
        collections.pad = self.pad;
    } else if ([segue.identifier isEqualToString:@"EditSharing"]) {
        HPPadSharingViewController *sharing;
        sharing = (HPPadSharingViewController *)[segue.destinationViewController topViewController];
        sharing.delegate = self;
        sharing.userInfos = self.padWebController.userInfos;
        if (self.pad.sharingOptions) {
            sharing.sharingOptions = self.pad.sharingOptions;
            return;
        }
        [self.pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
            if (pad.sharingOptions) {
                return;
            }
            pad.sharingOptions = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass([HPSharingOptions class])
                                                               inManagedObjectContext:pad.managedObjectContext];
        } completion:^(HPPad *pad, NSError *error) {
            if (!pad.sharingOptions) {
                TFLog(@"[%@ %@] Could not create sharing options: %@",
                      pad.space.URL.host, pad.padID, error);
                return;
            }
            sharing.sharingOptions = pad.sharingOptions;
        }];
    } else if ([segue.identifier isEqualToString:BrowserSegue]) {
        UIViewController *vc = [segue.destinationViewController topViewController];
        HPBrowserViewController *browser = (HPBrowserViewController *)vc;
        browser.delegate = self;
        browser.initialRequest = sender;
        // avoid double-tap, see -padWebController:didOpenURL:
        self.view.userInteractionEnabled = YES;
    } else if ([segue.identifier isEqualToString:@"UserInfosList"]) {
        HPUserInfosViewController *userInfos = (HPUserInfosViewController *)[segue.destinationViewController topViewController];
        userInfos.pad = self.pad;
        userInfos.userInfos = self.padWebController.userInfos;
    } else if ([segue.identifier isEqualToString:OpenPadSegue]) {
        HPPadEditorViewController *editor = segue.destinationViewController;
        editor.pad = sender;
    } else if ([segue.identifier isEqualToString:@"Search"]) {
        UIViewController *vc = segue.destinationViewController;
        vc.searchDisplayController.delegate = self;
        vc.searchDisplayController.searchResultsDelegate = self;
        vc.searchDisplayController.searchBar.placeholder = [NSString stringWithFormat:@"Search %@", [(self.pad.space ?: self.defaultSpace) name]];
        if ([sender isKindOfClass:[NSString class]]) {
            vc.searchDisplayController.searchBar.text = sender;
        }
    }
}

#pragma mark - Pad web controller delegate

- (void)updateScrollViewContentInsetForAutocomplete
{
    CGFloat webHeight = CGRectGetHeight(self.padWebController.webView.bounds);
    UIEdgeInsets insets = self.padWebController.webView.scrollView.contentInset;
    insets.bottom = webHeight - self.padWebController.visibleEditorHeight;
    self.padWebController.webView.scrollView.contentInset = insets;
    self.padWebController.webView.scrollView.scrollIndicatorInsets = insets;
}

- (void)positionAutocompleteTableView
{
    NSUInteger rows = UIInterfaceOrientationIsLandscape(self.interfaceOrientation) ? 2 : 4;
    CGFloat tableHeight = self.autocompleteTableView.rowHeight * rows;
    self.padWebController.visibleEditorHeight = self.keyboardOrigin - tableHeight;
    self.autocompleteTableHeightConstraint.constant = tableHeight;
    self.autocompleteTableTopConstraint.constant = self.keyboardOrigin - tableHeight;
    [self updateScrollViewContentInsetForAutocomplete];
}

- (void)padWebControllerDidBeginAutocomplete:(HPPadWebController *)padWebController
{
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [self positionAutocompleteTableView];
        self.autocompleteTableView.dataSource = padWebController.autocompleteDataSource;
        [self.autocompleteTableView reloadData];
        [self.autocompleteTableView hp_setHidden:NO
                                        animated:YES];
        [self updateScrollViewContentInsetForAutocomplete];
        return;
    }

    UITableViewController *controller = [[UITableViewController alloc] initWithStyle:UITableViewStylePlain];
    self.autocompleteTableView = controller.tableView;
    self.autocompleteTableView.delegate = self;
    self.autocompleteTableView.dataSource = padWebController.autocompleteDataSource;
    self.autocompleteDataPopover = [[UIPopoverController alloc] initWithContentViewController:controller];
    self.autocompleteDataPopover.delegate = self;
    CGRect popRect = self.padWebController.webView.frame;
    popRect.size.height /= 3;
    [self.autocompleteDataPopover presentPopoverFromRect:popRect
                                                  inView:self.padWebController.webView
                                permittedArrowDirections:UIPopoverArrowDirectionAny
                                                animated:YES];
}

- (void)padWebControllerDidUpdateAutocomplete:(HPPadWebController *)padWebController
{
    [self.autocompleteTableView hp_setHidden:NO
                                    animated:YES];
    [self.autocompleteTableView reloadData];
}

- (void)padWebControllerDidFinishAutocomplete:(HPPadWebController *)padWebController
{
    self.autocompleteTableView.dataSource = nil;
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [self.autocompleteTableView hp_setHidden:YES
                                        animated:YES];
        [self.autocompleteTableView reloadData];
        self.padWebController.visibleEditorHeight = self.keyboardOrigin;
        [self updateScrollViewContentInsetForAutocomplete];
        return;
    }

    self.autocompleteTableView.delegate = nil;
    self.autocompleteTableView = nil;
    [self.autocompleteDataPopover dismissPopoverAnimated:NO];
}

- (void)padWebController:(HPPadWebController *)padWebController
              didOpenURL:(NSURL *)URL
{
    if (self.navigationController.topViewController != self) {
        return;
    }
    // Prevent accidental double-tap
    if (!self.view.userInteractionEnabled) {
        return;
    }
    self.view.userInteractionEnabled = NO;
    switch ([HPAPI URLTypeWithURL:URL]) {
        case HPUserProfileURLType:
            // FIXME: Fetch profile, search on username
        case HPExternalURLType:
            HPLog(@"[%@ %@] Opening browser segue for %@",
                  self.pad.space.URL.host, self.pad.padID, URL);
            [self performSegueWithIdentifier:BrowserSegue
                                      sender:[NSURLRequest requestWithURL:URL]];
            break;
        case HPPadURLType:
            [self openPadWithURL:URL];
            break;
        case HPSearchURLType: {
            [self.padWebController.webView.hp_firstResponderSubview resignFirstResponder];
            NSString *searchText = URL.query.hp_dictionaryByParsingURLParameters[HPQueryParam];
            if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
                [self performSegueWithIdentifier:@"Search"
                                          sender:searchText];
            } else {
                [self.searchDisplayController setActive:YES
                                               animated:YES];
                self.searchDisplayController.searchBar.text = searchText;
            }
            self.view.userInteractionEnabled = YES;
            break;
        }
        default:
            TFLog(@"[%@ %@] Unhandled URL: %@",
                  self.padWebController.webView.request.URL.host,
                  self.pad.padID, URL);
            self.view.userInteractionEnabled = YES;
#if 0
            [[[UIAlertView alloc] initWithTitle:@"Sorry"
                                        message:@"Unfortunately, that URL cannot be opened."
                                       delegate:nil
                              cancelButtonTitle:nil
                              otherButtonTitles:@"OK", nil] show];
#endif
            break;
    }
}

- (void)padWebControllerDidUpdateUserInfo:(HPPadWebController *)padWebController
{
    [self updatePeoplePhoto];
}

- (void)setReloadToolbarHidden:(BOOL)hidden
{
    if (hidden) {
        [self.navigationController setToolbarHidden:YES
                                           animated:YES];
        self.toolbarItems = nil;
        return;
    }
    UIBarButtonItem *spacer = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace
                                                                            target:nil
                                                                            action:nil];
    UIBarButtonItem *item = [[UIBarButtonItem alloc] initWithTitle:@"Reload"
                                                             style:UIBarButtonItemStylePlain
                                                            target:self
                                                            action:@selector(reloadClientVars:)];
    self.toolbarItems = @[spacer, item, spacer];
    [self.navigationController setToolbarHidden:NO
                                       animated:YES];
}

- (void)padWebControllerDidDeletePad:(HPPadWebController *)padWebController
{
    if (self.navigationController.topViewController != self ||
        self.navigationController.viewControllers.firstObject == self) {
        [self configureView];
        self.pad = nil;
        return;
    }
    [self.navigationController popViewControllerAnimated:YES];
}

- (void)reloadClientVars:(id)sender
{
    HPPadEditorViewController * __weak weakSelf = self;
    HPActionSheetBlockDelegate *delegate = [[HPActionSheetBlockDelegate alloc] initWithBlock:^(UIActionSheet *actionSheet, NSInteger button) {
        if (button == actionSheet.cancelButtonIndex) {
            [weakSelf setReloadToolbarHidden:NO];
            return;
        }
        [weakSelf setReloadToolbarHidden:YES];
        [weakSelf.pad hp_performBlock:^(HPPad *pad, NSError *__autoreleasing *error) {
            pad.hasMissedChanges = NO;
        } completion:^(HPPad *pad, NSError *error) {
            [pad requestClientVarsWithRefresh:YES
                                   completion:^(HPPad *pad, NSError *error) {
                                       weakSelf.freakingOut = NO;
                                       [weakSelf.padWebController reloadDiscardingChanges:YES
                                                                              cachePolicy:NSURLRequestReturnCacheDataElseLoad
                                                                               completion:NULL];
                                   }];
        }];
    }];
    [[[UIActionSheet alloc] initWithTitle:@"Your unsaved changes will be lost. This cannot be undone."
                                 delegate:delegate
                        cancelButtonTitle:@"Cancel"
                   destructiveButtonTitle:@"Discard Changes"
                        otherButtonTitles:nil] showInView:self.view];
}

- (void)padWebControllerDidFreakOut:(HPPadWebController *)padWebController
{
    if (self.isFreakingOut) {
        return;
    }
    self.freakingOut = YES;
    NSString *message = @"An error is preventing the pad from synchronizing. "
        "If you'd like to copy your changes before reloading, tap Reload Later.";
    UIAlertView *alertView = [[UIAlertView alloc] initWithTitle:@"How embarrassing..."
                                                        message:message
                                                       delegate:nil
                                              cancelButtonTitle:@"Reload Later"
                                              otherButtonTitles:@"Reload Now", nil];
    NSInteger mailButton = -1;
    if ([MFMailComposeViewController canSendMail]) {
        mailButton = [alertView addButtonWithTitle:@"Contact Support"];
    }

    HPPadEditorViewController * __weak weakSelf = self;
    HPAlertViewBlockDelegate *delegate = [[HPAlertViewBlockDelegate alloc] initWithBlock:^(UIAlertView *alertView, NSInteger button) {
        if (button == alertView.firstOtherButtonIndex) {
            [weakSelf reloadClientVars:weakSelf];
            return;
        } else if (button == mailButton) {
            [weakSelf openSupportMail];
        }
        [weakSelf setReloadToolbarHidden:NO];
    }];
    alertView.delegate = delegate;
    [alertView show];
}

#pragma mark - Web view delegate

- (BOOL)webView:(UIWebView *)webView
shouldStartLoadWithRequest:(NSURLRequest *)request
 navigationType:(UIWebViewNavigationType)navigationType
{
    NSParameterAssert(request);
    HPLog(@"[%@] %s %@", self.pad.space.URL.host, __PRETTY_FUNCTION__, request.URL);
    /*
     * Unlike Safari, UIWebView blurs when loading a new iframe, causing the
     * keyboard to hide. This often happens for the comet iframe, for example.
     * Work around that by capturing the currently focused element, and restoring
     * it in -webViewDidStartLoad:.
     */
    if ([webView hp_firstResponderSubview].isFirstResponder) {
        [self saveFocus];
    }
    return YES;
}

- (void)webViewDidFinishLoad:(UIWebView *)webView
{
    // Sometimes -webViewDidStartLoad: doesn't get called, so check this here, too.
    [self restoreFocus];
}

- (void)saveFocus
{
    // Call directly as it needs to be synchronous so keyboard doesn't go away.
    if ([self.padWebController saveFocus]) {
        HPLog(@"[%@] Enabling focus workaround.", self.pad.space.URL.host);
        // Make non-empty so that backspace works.
        self.focusWorkaroundTextField.text = @"A";
        [self.focusWorkaroundTextField becomeFirstResponder];
    }
}

- (void)restoreFocus
{
    if (self.focusWorkaroundTextField.isFirstResponder) {
        HPLog(@"[%@] Restoring focus.", self.pad.space.URL.host);
        self.restoringFocus = YES;
        [self.padWebController saveFocus];
    }
}

- (void)webViewDidStartLoad:(UIWebView *)webView
{
    // iframe is loading now, so restore focus if we saved it.
    [self restoreFocus];
}

#pragma mark - Browser view delegate

- (BOOL)browserViewController:(HPBrowserViewController *)browserViewController
shouldStartLoadWithHackpadRequest:(NSURLRequest *)request
{
    // FIXME: Sanitize this to prevent redirections?
    NSString *padID = [HPPad padIDWithURL:request.URL];
    if (!padID) {
        TFLog(@"[%@ %@] Browser wanted to open internal link that was not a pad: %@",
              self.pad.space.URL.host, self.pad.padID, request.URL);
        return YES;
    }
    [browserViewController close:self];
    [self openPadWithURL:request.URL];
    return NO;
}

#pragma mark - State preservation
// UIWebView restoration doesn't work with HTML as a string, only requests.
static NSString * const PadKey = @"padKey";

- (void)encodeRestorableStateWithCoder:(NSCoder *)coder
{
    [super encodeRestorableStateWithCoder:coder];

    if (self.pad) {
        [coder encodeObject:self.pad.objectID.URIRepresentation
                     forKey:PadKey];
    }
}

- (void)decodeRestorableStateWithCoder:(NSCoder *)coder
{
    [super decodeRestorableStateWithCoder:coder];

    NSURL *URL = [coder decodeObjectOfClass:NSURL.class
                                     forKey:PadKey];
    if (!URL) {
        return;
    }

    HPCoreDataStack *coreDataStack = [HPCoreDataStack sharedStateRestorationCoreDataStack];
    NSManagedObjectID *objectID = [coreDataStack.persistentStoreCoordinator managedObjectIDForURIRepresentation:URL];
    NSError * __autoreleasing error;
    self.pad = (HPPad *)[coreDataStack.mainContext existingObjectWithID:objectID
                                                                  error:&error];
    if (error) {
        TFLog(@"Could not load pad %@: %@", objectID, error);
    }
}

#pragma mark - Image picker delegate

- (void)showImagePickerForSourceType:(UIImagePickerControllerSourceType)sourceType
{
    UIImagePickerController *picker = [[UIImagePickerController alloc] init];
    picker.delegate = self;
    picker.sourceType = sourceType;
    if (sourceType == UIImagePickerControllerSourceTypePhotoLibrary) {
        picker.modalPresentationStyle = UIModalPresentationFormSheet;
    }
    [self presentViewController:picker
                       animated:YES
                     completion:NULL];
}

- (void)imagePickerController:(UIImagePickerController *)picker
didFinishPickingMediaWithInfo:(NSDictionary *)info
{
    [self.padWebController insertImage:info[UIImagePickerControllerOriginalImage]];
    [self dismissViewControllerAnimated:YES
                             completion:NULL];
}

- (void)imagePickerControllerDidCancel:(UIImagePickerController *)picker
{
    [self dismissViewControllerAnimated:YES
                             completion:NULL];
}

#pragma mark - Undo / Redo

- (void)motionEnded:(UIEventSubtype)motion
          withEvent:(UIEvent *)event
{
    if (!motion != UIEventSubtypeMotionShake) {
        [super motionEnded:motion
                 withEvent:event];
        return;
    }
    HPPadEditorViewController * __weak weakSelf = self;
    [self.padWebController canUndoOrRedoWithCompletion:^(BOOL canUndo, BOOL canRedo) {
        if (!canUndo && !canRedo) {
            return;
        }
        UIAlertView *alert = [[UIAlertView alloc] initWithTitle:nil
                                                        message:nil
                                                       delegate:nil
                                              cancelButtonTitle:@"Cancel"
                                              otherButtonTitles:nil];
        NSInteger undoButtonIndex = -1;
        if (canUndo) {
            undoButtonIndex = [alert addButtonWithTitle:@"Undo"];
        }
        NSInteger redoButtonIndex = -1;
        if (canRedo) {
            redoButtonIndex = [alert addButtonWithTitle:@"Redo"];
        }
        HPAlertViewBlockDelegate *delegate = [[HPAlertViewBlockDelegate alloc] initWithBlock:^(UIAlertView *alertView,
                                                                                               NSInteger buttonIndex)
                                              {
                                                  if (buttonIndex == undoButtonIndex) {
                                                      [weakSelf.padWebController undo];
                                                  } else if (buttonIndex == redoButtonIndex) {
                                                      [weakSelf.padWebController redo];
                                                  }
                                              }];
        alert.delegate = delegate;
        [alert show];
    }];
}

#pragma mark - Pad sharing view controller delegate

- (void)padSharingViewControllerDidFinish:(HPPadSharingViewController *)padSharingViewController
{
    padSharingViewController.delegate = nil;
    if ([_popoverSegue.identifier isEqualToString:@"EditSharing"]) {
        [self hideDialogs];
    } else if ([UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPhone) {
        [self dismissViewControllerAnimated:YES
                                 completion:NULL];
    }
}

#pragma mark - Text field delegate

- (BOOL)textField:(UITextField *)textField
shouldChangeCharactersInRange:(NSRange)range
replacementString:(NSString *)string
{
    [self restoreFocus];
    if (string.length) {
        [self.padWebController insertString:string];
    } else {
        [self.padWebController deleteText];
    }
    return NO;
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField
{
    [self.padWebController insertNewLine];
    return NO;
}

#pragma mark - TableView delegate methods

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (tableView == self.autocompleteTableView) {
        [self.padWebController selectAutocompleteData:self.padWebController.autocompleteDataSource.autocompleteData[indexPath.row][DataKey]
                                              atIndex:indexPath.row];
    } else if (tableView.dataSource == self.searchDataSource) {
        HPPad *pad = [self.searchDataSource padAtIndexPath:indexPath];
        [self.currentSearchDisplayController setActive:NO
                                              animated:YES];
        [self performSegueWithIdentifier:OpenPadSegue
                                  sender:pad];
    }
}

#pragma mark - UISearchDisplay delegate

- (UISearchDisplayController *)currentSearchDisplayController
{
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        return self.searchDisplayController;
    }
    return self.popoverSegue.popoverController.contentViewController.searchDisplayController;
}

- (void)searchDisplayControllerWillBeginSearch:(UISearchDisplayController *)controller
{
    HPSpace *searchSpace = self.pad.space ?: self.defaultSpace;
    self.searchDataSource = [[HPPadSearchTableViewDataSource alloc] init];
    self.searchDataSource.managedObjectContext = searchSpace.managedObjectContext;
    self.searchDataSource.padScope = [[HPPadScope alloc] initWithCoreDataStack:searchSpace.managedObjectContext.hp_stack];
    self.searchDataSource.padScope.space = searchSpace;
    controller.searchResultsDataSource = self.searchDataSource;
    controller.searchResultsDelegate = self;
    self.searchDataSource.tableView = controller.searchResultsTableView;
    controller.searchResultsTableView.rowHeight = 60;
    self.searchDataSource.searchText = controller.searchBar.text;
    [controller.searchBar.superview bringSubviewToFront:controller.searchBar];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        return;
    }
    // FIXME: figure out how to slide webview down on iOS 7 instead
    controller.searchBar.alpha = 0;
    [UIView animateWithDuration:0.25
                     animations:^{
                         controller.searchBar.alpha = 1;
                         if (HP_SYSTEM_MAJOR_VERSION() < 7) {
                             return;
                         }
                         self.padWebController.webView.alpha = 0;
                     }];
}

- (void)searchDisplayControllerWillEndSearch:(UISearchDisplayController *)controller
{
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        [self hideDialogs];
        return;
    }
    [UIView animateWithDuration:0.25
                     animations:^{
                         self.searchDisplayController.searchBar.alpha = 0;
                         if (HP_SYSTEM_MAJOR_VERSION() < 7) {
                             return;
                         }
                         self.padWebController.webView.alpha = 1;
                     }];
}

- (void)searchDisplayControllerDidEndSearch:(UISearchDisplayController *)controller
{
    controller.searchResultsTableView.dataSource = nil;
    self.searchDataSource.tableView = nil;
    self.searchDataSource = nil;
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [controller.searchBar.superview sendSubviewToBack:controller.searchBar];
    }
}

- (BOOL)searchDisplayController:(UISearchDisplayController *)controller
shouldReloadTableForSearchString:(NSString *)searchString
{
    self.searchDataSource.searchText = (searchString.length > 2) ? searchString : nil;
    return NO;
}

#pragma mark - MFMailComposeViewControllerDelegate

- (void)mailComposeController:(MFMailComposeViewController *)controller
          didFinishWithResult:(MFMailComposeResult)result
                        error:(NSError *)error
{
    controller.mailComposeDelegate = nil;
    [self dismissViewControllerAnimated:YES
                             completion:nil];
}

@end
