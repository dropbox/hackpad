//
//  NSManagedObjectContext+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@class HPCoreDataStack;

@interface NSManagedObjectContext (HackpadAdditions)

@property (nonatomic, strong, setter=hp_setStack:) HPCoreDataStack *hp_stack;
@property (nonatomic, strong, setter=hp_setName:) NSString *hp_name;

- (BOOL)hp_saveToStore:(NSError * __autoreleasing *)error;

@end
