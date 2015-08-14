//
//  HPSignInController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPCoreDataStack;

UIKIT_EXTERN NSString * const HPSignInControllerWillRequestPadsNotification;
UIKIT_EXTERN NSString * const HPSignInControllerDidRequestPadsNotification;

UIKIT_EXTERN NSString * const HPSignInControllerSpaceKey;

@interface HPSignInController : NSObject

+ (id)defaultController;

- (void)addObserversWithCoreDataStack:(HPCoreDataStack *)coreDataStack
                   rootViewController:(UIViewController *)rootViewController;

@end
