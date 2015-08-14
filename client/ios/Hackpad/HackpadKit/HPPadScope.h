//
//  HPPadScope.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <CoreData/CoreData.h>

@class HPCoreDataStack;
@class HPCollection;
@class HPSpace;

FOUNDATION_EXTERN NSString * const HPPadScopeDidChangeNotification;

@interface HPPadScope : NSObject
@property (strong, nonatomic, readonly) HPCoreDataStack *coreDataStack;
@property (strong, nonatomic) HPSpace *space;
@property (strong, nonatomic) HPCollection *collection;

- (id)initWithCoreDataStack:(HPCoreDataStack *)coreDataStack;
@end
