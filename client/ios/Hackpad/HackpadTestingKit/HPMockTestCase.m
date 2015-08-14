//
//  HPMockTestCase.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPMockTestCase.h"

#import <OCMock/OCMock.h>

@interface HPMockTestCase ()
@property (nonatomic, strong) NSMutableArray *mocksToVerify;
@end

@implementation HPMockTestCase

- (void)tearDown
{
    [self.mocksToVerify enumerateObjectsUsingBlock:^(id mock, NSUInteger idx, BOOL *stop) {
        [mock verify];
    }];
    self.mocksToVerify = nil;
    [super tearDown];
}

- (NSURL *)URLForResource:(NSString *)name
            withExtension:(NSString *)extension
{
    return [[NSBundle bundleForClass:self.class] URLForResource:name
                                                  withExtension:extension];
}

- (id)autoVerifiedMockForClass:(Class)aClass
{
    id mock = [OCMockObject mockForClass:aClass];
    [self verifyDuringTearDown:mock];
    return mock;
}

- (id)autoVerifiedPartialMockForObject:(id)object
{
    id mock = [OCMockObject partialMockForObject:object];
    [self verifyDuringTearDown:mock];
    return mock;
}

- (void)verifyDuringTearDown:(id)mock
{
    if (self.mocksToVerify) {
        [self.mocksToVerify addObject:mock];
    } else {
        self.mocksToVerify = [NSMutableArray arrayWithObject:mock];
    }
}

@end
