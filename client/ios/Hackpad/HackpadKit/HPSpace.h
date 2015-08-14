//
//  HPSpace.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPCollection, HPPad;

@interface HPSpace : NSManagedObject

@property (nonatomic) BOOL hidden;
@property (nonatomic, retain) NSString * name;
@property (nonatomic) BOOL public;
@property (nonatomic, retain) NSString * rootURL;
@property (nonatomic) int32_t signInMethods;
@property (nonatomic, retain) NSString * subdomain;
@property (nonatomic, retain) NSString * userID;
@property (nonatomic) int32_t domainType;
@property (nonatomic, retain) NSSet *collections;
@property (nonatomic, retain) NSSet *pads;
@end

@interface HPSpace (CoreDataGeneratedAccessors)

- (void)addCollectionsObject:(HPCollection *)value;
- (void)removeCollectionsObject:(HPCollection *)value;
- (void)addCollections:(NSSet *)values;
- (void)removeCollections:(NSSet *)values;

- (void)addPadsObject:(HPPad *)value;
- (void)removePadsObject:(HPPad *)value;
- (void)addPads:(NSSet *)values;
- (void)removePads:(NSSet *)values;

@end
