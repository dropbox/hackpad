//
//  HPAppDelegate.m
//  Hackpad
//
//
//  Copyright (c) 2012 Hackpad. All rights reserved.
//

#import "HPAppDelegate.h"

#import "HPPadEditorViewController.h"
#import "HPPadListViewController.h"
#import "HPSignInController.h"
#import "HPDrawerController.h"
#import "HPPadScopeViewController.h"
#import "HPBlueNavigationController.h"
#import "HPGrayNavigationController.h"
#import "HPPadSplitViewController.h"
#import "HPPadScopeTableViewDataSource.h"
#import "HPSignInViewController.h"
#import "HPWhiteNavigationController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadUIAdditions.h"

#import <FacebookSDK/FacebookSDK.h>
#import <AppleSampleCode/Reachability.h>
#import "TestFlight.h"
#import "WebViewJavascriptBridge.h"
#import "Flurry.h"

static NSString * const InterfaceIdiomKey = @"interfaceIdiom";
static NSString * const LayoutVersionKey = @"layoutVersion";
static NSInteger const LayoutVersion = 2;
static NSString * const ResetOnLaunchKey = @"resetOnLaunch";
static NSString * const ShownWelcomePad = @"shownWelcomePad";
static NSString * const HPFlurryAnalyticsKey = @"PF8KBXHTPPPBTK3HV2RC";

#if DEBUG
static NSString * const TestFlightAppToken = @"61421fa6-591a-4a66-bbbd-64a3b218807f";
#elif AD_HOC
static NSString * const TestFlightAppToken = @"373fd844-32de-4e5d-9d58-5ee608b0f500";
#else
static NSString * const TestFlightAppToken = @"ab3a22d0-6771-4083-aa35-5ee800928409";
#endif

#if __IPHONE_OS_VERSION_MAX_ALLOWED > __IPHONE_6_1
#if DEBUG || AD_HOC
@interface UIDevice (UniqueIdentifier)
@property (nonatomic, readonly, retain) NSString *uniqueIdentifier;
@end
#endif
#else
@protocol IOS7UIAppearance <NSObject>
- (void)setBarTintColor:(UIColor *)color;
@end

@interface UIWindow (IOS7Additions)
- (void)setTintColor:(UIColor *)color;
@end
#endif

@interface HPAppDelegate () <HPDrawerControllerDelegate>

@property (strong, nonatomic) HPCoreDataStack *coreDataStack;
@property (strong, nonatomic) HPPadListViewController *padListViewController;
@property (strong, nonatomic) HPPadScopeViewController *padScopeViewController;
@property (assign, nonatomic) BOOL resetStore;

- (NSURL *)applicationDocumentsDirectory;
- (NSURL *)storeURL;

@end

@implementation HPAppDelegate

- (BOOL)application:(UIApplication *)application
willFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    if ([self.class isRunningTests]) {
        return YES;
    }

#if 0
    [self dumpFontsAndExit];
#endif
#if !CREATE_DEFAULT_PNG
#if !DEBUG
    [self initializeTestFlight];
#endif
    [self initializeCoreDataStack];
    [self initializeProtocols];
    [self setMobileCookie];
#if DEBUG
    [WebViewJavascriptBridge enableLogging];
#endif
#endif

    [[HPSignInController defaultController] addObserversWithCoreDataStack:self.coreDataStack
                                                       rootViewController:self.window.rootViewController];

    [self initializeUI];

    return YES;
}

- (BOOL)application:(UIApplication *)application
didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    [application registerForRemoteNotificationTypes:
        (UIRemoteNotificationTypeBadge | UIRemoteNotificationTypeSound |
         UIRemoteNotificationTypeAlert)];
    [self configureAnalytics];
    return YES;
}

- (void)applicationWillResignActive:(UIApplication *)application
{
    // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
    // Use this method to pause ongoing tasks, disable timers, and throttle down OpenGL ES frame rates. Games should use this method to pause the game.
    [[HPPadCacheController sharedPadCacheController] setDisabled:YES];
    [self.coreDataStack.mainContext hp_saveToStore:nil];
}

