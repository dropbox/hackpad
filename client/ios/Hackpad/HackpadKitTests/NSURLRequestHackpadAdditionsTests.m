//
//  NSURLRequestHackpadAdditionsTests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <SenTestingKit/SenTestingKit.h>

#import <HackpadAdditions/NSURLRequest+HackpadAdditions.h>

static NSString * const BaseURL = @"https://hackpad.com";

static NSString * const PathWithEscapeSpace = @"path%20with%20escaped%20space";

@interface NSURLRequestHackpadAdditionsTests : SenTestCase

@end

@implementation NSURLRequestHackpadAdditionsTests

- (void)testURLWithSpaceInPath
{
    NSURL *URL = [NSURL URLWithString:PathWithEscapeSpace
                        relativeToURL:[NSURL URLWithString:BaseURL]];
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"GET"
                                                 parameters:@{@"key":@"value"}];
    STAssertNotNil(request.URL, @"URL should not be nil");
    STAssertEqualObjects(request.URL.absoluteString,
                         @"https://hackpad.com/path%20with%20escaped%20space?key=value",
                         @"Unexpected URL value");
}

@end
