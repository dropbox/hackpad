//
//  HPAPITests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <SenTestingKit/SenTestingKit.h>

#import <HackpadKit/HackpadKit.h>

@interface HPAPITests : SenTestCase

@end

@implementation HPAPITests

- (void)testURLTypeWithURL
{
#define URLType(s) ([HPAPI URLTypeWithURL:[NSURL URLWithString:(s)]])

    STAssertEquals(URLType(@"http://example.com"), HPExternalURLType,
                   @"External URL");

    STAssertEquals(URLType(@"https://hackpad.com"), HPSpaceURLType,
                   @"Main site");

    STAssertEquals(URLType(@"https://subdomain.hackpad.com/"), HPSpaceURLType,
                   @"subdomain site");

    STAssertEquals(URLType(@"https://hackpad.com/AWELCOMEPAD"),
                   HPPadURLType, @"Welcome pad");

    STAssertEquals(URLType(@"https://hackpad.com/Welcome-to-Hackpad-Quick-Intro-AWELCOMEPAD"),
                   HPPadURLType, @"Pretty welcome pad");

    STAssertEquals(URLType(@"https://hackpad.com/ep/search/?q=%23todo"),
                   HPSearchURLType, @"Search");

    STAssertEquals(URLType(@"https://hackpad.com/ep/profile/AEry7xCgpHI"),
                   HPUserProfileURLType, @"user profile");

    STAssertEquals(URLType(@"https://hackpad.com/ep/group/orP4w9k83eZ"),
                   HPCollectionURLType, @"Collection home");

    STAssertEquals(URLType(@"https://hackpad.com/collection/orP4w9k83eZ"),
                   HPCollectionURLType, @"Collection home");

    STAssertEquals(URLType(@"https://hackpad.com/api/1.0/options"),
                   HPUnknownURLType, @"site options");
}

@end