- (void)applicationDidReceiveMemoryWarning:(UIApplication *)application
{
    [[NSURLCache sharedURLCache] removeAllCachedResponses];
}

- (void)applicationDidEnterBackground:(UIApplication *)application
{
    [self.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        [[HPPadCacheController sharedPadCacheController] setDisabled:YES];
        NSError *error = nil;
        [HPSpace removeNonfollowedPadsInManagedObjectContext:localContext
                                                       error:&error];
        if (error) {
            TFLog(@"Error Removing Non-Followed Pads: %@", error);
        }
    } completion:^(NSError *error) {
        if (error) {
            TFLog(@"Error pruning pads: %@", error);
        }
    }];
}

- (BOOL)application:(UIApplication *)application
shouldSaveApplicationState:(NSCoder *)coder
{
#if CREATE_DEFAULT_PNG
    return NO;
#else
    [coder encodeInteger:UIDevice.currentDevice.userInterfaceIdiom
                  forKey:InterfaceIdiomKey];
    [coder encodeInteger:LayoutVersion
                  forKey:LayoutVersionKey];
    return YES;
#endif
}

- (BOOL)application:(UIApplication *)application
shouldRestoreApplicationState:(NSCoder *)coder
{
#if CREATE_DEFAULT_PNG
    return NO;
#else
    if (self.resetStore ||
        [coder decodeIntegerForKey:InterfaceIdiomKey] != UIDevice.currentDevice.userInterfaceIdiom ||
        [coder decodeIntegerForKey:LayoutVersionKey] != LayoutVersion) {
        return NO;
    }
    [HPCoreDataStack setSharedStateRestorationCoreDataStack:self.coreDataStack];
    return YES;
#endif
}

- (void)application:(UIApplication *)application
didDecodeRestorableStateWithCoder:(NSCoder *)coder
{
    [HPCoreDataStack setSharedStateRestorationCoreDataStack:nil];
}

- (void)applicationWillEnterForeground:(UIApplication *)application
{
    // Called as part of the transition from the background to the inactive state; here you can undo many of the changes made on entering the background.
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
    [FBSession.activeSession handleDidBecomeActive];
    [[HPPadCacheController sharedPadCacheController] setDisabled:NO];
}

- (void)applicationWillTerminate:(UIApplication *)application
{
    [FBSession.activeSession close];
}

- (void)application:(UIApplication *)application
didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
    HPLog(@"Device notification token: %@", deviceToken.hp_hexEncodedString);
    [HPAPI setSharedDeviceTokenData:deviceToken];
}

- (void)application:(UIApplication *)application
didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
    TFLog(@"Failed to get device token, error: %@", error);
#if TARGET_IPHONE_SIMULATOR
//    [HPAPI setSharedDeviceTokenData:[@"bogus token" dataUsingEncoding:NSUTF8StringEncoding]];
#endif
}

#pragma mark - UI

