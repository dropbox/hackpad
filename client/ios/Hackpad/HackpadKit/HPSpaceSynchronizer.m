//
//  HPSpaceSynchronizer.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPSpaceSynchronizer.h"

#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>

static NSString * const URLKey = @"url";

@implementation HPSpaceSynchronizer

- (NSFetchRequest *)fetchRequestWithObjects:(NSArray *)objects
                                      error:(NSError *__autoreleasing *)error
{
    static NSString * const RootURLKey = @"rootURL";

    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    fetchRequest.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:RootURLKey
                                                                   ascending:YES]];
    fetchRequest.fetchBatchSize = 64;
    fetchRequest.predicate = [NSPredicate predicateWithValue:YES];
    return fetchRequest;
}

- (NSArray *)objectsSortDescriptors
{
    return @[[NSSortDescriptor sortDescriptorWithKey:URLKey
                                           ascending:YES
                                          comparator:^NSComparisonResult(NSString *space1,
                                                                         NSString *space2)
              {
                  if (![space1 isKindOfClass:[NSString class]]) {
                      return NSOrderedDescending;
                  } else if (![space2 isKindOfClass:[NSString class]]) {
                      return NSOrderedAscending;
                  }
                  return [space1 compare:space2];
              }]];
}

- (NSComparisonResult)compareObject:(NSDictionary *)JSONSpace
                     existingObject:(HPSpace *)space
{
    if (!space.rootURL) {
        return NSOrderedAscending;
    }
    if (![JSONSpace isKindOfClass:[NSDictionary class]]) {
        return NSOrderedDescending;
    }
    NSString *URLString = JSONSpace[URLKey];
    if (![URLString isKindOfClass:[NSString class]]) {
        return NSOrderedDescending;
    }
    return [URLString compare:space.rootURL];
}

- (BOOL)updateExistingObject:(HPSpace *)space
                      object:(NSDictionary *)JSONSpace
{
    static NSString * const SiteNameKey = @"siteName";

    if (![JSONSpace isKindOfClass:[NSDictionary class]]) {
        return NO;
    }
    if ([JSONSpace[SiteNameKey] isKindOfClass:[NSString class]] &&
        ![space.name isEqualToString:JSONSpace[SiteNameKey]]) {
        space.name = JSONSpace[SiteNameKey];
    }
    if (space.rootURL) {
        return YES;
    }
    space.rootURL = JSONSpace[URLKey];
    return YES;
}

- (void)existingObjectNotFound:(HPSpace *)space
{
    // noop
}

@end
