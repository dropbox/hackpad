//
//  NSManagedObject+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSManagedObject+HackpadAdditions.h"
#import "HackpadAdditions.h"

#import "HPError.h"

//#define DEBUG_COOKIES 1

@implementation NSManagedObject (HackpadAdditions)

- (void)hp_updateProperties:(NSArray *)properties
                     values:(NSDictionary *)values
{
    for (NSString *property in properties) {
        id value = [values objectForKey:property];
        if (value && ![[self valueForKey:property] isEqual:value]) {
            [self setValue:value
                    forKey:property];
        }
    }
}

- (void)hp_performBlock:(void (^)(id, NSError *__autoreleasing *))block
             completion:(void (^)(id, NSError *))handler
{
    NSParameterAssert(!self.objectID.isTemporaryID);

    NSManagedObject * __weak weakSelf = self;
    NSManagedObjectID *objectID = self.objectID;
    NSManagedObjectContext *managedObjectContext = self.managedObjectContext;
    NSError * __block error;
    [managedObjectContext.hp_stack saveWithBlock:^(NSManagedObjectContext *localContext) {
        NSManagedObject *obj = [localContext existingObjectWithID:objectID
                                                            error:&error];
        if (obj) {
            block(obj, &error);
        }
    } completion:^(NSError *saveError) {
        if (!handler) {
            return;
        }
        [managedObjectContext performBlockAndWait:^{
            handler(weakSelf.managedObjectContext ? weakSelf : nil,
                    error ? error : saveError);
        }];
    }];
}

- (void)hp_sendAsynchronousRequest:(NSURLRequest *)request
                             block:(void (^)(id, NSURLResponse *, NSData *, NSError * __autoreleasing *))block
                        completion:(void (^)(id, NSError *))handler;

{
    static NSOperationQueue *operationQueue;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        operationQueue = [[NSOperationQueue alloc] init];
        operationQueue.name = @"NSManagedObject+HackpadAdditions Asynchronous Request Queue";
    });

#if DEBUG_COOKIES
    [request.URL hp_dumpCookies];
#endif

    // If this object is deleted, self.managedObjectContext will be nil. Keep
    // this around so we can make the callbacks.
    NSManagedObjectContext *managedObjectContext = self.managedObjectContext;
    NSManagedObject * __weak weakSelf = self;
#if DEBUG
    NSDate *date = [NSDate date];
#endif
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:operationQueue
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *connectionError)

     {
         HPLog(@"[%@] Request %@ took %.3f seconds", request.URL.host,
               request.URL.hp_fullPath, -date.timeIntervalSinceNow);
#if DEBUG_COOKIES
         HPLog(@"[%@] Headers for %@: %@", request.URL.host,
               request.URL.hp_fullPath,
               [(NSHTTPURLResponse *)response allHeaderFields]);
         [request.URL hp_dumpCookies];
#endif
         [managedObjectContext performBlock:^{
             if (!weakSelf.managedObjectContext) {
                 // Object was deleted.
                 if (handler) {
                     handler(nil, nil);
                 }
                 return;
             }
             [weakSelf hp_performBlock:^(NSManagedObject *obj, NSError *__autoreleasing *error) {
                 if (connectionError && error) {
                     *error = connectionError;
                 }
                 block(obj, response, data, error);
             }
                            completion:handler];
         }];
     }];
}

@end