- (void)initializeUI
{
    HPDrawerController *drawerViewController;
    HPPadEditorViewController *padEditorViewController;
    HPPadSplitViewController *splitViewController;

    UIFont *font = [UIFont hp_UITextFontOfSize:17];
    NSDictionary *attributes = @{NSFontAttributeName:font};

    id appearance = [UILabel appearanceWhenContainedIn:[UITableViewCell class], [HPSignInViewController class], nil];
    [appearance setFont:font];

    appearance = [UITextField appearanceWhenContainedIn:[HPSignInViewController class], nil];
    [appearance setFont:font];

    if (HP_SYSTEM_MAJOR_VERSION() >= 7) {
        // This triggers a failed assertion on iOS 6 when sharing a pad URL?!
        appearance = [UIBarButtonItem appearance];
        [appearance setTitleTextAttributes:attributes
                                  forState:UIControlStateNormal];
    }

    [self setupAppearanceWhenContainedIn:[HPWhiteNavigationController class]
                            titleBarFont:font];
    [self setupAppearanceWhenContainedIn:[HPGrayNavigationController class]
                            titleBarFont:font];
    [self setupAppearanceWhenContainedIn:[HPBlueNavigationController class]
                            titleBarFont:font];

    font = [UIFont hp_UITextFontOfSize:14];
    appearance = [UILabel appearanceWhenContainedIn:[UITextField class], [UISearchBar class], nil];
    [appearance setFont:font];

    appearance = [UITextField appearanceWhenContainedIn:[UISearchBar class], nil];
    [appearance setFont:font];

    appearance = [UILabel appearanceWhenContainedIn:[UITableViewHeaderFooterView class], nil];
    [appearance setFont:font];

#if !CREATE_DEFAULT_PNG
    HPPadScope *padScope = [[HPPadScope alloc] initWithCoreDataStack:self.coreDataStack];
#endif

    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        splitViewController = (HPPadSplitViewController *)self.window.rootViewController;
        drawerViewController = splitViewController.viewControllers[0];
        UINavigationController *detailNavigationController = splitViewController.viewControllers[1];
        padEditorViewController = (HPPadEditorViewController *)detailNavigationController.topViewController;
#if CREATE_DEFAULT_PNG
        padEditorViewController.navigationItem.rightBarButtonItems = nil;
#endif
        splitViewController.delegate = splitViewController;
        detailNavigationController.delegate = splitViewController;
    } else {
        drawerViewController = (HPDrawerController *)self.window.rootViewController;
    }

    drawerViewController.delegate = self;

    UINavigationController *navigationController = (UINavigationController *)drawerViewController.mainViewController;
    self.padListViewController = (HPPadListViewController *)navigationController.topViewController;
    self.padListViewController.editorViewController = padEditorViewController;

#if CREATE_DEFAULT_PNG
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        self.padListViewController.title = @"";
        self.padListViewController.navigationItem.rightBarButtonItem = nil;
    }
    if (!self.padListViewController.isViewLoaded) {
        [self.padListViewController loadView];
    }
    self.padListViewController.searchDisplayController.searchBar.placeholder = @"";
#else
    self.padListViewController.padScope = padScope;
    splitViewController.padListViewController = self.padListViewController;

    navigationController = (UINavigationController *)drawerViewController.leftViewController;
    self.padScopeViewController = (HPPadScopeViewController *)navigationController.topViewController;
    self.padScopeViewController.padScope = padScope;
    self.padScopeViewController.dataSource.managedObjectContext = self.coreDataStack.mainContext;
    if (drawerViewController.isLeftDrawerShown) {
        [self drawerController:drawerViewController
    willShowLeftDrawerAnimated:NO];
    } else {
        [self drawerController:drawerViewController
    willHideLeftDrawerAnimated:NO];
    }
#endif
}

