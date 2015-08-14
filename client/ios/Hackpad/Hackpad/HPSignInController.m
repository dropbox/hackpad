//
//  HPSignInController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSignInController.h"

#import "HackpadKit/HackpadKit.h"
#import <HackpadAdditions/HackpadAdditions.h>

#import "HPSignInViewController.h"

#import <TestFlight/TestFlight.h>
#import <MBProgressHUD/MBProgressHUD.h>

NSString * const HPSignInControllerWillRequestPadsNotification = @"HPSignInControllerWillRequestPadsNotification";
NSString * const HPSignInControllerDidRequestPadsNotification = @"HPSignInControllerDidRequestPadsNotification";

NSString * const HPSignInControllerSpaceKey = @"HPSignInControllerSpace";

@interface HPSignInController ()
@property (nonatomic, strong) NSMutableSet *todo;
+ (UIStoryboard *)signInStoryboard;
@end

@implementation HPSignInController

+ (id)defaultController
{
    static HPSignInController *defaultController;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        defaultController = [self new];
    });
    return defaultController;
}

- (id)init
{
    if (!(self = [super init])) {
        return nil;
    }
    self.todo = [NSMutableSet set];
    return self;
}

+ (UIStoryboard *)signInStoryboard
{
    return [UIStoryboard storyboardWithName:UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad ? @"SignIn_iPad" : @"SignIn_iPhone"
                                     bundle:nil];
}

- (BOOL)resetSpace:(HPSpace *)space
     withNewUserID:(NSString *)userID
             error:(NSError * __autoreleasing *)error
{
    [HPStaticCachingURLProtocol removeCacheWithHost:space.API.URL.host
                                              error:NULL];
    HPSpace *newSpace = [NSEntityDescription insertNewObjectForEntityForName:HPSpaceEntity
                                                      inManagedObjectContext:space.managedObjectContext];
    newSpace.name = space.name;
    newSpace.public = space.public;
    newSpace.signInMethods = space.signInMethods;
    newSpace.rootURL = space.rootURL;
    newSpace.userID = userID;
    newSpace.hidden = space.hidden;
    newSpace.domainType = space.domainType;

    [space.managedObjectContext deleteObject:space];

    if (space.URL.hp_isToplevelHackpadURL) {
        HPPad *pad = [HPPad welcomePadInManagedObjectContext:newSpace.managedObjectContext
                                                       error:nil];
        pad.followed = YES;
    }

    return YES;
}

