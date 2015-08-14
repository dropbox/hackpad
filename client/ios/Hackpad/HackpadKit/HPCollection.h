//
//  HPCollection.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPPad, HPSharingOptions, HPSpace;

@interface HPCollection : NSManagedObject

@property (nonatomic, retain) NSString * collectionID;
@property (nonatomic) BOOL followed;
@property (nonatomic, retain) NSString * title;
@property (nonatomic, retain) NSSet *pads;
@property (nonatomic, retain) HPSharingOptions *sharingOptions;
@property (nonatomic, retain) HPSpace *space;
@end

@interface HPCollection (CoreDataGeneratedAccessors)

- (void)addPadsObject:(HPPad *)value;
- (void)removePadsObject:(HPPad *)value;
- (void)addPads:(NSSet *)values;
- (void)removePads:(NSSet *)values;

@end