- (void)setupAppearanceWhenContainedIn:(Class <HPColoredAppearanceContainer>)containerClass
                          titleBarFont:(UIFont *)font
{
    BOOL iOS7 = HP_SYSTEM_MAJOR_VERSION() >= 7;
    UIImage *image = iOS7 ? nil : [containerClass coloredBackgroundImage];
    UIColor *barTintColor = [containerClass coloredBarTintColor];
    UIColor *tintColor = [containerClass coloredTintColor];
    UIColor *navTitleColor = [containerClass navigationTitleColor];

    id appearance = [UINavigationBar appearanceWhenContainedIn:containerClass, nil];
    NSDictionary *attributes = @{NSForegroundColorAttributeName:navTitleColor,
                                 NSFontAttributeName:font};
    [appearance setTitleTextAttributes:attributes];
    if (iOS7) {
        [appearance setTintColor:tintColor];
        [appearance setBarTintColor:barTintColor];
    } else {
        [appearance setBackgroundImage:image
                         forBarMetrics:UIBarMetricsDefault];
        [appearance setShadowImage:[[UIImage alloc] init]];
    }
    appearance = [UINavigationBar appearance];
    [appearance setTitleTextAttributes:attributes];

    appearance = [UIToolbar appearanceWhenContainedIn:containerClass, nil];
    if (iOS7) {
        [appearance setBarTintColor:barTintColor];
        [appearance setTintColor:tintColor];
    } else {
        [appearance setBackgroundImage:image
                    forToolbarPosition:UIToolbarPositionAny
                            barMetrics:UIBarMetricsDefault];
    }

    appearance = [UIBarButtonItem appearanceWhenContainedIn:containerClass, nil];
    [appearance setTintColor:tintColor];

    if (iOS7) {
        appearance = [UITextField appearanceWhenContainedIn:[UISearchBar class], containerClass, nil];
        [appearance setBackgroundColor:[UIColor hp_mediumGreenGrayColor]];
        return;
    }

    [appearance setBackgroundImage:[UIImage new]
                          forState:UIControlStateNormal
                        barMetrics:UIBarMetricsDefault];
    UIImage *clearImage = [[UIImage imageNamed:@"clearback"] resizableImageWithCapInsets:UIEdgeInsetsMake(0, 20, 0, 1)];
    [appearance setBackButtonBackgroundImage:clearImage
                                    forState:UIControlStateNormal
                                  barMetrics:UIBarMetricsDefault];
#if 0
    clearImage = [[UIImage imageNamed:@"clearbacklandscape"] resizableImageWithCapInsets:UIEdgeInsetsMake(0, 20, 0, 1)];
    [appearance setBackButtonBackgroundImage:clearImage
                                    forState:UIControlStateNormal
                                  barMetrics:UIBarMetricsLandscapePhone];
#endif
    [appearance setTitleTextAttributes:@{UITextAttributeTextColor:tintColor,
                                         UITextAttributeTextShadowColor:[UIColor clearColor]}
                              forState:UIControlStateNormal];
    [appearance setTitleTextAttributes:@{UITextAttributeTextColor:[UIColor hp_darkGrayColor],
                                         UITextAttributeTextShadowColor:[UIColor clearColor]}
                              forState:UIControlStateHighlighted];

    appearance = [UISegmentedControl appearanceWhenContainedIn:containerClass, nil];
    [appearance setBackgroundImage:[UIImage new]
                          forState:UIControlStateNormal
                        barMetrics:UIBarMetricsDefault];

    appearance = [UISearchBar appearanceWhenContainedIn:containerClass, nil];
    [appearance setBackgroundColor:[UIColor colorWithPatternImage:image]];

    appearance = [NSClassFromString(@"UISearchBarBackground") appearanceWhenContainedIn:containerClass, nil];
    [appearance setAlpha:0];
}

- (void)showIPadPadList
{
    NSAssert(UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad, @"This should only be called on iPads");
    HPPadSplitViewController *svc = (HPPadSplitViewController *)self.window.rootViewController;
    [svc.padListItem.target performSelector:svc.padListItem.action
                                 withObject:self
                                 afterDelay:0];

}

#pragma mark - Core Data stack initialization & delegate

