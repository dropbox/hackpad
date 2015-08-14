//
//  HPImportJSONTests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HackpadTestingKit.h>
#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>

static NSString * const PadIDKey = @"localPadId";
static NSString * const TitleKey = @"title";
static NSString * const CreatedDateKey = @"createdDate";
static NSString * const LastEditedDate = @"lastEditedDate";
static NSString * const CollectionIDKey = @"groupId";
static NSString * const PadsKey = @"pads";
static NSString * const SiteNameKey = @"siteName";
static NSString * const URLKey = @"url";

static NSString * const FirstPadID = @"1";
static NSString * const FirstPadTitle = @"A single pad";
static NSString * const FirstCollectionID = @"1";
static NSString * const FirstCollectionTitle = @"A Lone Collection";
static NSString * const DefaultSpaceName = @"hackpad";
static NSString * const DefaultSpaceURL = @"https://hackpad.com";
static NSString * const InvalidPadID = @"invalid pad id";
static NSString * const TestSpaceName = @"Test Site";
static NSString * const TestSpaceURL = @"https://test.hackpad.com";

static NSUInteger MultipleBatchListSize = 200;
static NSUInteger LargePadListSize = 5000;
static NSUInteger LargeCollectionListSize = 500;
static NSUInteger LargeCollectionListPadListSize = 100;

@interface HPImportTests : HPCoreDataStackTestCase

@end

@implementation HPImportTests

- (id)singlePadList
{
    return @[@{PadIDKey:FirstPadID,
               TitleKey:FirstPadTitle,
               CreatedDateKey:@0,
               LastEditedDate:@(NSTimeIntervalSince1970)}];
}

- (id)padListWithCount:(NSUInteger)count
{
    NSMutableArray *JSON = [NSMutableArray arrayWithCapacity:count];
    for (NSUInteger i = 0; i < count; i++) {
        id pad = @{PadIDKey:@(i).stringValue,
                   TitleKey:[NSString stringWithFormat:@"Pad Title %lu", (unsigned long)i],
                   CreatedDateKey:@(i),
                   LastEditedDate:@(i + NSTimeIntervalSince1970)};
        [JSON addObject:pad];
    }
    return JSON;
}

- (id)invalidPadList
{
    return @[@{PadIDKey:InvalidPadID,
               TitleKey:FirstPadTitle,
               CreatedDateKey:@0,
               LastEditedDate:@(NSTimeIntervalSince1970)}];

}

- (id)singleCollectionList
{
    return @[@{CollectionIDKey:FirstCollectionID,
               TitleKey:FirstCollectionTitle,
               PadsKey:self.singlePadList}];
}

- (id)singleSpaceList
{
    return @[@{SiteNameKey:DefaultSpaceName,
               URLKey:DefaultSpaceURL}];
}

- (id)testSpaceList
{
    return @[@{SiteNameKey:DefaultSpaceName,
               URLKey:DefaultSpaceURL},
             @{SiteNameKey:TestSpaceName,
               URLKey:TestSpaceURL}];
}

- (id)largeCollectionList
{
    NSMutableArray *JSON = [NSMutableArray arrayWithCapacity:LargeCollectionListSize];
    for (NSUInteger i = 0; i < LargeCollectionListSize; i++) {
        NSMutableArray *JSONPads = [NSMutableArray arrayWithCapacity:LargeCollectionListPadListSize];
        for (NSUInteger j = 0; j < LargeCollectionListPadListSize; j++) {
            NSUInteger padID = i * LargeCollectionListPadListSize + j;
            id pad = @{PadIDKey:@(padID).stringValue,
                       TitleKey:[NSString stringWithFormat:@"Pad Title %lu", (unsigned long)padID],
                       CreatedDateKey:@(padID),
                       LastEditedDate:@(padID + NSTimeIntervalSince1970)};
            [JSONPads addObject:pad];
        }
        id collection = @{CollectionIDKey:@(i).stringValue,
                          TitleKey:[NSString stringWithFormat:@"Collection Title %lu", (unsigned long)i],
                          PadsKey:JSONPads};
        [JSON addObject:collection];
    }
    return JSON;
}

