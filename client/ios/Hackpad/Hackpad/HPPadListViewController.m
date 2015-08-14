//
//  HPPadListViewController.m
//  Hackpad
//
//
//  Copyright (c) 2012 Hackpad. All rights reserved.
//

#import "HPPadListViewController.h"

#import "HPDrawerController.h"
#import "HPPadEditorViewController.h"
#import "HPPadCacheController.h"
#import "HPPadTableViewDataSource.h"
#import "HPPadSearchTableViewDataSource.h"
#import "HPSignInController.h"

#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>

#import <AppleSampleCode/Reachability.h>
#import <MBProgressHUD/MBProgressHUD.h>
#import <TestFlight/TestFlight.h>

static NSString * const OfflineTitle = @"Offline";
static NSString * const SignInTitle = @"Sign In";
static NSString * const SignOutTitle = @"Sign Out";

static NSString * const ShowDetailSegue = @"showDetail";
static NSString * const SelectSourceSegue = @"selectSource";
static NSString * const CreatePadSegue = @"createPad";

static BOOL AuthenticationStateContext;

@interface HPPadListViewController () <UIDataSourceModelAssociation> {
    id scopeObserver;
    id signInObserver;
    HPPadSearchTableViewDataSource *searchDataSource;
    NSMutableSet *expandedIndexPaths;
}
@property (nonatomic, strong) HPPadWebController *padWebController;
@property (nonatomic, strong) HPSpace *observingSpace;
@property (nonatomic, strong) MBProgressHUD *signInHUD;
@property (nonatomic, assign, getter = isSigningIn) BOOL signingIn;
@property (nonatomic, assign, getter = isRequestingPads) BOOL requestingPads;
- (void)configureView;
- (void)scopeDidChange;
@end

@implementation HPPadListViewController

