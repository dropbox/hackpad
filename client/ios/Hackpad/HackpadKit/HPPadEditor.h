//
//  HPPadEditor.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPPad;

@interface HPPadEditor : NSManagedObject

@property (nonatomic, retain) id clientVars;
@property (nonatomic) NSTimeInterval clientVarsLastEditedDate;
@property (nonatomic, retain) NSData * clientVarsJSON;
@property (nonatomic, retain) HPPad *pad;

@end
