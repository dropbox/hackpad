//
//  NSManagedObjectContext+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSManagedObjectContext+HackpadAdditions.h"

#import <TestFlight/TestFlight.h>

static NSString *const HPManagedObjectContextNameKey = @"HPManagedObjectContextName";
static NSString * const HPCoreDataStackKey = @"HPCoreDataStackKey";

@implementation NSManagedObjectContext (HackpadAdditions)

- (HPCoreDataStack *)hp_stack
{
    return self.userInfo[HPCoreDataStackKey];
}

- (void)hp_setStack:(HPCoreDataStack *)stack
{
    self.userInfo[HPCoreDataStackKey] = stack;
}

- (NSString *)hp_name
{
    return self.userInfo[HPManagedObjectContextNameKey];
}

- (void)hp_setName:(NSString *)name
{
    self.userInfo[HPManagedObjectContextNameKey] = [name copy];
}

- (BOOL)hp_saveToStore:(NSError * __autoreleasing *)error
{
    UIApplication *app = [UIApplication sharedApplication];
    UIBackgroundTaskIdentifier taskID = [app beginBackgroundTaskWithExpirationHandler:^{
        TFLog(@"Warning: %s failed to complete in time.", __PRETTY_FUNCTION__);
    }];
    if (taskID == UIBackgroundTaskInvalid) {
        TFLog(@"Warning: Background tasks not supported for save.");
    }
    return [self hp_saveToStoreWithTaskID:taskID
                                    error:error];
}

- (BOOL)hp_saveToStoreWithTaskID:(UIBackgroundTaskIdentifier)taskID
                           error:(NSError * __autoreleasing *)error
{
    NSUInteger deletes = self.deletedObjects.count;
    NSSet *insertedObjects = self.insertedObjects;
    NSUInteger inserts = insertedObjects.count;
    NSUInteger updates = self.updatedObjects.count;

    NSError *saveError;
    if (inserts && ![self obtainPermanentIDsForObjects:insertedObjects.allObjects
                                                 error:&saveError]) {
        TFLog(@"[%@] Could not obtain permanent IDs: %@", self.hp_name, saveError);
        if (error) {
            *error = saveError;
        }
        if (taskID != UIBackgroundTaskInvalid) {
            [[UIApplication sharedApplication] endBackgroundTask:taskID];
        }
        return NO;
    }

    NSDate *date = [NSDate new];
    BOOL ret = [self save:&saveError];
    NSTimeInterval delta = -date.timeIntervalSinceNow;
    if (!ret) {
        TFLog(@"[%@] Could not save: %@", self.hp_name, saveError);
        if (error) {
            *error = saveError;
        }
    }
    if (delta > .1) {
        NSUInteger registered = self.registeredObjects.count;
        TFLog(@"[%@] save took %.3fs; %lu inserts, %lu updates, "
              "%lu deletes, %lu registered.", self.hp_name, delta,
              (unsigned long)inserts, (unsigned long)updates,
              (unsigned long)deletes, (unsigned long)registered);
    }
    if (ret && self.parentContext) {
        NSManagedObjectContext *parentContext = self.parentContext;
        [parentContext performBlock:^{
            [parentContext hp_saveToStoreWithTaskID:taskID
                                              error:nil];
        }];
    } else if (taskID != UIBackgroundTaskInvalid) {
        [[UIApplication sharedApplication] endBackgroundTask:taskID];
    }
    return ret;
}

@end
