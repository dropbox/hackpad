//
//  NSString+URLEncoding.m
//  HackPad
//
//  Created by Tyler Bunnell on 6/21/12.
//  Copyright (c) 2012 __MyCompanyName__. All rights reserved.
//

#import "NSString+URLEncoding.h"

@implementation NSString (URLEncoding)

- (NSString *) stringByUrlEncoding
{
	return (NSString *)CFURLCreateStringByAddingPercentEscapes(NULL,  (CFStringRef)self,  NULL,  (CFStringRef)@"!*'();:@&amp;=+$,/?%#[]",  kCFStringEncodingUTF8);
}

@end