- (void)initializeCoreDataStack
{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    self.resetStore = [defaults boolForKey:ResetOnLaunchKey];
    if (self.resetStore) {
        NSHTTPCookieStorage *cookieJar = [NSHTTPCookieStorage sharedHTTPCookieStorage];
        for (NSHTTPCookie *cookie in cookieJar.cookies) {
            [cookieJar deleteCookie:cookie];
        }

        NSDictionary *query = [NSDictionary dictionaryWithObjectsAndKeys:
                               (__bridge id)kSecClassGenericPassword, (__bridge id)kSecClass,
                               (__bridge id)kSecMatchLimitAll, (__bridge id)kSecMatchLimit,
                               nil];
        SecItemDelete((__bridge CFDictionaryRef)query);

        NSFileManager *fm = [NSFileManager defaultManager];
        NSDirectoryEnumerator *files;
        NSDirectoryEnumerationOptions options =
            NSDirectoryEnumerationSkipsSubdirectoryDescendants |
            NSDirectoryEnumerationSkipsPackageDescendants |
            NSDirectoryEnumerationSkipsHiddenFiles;
        files = [fm enumeratorAtURL:[self.storeURL URLByDeletingLastPathComponent]
         includingPropertiesForKeys:nil
                            options:options
                       errorHandler:^BOOL(NSURL *url, NSError *error) {
                           TFLog(@"Error enumerating %@: %@", url, error);
                           return YES;
                       }];
        NSString *storeFile = self.storeURL.lastPathComponent;
        for (NSURL *URL in files) {
            if (![URL.lastPathComponent hasPrefix:storeFile]) {
                continue;
            }
            HPLog(@"Deleting file: %@", URL.absoluteString);
            [fm removeItemAtURL:URL
                          error:nil];
        }
        [HPStaticCachingURLProtocol removeCacheWithError:nil];

        for (NSString *key in defaults.dictionaryRepresentation.allKeys) {
#if TARGET_IPHONE_SIMULATOR
            if (![key isEqualToString:@"devServer"])
#endif
            {
                HPLog(@"Removing key: %@", key);
                [defaults removeObjectForKey:key];
            }
        }
        [defaults synchronize];
        [NSUserDefaults resetStandardUserDefaults];
    }

    self.coreDataStack = [HPCoreDataStack new];
    self.coreDataStack.storeURL = self.storeURL;

    HPAppDelegate * __weak weakSelf = self;
    NSManagedObjectID * __block objectID;
    [self.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        NSError * __autoreleasing error;
        HPSpace *space = [HPSpace spaceWithURL:[NSURL hp_sharedHackpadURL]
                        inManagedObjectContext:localContext
                                         error:&error];
        if (error) {
            TFLog(@"Error fetching space: %@", error);
        }
        if (space) {
            if ((!space.rootURL || space.domainType != HPToplevelDomainType) &&
                ![HPSpace migrateRootURLsInManagedObjectContext:localContext
                                                          error:&error]) {
                TFLog(@"Error migrating spaces: %@", error);
                return;
            }
            objectID = space.objectID;
            return;
        }
        space = [HPSpace insertSpaceWithURL:[NSURL hp_sharedHackpadURL]
                                       name:nil
                       managedObjectContext:localContext];
        if (![localContext obtainPermanentIDsForObjects:@[space]
                                                  error:&error]) {
            TFLog(@"Error getting default space permanent ID: %@", error);
            return;
        }
        objectID = space.objectID;
    } completion:^(NSError *error) {
        if (error) {
            TFLog(@"Error saving default space: %@", error);
            return;
        }
        [[HPPadCacheController sharedPadCacheController] setCoreDataStack:weakSelf.coreDataStack];
        if (!objectID) {
            return;
        }
        HPSpace *space = (HPSpace *)[weakSelf.coreDataStack.mainContext existingObjectWithID:objectID
                                                                                       error:&error];
        if (error) {
            TFLog(@"Error fetching default space: %@", error);
            return;
        }
        [space.API signInEvenIfSignedIn:NO];
        if (weakSelf.padListViewController.padScope.space) {
            return;
        }
        weakSelf.padListViewController.padScope.space = space;
        [weakSelf.padScopeViewController.tableView reloadData];
        if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone ||
            weakSelf.padListViewController.editorViewController.pad) {
            return;
        }
        [weakSelf showIPadPadList];
    }];
}

#pragma mark - Application's Documents directory

// Returns the URL to the application's Documents directory.
- (NSURL *)applicationDocumentsDirectory
{
    return [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                                   inDomains:NSUserDomainMask] lastObject];
}

- (NSURL *)storeURL
{
    return [[self applicationDocumentsDirectory] URLByAppendingPathComponent:@"pads.data"];
}

#pragma mark - URL stuffs

- (void)openPadWithURL:(NSURL *)URL
{
    static NSString * const ShowDetailSegue = @"showDetail";

    NSManagedObjectID * __block objectID;
    NSError * __block padError;
    HPAppDelegate * __weak weakSelf = self;
    [self.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        HPPad *pad = [HPPad padWithURL:URL
                  managedObjectContext:localContext
                                 error:&padError];
        if (!pad) {
            return;
        }
        if (![localContext obtainPermanentIDsForObjects:@[pad]
                                                  error:&padError]) {
            return;
        }
        objectID = pad.objectID;
    } completion:^(NSError *error) {
        if (!error) {
            error = padError;
        }
        HPPad *pad;
        if (!error) {
            pad = (HPPad *)[weakSelf.coreDataStack.mainContext existingObjectWithID:objectID
                                                                              error:&error];
        }
        if (error) {
            TFLog(@"[%@] Could not create pad with path %@: %@",
                  URL.host, URL.hp_fullPath, error);
            [[[UIAlertView alloc] initWithTitle:@"Oops"
                                        message:@"The pad couldn't be found. Please try again later."
                                       delegate:nil
                              cancelButtonTitle:nil
                              otherButtonTitles:@"OK", nil] show];
            return;
        }
        weakSelf.padScopeViewController.padScope.space = pad.space;
        if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
            weakSelf.padListViewController.editorViewController.pad = pad;
        } else {
            [weakSelf.padListViewController performSegueWithIdentifier:ShowDetailSegue
                                                                sender:pad];
        }
    }];
}