- (void)dealloc
{
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    if (scopeObserver) {
        [center removeObserver:scopeObserver];
        scopeObserver = nil;
    }
    if (signInObserver) {
        [center removeObserver:signInObserver];
        signInObserver = nil;
    }
    [center removeObserver:self];
    [self.observingSpace removeObserver:self
                             forKeyPath:@"authenticationState"];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context
{
    if (context != &AuthenticationStateContext) {
        [super observeValueForKeyPath:keyPath
                             ofObject:object
                               change:change
                              context:context];
        return;
    }
    [[NSOperationQueue mainQueue] addOperationWithBlock:^{
        [self updateSigningIn];
    }];
}

- (void)configureProgressHUD
{
    if (self.isRequestingPads || self.isSigningIn) {
        if (self.signInHUD) {
            return;
        }
        self.signInHUD = [MBProgressHUD showHUDAddedTo:self.view
                                              animated:YES];
    } else if (self.signInHUD) {
        [self.signInHUD hide:YES];
        self.signInHUD = nil;
    }
}

- (void)setSigningIn:(BOOL)signingIn
{
    _signingIn = signingIn;
    [self configureProgressHUD];
}

- (void)setRequestingPads:(BOOL)requestingPads
{
    _requestingPads = requestingPads;
    [self configureProgressHUD];
}

- (void)updateSigningIn
{
    UIBarButtonItem *item;
    switch (self.padScope.space.API.authenticationState) {
        case HPRequiresSignInAuthenticationState:
            item = self.signInButtonItem;
            break;
        case HPReconnectAuthenticationState:
        case HPSignedInAuthenticationState:
            item = self.composeButtonItem;
            break;
        default:
            break;
    }
    [self.navigationItem setRightBarButtonItem:item
                                      animated:YES];
    self.signingIn = !item;
}

- (void)signInControllerWillRequestPadsWithNotification:(NSNotification *)note
{
    if (note.userInfo[HPSignInControllerSpaceKey] != self.padScope.space) {
        return;
    }
    if ([self.dataSource tableView:self.tableView
             numberOfRowsInSection:0]) {
        return;
    }
    self.requestingPads = YES;
}

- (void)signInControllerDidRequestPadsWithNotification:(NSNotification *)note
{
    if (note.userInfo[HPSignInControllerSpaceKey] != self.padScope.space) {
        return;
    }
    self.requestingPads = NO;
}

- (void)configureView
{
    HPLog(@"[%@] %s", self.padScope.space.URL.host, __PRETTY_FUNCTION__);
    if (!self.padScope.space) {
        return;
    }
    self.title = self.padScope.collection
        ? self.padScope.collection.title
        : self.padScope.space.name;
    // Avoid animating the title change along with the buttons below.
    [self.navigationController.navigationBar layoutIfNeeded];
    [self updateSigningIn];
}

- (void)viewDidLoad
{
    HPLog(@"[%@] %s", self.padScope.space.URL.host, __PRETTY_FUNCTION__);
    [super viewDidLoad];

    // XXX: The color being saved in the storyboard isn't quite right?
    self.tableView.backgroundColor = [UIColor hp_lightGreenGrayColor];
    self.refreshControl.backgroundColor = [UIColor hp_lightGreenGrayColor];

    [self.refreshControl addTarget:self
                            action:@selector(refresh:)
                  forControlEvents:UIControlEventValueChanged];

    self.signInButtonItem.possibleTitles = [NSSet setWithObjects:SignInTitle,
                                               SignOutTitle, OfflineTitle, nil];

    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    HPPadListViewController * __weak weakSelf = self;
    scopeObserver = [center addObserverForName:HPPadScopeDidChangeNotification
                                         object:nil
                                          queue:[NSOperationQueue mainQueue]
                                     usingBlock:^(NSNotification *note)
                      {
                          if (note.object == weakSelf.padScope) {
                              [weakSelf configureView];
                              [weakSelf scopeDidChange];
                          }
                      }];
    signInObserver = [center addObserverForName:HPAPIDidSignInNotification
                                         object:nil
                                          queue:[NSOperationQueue mainQueue]
                                     usingBlock:^(NSNotification *note)
                      {
                          if (note.object == weakSelf.padScope.space.API) {
                              [weakSelf configureView];
                              [weakSelf reloadPadWebControllerForSignIn];
                          }
                      }];
    [center addObserver:self
               selector:@selector(signInControllerWillRequestPadsWithNotification:)
                   name:HPSignInControllerWillRequestPadsNotification
                 object:nil];
    [center addObserver:self
               selector:@selector(signInControllerDidRequestPadsWithNotification:)
                   name:HPSignInControllerWillRequestPadsNotification
                 object:nil];
    [self configureView];
}

- (void)viewWillAppear:(BOOL)animated
{
    [super viewWillAppear:animated];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [self.navigationController setToolbarHidden:YES
                                           animated:animated];
        if (!self.padWebController && self.observingSpace) {
            [self loadPadWebController];
        }
    }
}

- (void)viewDidDisappear:(BOOL)animated
{
    [super viewDidDisappear:animated];
    self.padWebController = nil;
}

- (void)didReceiveMemoryWarning
{
    [super didReceiveMemoryWarning];
    self.padWebController = nil;
}

- (void)loadEditorWithPad:(HPPad *)pad
{
    self.padWebController = [HPPadWebController sharedPadWebControllerWithPad:pad
                                                             padWebController:self.padWebController];
    self.editorViewController.pad = pad;
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        [self loadPadWebController];
    } else {
        self.padWebController = nil;
        self.editorViewController = nil;
    }
}

// iPhone -> show detail
- (void)prepareForSegue:(UIStoryboardSegue *)segue
                 sender:(id)sender
{
    if ([segue.identifier isEqualToString:ShowDetailSegue]) {
        self.editorViewController = segue.destinationViewController;
        if ([sender isKindOfClass:[HPPad class]]) {
            [self loadEditorWithPad:sender];
        }
        // otherwise pad is set above in didSelectRowAtIndexPath:
    } else if ([segue.identifier isEqualToString:CreatePadSegue]) {
        NSParameterAssert([sender isKindOfClass:[HPPad class]]);
        self.editorViewController = segue.destinationViewController;
        [self loadEditorWithPad:sender];
    }
}