- (void)synchronizePadsWithJSON:(id)JSON
                          space:(HPSpace *)space
         padSynchronizationMode:(HPPadSynchronizerMode)padSynchronizerMode
{
    NSError *error;
    HPPadSynchronizer *sync = [[HPPadSynchronizer alloc] initWithSpace:space
                                                              padIDKey:PadIDKey
                                                   padSynchronizerMode:padSynchronizerMode];
    NSArray *pads = [sync synchronizeObjects:JSON
                        managedObjectContext:space.managedObjectContext
                                       error:&error];
    STAssertEquals(pads.count, [JSON count], @"Incorrect number of pads");
    STAssertNil(error, @"Import pads failed with error: %@", error);
}

- (void)synchronizePadsWithJSON:(id)JSON
            padSynchronizerMode:(HPPadSynchronizerMode)padSynchronizerMode
{
    [self synchronizePadsWithJSON:JSON
                            space:self.defaultSpace
           padSynchronizationMode:padSynchronizerMode];
}

- (void)createOrUpdateCollectionsWithJSON:(id)JSON
                                  inSpace:(HPSpace *)space
{
    NSError *error;
    HPCollectionSynchronizer *sync;
    sync  = [[HPCollectionSynchronizer alloc] initWithSpace:space];
    NSArray *collections = [sync synchronizeObjects:JSON
                               managedObjectContext:space.managedObjectContext
                                              error:&error];
    STAssertEquals(collections.count, [JSON count], @"Incorrect number of collections");
    STAssertNil(error, @"Import collections failed with error: %@", error);
}

- (void)createOrUpdateCollectionsWithJSON:(id)JSON
{
    [self createOrUpdateCollectionsWithJSON:JSON
                                    inSpace:self.defaultSpace];
}

- (void)createOrUpdateSpacesWithJSON:(id)JSON
              inManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
{
    NSError *error;
    NSArray *spaces = [[HPSpaceSynchronizer new] synchronizeObjects:JSON
                                               managedObjectContext:managedObjectContext
                                                              error:&error];
    STAssertEquals(spaces.count, [JSON count], @"Incorrect number of spaces");
    STAssertNil(error, @"Error creating spaces: %@", error);
}