- (void)openSpaceWithURL:(NSURL *)URL
{
    HPAppDelegate * __weak weakSelf = self;
    NSManagedObjectID * __block objectID;
    // This should be in HPSpace+Impl.
    [self.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        NSError *error = nil;
        HPSpace *space = [HPSpace spaceWithURL:URL
                        inManagedObjectContext:localContext
                                         error:&error];
        if (error) {
            return;
        }
        if (space) {
            space.hidden = NO;
        } else {
            space = [HPSpace insertSpaceWithURL:URL
                                           name:nil
                           managedObjectContext:localContext];
            if (![localContext obtainPermanentIDsForObjects:@[space]
                                                      error:&error]) {
                TFLog(@"Error obtaining permanent IDs: %@", error);
                return;
            }
        }
        objectID = space.objectID;
    } completion:^(NSError *error) {
        if (error) {
            TFLog(@"[%@] Could not add space: %@", URL.host, error);
            return;
        }
        if (!objectID) {
            return;
        }
        if (!weakSelf) {
            return;
        }
        HPSpace *space = (HPSpace *)[weakSelf.coreDataStack.mainContext existingObjectWithID:objectID
                                                                                       error:&error];
        if (!space) {
            TFLog(@"[%@] Could not look up space: %@", URL.host, error);
            return;
        }
        [space.API signInEvenIfSignedIn:NO];
        weakSelf.padScopeViewController.padScope.space = space;
        if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
            [self.padListViewController.navigationController popToRootViewControllerAnimated:YES];
        } else {
            [self showIPadPadList];
        }
    }];
}

/*
 * If we have a valid session at the time of openURL call, we handle
 * Facebook transitions by passing the url argument to handleOpenURL
 */
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
  sourceApplication:(NSString *)sourceApplication
         annotation:(id)annotation
{
    // attempt to extract a token from the url
    if ([FBSession.activeSession handleOpenURL:url]) {
        return YES;
    }

    switch ([HPAPI URLTypeWithURL:url]) {
        case HPPadURLType:
            [self openPadWithURL:url];
            return YES;

        case HPSpaceURLType:
            [self openSpaceWithURL:url];
            return YES;

        // TODO: Allow opening searches, sites, etc.
        default:
            return NO;
    }
}

#pragma mark - Notifications

- (void)application:(UIApplication *)application
didReceiveRemoteNotification:(NSDictionary *)userInfo
{
    [self application:application
didReceiveRemoteNotification:userInfo
fetchCompletionHandler:^(UIBackgroundFetchResult result) {}];
}

