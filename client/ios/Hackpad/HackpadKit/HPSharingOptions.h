//
//  HPSharingOptions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPCollection, HPPad;

@interface HPSharingOptions : NSManagedObject

@property (nonatomic) int32_t allowedSharingTypes;
@property (nonatomic) BOOL moderated;
@property (nonatomic) int32_t sharingType;
@property (nonatomic, retain) HPCollection *collection;
@property (nonatomic, retain) HPPad *pad;

@end
