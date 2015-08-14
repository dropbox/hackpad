//
//  NSURLResponse+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSURLResponse+HackpadAdditions.h"

@implementation NSURLResponse (HackpadAdditions)

- (NSStringEncoding)hp_textEncoding
{
    CFStringRef textEncodingName = (__bridge CFStringRef)self.textEncodingName;
    CFStringEncoding encoding = CFStringConvertIANACharSetNameToEncoding(textEncodingName);
    return CFStringConvertEncodingToNSStringEncoding(encoding);
}

@end
