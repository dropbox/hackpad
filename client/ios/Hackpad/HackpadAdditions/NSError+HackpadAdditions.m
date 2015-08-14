//
//  NSError+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSError+HackpadAdditions.h"

#import <CoreData/CoreData.h>

@implementation NSError (HackpadAdditions)

- (NSError *)hp_errorWithOriginalValidationError:(NSError *)error
{
    if (!error) {
        return self;
    }
    NSMutableDictionary *userInfo = [NSMutableDictionary dictionary];
    NSMutableArray *errors = [NSMutableArray arrayWithObject:self];

    if (error.code == NSValidationMultipleErrorsError) {
        [userInfo addEntriesFromDictionary:error.userInfo];
        [errors addObjectsFromArray:userInfo[NSDetailedErrorsKey]];
    } else {
        [errors addObject:error];
    }

    userInfo[NSDetailedErrorsKey] = errors;

    return [NSError errorWithDomain:NSCocoaErrorDomain
                               code:NSValidationMultipleErrorsError
                           userInfo:userInfo];
}

@end