- (void)addObserversWithCoreDataStack:(HPCoreDataStack *)coreDataStack
                   rootViewController:(UIViewController *)rootViewController
{
    NSManagedObjectContext *managedObjectContext = coreDataStack.mainContext;
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    HPSignInController * __weak weakSelf = self;
    [center addObserverForName:HPAPIDidRequireUserActionNotification
                        object:nil
                         queue:nil
                    usingBlock:^(NSNotification *note)
     {
         HPAPI *API = note.object;
         NSUInteger sessionID = API.sessionID;
         switch (API.authenticationState) {
         case HPSignInPromptAuthenticationState: {
             [managedObjectContext performBlock:^{
                 HPSignInController *strongSelf = weakSelf;
                 if (!strongSelf) {
                     return;
                 }
                 NSError *error;
                 HPSpace *space = [HPSpace spaceWithAPI:API
                                 inManagedObjectContext:managedObjectContext
                                                  error:&error];
                 if (error) {
                     TFLog(@"[%@] Could not find space: %@", API.URL.host, error);
                     return;
                 }

                 [strongSelf.todo addObject:space];
                 if (strongSelf.todo.count == 1) {
                     [strongSelf signInToSpace:space
                            rootViewController:rootViewController];
                 }
             }];
             break;
         }
         case HPChangedUserAuthenticationState: {
             HPLog(@"[%@] Space changed users: %@ -> %@", API.URL.host, API.userID,
                   [note.userInfo objectForKey:HPAPINewUserIDKey]);
             MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:rootViewController.view
                                                       animated:YES];
             [coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
                 NSError *error = nil;
                 HPSignInController *strongSelf = weakSelf;
                 if (!strongSelf) {
                     return;
                 }
                 HPSpace *space = [HPSpace spaceWithAPI:API
                                 inManagedObjectContext:localContext
                                                  error:&error];
                 if (!space) {
                     return;
                 }
                 [strongSelf resetSpace:space
                          withNewUserID:note.userInfo[HPAPINewUserIDKey]
                                  error:&error];
             } completion:^(NSError *error) {
                 [HUD hide:YES];
                 if (error) {
                     TFLog(@"[%@] Could not reset space: %@", API.URL.host, error);
                     return;
                 }
                 if (API.sessionID != sessionID) {
                     return;
                 }
                 API.authenticationState = HPSignedInAuthenticationState;
             }];
             break;
         }
         default:
             TFLog(@"[%@] Unexpected authentication state: %lu",
                   API.URL.host, (unsigned long)API.authenticationState);
             break;
         }
     }];
    [center addObserverForName:HPAPIDidSignInNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(NSNotification *note)
     {
         if (!weakSelf) {
             return;
         }
         HPAPI *API = note.object;
         NSUInteger sessionID = API.sessionID;
         NSError * __autoreleasing error;
         HPSpace *space = [HPSpace spaceWithAPI:API
                         inManagedObjectContext:managedObjectContext
                                          error:&error];
         if (!space) {
             return;
         }
         if (space.userID.length) {
             if (![space.userID isEqualToString:API.userID]) {
                 TFLog(@"[%@] userID mismatch: expected %@ but found %@",
                       API.URL.host, API.userID, space.userID);
                 return;
             }
         } else {
             [space hp_performBlock:^(HPSpace *space, NSError *__autoreleasing *error)
              {
                  @synchronized ([space API]) {
                      if (!space.API.isSignedIn || space.API.sessionID != sessionID) {
                          return;
                      }
                      space.userID = API.userID;
                  }
              } completion:^(HPSpace *space, NSError *error) {
                  if (error) {
                      TFLog(@"[%@] Could not update space userID: %@", API.URL.host, error);
                  }
              }];
         }
         [[NSNotificationCenter defaultCenter] postNotificationName:HPSignInControllerWillRequestPadsNotification
                                                             object:self
                                                           userInfo:@{HPSignInControllerSpaceKey:space}];
         [space requestFollowedPadsWithRefresh:YES
                                    completion:^(HPSpace *space, NSError *error)
          {
              if (error) {
                  TFLog(@"[%@] Could not import pads: %@",
                        API.URL.host, error);
              }
          }];
         [space refreshSpacesWithCompletion:^(HPSpace *sites,
                                              NSError *error) {
             if (error) {
                 TFLog(@"[%@] Could not update sites: %@",
                       space.URL.host, error);
             }
         }];
     }];
    [center addObserverForName:HPAPIDidSignOutNotification
                        object:nil
                         queue:nil
                    usingBlock:^(NSNotification *note)
     {
         HPAPI *API = note.object;
         if (API.authenticationState != HPRequiresSignInAuthenticationState) {
             return;
         }
         MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:rootViewController.view
                                                   animated:YES];
         [coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
             NSError *error = nil;
             HPSignInController *strongSelf = weakSelf;
             if (!strongSelf) {
                 return;
             }
             HPSpace *space = [HPSpace spaceWithAPI:API
                             inManagedObjectContext:localContext
                                              error:&error];
             if (!space) {

             }
             [strongSelf resetSpace:space
                      withNewUserID:nil
                              error:nil];

         } completion:^(NSError *error) {
             [HUD hide:YES];
             if (error) {
                 TFLog(@"[%@] Could not handle sign out: %@", API.URL.host, error);
             }
         }];
     }];
    [center addObserverForName:HPAPIDidFailToSignInNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(NSNotification *note)
     {
         [SignInAlertHelper showAlertWithSignInError:[note.userInfo objectForKey:HPAPISignInErrorKey]];
     }];
}

- (void)signInToSpace:(HPSpace *)space
   rootViewController:(UIViewController *)rootViewController
{
    UINavigationController *navCon = [[self.class signInStoryboard] instantiateInitialViewController];
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        [navCon view];
        navCon.navigationBar.translucent = NO;
    }
   HPSignInViewController *signIn = (HPSignInViewController *)navCon.topViewController;

    UIViewController *viewController = rootViewController;
    while (viewController.presentedViewController) {
        viewController = viewController.presentedViewController;
    }
//    MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:viewController.view
//                                              animated:YES];
    BOOL oldUserInteractionEnabled = rootViewController.view.userInteractionEnabled;
    rootViewController.view.userInteractionEnabled = NO;
    [space refreshOptionsWithCompletion:^(id unused, NSError *error)
     {
         rootViewController.view.userInteractionEnabled = oldUserInteractionEnabled;
//         [HUD hide:YES];
         if (error) {
             [_todo removeObject:space];
             [space signOutWithCompletion:nil];
             [SignInAlertHelper showAlertWithSignInError:error];
             return;
         }

         UIViewController *viewController = rootViewController;
         while (viewController.presentedViewController) {
             viewController = viewController.presentedViewController;
         }
         [signIn signInToSpace:space
                    completion:^(BOOL canceled,
                                 NSError *signInError)
          {
              [viewController dismissViewControllerAnimated:YES
                                                 completion:^
               {
                   NSError *error = signInError;
                   [_todo removeObject:space];
                   if (error || canceled) {
                       if (error) {
                           [SignInAlertHelper showAlertWithSignInError:error];
                           error = nil;
                       } else {
                                HPLog(@"[%@] Canceled sign in.", space.API.URL.host);
                       }
                       [space signOutWithCompletion:nil];
                   } else {
                       HPLog(@"[%@] Signed in.", space.API.URL.host);
                       space.API.authenticationState = HPRequestAPISecretAuthenticationState;
                   }
                   HPSpace *todo;
                   while ((todo = [_todo anyObject])) {
                       if (todo.API.authenticationState != HPSignInPromptAuthenticationState) {
                           [_todo removeObject:todo];
                           continue;
                       }
                       [self signInToSpace:todo
                        rootViewController:rootViewController];
                       break;
                   }
               }];
          }];
         [viewController presentViewController:navCon
                                      animated:YES
                                    completion:nil];
     }];
}

@end
