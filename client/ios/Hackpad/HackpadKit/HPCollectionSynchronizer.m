//
//  HPCollectionSynchronizer.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPCollectionSynchronizer.h"

#import <HackpadKit/HackpadKit.h>

static NSString * const GroupIdKey = @"groupId";
static NSString * const PadIdKey = @"localPadId";
static NSString * const PadsKey = @"localPadIds";

@interface HPCollectionSynchronizer ()
@property (nonatomic, strong) HPSpace *space;
@property (nonatomic, strong) NSMutableDictionary *padsByID;
@end

@implementation HPCollectionSynchronizer

- (id)initWithSpace:(HPSpace *)space
{
    NSParameterAssert(space);

    if (!(self = [super init])) {
        return nil;
    }
    self.space = space;
    self.padsByID = [NSMutableDictionary dictionary];
    return self;
}

- (void)synchronizer:(HPSynchronizer *)synchronizer
     willSaveObjects:(NSArray *)objects
{
    [objects enumerateObjectsUsingBlock:^(HPPad *pad, NSUInteger idx, BOOL *stop) {
        self.padsByID[pad.padID] = pad;
    }];
}

- (NSFetchRequest *)fetchRequestWithObjects:(NSArray *)JSONCollections
                                      error:(NSError *__autoreleasing *)error
{
    static NSString * const CollectionIDKey = @"collectionID";

    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPCollectionEntity];
    fetchRequest.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:CollectionIDKey
                                                                   ascending:YES]];
    fetchRequest.fetchBatchSize = 64;
    fetchRequest.predicate = [NSPredicate predicateWithFormat:@"space == %@ && collectionID != nil", self.space];
    return fetchRequest;
}

- (NSArray *)objectsSortDescriptors
{
    return @[[NSSortDescriptor sortDescriptorWithKey:GroupIdKey
                                           ascending:YES]];
}

- (NSComparisonResult)compareObject:(NSDictionary *)JSONCollection
                     existingObject:(HPCollection *)collection
{
    if (!collection.collectionID) {
        return NSOrderedAscending;
    }
    if (![JSONCollection isKindOfClass:[NSDictionary class]]) {
        return NSOrderedDescending;
    }
    NSString *collectionID = JSONCollection[GroupIdKey];
    if (![collectionID isKindOfClass:[NSString class]]) {
        return NSOrderedDescending;
    }
    return [collectionID compare:collection.collectionID];
}

- (BOOL)updateExistingObject:(HPCollection *)collection
                      object:(NSDictionary *)JSONCollection
{
    static NSString * const TitleKey = @"title";

    if (![collection.title isEqualToString:JSONCollection[TitleKey]]) {
        collection.title = JSONCollection[TitleKey];
    }
    if (!collection.followed) {
        collection.followed = YES;
    }
    NSArray *JSONPads = JSONCollection[PadsKey];
    NSMutableSet *pads = [NSMutableSet setWithCapacity:JSONPads.count];
    [JSONPads enumerateObjectsUsingBlock:^(NSDictionary *JSONPad, NSUInteger idx, BOOL *stop) {
        if (![JSONPad isKindOfClass:[NSString class]]) {
            return;
        }
        HPPad *pad = self.padsByID[JSONPad];
        if (!pad) {
            return;
        }
        [pads addObject:pad];
    }];
    if (![collection.pads isEqualToSet:pads]) {
        collection.pads = pads;
    }
    if (collection.collectionID) {
        return YES;
    }
    collection.collectionID = JSONCollection[GroupIdKey];
    collection.space = self.space;
    return YES;
}

- (void)existingObjectNotFound:(HPCollection *)existingObject
{
    existingObject.followed = NO;
}

@end
