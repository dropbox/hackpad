//
//  HPImageUploadURLProtocol.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@class HPCoreDataStack;

FOUNDATION_EXTERN NSString * const HPImageUploadScheme;

@interface HPImageUploadURLProtocol : NSURLProtocol
+ (void)setSharedCoreDataStack:(HPCoreDataStack *)coreDataStack;
@end
