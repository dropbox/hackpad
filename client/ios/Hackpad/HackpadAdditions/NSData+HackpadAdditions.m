//
//  NSData+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSData+HackpadAdditions.h"

@implementation NSData (HackpadAdditions)

- (NSString *)hp_hexEncodedString
{
    NSUInteger length = self.length;
    const unsigned char *bytes = (const unsigned char *)self.bytes;
    NSMutableString *s = [NSMutableString stringWithCapacity:length * 2];
    for (NSUInteger i = 0; i < length; i++) {
        [s appendFormat:@"%.2hhx", bytes[i]];
    }
    return s;
}

@end
