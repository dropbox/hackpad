//
//  HPPadScopeViewControllerTests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HackpadTestingKit.h>
#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadUIAdditions.h>

#import "HPPadScopeTableViewDataSource.h"

#import <OCMock/OCMock.h>

@interface HPPadScopeTableViewDataSourceTests : HPCoreDataStackTestCase
@property (nonatomic, strong) HPPadScopeTableViewDataSource *dataSource;
@property (nonatomic, strong) id mockDataSource;
@property (nonatomic, strong) id mockTableView;
@end

#define CHECK_OBJECT_ID(obj1) \
[OCMArg checkWithBlock:^BOOL(NSManagedObject *obj2) \
{ \
    HPLog(@"%d %p %@ ?= %p %@", (int)[obj1.objectID isEqual:obj2.objectID], obj1.objectID, obj1.objectID, obj2.objectID, obj2.objectID); \
    return [obj1.objectID isEqual:obj2.objectID]; \
}]

@implementation HPPadScopeTableViewDataSourceTests

- (void)setUp
{
    [super setUp];

    self.dataSource = [[HPPadScopeTableViewDataSource alloc] init];
    self.mockDataSource = [self autoVerifiedPartialMockForObject:self.dataSource];
    self.mockTableView = [self autoVerifiedMockForClass:[UITableView class]];

    self.dataSource.managedObjectContext = self.coreDataStack.mainContext;

    // Initializes the fetched results controller.
    [self.dataSource numberOfSectionsInTableView:self.mockTableView];
}

- (void)tearDown
{
    self.mockDataSource = nil;
    self.dataSource = nil;
    self.mockTableView = nil;

    [super tearDown];
}

- (void)expectEmptyStore
{
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];
    STAssertEquals([self.dataSource numberOfSectionsInTableView:self.mockTableView],
                   0, @"Empty store");
}

- (void)expectDefaultSpace
{
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];
    STAssertEquals([self.dataSource numberOfSectionsInTableView:self.mockTableView],
                   1, @"Default space");
    STAssertEquals([self.dataSource tableView:self.mockTableView
                        numberOfRowsInSection:0],
                   1, @"Default space");
}

- (void)test_0001_EmptyStore
{
    [self expectEmptyStore];
}

- (void)test_0002_DefaultSpace
{
    [self defaultSpace];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                      didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                          atIndexPath:nil
                                                        forChangeType:NSFetchedResultsChangeInsert
                                                         newIndexPath:[NSIndexPath indexPathForRow:0
                                                                                         inSection:0]];

    [self save];
    [self expectDefaultSpace];
}

- (void)test_0003_DefaultSpaceWithCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];


    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    collection.space = self.defaultSpace;

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                              atIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]
                                                            forChangeType:NSFetchedResultsChangeUpdate
                                                             newIndexPath:nil];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(collection)
                                                              atIndexPath:nil
                                                            forChangeType:NSFetchedResultsChangeInsert
                                                             newIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    STAssertEquals([self.dataSource numberOfSectionsInTableView:self.mockTableView],
                   1, @"Default space");
    STAssertEquals([self.dataSource tableView:self.mockTableView
                               numberOfRowsInSection:0],
                   2, @"Default space and test collection");
}

- (void)test_0004_RemoveSpace
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    [self.managedObjectContext deleteObject:self.defaultSpace];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                              atIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]
                                                            forChangeType:NSFetchedResultsChangeDelete
                                                             newIndexPath:nil];
    [self save];
    [self expectEmptyStore];
}

- (void)test_0005_ReplaceSpace
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    NSManagedObjectID *oldSpace = self.defaultSpace.objectID;
    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;
    [self defaultSpace];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:[OCMArg checkWithBlock:^BOOL(id obj)
                                                                           {
                                                                               return [oldSpace isEqual:[obj objectID]];
                                                                           }]
                                                              atIndexPath:[OCMArg any]
                                                            forChangeType:NSFetchedResultsChangeDelete
                                                             newIndexPath:nil];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                              atIndexPath:nil
                                                            forChangeType:NSFetchedResultsChangeInsert
                                                             newIndexPath:[OCMArg any]];

    [self save];
    [self expectDefaultSpace];
}

- (void)test_0006_RemoveCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    [self.defaultSpace addCollectionsObject:collection];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    NSManagedObjectID *collectionID = collection.objectID;
    [self.managedObjectContext deleteObject:collection];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                              atIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]
                                                            forChangeType:NSFetchedResultsChangeUpdate
                                                             newIndexPath:nil];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:[OCMArg checkWithBlock:^BOOL(id obj)
                                                                           {
                                                                               return [collectionID isEqual:[obj objectID]];
                                                                           }]
                                                              atIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]
                                                            forChangeType:NSFetchedResultsChangeDelete
                                                             newIndexPath:nil];
    [self save];
    [self expectDefaultSpace];
}

- (void)test_0007_RemoveSpaceWithCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    [self.defaultSpace addCollectionsObject:collection];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    [self.managedObjectContext deleteObject:self.defaultSpace];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                              atIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]
                                                            forChangeType:NSFetchedResultsChangeDelete
                                                             newIndexPath:nil];
    [self save];
    [self expectEmptyStore];
}

- (void)test_0008_ReplaceSpaceWithCollection
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                             inManagedObjectContext:self.managedObjectContext];
    collection.title = @"Test Collection";
    collection.followed = YES;
    collection.collectionID = @"1";
    [self.defaultSpace addCollectionsObject:collection];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];


    NSManagedObjectID *oldSpace = self.defaultSpace.objectID;
    [self.managedObjectContext deleteObject:self.defaultSpace];
    self.defaultSpace = nil;
    [self defaultSpace];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(self.defaultSpace)
                                                              atIndexPath:nil
                                                            forChangeType:NSFetchedResultsChangeInsert
                                                             newIndexPath:[NSIndexPath indexPathForRow:0
                                                                                             inSection:0]];
    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:[OCMArg checkWithBlock:^BOOL(id obj)
                                                                           {
                                                                               return [oldSpace isEqual:[obj objectID]];
                                                                           }]
                                                              atIndexPath:[OCMArg any]
                                                            forChangeType:NSFetchedResultsChangeDelete
                                                             newIndexPath:nil];
    [self save];
    [self expectDefaultSpace];
}

- (void)test_0009_RemoveSecondSpace
{
    [self defaultSpace];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    HPSpace *space = [NSEntityDescription insertNewObjectForEntityForName:HPSpaceEntity
                                                   inManagedObjectContext:self.managedObjectContext];
    space.name = @"Test";
    space.hidden = NO;
    space.subdomain = @"test";

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(space)
                                                              atIndexPath:nil
                                                            forChangeType:NSFetchedResultsChangeInsert
                                                             newIndexPath:[NSIndexPath indexPathForRow:1
                                                                                             inSection:0]];
    [self save];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];

    [self.managedObjectContext deleteObject:space];

    [[[self.mockDataSource expect] andForwardToRealObject] controller:[OCMArg any]
                                                          didChangeObject:CHECK_OBJECT_ID(space)
                                                              atIndexPath:[NSIndexPath indexPathForRow:1
                                                                                             inSection:0]
                                                            forChangeType:NSFetchedResultsChangeDelete
                                                             newIndexPath:nil];
    [self save];
    [self expectDefaultSpace];
}

@end
