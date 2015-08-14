//
//  HPImageUpload.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPPad;

@interface HPImageUpload : NSManagedObject

@property (nonatomic, retain) NSString * attachmentID;
@property (nonatomic, retain) NSString * contentType;
@property (nonatomic, retain) NSString * fileName;
@property (nonatomic, retain) NSData * image;
@property (nonatomic, retain) NSString * rootURL;
@property (nonatomic, retain) HPPad *pad;

@end
