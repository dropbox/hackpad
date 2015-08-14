//
//  NSError+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSError (HackpadAdditions)
- (NSError *)hp_errorWithOriginalValidationError:(NSError *)error;
@end
