//
//  NSManagedObject+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@interface NSManagedObject (HackpadAdditions)

- (void)hp_performBlock:(void (^)(id, NSError * __autoreleasing *))block
             completion:(void (^)(id, NSError *))handler;

- (void)hp_updateProperties:(NSArray *)properties
                     values:(NSDictionary *)values;

- (void)hp_sendAsynchronousRequest:(NSURLRequest *)request
                             block:(void (^)(id, NSURLResponse *, NSData *, NSError * __autoreleasing *))block
                        completion:(void (^)(id, NSError *))handler;

@end
