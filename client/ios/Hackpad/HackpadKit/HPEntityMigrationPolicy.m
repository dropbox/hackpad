//
//  HPEntityMigrationPolicy.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPEntityMigrationPolicy.h"

@implementation HPEntityMigrationPolicy

- (NSDate *)dateWithNumberSince1970:(NSNumber *)timeInterval
{
    return [NSDate dateWithTimeIntervalSince1970:timeInterval.doubleValue];
}

@end
