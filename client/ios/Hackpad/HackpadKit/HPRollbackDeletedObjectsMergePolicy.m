//
//  HPRollbackDeletedObjectsMergePolicy.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPRollbackDeletedObjectsMergePolicy.h"

@implementation HPRollbackDeletedObjectsMergePolicy

- (BOOL)resolveConflicts:(NSArray *)list
                   error:(NSError *__autoreleasing *)error
{
    BOOL ret = [super resolveConflicts:list
                                 error:error];
    [list enumerateObjectsUsingBlock:^(NSMergeConflict *mergeConflict, NSUInteger idx, BOOL *stop) {
        if (!mergeConflict.newVersionNumber) {
            HPLog(@"Deleting due to merge policy: %@", mergeConflict.sourceObject.objectID);
            [mergeConflict.sourceObject.managedObjectContext deleteObject:mergeConflict.sourceObject];
        }
    }];
    return ret;
}

@end
