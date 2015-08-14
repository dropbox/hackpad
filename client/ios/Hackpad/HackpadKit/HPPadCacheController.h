//
//  HPPadCacheController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@class HPCoreDataStack;
@class HPPad;

@interface HPPadCacheController : NSObject

@property (atomic, assign, getter = isDisabled) BOOL disabled;

+ (id)sharedPadCacheController;
- (void)setCoreDataStack:(HPCoreDataStack *)coreDataStack;
- (void)setPad:(HPPad *)pad
       editing:(BOOL)editing;

@end
