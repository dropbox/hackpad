//
//  HPPadSearch.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPPad;

@interface HPPadSearch : NSManagedObject

@property (nonatomic, retain) NSString * content;
@property (nonatomic) NSTimeInterval lastEditedDate;
@property (nonatomic, retain) HPPad *pad;

@end