- (void)test_0001_SinglePad
{
    [self synchronizePadsWithJSON:self.singlePadList
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");

    HPPad *pad = [self.defaultSpace.pads anyObject];
    STAssertNotNil(pad, @"nil pad in space");

    STAssertEqualObjects(pad.padID, FirstPadID, @"Pad ID mismatch.");
    STAssertEqualObjects(pad.title, FirstPadTitle, @"Pad title mismatch.");
}

- (void)test_0002_BigPadList
{
    [self synchronizePadsWithJSON:[self padListWithCount:LargePadListSize]
                 padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    STAssertEquals(self.defaultSpace.pads.count, LargePadListSize,
                   @"Incorrect number of pads created.");
}

- (void)test_0003_BigPadList10
{
    id JSON = [self padListWithCount:LargePadListSize];
    for (NSUInteger i = 0; i < 10; i++) {
        [self synchronizePadsWithJSON:JSON
                      padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    }
}

- (void)test_0004_SingleCollection
{
    [self createOrUpdateCollectionsWithJSON:self.singleCollectionList];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");
    STAssertEquals(self.defaultSpace.collections.count, 1u,
                   @"Incorrect number of collections created.");
    STAssertEquals([self.defaultSpace.collections.anyObject pads].count, 1u,
                   @"Incorrect number of pads in collection.");

    HPCollection *collection = self.defaultSpace.collections.anyObject;
    STAssertNotNil(collection, @"nil collection in space");

    STAssertEqualObjects(collection.collectionID, FirstCollectionID,
                         @"Collection ID mismatch");
    STAssertEqualObjects(collection.title, FirstCollectionTitle,
                         @"Collection title mismatch");
}

- (void)test_0005_BigCollectionList
{
    [self createOrUpdateCollectionsWithJSON:self.largeCollectionList];

    STAssertEquals(self.defaultSpace.collections.count, LargeCollectionListSize,
                   @"Incorrect number of collections created");
    STAssertEquals(self.defaultSpace.pads.count, LargeCollectionListSize * LargeCollectionListPadListSize,
                   @"Incorrect number of pads created");
}

- (void)test_0006_BigCollectionList10
{
    id JSON = self.largeCollectionList;
    for (NSUInteger i = 0; i < 10; i++) {
        [self createOrUpdateCollectionsWithJSON:JSON];
    }
}

- (void)test_0007_BigPadListUpdate
{
    id JSON = [self padListWithCount:LargePadListSize];
    [self synchronizePadsWithJSON:JSON
                  padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    [self.coreDataStack.mainContext hp_saveToStore:nil];
    [self.coreDataStack.mainContext.parentContext hp_saveToStore:nil];
    [self resetStack];
    [self synchronizePadsWithJSON:JSON
                  padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
}

#if 0
/*
 * Change the default space's name in both contexts, saving in the worker
 * context first.
 */
- (void)testSimulataneousEdit
{
    NSError * __block error;
    HPSpace * __block space;

    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
    }];

    self.defaultSpace.name = @"New name from the main thread.";

    [moc performBlockAndWait:^{
        space.name = @"New name from the import thread.";
        [self saveWithManagedObjectContext:moc];
    }];

    [self save];
    STAssertEqualObjects(self.defaultSpace.name, @"New name from the main thread.",
                         @"Main thread didn't overwrite worker");
}

/*
 * Change the default space's name in the worker after deleting it in main.
 */
- (void)testEditAfterDelete
{
    NSError * __block error;
    HPSpace * __block space;

    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
        // Make sure object is faulted in.
        [space willAccessValueForKey:nil];
    }];

    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;

    [self save];

    [moc performBlockAndWait:^{
        space.name = @"New name from the import thread.";
        [self saveWithManagedObjectContext:moc];
        STAssertNil(space.managedObjectContext, @"Deleted object has a context.");
    }];
}

/*
 * This simulates loading a pad list after having signed out from that space.
 */
- (void)testSignOutBeforeParsingPadList
{
    NSError * __block error;
    HPSpace * __block space;

    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
    }];

    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;

    [self save];

    [moc performBlockAndWait:^{
        STAssertThrowsSpecificNamed([HPPad synchronizePadsWithJSON:self.singlePadList
                                                              inSpace:space
                                                             padIDKey:PadIDKey
                                                               follow:NO
                                                                error:&error],
                                    NSException, @"NSObjectInaccessibleException",
                                    @"This space should have been a fault that CoreData could not fulfill.");
    }];
}

/*
 * This simulates loading a pad list after having signed out from that space.
 */
- (void)testSignOutAfterParsingPadList
{
    NSError * __block error;
    HPSpace * __block space;

    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);

        HPPad *pad = [NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                                   inManagedObjectContext:moc];
        pad.padID = FirstPadID;
        pad.title = FirstPadTitle;
        pad.space = space;
    }];

    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;

    [self save];

    [moc performBlockAndWait:^{
        // Merge policy will delete new space + pads.
        [self saveWithManagedObjectContext:moc];
        STAssertNil(space.managedObjectContext, @"Space wasn't deleted.");
    }];
}

/*
 * This simulates loading a pad list after having signed out from that space.
 */
- (void)testSignOutBeforeParsingPadListNotFaulted
{
    NSError * __block error;
    HPSpace * __block space;

    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
        // Fault-in the space first, this time.
        [space willAccessValueForKey:nil];
    }];

    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;

    [self save];

    [moc performBlockAndWait:^{
        [HPPad synchronizePadsWithJSON:self.singlePadList
                                  inSpace:space
                                 padIDKey:PadIDKey
                                   follow:NO
                                    error:&error];
        // Merge policy will delete new space + pads.
        [self saveWithManagedObjectContext:moc];
        STAssertNil(space.managedObjectContext, @"Space wasn't deleted.");
    }];
}

