//
//  HPPad+Impl.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPad.h"

#define HPPadEntity (NSStringFromClass([HPPad class]))

COREDATA_EXTERN NSString * const HPPadDidGetGlobalPadIDNotification;
COREDATA_EXTERN NSString * const HPGlobalPadIDKey;

COREDATA_EXTERN NSString * const HPLimitParam;
COREDATA_EXTERN NSString * const HPPadIdParam;
COREDATA_EXTERN NSString * const HPUserIdParam;

COREDATA_EXTERN NSString * const HPPadClientVarsPath;

@interface HPPad (Impl)

@property (nonatomic, readonly) NSURL *URL;
@property (nonatomic, readonly) NSURL *APIURL;
@property (nonatomic, readonly, getter = isWelcomePad) BOOL welcomePad;
@property (nonatomic, readonly, getter = isFeatureHelpPad) BOOL featureHelpPad;
@property (nonatomic, readonly, getter = isTermsOfServicePad) BOOL termsOfServicePad;
@property (nonatomic, readonly, getter = isPrivacyPolicyPad) BOOL privacyPolicyPad;
@property (nonatomic, readonly) NSString *fullSnippetHTML;
@property (nonatomic, readonly, getter = isCreator) BOOL creator;
@property (nonatomic, readonly) NSDictionary *clientVars;
@property (nonatomic, readonly) BOOL hasClientVars;

+ (NSString *)fullSnippetHTMLWithSnippetHTML:(NSString *)snippetHTML;
+ (NSString *)padIDWithURL:(NSURL *)URL;

+ (id)padWithID:(NSString *)padID
        inSpace:(HPSpace *)space
          error:(NSError *__autoreleasing *)error;

+ (id)padWithID:(NSString *)padID
          title:(NSString *)title
       spaceURL:(NSURL *)URL
managedObjectContext:(NSManagedObjectContext *)managedObjectContext
          error:(NSError * __autoreleasing *)error;
+ (id)padWithURL:(NSURL *)URL
managedObjectContext:(NSManagedObjectContext *)managedObjectContext
           error:(NSError * __autoreleasing *)error;

+ (id)welcomePadInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                 error:(NSError * __autoreleasing *)error;

+ (id)featureHelpPadInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                     error:(NSError * __autoreleasing *)error;

+ (id)termsOfServicePadInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                        error:(NSError * __autoreleasing *)error;

+ (id)privacyPolicyPadInObjectContext:(NSManagedObjectContext *)managedObjectContext
                                error:(NSError * __autoreleasing *)error;

- (void)deleteWithCompletion:(void (^)(HPPad *, NSError *))handler;

- (void)setFollowed:(BOOL)followed
         completion:(void (^)(HPPad *, NSError *))handler;


- (void)sendInvitationWithUserId:(NSString *)userId
                      completion:(void (^)(HPPad *, NSError *))handler;

- (void)sendInvitationWithEmail:(NSString *)email
                     completion:(void (^)(HPPad *, NSError *))handler;

- (void)sendInvitationWithFacebookID:(NSString *)friendID
                                name:(NSString *)friendName
                          completion:(void (^)(HPPad *, NSError *))handler;

- (void)removeUserWithId:(NSString *)userID
              completion:(void (^)(HPPad *, NSError *))handler;

- (void)requestClientVarsWithRefresh:(BOOL)refresh
                          completion:(void (^)(HPPad *, NSError *))handler;

- (void)getPadIDWithCompletion:(void (^)(HPPad *, NSError *))handler;
- (void)requestAuthorsWithCompletion:(void (^)(HPPad *, NSError *))handler;
- (void)requestContentWithCompletion:(void (^)(HPPad *, NSError *))handler;
- (void)applyMissedChangesWithCompletion:(void (^)(HPPad *, NSError *))handler;
- (void)discardMissedChangesWithCompletion:(void (^)(HPPad *, NSError *))handler;
- (void)setClientVars:(NSDictionary *)clientVars
       lastEditedDate:(NSTimeInterval)lastEditedDate;
- (void)requestAccessWithCompletion:(void (^)(HPPad *, NSError *))handler;

@end
