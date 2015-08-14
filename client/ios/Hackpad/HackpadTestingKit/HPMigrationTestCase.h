//
//  HPMigrationTestCase.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <HackpadTestingKit/HPCoreDataStackTestCase.h>

#define HP_MIGRATION_TEST_CASE_IMPL \
- (void)testSpaceMigration { [self doTestSpaceMigration]; } \
- (void)testCollectionMigration { [self doTestCollectionMigration]; } \
- (void)testPadMigration { [self doTestPadMigration]; }

@interface HPMigrationTestCase : HPCoreDataStackTestCase
- (void)doTestSpaceMigration;
- (void)doTestCollectionMigration;
- (void)doTestPadMigration;
@end