- (void)application:(UIApplication *)application
didReceiveRemoteNotification:(NSDictionary *)userInfo
fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
    static NSString * const HPKey = @"hp";
    static NSString * const PadURLKey = @"u";
    static NSString * const AccountIdKey = @"a";
    static NSString * const EventTypeKey = @"t";
    static NSString * const LastEditedDateKey = @"d";

    typedef NS_ENUM(unichar, HPNotificationEventType) {
        HPCreateEventType = 'c',
        HPDeleteEventType = 'd',
        HPEditEventType = 'e',
        HPFollowEventType = 'f',
        HPUnfollowEventType = 'u',
        HPInviteEventType = 'i',
        HPMentionEventType = 'm',
    };

    HPLog(@"got API notification: %@", userInfo);
    NSDictionary *hp = userInfo[HPKey];

    NSURL *URL = [NSURL URLWithString:hp[PadURLKey]];
    if (!URL) {
        TFLog(@"Ignoring notification without pad URL.");
        completionHandler(UIBackgroundFetchResultNoData);
        return;
    }

    NSString *padID = [HPPad padIDWithURL:URL];
    if (!padID) {
        TFLog(@"[%@] Could not find pad ID in URL: %@", URL.host, URL.hp_fullPath);
        completionHandler(UIBackgroundFetchResultFailed);
        return;
    }

    HPNotificationEventType eventType = [hp[EventTypeKey] characterAtIndex:0];
    if (!eventType) {
        TFLog(@"[%@ %@] Unknown event type in notification: %uh", URL.host, padID, eventType);
        completionHandler(UIBackgroundFetchResultFailed);
        return;
    }

    NSTimeInterval lastEditedDate = [hp[LastEditedDateKey] longLongValue] - NSTimeIntervalSince1970;

    UIApplicationState applicationState = application.applicationState;
    switch (applicationState) {
        case UIApplicationStateInactive:
            [self openPadWithURL:URL];
            completionHandler(UIBackgroundFetchResultNoData);
            return;
        case UIApplicationStateBackground: {
            HPAPI *API = [HPAPI APIWithURL:URL];
            if (!API) {
                TFLog(@"[%@ %@] Could not find API for notification URL.", URL.host, padID);
                completionHandler(UIBackgroundFetchResultFailed);
                return;
            }
#if 0
            if (!API.reachability.currentReachabilityStatus) {
                // FIXME: reschedule with local notification?
                TFLog(@"[%@ %@] Ignoring notification while offline.", URL.host, padID);
                completionHandler(UIBackgroundFetchResultFailed);
                return;
            }
#endif
            if (!API.oAuth || ![API loadOAuthFromKeychain]) {
                TFLog(@"[%@ %@] No oAuth info for notification.", URL.host, padID);
                completionHandler(UIBackgroundFetchResultFailed);
                return;
            }
            break;
        }
        case UIApplicationStateActive:
            break;
    }

    NSManagedObjectID * __block objectID;
    NSError * __block padError;
    [self.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        HPPad *pad = [HPPad padWithID:padID
                                title:@"Untitled"
                             spaceURL:URL
                 managedObjectContext:localContext
                                error:&padError];
        if (!pad) {
            return;
        }

        if (![pad.space.userID isEqualToString:hp[AccountIdKey]]) {
            TFLog(@"[%@ %@] Ignoring notification for wrong account: %@ (expecting %@)",
                  URL.host, padID, hp[AccountIdKey], pad.space.userID);
            return;
        }

        if (lastEditedDate > pad.lastEditedDate) {
            pad.lastEditedDate = lastEditedDate;
        }

        switch (eventType) {
            case HPEditEventType:
                break;
            case HPCreateEventType:
            case HPFollowEventType:
            case HPInviteEventType:
            case HPMentionEventType:
                pad.followed = YES;
                break;
            case HPUnfollowEventType:
                pad.followed = NO;
                break;
            case HPDeleteEventType:
                [pad.managedObjectContext deleteObject:pad];
                return;
            default:
                TFLog(@"[%@ %@] Unhandled event type: %uh", URL.host, padID, eventType);
                return;
        }

        if (applicationState == UIApplicationStateActive) {
            // App's running, so let pad cache controller update it.
            return;
        }

        if (![localContext obtainPermanentIDsForObjects:@[pad]
                                                  error:&padError]) {
            return;
        }
        objectID = pad.objectID;
    } completion:^(NSError *error) {
        if (padError) {
            TFLog(@"[%@ %@] Could not update pad from notification: %@",
                  URL.host, padID, padError);
            completionHandler(UIBackgroundFetchResultFailed);
            return;
        }
        if (!objectID) {
            completionHandler(UIBackgroundFetchResultNewData);
            return;
        }
        HPPad *pad = (HPPad *)[self.coreDataStack.mainContext existingObjectWithID:objectID
                                                                             error:&padError];
        if (!pad) {
            TFLog(@"[%@ %@] Could not find pad from notification: %@", URL.host,
                  padID, padError);
            completionHandler(UIBackgroundFetchResultFailed);
            return;
        }
        if (pad.hasMissedChanges) {
            TFLog(@"[%@ %@] Ignoring notification since we have missed changes.",
                  URL.host, padID);
            completionHandler(UIBackgroundFetchResultNoData);
            return;
        }
        if (pad.lastEditedDate == pad.editor.clientVarsLastEditedDate) {
            TFLog(@"[%@ %@] Pad is already up to date.", URL.host, padID);
            completionHandler(UIBackgroundFetchResultNoData);
            return;
        }
        [pad requestClientVarsWithRefresh:YES
                               completion:^(HPPad *pad, NSError *error) {
                                   if (error) {
                                       TFLog(@"[%@ %@] Could not update client vars from notification: %@", URL.host, padID, error);
                                       completionHandler(UIBackgroundFetchResultFailed);
                                       return;
                                   }
                                   [pad requestAuthorsWithCompletion:^(HPPad *pad, NSError *error) {
                                       if (error) {
                                           TFLog(@"[%@ %@] Could not update client vars from notification: %@", URL.host, padID, error);
                                           completionHandler(UIBackgroundFetchResultFailed);
                                           return;
                                       }
                                       completionHandler(UIBackgroundFetchResultNewData);
                                   }];
                               }];
    }];
}