- (NSUInteger)supportedInterfaceOrientations
{
    return [UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPad
        ? UIInterfaceOrientationMaskAll
        : UIInterfaceOrientationMaskPortrait;
}

#pragma mark - PadListViewController implementation

- (void)loadPadWebController
{
    [self loadPadWebControllerWithCachePolicy:NSURLRequestReturnCacheDataElseLoad];
}

- (void)loadPadWebControllerWithCachePolicy:(NSURLRequestCachePolicy)cachePolicy
{
    /*
     * If we don't stop loading first, we'll get an "operation cancelled" error
     * from the *new* WebView - even though we only killed the old one?
     */
    [self.padWebController.webView stopLoading];
    self.padWebController = [[HPPadWebController alloc] initWithSpace:self.observingSpace
                                                                frame:CGRectMake(0, 0, 320, 480)];
    HPPadListViewController * __weak weakSelf = self;
    HPPadWebController * __weak padWebController = self.padWebController;
    [self.padWebController loadWithCachePolicy:cachePolicy
                                    completion:^(NSError *error)
     {
         if (!error) {
             return;
         }
         TFLog(@"[%@] Could not preload web controller: %@",
               weakSelf.observingSpace.URL.host, error);
         if (padWebController && weakSelf.padWebController != padWebController) {
             return;
         }
         weakSelf.padWebController = nil;
     }];
}

- (void)reloadPadWebControllerForSignIn
{
    if (!self.padWebController) {
        return;
    }
    [self loadPadWebControllerWithCachePolicy:NSURLRequestReloadRevalidatingCacheData];
}

- (void)scopeDidChange
{
    [self.observingSpace removeObserver:self
                             forKeyPath:@"authenticationState"];
    self.observingSpace = self.padScope.space;
    [self.observingSpace addObserver:self
                          forKeyPath:@"authenticationState"
                             options:0
                             context:&AuthenticationStateContext];
    if (self.observingSpace != self.padWebController.space &&
        self.navigationController.topViewController == self) {
        [self loadPadWebController];
    }
    self.editorViewController.defaultSpace = self.padScope.space;
}

- (void)setPadScope:(HPPadScope *)padScope
{
    HPLog(@"[%@] %s", padScope.space.URL.host, __PRETTY_FUNCTION__);

    self.managedObjectContext = padScope.coreDataStack.mainContext;
    _padScope = padScope;

    self.dataSource.managedObjectContext = self.managedObjectContext;
    self.dataSource.padScope = padScope;

    searchDataSource.managedObjectContext = self.managedObjectContext;
    searchDataSource.padScope = padScope;

    if (!self.isViewLoaded) {
        return;
    }

    [self configureView];
    [self scopeDidChange];
    [self.tableView reloadData];
}

- (IBAction)signIn:(id)sender
{
    [self.padScope.space.API signInEvenIfSignedIn:NO];
    [self configureView];
}

- (IBAction)toggleDrawer:(id)sender
{
    HPDrawerController *drawer = (HPDrawerController *)self.navigationController.parentViewController;
    [drawer setLeftDrawerShown:!drawer.isLeftDrawerShown
                      animated:YES];
}

- (IBAction)refresh:(id)sender
{
    if (!self.padScope.space.API.isSignedIn ||
        !self.padScope.space.API.reachability.currentReachabilityStatus) {
        [self.refreshControl endRefreshing];
        return;
    }
    NSString *host = self.padScope.space.URL.host;
    // http://blog.wednesdaynight.org/2014/2/2/endRefreshing-while-decelerating
    UIRefreshControl * __weak refreshControl = self.refreshControl;
    [self.padScope.space requestFollowedPadsWithRefresh:YES
                                             completion:^(id obj, NSError *error)
     {
         if (error) {
             TFLog(@"[%@] Could not fetch pads: %@", host, error);
         }
         dispatch_async(dispatch_get_main_queue(), ^{
             [refreshControl performSelector:@selector(endRefreshing)
                                  withObject:nil
                                  afterDelay:0];
         });
     }];
}

- (IBAction)createPad:(id)sender
{
    HPPadListViewController * __weak weakSelf = self;
    UIBarButtonItem *item = sender;
    if ([item isKindOfClass:[UIBarButtonItem class]]) {
        item.enabled = NO;
    }
    [self.padScope.space blankPadWithTitle:@"Untitled"
                                  followed:YES
                                completion:^(HPPad *pad, NSError *error)
     {
         if ([item isKindOfClass:[UIBarButtonItem class]]) {
             item.enabled = YES;
         }
         if (!pad) {
             if (error) {
                 TFLog(@"[%@] Could not create blank pad: %@",
                       weakSelf.padScope.space.URL.host, error);
             }
             return;
         }
         if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
             [weakSelf performSegueWithIdentifier:CreatePadSegue
                                           sender:pad];
         } else {
             [self.masterPopoverController dismissPopoverAnimated:YES];
             [self.editorViewController.navigationController popToRootViewControllerAnimated:YES];
             [self loadEditorWithPad:pad];
         }
     }];
}

