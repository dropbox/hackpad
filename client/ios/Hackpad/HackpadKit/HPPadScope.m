//
//  HPPadScope.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadScope.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadAdditions.h"

#import <TestFlight/TestFlight.h>

NSString * const HPPadScopeDidChangeNotification = @"HPPadScopeDidChangeNotification";

@interface HPPadScope () <NSFetchedResultsControllerDelegate>

@property (strong, nonatomic) NSFetchedResultsController *fetchedResultsController;

@end

@implementation HPPadScope

- (id)initWithCoreDataStack:(HPCoreDataStack *)coreDataStack
{
    self = [super init];
    if (self) {
        _coreDataStack = coreDataStack;
        NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
        fetch.fetchLimit = 1;
        fetch.shouldRefreshRefetchedObjects = YES;
        fetch.predicate = [NSPredicate predicateWithValue:NO];
        fetch.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"rootURL"
                                                                ascending:YES]];
        NSManagedObjectContext *managedObjectContext = coreDataStack.mainContext;
        _fetchedResultsController = [[NSFetchedResultsController alloc] initWithFetchRequest:fetch
                                                                       managedObjectContext:managedObjectContext
                                                                         sectionNameKeyPath:nil
                                                                                  cacheName:nil];
        _fetchedResultsController.delegate = self;
        [self updateFetchedResultsController];
    }
    return self;
}

- (void)dealloc
{
    _fetchedResultsController.delegate = nil;
}

- (void)updateFetchedResultsController
{
    if (_space) {
        self.fetchedResultsController.fetchRequest.predicate = [NSPredicate predicateWithFormat:@"rootURL = %@",
                                                                _space.rootURL];
    } else {
        self.fetchedResultsController.fetchRequest.predicate = [NSPredicate predicateWithValue:NO];
    }
    NSError *error;
    if (![self.fetchedResultsController performFetch:&error]) {
        TFLog(@"[PadScope] Could not perform space fetch: %@", error);
    }
    [[NSNotificationCenter defaultCenter] postNotificationName:HPPadScopeDidChangeNotification
                                                        object:self];
}

- (void)setSpace:(HPSpace *)space
{
    _collection = nil;
    if (space && space.managedObjectContext != self.fetchedResultsController.managedObjectContext) {
        NSParameterAssert(space.managedObjectContext.concurrencyType == NSMainQueueConcurrencyType);
        NSError * __autoreleasing error;
        if (space.objectID.isTemporaryID &&
            ![space.managedObjectContext obtainPermanentIDsForObjects:@[space]
                                                                error:&error]) {
            TFLog(@"[%@] Could not obtain permanent ID for %@", space.URL.host, space.objectID);
            return;
        }
        _space = (HPSpace *)[self.fetchedResultsController.managedObjectContext existingObjectWithID:space.objectID
                                                                                          error:&error];
        if (error) {
            TFLog(@"[%@] Could not fetch space: %@", space.URL.host, space.objectID);
        }
    } else {
        _space = space;
    }
    [self updateFetchedResultsController];
}

- (void)setCollection:(HPCollection *)collection
{
    if (collection && collection.managedObjectContext != self.fetchedResultsController.managedObjectContext) {
        NSParameterAssert(collection.managedObjectContext.concurrencyType == NSMainQueueConcurrencyType);
        NSError * __autoreleasing error;
        if (collection.objectID.isTemporaryID &&
            ![collection.managedObjectContext obtainPermanentIDsForObjects:@[collection]
                                                                     error:&error]) {
            TFLog(@"[%@] Could not obtain permanent ID for %@",
                  collection.space.URL.host, collection.space.objectID);
            return;
        }
        _collection = (HPCollection *)[self.fetchedResultsController.managedObjectContext existingObjectWithID:collection.objectID
                                                                                                    error:&error];
        if (error) {
            TFLog(@"[%@] Could not fetch collection: %@", collection.space.URL.host, collection.objectID);
        }
    } else {
        _collection = collection;
    }
    _space = _collection.space;
    [self updateFetchedResultsController];
}

#pragma mark - Fetched results controller delegate

- (void)controllerDidChangeContent:(NSFetchedResultsController *)controller
{
    if (self.fetchedResultsController.fetchedObjects.count) {
        if (self.fetchedResultsController.fetchedObjects[0] != self.space) {
            self.space = self.fetchedResultsController.fetchedObjects[0];
        }
    } else {
        // If there's no space, there's no space.
        self.space = [HPSpace spaceWithURL:[NSURL hp_sharedHackpadURL]
                    inManagedObjectContext:self.fetchedResultsController.managedObjectContext
                                     error:NULL];
    }
}

@end
