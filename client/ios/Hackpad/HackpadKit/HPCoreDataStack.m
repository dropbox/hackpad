//
//  HPCoreDataStack.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPCoreDataStack.h"

#import <UIKit/UIKit.h>

#import "HackpadAdditions.h"
#import "HPRollbackDeletedObjectsMergePolicy.h"

#import <TestFlight/TestFlight.h>

static HPCoreDataStack *SharedStateRestorationCoreDataStack;

@interface HPCoreDataStack ()

@property (strong, nonatomic) NSManagedObjectContext *rootContext;
@property (strong, nonatomic) NSManagedObjectContext *workerContext;

@property (strong, readwrite, nonatomic) NSManagedObjectContext *mainContext;
@property (strong, readwrite, nonatomic) NSPersistentStoreCoordinator *persistentStoreCoordinator;
@property (strong, readwrite, nonatomic) NSManagedObjectModel *managedObjectModel;

@end

@implementation HPCoreDataStack

+ (void)setSharedStateRestorationCoreDataStack:(HPCoreDataStack *)coreDataStack
{
    SharedStateRestorationCoreDataStack = coreDataStack;
}

+ (HPCoreDataStack *)sharedStateRestorationCoreDataStack
{
    return SharedStateRestorationCoreDataStack;
}

- (NSString *)storeType
{
    if (_storeType) {
        return _storeType;
    }
    _storeType = NSSQLiteStoreType;
    return _storeType;
}

- (void)saveWithBlock:(void(^)(NSManagedObjectContext *localContext))block
           completion:(void(^)(NSError *error))completion
{
    NSManagedObjectContext *workerContext = self.workerContext;
    [self.workerContext performBlock:^{
        block(workerContext);
        NSError *error;
        if (workerContext.hasChanges) {
            [workerContext hp_saveToStore:&error];
        }
        if (completion) {
            [[NSOperationQueue mainQueue] addOperationWithBlock:^{
                completion(error);
            }];
        }
        [workerContext reset];
    }];
}

#pragma mark - Accessors

- (NSManagedObjectContext *)mainContext
{
    if (!_mainContext) {
        _mainContext = [[NSManagedObjectContext alloc] initWithConcurrencyType:NSMainQueueConcurrencyType];
        _mainContext.mergePolicy = [[HPRollbackDeletedObjectsMergePolicy alloc] initWithMergeType:NSMergeByPropertyObjectTrumpMergePolicyType];
        _mainContext.parentContext = self.rootContext;
        _mainContext.hp_name = @"Main Context";
        [_mainContext hp_setStack:self];
    }
    return _mainContext;
}

- (NSManagedObjectContext *)rootContext
{
    if (!_rootContext) {
        _rootContext = [[NSManagedObjectContext alloc] initWithConcurrencyType:NSPrivateQueueConcurrencyType];
        NSPersistentStoreCoordinator *persistentStoreCoordinator = self.persistentStoreCoordinator;
        [_rootContext performBlockAndWait:^{
            _rootContext.persistentStoreCoordinator = persistentStoreCoordinator;
            _rootContext.hp_name = @"Root Context";
            [_rootContext hp_setStack:self];
        }];
    }
    return _rootContext;
}

- (NSManagedObjectModel *)managedObjectModel
{
    if (!_managedObjectModel) {
        NSURL *modelURL = [[NSBundle bundleForClass:[self class]] URLForResource:@"Hackpad" withExtension:@"momd"];
        _managedObjectModel = [[NSManagedObjectModel alloc] initWithContentsOfURL:modelURL];
    }

    return _managedObjectModel;
}

- (NSPersistentStoreCoordinator *)persistentStoreCoordinator
{
    if (_persistentStoreCoordinator) {
        return _persistentStoreCoordinator;
    }

    NSDictionary *options = @{NSMigratePersistentStoresAutomaticallyOption:@YES,
                              NSInferMappingModelAutomaticallyOption:@YES};
    _persistentStoreCoordinator = [[NSPersistentStoreCoordinator alloc] initWithManagedObjectModel:self.managedObjectModel];

    NSError * __autoreleasing error;
    if (![_persistentStoreCoordinator addPersistentStoreWithType:self.storeType
                                                   configuration:nil
                                                             URL:self.storeURL
                                                         options:options
                                                           error:&error]) {
        TFLog(@"Could not add persisitent store: %@", error);
        abort();
    }
    return _persistentStoreCoordinator;
}

- (NSManagedObjectContext *)workerContext
{
    if (!_workerContext) {
        _workerContext = [[NSManagedObjectContext alloc] initWithConcurrencyType:NSPrivateQueueConcurrencyType];
        _workerContext.hp_name = @"Worker Context";
        _workerContext.parentContext = self.mainContext;
        [_workerContext hp_setStack:self];
    }
    return _workerContext;
}

- (BOOL)isMigrationNeeded
{
    NSError *error;

    // Check if we need to migrate
    NSDictionary *sourceMetadata = [NSPersistentStoreCoordinator metadataForPersistentStoreOfType:self.storeType
                                                                                              URL:self.storeURL
                                                                                            error:&error];
    BOOL isMigrationNeeded = NO;

    if (sourceMetadata != nil) {
        NSManagedObjectModel *destinationModel = [self managedObjectModel];
        // Migration is needed if destinationModel is NOT compatible
        isMigrationNeeded = ![destinationModel isConfiguration:nil
                                   compatibleWithStoreMetadata:sourceMetadata];
    }

    return isMigrationNeeded;
}

@end