#pragma mark - Table view delegate

- (NSString *)tableView:(UITableView *)tableView
titleForDeleteConfirmationButtonForRowAtIndexPath:(NSIndexPath *)indexPath
{
    HPPad *pad = [self.dataSource padAtIndexPath:indexPath];
    return pad.hasMissedChanges ? @"Discard Changes" : @"Remove";
}

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    HPPad *pad;
    if (tableView == self.tableView) {
        pad = [self.dataSource padAtIndexPath:indexPath];
    } else  if (tableView == self.searchDisplayController.searchResultsTableView) {
        pad = [searchDataSource padAtIndexPath:indexPath];
    } else {
        return;
    }
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [self performSegueWithIdentifier:ShowDetailSegue
                                  sender:[tableView cellForRowAtIndexPath:indexPath]];
        [self loadEditorWithPad:pad];
    } else {
        [self.masterPopoverController dismissPopoverAnimated:YES];
        [self loadEditorWithPad:pad];
    }
}

#if 0
- (CGFloat)tableView:(UITableView *)tableView
heightForRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (tableView == self.tableView) {
        HPPad *pad = [self.dataSource padAtIndexPath:indexPath];
        CGFloat snippetHeight = [expandedIndexPaths member:indexPath] ? pad.expandedSnippetHeight : pad.snippetHeight;
        return MAX(77 - 44 + MAX(snippetHeight, 21), 44);
    }
    return 60;
}
#endif

- (void)tableView:(UITableView *)tableView
accessoryButtonTappedForRowWithIndexPath:(NSIndexPath *)indexPath
{
    HPPad *pad = [self.dataSource padAtIndexPath:indexPath];
    if (pad.snippetHeight <= 164) {
        return;
    }
    BOOL shrink = !![expandedIndexPaths member:indexPath];
    if (shrink) {
        [expandedIndexPaths removeObject:indexPath];
    } else {
        [expandedIndexPaths addObject:indexPath];
    }
    [tableView reloadRowsAtIndexPaths:@[indexPath]
                     withRowAnimation:UITableViewRowAnimationAutomatic];
    [tableView scrollToRowAtIndexPath:indexPath
                     atScrollPosition:shrink ? UITableViewScrollPositionMiddle : UITableViewScrollPositionTop
                             animated:YES];
}

#pragma mark - Scroll view delegate

- (void)enablePadCacheController
{
    [[HPPadCacheController sharedPadCacheController] setDisabled:NO];
}

- (void)scrollViewWillBeginDragging:(UIScrollView *)scrollView
{
    [[HPPadCacheController sharedPadCacheController] setDisabled:YES];
    [self performSelector:@selector(enablePadCacheController)
               withObject:nil
               afterDelay:0];
}

#pragma mark - UISearchDisplay delegate

- (void)searchDisplayControllerWillBeginSearch:(UISearchDisplayController *)controller
{
    searchDataSource = [[HPPadSearchTableViewDataSource alloc] init];
    searchDataSource.managedObjectContext = self.managedObjectContext;
    searchDataSource.padScope = self.padScope;
    searchDataSource.prototypeTableView = self.tableView;
    searchDataSource.tableView = controller.searchResultsTableView;
    controller.searchResultsTableView.dataSource = searchDataSource;
    controller.searchResultsTableView.rowHeight = 60;
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        return;
    }
    [UIView transitionWithView:controller.searchBar
                      duration:0.25
                       options:UIViewAnimationOptionTransitionCrossDissolve
                    animations:^{
                        controller.searchBar.searchBarStyle = UISearchBarStyleProminent;
                        controller.searchBar.barTintColor = [UIColor whiteColor];
                    } completion:nil];
}

