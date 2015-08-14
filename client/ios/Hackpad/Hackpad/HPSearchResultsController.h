//
//  HPSearchResultsController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@interface HPSearchResultsController : NSFetchedResultsController

@property (strong, nonatomic, readonly) NSPredicate *resultsPredicate;
@property (strong, nonatomic) NSPredicate *baseSearchPredicate;
@property (strong, nonatomic) NSPredicate *searchResultsPredicate;
@property (strong, nonatomic) NSPredicate *searchTextPredicate;
@property (strong, nonatomic) NSPredicate *searchTextResultsPredicate;

- (void)setSearchText:(NSString *)searchText
             variable:(NSString *)variable;

@end

@protocol HPSearchResultsControllerDelegate <NSFetchedResultsControllerDelegate>

- (void)controllerDidChangePredicate:(HPSearchResultsController *)controller;

@end
