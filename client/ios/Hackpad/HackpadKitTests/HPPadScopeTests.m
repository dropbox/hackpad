//
//  HPPadScopeTests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HackpadTestingKit.h>

#import <HackpadKit/HackpadKit.h>

@interface HPPadScopeTests : HPCoreDataStackTestCase
@property (nonatomic, strong) HPPadScope *padScope;
@end

@implementation HPPadScopeTests

- (void)setUp
{
    [super setUp];
    self.padScope = [[HPPadScope alloc] initWithCoreDataStack:self.coreDataStack];
}

- (void)tearDown
{
    self.padScope = nil;
    [super tearDown];
}

- (void)expectEmptyStore
{
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];
    STAssertNil(self.padScope.space, @"Unexpected space selected");
}

- (void)expectDefaultSpace
{
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];
    STAssertEqualObjects(self.padScope.space.objectID,
                         self.defaultSpace.objectID,
                         @"Unexpected space selected");
}

- (void)test_0001_EmptyStore
{
    [self expectEmptyStore];
}

- (void)test_0002_DefaultSpace
{
    [self defaultSpace];
    [self save];

    self.padScope.space = self.defaultSpace;
    [self save];
    [self expectDefaultSpace];
}

- (void)test_0004_RemoveSpace
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = self.defaultSpace;

    [self.managedObjectContext deleteObject:self.defaultSpace];

    [self save];
    [self expectEmptyStore];
}

- (void)test_0005_ReplaceSpace
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = self.defaultSpace;

    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;
    [self defaultSpace];

    [self save];
    [self expectDefaultSpace];
}

- (void)test_0006_RemoveCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = self.defaultSpace;

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    [self.defaultSpace addCollectionsObject:collection];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.collection = collection;
    [self.managedObjectContext deleteObject:collection];

    [self save];
    [self expectDefaultSpace];
}

- (void)test_0007_RemoveSpaceWithCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = self.defaultSpace;

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    [self.defaultSpace addCollectionsObject:collection];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.collection = collection;
    [self.managedObjectContext deleteObject:self.defaultSpace];
    [self save];
    [self expectEmptyStore];
}

- (void)test_0008_ReplaceSpaceWithCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = self.defaultSpace;

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    [self.defaultSpace addCollectionsObject:collection];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.collection = collection;
    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;
    [self defaultSpace];

    [self save];
    [self expectDefaultSpace];
}

- (void)test_0009_RemoveSecondSpace
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = self.defaultSpace;

    HPSpace *space = [NSEntityDescription insertNewObjectForEntityForName:HPSpaceEntity
                                                   inManagedObjectContext:self.managedObjectContext];
    space.name = @"Test";
    space.hidden = NO;
    space.subdomain = @"test";

    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    self.padScope.space = space;
    [self.managedObjectContext deleteObject:space];

    [self save];
    [self expectDefaultSpace];
}

@end