- (void)testDuplicateSpace
{
    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    HPSpace *space = [NSEntityDescription insertNewObjectForEntityForName:HPSpaceEntity
                                          inManagedObjectContext:self.managedObjectContext];
    space.subdomain = self.defaultSpace.subdomain;
    space.name = @"Duplicate";

    NSError *error = [self saveFailsWithDomain:HPHackpadErrorDomain
                                          code:HPDuplicateEntityError];
    STAssertTrue([HPSpace hp_resolveValidationByDeletingDuplicatesWithError:&error],
                 @"Could not resolve validation error by deleting duplicates");
    STAssertNil(error, @"Error left over from deleting duplicates: %@", error);
    [self save];
}

- (void)testDuplicateCollection
{
    [self createOrUpdateCollectionsWithJSON:self.singleCollectionList];

    HPCollection *orig = self.defaultSpace.collections.anyObject;
    HPCollection *collection = (HPCollection *)[NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Duplicate";
    collection.collectionID = orig.collectionID;
    collection.space = self.defaultSpace;

    NSError *error = [self saveFailsWithDomain:HPHackpadErrorDomain
                                          code:HPDuplicateEntityError];
    STAssertTrue([HPCollection resolveValidationByMovingPadsToStoreCollectionsWithError:&error],
                 @"Could not resolve validation error by deleting duplicates");
    STAssertNil(error, @"Error left over from deleting duplicates: %@", error);
    [self save];
}

- (void)testDuplicatePad
{
    [self synchronizePadsWithJSON:self.singlePadList];

    HPPad *orig = self.defaultSpace.pads.anyObject;
    HPPad *pad = (HPPad *)[NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                                        inManagedObjectContext:self.managedObjectContext];

    pad.title = @"Duplicate";
    pad.padID = orig.padID;
    pad.space = self.defaultSpace;

    NSError *error = [self saveFailsWithDomain:HPHackpadErrorDomain
                                          code:HPDuplicateEntityError];
    STAssertTrue([HPPad hp_resolveValidationByDeletingDuplicatesWithError:&error],
                 @"Could not resolve validation error by deleting duplicates");
    STAssertNil(error, @"Error left over from deleting duplicates: %@", error);
    [self save];
}

- (void)testImportDuplicateSpace
{
    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        [self createOrUpdateSpacesWithJSON:self.testSpaceList
                    inManagedObjectContext:moc];
    }];

    [self createOrUpdateSpacesWithJSON:self.testSpaceList
                inManagedObjectContext:self.managedObjectContext];
    [self save];

    [moc performBlockAndWait:^{
        NSError *error = [self saveFailsWithManagedObjectContext:moc
                                                          domain:NSCocoaErrorDomain
                                                            code:NSValidationMultipleErrorsError];
        STAssertTrue([HPSpace hp_resolveValidationByDeletingDuplicatesWithError:&error],
                     @"Could not remove duplicates.");
        STAssertNil(error, @"Could not resolve all errors: %@", error);
        [self saveWithManagedObjectContext:moc];
    }];
}

- (void)testImportDuplicateCollection
{
    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        NSError *error;
        HPSpace *space = [HPSpace spaceWithSubdomain:@""
                              inManagedObjectContext:moc
                                               error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
        HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                                 inManagedObjectContext:moc];
        collection.collectionID = FirstCollectionID;
        collection.title = FirstCollectionTitle;
        collection.space = space;
    }];

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.collectionID = FirstCollectionID;
    collection.title = FirstCollectionTitle;
    collection.space = self.defaultSpace;
    [self save];

    [moc performBlockAndWait:^{
        NSError *error = [self saveFailsWithManagedObjectContext:moc
                                                          domain:HPHackpadErrorDomain
                                                            code:HPDuplicateEntityError];
        if (error) {
            // These NSParamaterAssert(*error), but the above will fail if this returns nil.
            STAssertTrue([HPCollection resolveValidationByMovingPadsToStoreCollectionsWithError:&error],
                         @"Could not remove duplicate collections");
            STAssertNil(error, @"Could not resolve validation errors: %@", error);
        }
        [self saveWithManagedObjectContext:moc];
    }];
}

