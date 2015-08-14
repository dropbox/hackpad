//
//  HPMigrationTests.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HackpadTestingKit.h>

#define MIGRATION_TEST2(Version, Impl) \
@interface HP##Version##MigrationTests : HPMigrationTestCase \
@end \
@implementation HP##Version##MigrationTests \
- (void)setUp \
{ \
    [super setUpWithStoreURL:[self URLForResource:@#Version \
                                    withExtension:@"sqlite"]]; \
}\
Impl \
@end
#define MIGRATION_TEST(Version) MIGRATION_TEST2(Version, HP_MIGRATION_TEST_CASE_IMPL)

MIGRATION_TEST(Hackpad9)
MIGRATION_TEST(Hackpad10)
MIGRATION_TEST(Hackpad11)
MIGRATION_TEST(Hackpad12)
MIGRATION_TEST(Hackpad13)
MIGRATION_TEST(Hackpad14)
MIGRATION_TEST(Hackpad15)
