//
//  HPSearchResultsController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSearchResultsController.h"

#import <TestFlight/TestFlight.h>

@implementation HPSearchResultsController

- (void)setBaseSearchPredicate:(NSPredicate *)baseSearchPredicate
{
    _baseSearchPredicate = baseSearchPredicate;
    [self fetchSearchTextResults];
}

- (void)setSearchResultsPredicate:(NSPredicate *)searchResultsPredicate
{
    _searchResultsPredicate = searchResultsPredicate;
    [self updatePredicate];
}

- (void)setSearchTextResultsPredicate:(NSPredicate *)searchTextResultsPredicate
{
    _searchTextResultsPredicate = searchTextResultsPredicate;
    [self updatePredicate];
}

- (void)setSearchTextPredicate:(NSPredicate *)searchTextPredicate
{
    _searchTextPredicate = searchTextPredicate;
    [self fetchSearchTextResults];
}

- (void)setSearchText:(NSString *)searchText
             variable:(NSString *)variable
{
    NSMutableArray *predicates = [NSMutableArray array];
    [searchText enumerateSubstringsInRange:NSMakeRange(0, searchText.length)
                                   options:NSStringEnumerationByWords
                                usingBlock:^(NSString *word, NSRange substringRange, NSRange enclosingRange, BOOL *stop)
     {
         NSAssert(word.length, @"Word should not be empty.");
         [predicates addObject:[NSPredicate predicateWithFormat:@"%K CONTAINS[cd] %@", variable, word]];
     }];
    [self setSearchTextPredicate:[NSCompoundPredicate andPredicateWithSubpredicates:predicates]];
}

- (NSPredicate *)resultsPredicate
{
    if (_searchResultsPredicate && _searchTextResultsPredicate) {
        NSArray *subpredicates = @[_searchResultsPredicate,
                                   _searchTextResultsPredicate];
        return [NSCompoundPredicate orPredicateWithSubpredicates:subpredicates];
    } else if (_searchResultsPredicate) {
        return _searchResultsPredicate;
    } else if (_searchTextResultsPredicate) {
        return _searchTextResultsPredicate;
    } else {
        return [NSPredicate predicateWithValue:NO];
    }
}

- (void)updatePredicate
{
    self.fetchRequest.predicate = self.resultsPredicate;
    if ([(id)self.delegate respondsToSelector:@selector(controllerDidChangePredicate:)]) {
        id <HPSearchResultsControllerDelegate> delegate = (id <HPSearchResultsControllerDelegate>)self.delegate;
        [delegate controllerDidChangePredicate:self];
    }
}

- (void)fetchSearchTextResults
{
    if (!self.baseSearchPredicate || !self.searchTextPredicate) {
        return;
    }

    NSManagedObjectContext *managedObjectContext = self.managedObjectContext;
    NSPredicate *basePredicate = self.baseSearchPredicate;
    NSPredicate *textPredicate = self.searchTextPredicate;
    NSString *entityName = self.fetchRequest.entityName;

    double delayInSeconds = 0.400;
    dispatch_time_t popTime = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delayInSeconds * NSEC_PER_SEC));
    dispatch_after(popTime, dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_LOW, 0), ^{
        BOOL __block changed;
        [managedObjectContext performBlockAndWait:^{
            changed = self.baseSearchPredicate != basePredicate || self.searchTextPredicate != textPredicate;
        }];
        if (changed) {
            return;
        }
        NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:entityName];
        NSArray *subpredicates = @[basePredicate, textPredicate];
        fetch.predicate = [NSCompoundPredicate andPredicateWithSubpredicates:subpredicates];
        fetch.resultType = NSManagedObjectIDResultType;

        NSManagedObjectContext *worker = [[NSManagedObjectContext alloc] initWithConcurrencyType:NSPrivateQueueConcurrencyType];
        worker.persistentStoreCoordinator = self.managedObjectContext.persistentStoreCoordinator;
        [worker performBlock:^{
            NSError * __autoreleasing error;
            NSDate *date = [NSDate date];
            NSArray *results = [worker executeFetchRequest:fetch
                                                     error:&error];
            TFLog(@"Search took %.3f seconds.", -date.timeIntervalSinceNow);
            NSPredicate *searchTextResultsPredicate;
            if (results.count) {
                searchTextResultsPredicate = [NSPredicate predicateWithFormat:@"SELF IN %@", results];
            } else if (error) {
                TFLog(@"Could not perform text search: %@", error);
            }
            [managedObjectContext performBlock:^{
                if (self.baseSearchPredicate == basePredicate &&
                    self.searchTextPredicate == textPredicate) {
                    self.searchTextResultsPredicate = searchTextResultsPredicate;
                }
            }];
        }];
    });
}

@end