- (void)searchDisplayControllerWillEndSearch:(UISearchDisplayController *)controller
{
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        return;
    }
    [UIView transitionWithView:controller.searchBar
                      duration:0.25
                       options:UIViewAnimationOptionTransitionCrossDissolve
                    animations:^{
                        controller.searchBar.searchBarStyle = UISearchBarStyleMinimal;
                    } completion:nil];
}

- (void)searchDisplayControllerDidEndSearch:(UISearchDisplayController *)controller
{
    controller.searchResultsTableView.dataSource = nil;
    searchDataSource.tableView = nil;
    searchDataSource = nil;
    if (controller.searchBar.superview == self.tableView) {
        return;
    }
    [self.tableView addSubview:controller.searchBar];
}

- (BOOL)searchDisplayController:(UISearchDisplayController *)controller
shouldReloadTableForSearchString:(NSString *)searchString
{
    if (!self.padScope.space.userID) {
        return NO;
    }
    searchDataSource.searchText = (searchString.length > 2) ? searchString : nil;
    return NO;
}

#pragma mark - State preservation

static NSString * const HPPadListScope = @"HPPadListScope";

- (void)encodeRestorableStateWithCoder:(NSCoder *)coder
{
    // Don't persist editing, as we have no UI to undo it.
    self.editing = NO;
    [super encodeRestorableStateWithCoder:coder];
    NSManagedObject *managedObject = self.padScope.collection
        ? self.padScope.collection
        : self.padScope.space;
    if (managedObject) {
        [coder encodeObject:managedObject.objectID.URIRepresentation
                     forKey:HPPadListScope];
    }
}

- (void)decodeRestorableStateWithCoder:(NSCoder *)coder
{
    [super decodeRestorableStateWithCoder:coder];

    NSURL *URL = [coder decodeObjectOfClass:[NSURL class]
                                     forKey:HPPadListScope];

    if (!URL) {
        return;
    }

    NSManagedObjectID *objectID = [self.padScope.coreDataStack.persistentStoreCoordinator managedObjectIDForURIRepresentation:URL];
    if (!objectID) {
        TFLog(@"Could not find objectID for restored URL: %@", URL);
        return;
    }

    NSError * __autoreleasing error;
    NSManagedObject *managedObject = [self.managedObjectContext existingObjectWithID:objectID
                                                                               error:&error];
    if (error) {
        TFLog(@"Could not find restoring object: %@", error);
        return;
    }

    if ([managedObject isKindOfClass:[HPCollection class]]) {
        self.padScope.collection = (HPCollection *)managedObject;
    } else if ([managedObject isKindOfClass:[HPSpace class]]) {
        self.padScope.space = (HPSpace *)managedObject;
    } else {
        TFLog(@"Unexpected saved scope: %@", managedObject);
    }
}

#pragma mark - UIDataSourceModelAssociation implementation

- (NSString *)modelIdentifierForElementAtIndexPath:(NSIndexPath *)idx
                                            inView:(UIView *)view
{
    HPPad *pad = [self.dataSource padAtIndexPath:idx];
    return pad.objectID.URIRepresentation.absoluteString;
}

- (NSIndexPath *)indexPathForElementWithModelIdentifier:(NSString *)identifier
                                                 inView:(UIView *)view
{
    NSURL *URL = [NSURL URLWithString:identifier];
    if (!URL) {
        return nil;
    }
    NSManagedObjectID *objectID = [self.managedObjectContext.persistentStoreCoordinator managedObjectIDForURIRepresentation:URL];
    NSError * __autoreleasing error;
    NSManagedObject *obj = [self.managedObjectContext existingObjectWithID:objectID
                                                                     error:&error];
    if (!obj) {
        if (error) {
            TFLog(@"Error reloading pad: %@", error);
        }
        return nil;
    }
    return [self.dataSource indexPathForPad:(HPPad *)obj];

}

@end
