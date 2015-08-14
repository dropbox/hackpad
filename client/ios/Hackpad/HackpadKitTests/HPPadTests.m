//
//  HPPadTests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HackpadTestingKit.h>
#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>

static NSString * const WelcomePadID = @"AWELCOMEPAD";
static NSString * const WelcomePrettyPath = @"Welcome-to-Hackpad-Quick-Intro-AWELCOMEPAD";
static NSString * const MainDomain = @"";
static NSString * const ProSubdomain = @"test";
static NSString * const InvalidPadPath = @"/invalid/pad/path";
static NSString * const InvalidURL = @"http://hackpad.invalid";

@interface HPPadTests : HPCoreDataStackTestCase

@end

@implementation HPPadTests

- (void)testPadIDWithBasicURL
{
    NSURL *URL = [NSURL URLWithString:WelcomePadID
                        relativeToURL:[NSURL hp_sharedHackpadURL]];
    STAssertEqualObjects([HPPad padIDWithURL:URL], WelcomePadID,
                         @"Incorrect pad ID");
}

- (void)testPadIDWithPrettyURL
{
    NSURL *URL = [NSURL URLWithString:WelcomePrettyPath
                        relativeToURL:[NSURL hp_sharedHackpadURL]];
    STAssertEqualObjects([HPPad padIDWithURL:URL], WelcomePadID,
                         @"Incorrect pad ID");
}

- (void)testPadIDWithAPIURL
{
    NSURL *URL = [NSURL URLWithString:InvalidPadPath
                        relativeToURL:[NSURL hp_sharedHackpadURL]];
    STAssertNil([HPPad padIDWithURL:URL],
                @"An API path should not return a valid pad ID.");
}

- (void)testPadIDWithInvalidURL
{
    NSURL *URL = [NSURL URLWithString:InvalidURL];
    STAssertNil([HPPad padIDWithURL:URL],
                @"An invalid URL should not return a valid pad");
}

- (void)testPadWithBasicMainURL
{
    NSError * __autoreleasing error;
    NSURL *URL = [NSURL URLWithString:WelcomePadID
                        relativeToURL:[NSURL hp_sharedHackpadURL]];
    HPPad *pad = [HPPad padWithURL:URL
              managedObjectContext:self.managedObjectContext
                             error:&error];
    STAssertNotNil(pad, @"Could not create pad");
    STAssertEqualObjects(pad.padID, WelcomePadID, @"Mismatched pad ID");
    STAssertEqualObjects(pad.space.URL.hp_hackpadSubdomain, MainDomain, @"Incorrect space subdomain");
}

- (void)testPadWithBasicProURL
{
    NSError * __autoreleasing error;
    NSURL *URL = [NSURL URLWithString:WelcomePadID
                        relativeToURL:[NSURL hp_URLForSubdomain:ProSubdomain
                                                  relativeToURL:[NSURL hp_sharedHackpadURL]]];
    HPPad *pad = [HPPad padWithURL:URL
              managedObjectContext:self.managedObjectContext
                             error:&error];
    STAssertNotNil(pad, @"Could not create pad");
    STAssertEqualObjects(pad.padID, WelcomePadID, @"Mismatched pad ID");
    STAssertEqualObjects(pad.space.URL.hp_hackpadSubdomain, ProSubdomain, @"Incorrect space subdomain");
}

- (void)testPadWithPrettyMainURL
{
    NSError * __autoreleasing error;
    NSURL *URL = [NSURL URLWithString:WelcomePrettyPath
                        relativeToURL:[NSURL hp_sharedHackpadURL]];
    HPPad *pad = [HPPad padWithURL:URL
              managedObjectContext:self.managedObjectContext
                             error:&error];
    STAssertNotNil(pad, @"Could not create pad");
    STAssertEqualObjects(pad.padID, WelcomePadID, @"Mismatched pad ID");
    STAssertEqualObjects(pad.space.URL.hp_hackpadSubdomain, MainDomain, @"Incorrect space subdomain");
}

- (void)testPadWithPrettyProURL
{
    NSError * __autoreleasing error;
    NSURL *URL = [NSURL URLWithString:WelcomePrettyPath
                        relativeToURL:[NSURL hp_URLForSubdomain:ProSubdomain
                                                  relativeToURL:[NSURL hp_sharedHackpadURL]]];
    HPPad *pad = [HPPad padWithURL:URL
              managedObjectContext:self.managedObjectContext
                             error:&error];
    STAssertNotNil(pad, @"Could not create pad");
    STAssertEqualObjects(pad.padID, WelcomePadID, @"Mismatched pad ID");
    STAssertEqualObjects(pad.space.URL.hp_hackpadSubdomain, ProSubdomain, @"Incorrect space subdomain");
}

- (void)testPadWithAPIURL
{
    NSError * __autoreleasing error;
    NSURL *URL = [NSURL URLWithString:InvalidPadPath
                        relativeToURL:[NSURL hp_sharedHackpadURL]];
    HPPad *pad = [HPPad padWithURL:URL
              managedObjectContext:self.managedObjectContext
                             error:&error];
    STAssertNil(pad, @"This URL should not have created a pad.");
    STAssertNotNil(error, @"An error should have been returned.");
    STAssertEqualObjects(error.domain, HPHackpadErrorDomain,
                         @"Unexpected error domain");
    STAssertEquals(error.code, HPInvalidURLError, @"Unexpected error code");

}

- (void)testPadWithExternalURL
{
    NSError * __autoreleasing error;
    NSURL *URL = [NSURL URLWithString:InvalidURL];
    HPPad *pad = [HPPad padWithURL:URL
              managedObjectContext:self.managedObjectContext
                             error:&error];
    STAssertNil(pad, @"This URL should not have created a pad.");
    STAssertNotNil(error, @"An error should have been returned.");
    STAssertEqualObjects(error.domain, HPHackpadErrorDomain,
                         @"Unexpected error domain");
    STAssertEquals(error.code, HPInvalidURLError, @"Unexpected error code");
}

@end
