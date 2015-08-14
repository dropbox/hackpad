//
//  HPCoreDataStack.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@protocol HPCoreDataStackDelegate;

@interface HPCoreDataStack : NSObject

@property (strong, readonly, nonatomic) NSManagedObjectContext *mainContext;
@property (strong, readonly, nonatomic) NSManagedObjectModel *managedObjectModel;
@property (strong, readonly, nonatomic) NSPersistentStoreCoordinator *persistentStoreCoordinator;
@property (nonatomic, readonly, getter=isMigrationNeeded) BOOL migrationNeeded;
@property (nonatomic, strong) NSURL *storeURL;
@property (nonatomic, strong) NSString *storeType;

+ (void)setSharedStateRestorationCoreDataStack:(HPCoreDataStack *)coreDataStack;
+ (HPCoreDataStack *)sharedStateRestorationCoreDataStack;

// Completion block will always be executed on the main queue.
- (void)saveWithBlock:(void(^)(NSManagedObjectContext *localContext))block
           completion:(void(^)(NSError *error))completion;
@end