#pragma mark - Other stuff

#if DEBUG
- (void)dumpFontsAndExit
{
    for (NSString* family in [UIFont familyNames]) {
        HPLog(@"%@", family);
        for (NSString* name in [UIFont fontNamesForFamilyName:family]) {
            HPLog(@"  %@", name);
        }
    }
    exit(0);
}
#endif

- (void)configureAnalytics
{
    //[Flurry setCrashReportingEnabled:YES];
    [Flurry startSession:HPFlurryAnalyticsKey];
}

- (void)initializeTestFlight
{
#if DEBUG || AD_HOC
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        [TestFlight setDeviceIdentifier:[[UIDevice currentDevice] uniqueIdentifier]];
    }
#endif
    HPLog(@"Using App Token: %@", TestFlightAppToken);
    [TestFlight takeOff:TestFlightAppToken];
}

- (void)initializeProtocols
{
    [HPImageUploadURLProtocol setSharedCoreDataStack:self.coreDataStack];
    [NSURLProtocol registerClass:[HPImageUploadURLProtocol class]];
    [NSURLProtocol registerClass:[HPStaticCachingURLProtocol class]];
}

+ (BOOL)isRunningTests
{
    NSDictionary* environment = [[NSProcessInfo processInfo] environment];
    NSString* injectBundle = environment[@"XCInjectBundle"];
    return [[injectBundle pathExtension] isEqualToString:@"octest"];
}

- (void)setMobileCookie
{
    NSTimeInterval secondsPerYear = 60 * 60 * 24 * 365;
    NSDictionary *cookieProperties = @{
                                       NSHTTPCookieDomain: [@"." stringByAppendingString:[[NSURL hp_sharedHackpadURL] host]],
                                       NSHTTPCookiePath: @"/",
                                       NSHTTPCookieName: @"HM",
                                       NSHTTPCookieValue: @"T",
                                       NSHTTPCookieExpires: [NSDate dateWithTimeIntervalSinceNow:secondsPerYear],
                                       };
    NSHTTPCookie *cookie = [NSHTTPCookie cookieWithProperties:cookieProperties];
    [[NSHTTPCookieStorage sharedHTTPCookieStorage] setCookie:cookie];
}

#pragma mark - Drawer Controller delegate

- (void)drawerController:(HPDrawerController *)drawerController
willShowLeftDrawerAnimated:(BOOL)animated
{
    self.padScopeViewController.view.userInteractionEnabled = YES;
    UINavigationController *mainNav = (UINavigationController *)drawerController.mainViewController;
    mainNav.topViewController.view.userInteractionEnabled = NO;
}

- (void)drawerController:(HPDrawerController *)drawerController
willHideLeftDrawerAnimated:(BOOL)animated
{
    self.padScopeViewController.view.userInteractionEnabled = NO;
    UINavigationController *mainNav = (UINavigationController *)drawerController.mainViewController;
    mainNav.topViewController.view.userInteractionEnabled = YES;
}

@end