- (void)testImportDuplicatePad
{
    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    HPSpace * __block space;
    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        NSError *error;
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
        HPPad *pad = [NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                                   inManagedObjectContext:moc];
        pad.padID = FirstPadID;
        pad.title = FirstPadTitle;
        pad.space = space;
    }];

    HPPad *pad = [NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                               inManagedObjectContext:self.managedObjectContext];
    pad.padID = FirstPadID;
    pad.title = FirstPadTitle;
    pad.space = self.defaultSpace;
    [self save];

    [moc performBlockAndWait:^{
        NSError *saveError = [self saveFailsWithManagedObjectContext:moc
                                                              domain:HPHackpadErrorDomain
                                                                code:HPDuplicateEntityError];
        HPPad *pad = saveError.userInfo[NSValidationObjectErrorKey];
        NSError *error;
        HPPad *newPad = [HPPad padWithID:pad.padID
                                 inSpace:space
                                   error:&error];
        STAssertNotNil(newPad, @"Could not find conflicting pad");
        STAssertNil(error, @"Error finding conflicting pad: %@", error);
        STAssertTrue([HPPad hp_resolveValidationByDeletingDuplicatesWithError:&saveError],
                     @"Could not remove duplicates.");
        STAssertNil(saveError, @"Could not resolve all errors: %@", saveError);
        [self saveWithManagedObjectContext:moc];
    }];
}

- (void)testSimultaneousPadCreate
{
    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    HPSpace * __block space;
    NSManagedObjectContext *moc = [self.coreDataStack newWorkerManagedObjectContextWithName:@"Test Context"];
    [moc performBlockAndWait:^{
        NSError *error;
        moc.mergePolicy = NSMergeByPropertyStoreTrumpMergePolicy;
        space = [HPSpace spaceWithSubdomain:@""
                     inManagedObjectContext:moc
                                      error:&error];
        STAssertNotNil(space, @"Failed to find space: %@", error);
        STAssertNil(error, @"Failed to find space: %@", error);
        STAssertEquals(space.pads.count, 0u, @"No pads yet");
    }];

    NSError *error;
    HPPad *pad = [HPPad padWithID:@"0"
                          inSpace:self.defaultSpace
                            error:&error];
    STAssertNotNil(pad, @"Could not create new pad");
    STAssertNil(error, @"Error creating pad: %@", error);
    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Default space should see its pad");

    [moc performBlockAndWait:^{
        NSError *error;
        HPPad *pad = [HPPad padWithID:@"2"
                              inSpace:space
                                error:&error];
        STAssertNotNil(pad, @"Could not create new pad");
        STAssertNil(error, @"Error creating pad: %@", error);
        STAssertEquals(space.pads.count, 1u,
                       @"Space shouldn't see the other pad (yet)");
    }];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Default space shouldn't see the other pad (yet)");
    [self.managedObjectContext refreshObject:self.defaultSpace
                                              mergeChanges:YES];
    STAssertEquals(self.defaultSpace.pads.count, 2u, @"Didn't refresh space");
}

