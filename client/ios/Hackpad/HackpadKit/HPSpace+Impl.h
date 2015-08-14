//
//  HPSpace+Impl.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSpace.h"

@class HPAPI;

#define HPSpaceEntity (NSStringFromClass([HPSpace class]))

COREDATA_EXTERN NSString * const HPQueryParam;
COREDATA_EXTERN NSString * const HPFullNameProfileKey;
COREDATA_EXTERN NSString * const HPPhotoURLProfileKey;
COREDATA_EXTERN NSString * const HPLargePhotoURLProfileKey;

typedef NS_ENUM(int32_t, HPSignInMethodsMask) {
    HPPasswordSignInMask  = 1,
    HPGoogleSignInMask    = 1 << 1,
    HPFaceboookSignInMask = 1 << 2,
};
typedef NS_ENUM(int32_t, HPDomainType) {
    HPToplevelDomainType = 1,
    HPHostedDomainType,
    HPWorkspaceDomainType
};
@interface HPSpace (Impl)

@property (strong, nonatomic) NSArray *followedPads;
@property (weak, nonatomic, readonly) HPAPI *API;

+ (id)firstSpaceInContext:(NSManagedObjectContext *)context error:(NSError *__autoreleasing *)error;

+ (instancetype)insertSpaceWithURL:(NSURL *)URL
                              name:(NSString *)name
              managedObjectContext:(NSManagedObjectContext *)managedObjectContext;

+ (id)spaceWithURL:(NSURL *)URL
inManagedObjectContext:(NSManagedObjectContext *)context
             error:(NSError * __autoreleasing *)error;

+ (id)spaceWithAPI:(HPAPI *)API
inManagedObjectContext:(NSManagedObjectContext *)context
             error:(NSError * __autoreleasing *)error;

+ (BOOL)removeNonfollowedPadsInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                              error:(NSError * __autoreleasing *)error;

+ (BOOL)migrateRootURLsInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                        error:(NSError * __autoreleasing *)error;

- (NSURL *)URL;

- (void)refreshOptionsWithCompletion:(void (^)(HPSpace *, NSError *))handler;

- (void)requestFollowedPadsWithRefresh:(BOOL)refresh
                            completion:(void (^)(HPSpace *, NSError *))handler;

- (void)requestPadsMatchingText:(NSString *)searchText
                        refresh:(BOOL)refresh
                     completion:(void (^)(HPSpace *, NSArray *, NSDictionary *, NSError *))handler;

- (void)createCollectionWithName:(NSString *)name
                             pad:(HPPad *)pad
                      completion:(void (^)(HPSpace *, HPCollection *, NSError *))handler;

- (void)signOutWithCompletion:(void (^)(HPSpace *, NSError *))handler;
- (void)leaveWithCompletion:(void (^)(HPSpace *, NSError *))handler;

- (void)refreshSpacesWithCompletion:(void (^)(HPSpace *, NSError *))handler;

- (void)blankPadWithTitle:(NSString *)title
                 followed:(BOOL)followed
               completion:(void (^)(HPPad *, NSError *))handler;

- (void)requestContactsMatchingText:(NSString *)searchText
                         completion:(void (^)(HPSpace *, NSArray *, NSError *))handler;

- (void)requestUserProfileWithID:(NSString *)encryptedUserID
                      completion:(void (^)(HPSpace *, NSDictionary *, NSError *))handler;

@end
