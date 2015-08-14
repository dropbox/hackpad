//
//  HPSynchronizer.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@protocol HPSynchronizerDelegate;

@interface HPSynchronizer : NSObject

@property (nonatomic, assign) id<HPSynchronizerDelegate> delegate;

- (NSArray *)synchronizeObjects:(NSArray *)objects
           managedObjectContext:(NSManagedObjectContext *)managedObjectContext
                          error:(NSError * __autoreleasing *)error;

@end

@protocol HPSynchronizerDelegate <NSObject>
@optional

- (void)synchronizer:(HPSynchronizer *)synchronizer
     willSaveObjects:(NSArray *)objects;

@end

@interface HPSynchronizer (Implementation)

- (NSFetchRequest *)fetchRequestWithObjects:(NSArray *)objects
                                      error:(NSError * __autoreleasing *)error;
- (NSArray *)objectsSortDescriptors;
- (NSComparisonResult)compareObject:(id)object
                     existingObject:(id)existingObject;
- (BOOL)updateExistingObject:(id)existingObject
                      object:(id)object;
- (void)existingObjectNotFound:(id)existingObject;

@end
