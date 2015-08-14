//
//  HPMockTestCase.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//
//  Based on objc.io example project (issue #1)

#import <SenTestingKit/SenTestingKit.h>

@interface HPMockTestCase : SenTestCase

/// Returns the URL for a resource that's been added to the test target.
- (NSURL *)URLForResource:(NSString *)name
            withExtension:(NSString *)extension;

/// Calls +[OCMockObject mockForClass:] and adds the mock and call -verify on it during -tearDown
- (id)autoVerifiedMockForClass:(Class)aClass;
/// C.f. -autoVerifiedMockForClass:
- (id)autoVerifiedPartialMockForObject:(id)object;

/// Calls -verify on the mock during -tearDown
- (void)verifyDuringTearDown:(id)mock;

@end
