//
//  HPCoreDataStackTestCase.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPCoreDataStackTestCase.h"

#import "HackpadKit/HPCoreDataStack.h"
#import "HackpadKit/HPSpace+Impl.h"

@interface HPCoreDataStackTestCase ()
@property (nonatomic, strong) NSURL *storeDirectory;
@property (nonatomic, strong) NSURL *storeURL;
@end

@implementation HPCoreDataStackTestCase

@synthesize defaultSpace = _defaultSpace;

- (void)resetStack
{
    self.defaultSpace = nil;
    self.managedObjectContext = nil;
    self.coreDataStack = nil;
}

- (NSURL *)storeDirectory
{
    return self.storeURL.URLByDeletingLastPathComponent;
}

- (NSURL *)storeURL
{
    if (_storeURL) {
        return _storeURL;
    }
    NSError *error;
    NSURL *URL = [[NSFileManager defaultManager] URLForDirectory:NSDocumentDirectory
                                                        inDomain:NSUserDomainMask
                                               appropriateForURL:nil
                                                          create:YES
                                                           error:&error];
    STAssertNil(error, @"Failed to get documents URL: %@", error);
    STAssertNotNil(URL, @"Failed to get documents URL: %@", error);

    URL = [[NSFileManager defaultManager] URLForDirectory:NSItemReplacementDirectory
                                                 inDomain:NSUserDomainMask
                                        appropriateForURL:URL
                                                   create:YES
                                                    error:&error];
    STAssertNil(error, @"Failed to get temporary documents URL: %@", error);
    STAssertNotNil(URL, @"Failed to get temporary documents URL: %@", error);

    _storeURL = [URL URLByAppendingPathComponent:@"test.data"];
    return _storeURL;
}

- (HPCoreDataStack *)coreDataStack
{
    if (_coreDataStack) {
        return _coreDataStack;
    }
    _coreDataStack = [HPCoreDataStack new];
    _coreDataStack.storeURL = self.storeURL;
    return _coreDataStack;
}

- (NSManagedObjectContext *)managedObjectContext
{
    if (_managedObjectContext) {
        return _managedObjectContext;
    }
    _managedObjectContext = self.coreDataStack.mainContext;
    return _managedObjectContext;
}

- (void)setUp
{
    [self setUpWithStoreURL:nil];
}

- (void)setUpWithStoreURL:(NSURL *)storeURL
{
    [super setUp];
    STAssertNil(_storeURL, @"storeURL already initialized to: %@", _storeURL);
    STAssertNil(_coreDataStack, @"coreDataStack already initialized.");
    STAssertNil(_defaultSpace, @"defaultSpace already initialized.");

    STAssertNotNil(self.storeURL, @"Could not initialize CoreData store URL.");
    if (storeURL) {
        NSError * __autoreleasing error;
        STAssertTrue([[NSFileManager defaultManager] copyItemAtURL:storeURL
                                                             toURL:self.storeURL
                                                             error:&error],
                     @"Unable to copy store URL");
        STAssertNil(error, @"Error copying store URL: %@", error);
        sync();
        sleep(1);
    }
    STAssertNotNil(self.coreDataStack, @"Could not create CoreData stack in %@.", self.storeDirectory);

    if (self.coreDataStack.isMigrationNeeded) {
        HPLog(@"Not migrating CoreData...");
#if 0
        HPMigrationController *migrationController = [HPMigrationController new];
        MHWMigrationManager *migrationManager = [MHWMigrationManager new];
        migrationManager.delegate = migrationController;

        NSError * __autoreleasing error;
        STAssertTrue([migrationManager progressivelyMigrateURL:self.coreDataStack.storeURL
                                                        ofType:self.coreDataStack.storeType
                                                       toModel:self.coreDataStack.managedObjectModel
                                                         error:&error],
                     @"CoreData migration failed.");
        STAssertNil(error, @"Error migrating CoreData: %@", error);
#endif
    }

    STAssertNotNil(self.managedObjectContext, @"Could not create managed object context");
}

- (void)tearDown
{
    [self resetStack];
    if (self.storeDirectory) {
        NSError *error;
        [[NSFileManager defaultManager] removeItemAtURL:self.storeDirectory
                                                  error:&error];
        STAssertNil(error, @"Could not remove store directory '%@': %@", self.storeDirectory, error);
        self.storeDirectory = nil;
    }
    [super tearDown];
}

- (HPSpace *)defaultSpace
{
    if (_defaultSpace) {
        return _defaultSpace;
    }
    _defaultSpace = [HPSpace spaceWithURL:[NSURL hp_sharedHackpadURL]
                   inManagedObjectContext:self.managedObjectContext
                                    error:nil];
    if (_defaultSpace) {
        return _defaultSpace;
    }
    _defaultSpace = [HPSpace insertSpaceWithURL:[NSURL hp_sharedHackpadURL]
                                           name:nil
                           managedObjectContext:self.managedObjectContext];
    STAssertNotNil(_defaultSpace, @"Could not create default space.");

    return _defaultSpace;
}

- (void)saveWithManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
{
    NSError *error;
    STAssertTrue([managedObjectContext hp_saveToStore:&error],
                 @"[%@] Saving context failed.", managedObjectContext.hp_name);
    STAssertNil(error, @"[%@] Error saving %@: %@",
                    managedObjectContext.hp_name, error);
}

- (void)save
{
    [self saveWithManagedObjectContext:self.managedObjectContext];
}

@end
