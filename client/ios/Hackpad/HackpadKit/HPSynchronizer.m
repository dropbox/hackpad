//
//  HPSynchronizer.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPSynchronizer.h"

#import <TestFlight/TestFlight.h>

@implementation HPSynchronizer

#pragma mark - algorithm implementation

- (void)noop
{
}

- (void)syncBarrier
{
    // We want to avoid going through the main thread while it's busy scrolling,
    // AKA in UITrackingRunLoopMode. This call waits until that's done.
    [self performSelectorOnMainThread:@selector(noop)
                           withObject:nil
                        waitUntilDone:YES
                                modes:@[NSDefaultRunLoopMode]];
}

- (NSEnumerator *)enumeratorWithFetchRequest:(NSFetchRequest *)fetchRequest
                        managedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                        stop:(BOOL *)stop
                                       error:(NSError * __autoreleasing *)error
{
    [self syncBarrier];
    NSArray *existingObjects = [managedObjectContext executeFetchRequest:fetchRequest
                                                                   error:error];
    if (!existingObjects) {
        return nil;
    }
    fetchRequest.fetchOffset += existingObjects.count;
    if (existingObjects.count < fetchRequest.fetchLimit) {
        *stop = YES;
    }
    return existingObjects.objectEnumerator;
}

- (BOOL)saveBatch:(NSMutableArray *)batch
managedObjectContext:(NSManagedObjectContext *)managedObjectContext
            error:(NSError *__autoreleasing *)error
{
    if (batch.count && [self.delegate respondsToSelector:@selector(synchronizer:willSaveObjects:)]) {
        [self.delegate synchronizer:self
                    willSaveObjects:batch];
    }
    if (managedObjectContext.hasChanges) {
        [self syncBarrier];
        if (![managedObjectContext hp_saveToStore:error]) {
            return NO;
        }
    }
    // Turn objects into faults to reduce memory usage.
    [batch enumerateObjectsUsingBlock:^(NSManagedObject *managedObject,
                                        NSUInteger idx, BOOL *stop) {
        [managedObjectContext refreshObject:managedObject
                               mergeChanges:NO];
    }];
    return YES;
}

- (NSArray *)synchronizeObjects:(NSArray *)objects
           managedObjectContext:(NSManagedObjectContext *)managedObjectContext
                          error:(NSError *__autoreleasing *)error
{
    NSFetchRequest *fetchRequest = [self fetchRequestWithObjects:objects
                                                           error:error];
    if (!fetchRequest) {
        return nil;
    }

    NSMutableArray * __block ret = [NSMutableArray arrayWithCapacity:objects.count];
    NSMutableArray *batch = [NSMutableArray arrayWithCapacity:fetchRequest.fetchBatchSize];

    NSEnumerator * __block existingEnumerator;
    BOOL __block fetchingComplete = NO;

    id (^getNextExistingObject)(void) = ^{
        id nextObject = existingEnumerator.nextObject;
        if (nextObject || fetchingComplete) {
            return nextObject;
        }
        /*
         * Fetch offset is ignored if context has saved data?
         * http://stackoverflow.com/questions/10725252/possible-issue-with-fetchlimit-and-fetchoffset-in-a-core-data-query
         *
         * This workaround doesn't work, since we go in batches and eventually
         * our pending changes become nonpending:
         * http://stackoverflow.com/questions/16422961/nsfetchrequest-fetchoffset-broke-after-setting-nsmanagedobjects-property
         */
        if (managedObjectContext.hasChanges && ![self saveBatch:batch
                                           managedObjectContext:managedObjectContext
                                                          error:error]) {
            ret = nil;
            return nextObject;
        }
        [ret addObjectsFromArray:batch];
        [batch removeAllObjects];
        existingEnumerator = [self enumeratorWithFetchRequest:fetchRequest
                                         managedObjectContext:managedObjectContext
                                                         stop:&fetchingComplete
                                                        error:error];
        if (!existingEnumerator) {
            ret = nil;
            return nextObject;
        }
        return existingEnumerator.nextObject;
    };

    BOOL (^saveBatch)(void) = ^{
        NSUInteger dirty = managedObjectContext.insertedObjects.count +
            managedObjectContext.updatedObjects.count +
            managedObjectContext.deletedObjects.count;
        if (dirty < fetchRequest.fetchBatchSize) {
            return YES;
        }
        BOOL saved = [self saveBatch:batch
                managedObjectContext:managedObjectContext
                               error:error];
        [ret addObjectsFromArray:batch];
        [batch removeAllObjects];
        return saved;
    };

    fetchRequest.fetchOffset = 0;
    fetchRequest.fetchLimit = fetchRequest.fetchBatchSize;
    fetchRequest.returnsObjectsAsFaults = NO;
    fetchRequest.resultType = NSManagedObjectResultType;

    objects = [objects sortedArrayUsingDescriptors:[self objectsSortDescriptors]];

    id __block existingObject = getNextExistingObject();
    [objects enumerateObjectsUsingBlock:^(id object, NSUInteger idx, BOOL *stop) {
        do {
            if (!ret) {
                *stop = YES;
                return;
            }
            if (!saveBatch()) {
                ret = nil;
                *stop = YES;
                return;
            }
            id updatedObject;
            switch ([self compareObject:object
                         existingObject:existingObject]) {
                case NSOrderedAscending:
                    // HPLog(@"...create (%lu)", (unsigned long)idx);
                    updatedObject = [NSEntityDescription insertNewObjectForEntityForName:fetchRequest.entityName
                                                                  inManagedObjectContext:managedObjectContext];
                    ++fetchRequest.fetchOffset;
                    break;

                case NSOrderedSame:
                    // HPLog(@"...update (%lu)", (unsigned long)idx);
                    updatedObject = existingObject;
                    existingObject = getNextExistingObject();
                    break;

                case NSOrderedDescending:
                    // HPLog(@"...delete (%lu)", (unsigned long)idx);
                    [self existingObjectNotFound:existingObject];
                    existingObject = getNextExistingObject();
                    continue;
            }
            if ([self updateExistingObject:updatedObject
                                    object:object]) {
                [batch addObject:updatedObject];
            }
            break;
        } while (existingObject);
    }];
    while (ret && existingObject) {
        // HPLog(@"...delete 2: %@", existingObject);
        [self existingObjectNotFound:existingObject];
        existingObject = getNextExistingObject();
    }
    if (ret && ![self saveBatch:batch
           managedObjectContext:managedObjectContext
                          error:error]) {
        return nil;
    }
    [ret addObjectsFromArray:batch];
    [batch removeAllObjects];
    return ret;
}

@end

@implementation HPSynchronizer (Implementation)

- (NSFetchRequest *)fetchRequestWithObjects:(NSArray *)objects
                                      error:(NSError *__autoreleasing *)error
{
    [self doesNotRecognizeSelector:_cmd];
    return nil;
}

- (NSArray *)objectsSortDescriptors
{
    [self doesNotRecognizeSelector:_cmd];
    return nil;
}

- (NSComparisonResult)compareObject:(id)object
                     existingObject:(id)existingObject
{
    [self doesNotRecognizeSelector:_cmd];
    return NSOrderedSame;
}

- (id)importObject:(id)object
{
    [self doesNotRecognizeSelector:_cmd];
    return nil;
}

- (BOOL)updateExistingObject:(id)existingObject
                      object:(id)object
{
    [self doesNotRecognizeSelector:_cmd];
    return NO;
}

- (void)existingObjectNotFound:(id)existingObject
{
    [self doesNotRecognizeSelector:_cmd];
}

@end
