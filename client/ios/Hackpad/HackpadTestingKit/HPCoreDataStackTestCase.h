//
//  HPCoreDataStackTestCase.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HPMockTestCase.h>

@class HPCoreDataStack;
@class HPSpace;
@class NSManagedObjectContext;

@interface HPCoreDataStackTestCase : HPMockTestCase
@property (nonatomic, strong) HPCoreDataStack *coreDataStack;
@property (nonatomic, strong) NSManagedObjectContext *managedObjectContext;
@property (nonatomic, strong) HPSpace *defaultSpace;
- (void)setUpWithStoreURL:(NSURL *)storeURL;
- (void)save;
- (void)saveWithManagedObjectContext:(NSManagedObjectContext *)managedObjectContext;
- (void)resetStack;
@end
