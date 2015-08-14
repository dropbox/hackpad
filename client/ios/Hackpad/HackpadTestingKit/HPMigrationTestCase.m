//
//  HPMigrationTestCase.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPMigrationTestCase.h"

#import <HackpadKit/HackpadKit.h>

@implementation HPMigrationTestCase

- (void)doTestSpaceMigration
{
    NSError * __autoreleasing error;
    STAssertTrue([HPSpace migrateRootURLsInManagedObjectContext:self.managedObjectContext
                                                          error:&error],
                 @"Could not migrate spaces to rootURL");
    STAssertNil(error, @"Error migrating root URLs: %@", error);
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    fetch.predicate = [NSPredicate predicateWithValue:YES];
    NSArray *spaces = [self.coreDataStack.mainContext executeFetchRequest:fetch
                                                                    error:&error];
    STAssertNotNil(spaces, @"Could not fetch spaces");
    STAssertNil(error, @"Error fetching spaces");
    STAssertTrue(!!(spaces.count > 0), @"No spaces were fetched");
    [spaces enumerateObjectsUsingBlock:^(HPSpace *space, NSUInteger idx, BOOL *stop) {
        STAssertNotNil(space.URL, @"Space doesn't have a URL");
        STAssertFalse(space.domainType < HPToplevelDomainType, @"Invalid domain type");
        STAssertFalse(space.domainType > HPWorkspaceDomainType, @"Invalid domain type");
    }];
}

- (void)doTestCollectionMigration
{
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPCollectionEntity];
    fetch.predicate = [NSPredicate predicateWithValue:YES];
    NSError * __autoreleasing error;
    NSArray *collections = [self.coreDataStack.mainContext executeFetchRequest:fetch
                                                                         error:&error];
    STAssertNotNil(collections, @"Could not fetch collections");
    STAssertNil(error, @"Error fetching collections");
    STAssertTrue(collections.count > 0, @"No collections were fetched");
}

- (void)doTestPadMigration
{
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetch.predicate = [NSPredicate predicateWithValue:YES];
    NSError * __autoreleasing error;
    NSArray *pads = [self.coreDataStack.mainContext executeFetchRequest:fetch
                                                                         error:&error];
    STAssertNotNil(pads, @"Could not fetch pads");
    STAssertNil(error, @"Error fetching pads");
    STAssertTrue(pads.count > 0, @"No pads were fetched");
}

@end