- (void)testRemovePadFromCollection
{
    STAssertNotNil(self.defaultSpace, @"Could not create default space");
    [self save];

    [self createOrUpdateCollectionsWithJSON:self.singleCollectionList];
    [self save];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");
    STAssertEquals(self.defaultSpace.collections.count, 1u,
                   @"Incorrect number of collections created.");
    STAssertEquals([self.defaultSpace.collections.anyObject pads].count, 1u,
                   @"Incorrect number of pads in collection.");

    [self createOrUpdateCollectionsWithJSON:@[@{CollectionIDKey:FirstCollectionID,
                                                TitleKey:FirstCollectionTitle,
                                                PadsKey:@[]}]];
    [self save];

    NSError * __autoreleasing error;
    STAssertTrue([HPSpace removeNonfollowedPadsInManagedObjectContext:self.managedObjectContext
                                                                error:&error],
                 @"Could not prune pads: %@", error);
    STAssertEquals(self.defaultSpace.pads.count, 0u,
                   @"Incorrect number of pads created.");
    STAssertEquals(self.defaultSpace.collections.count, 1u,
                   @"Incorrect number of collections created.");
    STAssertEquals([self.defaultSpace.collections.anyObject pads].count, 0u,
                   @"Incorrect number of pads in collection.");
}
#endif

- (void)testInvalidPadID
{
    NSError *error;
    HPPadSynchronizer *sync = [[HPPadSynchronizer alloc] initWithSpace:self.defaultSpace
                                                              padIDKey:PadIDKey
                                                   padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    NSArray *pads = [sync synchronizeObjects:[self invalidPadList]
                        managedObjectContext:self.managedObjectContext
                                       error:&error];
    STAssertEquals(pads.count, 0u, @"Incorrect number of pads");
    STAssertNil(error, @"Import pads failed with error: %@", error);
}

- (void)testUpdatedPad
{
    static NSString * const UpdatedTitle = @"A New Title";
    NSArray *pads = self.singlePadList;

    [self synchronizePadsWithJSON:pads
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    NSMutableDictionary *updatedPad = [pads[0] mutableCopy];
    updatedPad[TitleKey] = UpdatedTitle;

    [self synchronizePadsWithJSON:@[updatedPad]
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");
    STAssertEqualObjects([self.defaultSpace.pads.anyObject title],
                         UpdatedTitle, @"Pad title mismatch.");
}

- (void)testUnfollowPad
{
    [self synchronizePadsWithJSON:self.singlePadList
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");

    [self synchronizePadsWithJSON:@[]
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");
    STAssertFalse([self.defaultSpace.pads.anyObject followed],
                  @"Pad is still followed.");
}

- (void)testRefollowPad
{
    [self synchronizePadsWithJSON:self.singlePadList
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    [self synchronizePadsWithJSON:@[]
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    [self synchronizePadsWithJSON:self.singlePadList
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");
    STAssertTrue([self.defaultSpace.pads.anyObject followed],
                 @"Pad is not followed.");
}

- (void)testRefresh
{
    [self synchronizePadsWithJSON:self.singlePadList
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    [self synchronizePadsWithJSON:self.singlePadList
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];

    STAssertEquals(self.defaultSpace.pads.count, 1u,
                   @"Incorrect number of pads created.");
    STAssertTrue([self.defaultSpace.pads.anyObject followed],
                 @"Pad is not followed.");
}

- (void)testRefreshMultipleBatches
{
    id JSON = [self padListWithCount:MultipleBatchListSize];
    [self synchronizePadsWithJSON:JSON
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    STAssertEquals(self.defaultSpace.pads.count, MultipleBatchListSize,
                   @"Incorrect number of pads created.");
    [self synchronizePadsWithJSON:JSON
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    STAssertEquals(self.defaultSpace.pads.count, MultipleBatchListSize,
                   @"Incorrect number of pads created.");
}

- (void)testReimportWithUnfollowedPads
{
    HPPad *pad = [NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                               inManagedObjectContext:self.managedObjectContext];
    pad.space = self.defaultSpace;
    pad.padID = @"_unfollowedPad";
    pad.title = @"Unfollowed";
    [self synchronizePadsWithJSON:[self padListWithCount:MultipleBatchListSize]
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    STAssertEquals(self.defaultSpace.pads.count, MultipleBatchListSize + 1, @"Invalid import");
    [self synchronizePadsWithJSON:[self padListWithCount:MultipleBatchListSize]
              padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
    STAssertEquals(self.defaultSpace.pads.count, MultipleBatchListSize + 1, @"Invalid import");
}

@end
