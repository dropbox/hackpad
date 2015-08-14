 //
//  HPSpace+Impl.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSpace+Impl.h"

#import "HackpadKit.h"
#import "HackpadAdditions.h"

#import "GTMOAuthAuthentication.h"
#import "GTMNSString+HTML.h"

#import <TestFlight/TestFlight.h>

NSString * const HPQueryParam = @"q";
NSString * const HPFullNameProfileKey = @"fullName";
NSString * const HPPhotoURLProfileKey = @"photoUrl";
NSString * const HPLargePhotoURLProfileKey = @"largePhotoUrl";

static NSString * const HPCollectionInfoPath = @"/ep/api/collection-info";
static NSString * const HPCreateCollectionPath = @"/ep/group/create-with-pad";
static NSString * const HPPadAutocompletePath = @"/ep/search/autocomplete";
static NSString * const HPSignOutPath = @"/ep/account/sign-out";
static NSString * const HPSiteOptionsPath = @"/api/1.0/options";
static NSString * const HPUserSitesPath = @"/api/1.0/user/sites";

static NSString * const HPCollectionNameParam = @"groupName";

static NSString * const DataKey = @"data";
static NSString * const PadIDKey = @"padID";
static NSString * const ServerPadIdKey = @"padId";
static NSString * const LocalPadIdKey = @"localPadId";
static NSString * const CollectionIDKey = @"collectionID";
static NSString * const FollowedKey = @"followed";
static NSString * const SpaceKey = @"space";
static NSString * const SiteNameKey = @"siteName";
static NSString * const SignInMethodsKey = @"signInMethods";
static NSString * const PasswordMethod = @"password";
static NSString * const GoogleMethod = @"google";
static NSString * const FacebookMethod = @"facebook";
static NSString * const SitesKey = @"sites";
static NSString * const TitleKey = @"title";
static NSString * const OptionsKey = @"options";
static NSString * const URLKey = @"url";

@implementation HPSpace (Impl)

@dynamic followedPads;

+ (id)firstSpaceInContext:(NSManagedObjectContext *)context error:(NSError *__autoreleasing *)error
{
    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    fetchRequest.fetchLimit = 1;
    return [context executeFetchRequest:fetchRequest error:error].firstObject;
}

+ (instancetype)insertSpaceWithURL:(NSURL *)URL
                              name:(NSString *)name
              managedObjectContext:(NSManagedObjectContext *)managedObjectContext;
{
    HPSpace *space = [NSEntityDescription insertNewObjectForEntityForName:HPSpaceEntity
                                                   inManagedObjectContext:managedObjectContext];
    space.rootURL = [[NSURL URLWithString:@"/"
                            relativeToURL:URL] absoluteString];
    [space setDomainTypeForURL:URL];
    if (name) {
        space.name = name;
        return space;
    }
    NSRange dot = [URL.host rangeOfString:@"."];
    if (dot.location == NSNotFound){
        space.name = URL.host;
    } else {
        space.name = [URL.host substringToIndex:dot.location];
    }
    return space;
}

+ (id)spaceWithURL:(NSURL *)URL
inManagedObjectContext:(NSManagedObjectContext *)context
             error:(NSError *__autoreleasing *)error
{
    NSParameterAssert([URL isKindOfClass:[NSURL class]]);
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    fetch.fetchLimit = 1;
    NSString *rootURL = [[NSURL URLWithString:@"/"
                                relativeToURL:URL] absoluteString];
    fetch.predicate = [NSPredicate predicateWithFormat:@"rootURL == %@", rootURL];
    NSString *subdomain = URL.hp_hackpadSubdomain;
    if (subdomain) {
        NSPredicate *predicate = [NSPredicate predicateWithFormat:@"subdomain == %@", subdomain];
        fetch.predicate = [NSCompoundPredicate orPredicateWithSubpredicates:@[fetch.predicate, predicate]];
    }
    return [context executeFetchRequest:fetch
                                  error:error].firstObject;
}

+ (id)spaceWithAPI:(HPAPI *)API
inManagedObjectContext:(NSManagedObjectContext *)context
             error:(NSError *__autoreleasing *)error
{
    return [self spaceWithURL:API.URL
       inManagedObjectContext:context
                        error:error];
}

+ (BOOL)removeNonfollowedPadsInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                              error:(NSError *__autoreleasing *)error
{
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetch.predicate = [NSPredicate predicateWithFormat:@"hasMissedChanges == NO AND padID != nil AND followed == NO AND (collections.@count == 0 || NONE collections.followed == YES)"];
    NSArray *pads = [managedObjectContext executeFetchRequest:fetch
                                                        error:error];
    if (!pads) {
        return NO;
    }
    TFLog(@"Pruning %lu pads.", (unsigned long)pads.count);
    [pads enumerateObjectsUsingBlock:^(HPPad *pad, NSUInteger idx, BOOL *stop) {
        [managedObjectContext deleteObject:pad];
    }];
    return YES;
}

+ (BOOL)migrateRootURLsInManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                        error:(NSError *__autoreleasing *)error
{
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    fetch.predicate = [NSPredicate predicateWithFormat:@"rootURL == nil || domainType == nil"];
    NSArray *spaces = [managedObjectContext executeFetchRequest:fetch
                                                          error:error];
    if (!spaces) {
        return NO;
    }
    TFLog(@"Migrating %lu spaces to rootURLs.", (unsigned long)spaces.count);
    [spaces enumerateObjectsUsingBlock:^(HPSpace *space, NSUInteger idx, BOOL *stop) {
        NSURL *URL = space.URL;
        space.rootURL = URL.absoluteString;
        [space setDomainTypeForURL:URL];
    }];
    return YES;
}

- (NSURL *)URL
{
    return self.rootURL ? [NSURL URLWithString:self.rootURL]
        : [NSURL hp_URLForSubdomain:self.subdomain
                      relativeToURL:[NSURL hp_sharedHackpadURL]];
}

- (void)setDomainTypeForURL:(NSURL *)URL
{
    if (URL.hp_isToplevelHackpadURL) {
        self.domainType = HPToplevelDomainType;
    } else if (URL.hp_isHackpadSubdomain) {
        self.domainType = HPWorkspaceDomainType;
    } else {
        self.domainType = HPHostedDomainType;
    }
}

- (HPAPI *)API
{
    HPAPI *API = [HPAPI APIWithURL:self.URL];
    @synchronized (API) {
        if (API.authenticationState == HPNotInitializedAuthenticationState) {
            API.userID = self.userID;
            API.authenticationState = self.userID.length ? HPReconnectAuthenticationState : HPRequiresSignInAuthenticationState;
        }
    }
    return API;
}

- (void)refreshOptionsWithCompletion:(void (^)(HPSpace *, NSError *))handler
{
    NSDictionary *params = @{};
    NSURL *URL = [NSURL URLWithString:HPSiteOptionsPath
                        relativeToURL:self.URL];
    if (![HPAPI XSRFTokenForURL:URL].length) {
        static NSString * const ContUrlParam = @"contUrl";
        static NSString * const SetCookieParam = @"setCookie";
        params = @{ContUrlParam:URL.absoluteString,
                   SetCookieParam:@"1"};
        URL = [NSURL hp_sharedHackpadURL];
    }
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"GET"
                                                 parameters:params];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         id JSON = [space.API parseJSONResponse:response
                                          data:data
                                       request:request
                                         error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[OptionsKey] isKindOfClass:[NSDictionary class]] ||
             ![JSON[OptionsKey][SignInMethodsKey] isKindOfClass:[NSArray class]]) {
             return;
         }
         JSON = JSON[OptionsKey];
         space.name = JSON[SiteNameKey];
         space.signInMethods = 0;
         for (NSString *method in JSON[SignInMethodsKey]) {
             if (![method isKindOfClass:[NSString class]]) {
                 continue;
             } else if ([method isEqualToString:PasswordMethod]) {
                 space.signInMethods |= HPPasswordSignInMask;
             } else if ([method isEqualToString:GoogleMethod]) {
                 space.signInMethods |= HPGoogleSignInMask;
             } else if ([method isEqualToString:FacebookMethod]) {
                 space.signInMethods |= HPFaceboookSignInMask;
             }
         }
     } completion:handler];
}

- (void)requestFollowedPadsWithRefresh:(BOOL)refresh
                            completion:(void (^)(HPSpace *, NSError *))handler
{
    static NSString * const PadsPath = @"/ep/api/pads";
    static NSString * const PadsKey = @"pads";
    static NSString * const CollectionsKey = @"collections";
    static NSString * const EditorNamesKey = @"editorNames";
    static NSString * const EditorPicsKey = @"editorPics";

    NSURL *URL = [NSURL URLWithString:PadsPath
                        relativeToURL:self.URL];
    NSURLRequestCachePolicy cachePolicy = refresh
        ? NSURLRequestReloadIgnoringCacheData
        : NSURLRequestUseProtocolCachePolicy;
    NSURLRequest *request = [NSURLRequest requestWithURL:URL
                                             cachePolicy:cachePolicy
                                         timeoutInterval:60];

    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         id JSON = [space.API parseJSONResponse:response
                                           data:data
                                        request:request
                                          error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[PadsKey] isKindOfClass:[NSArray class]] ||
             ![JSON[CollectionsKey] isKindOfClass:[NSArray class]] ||
             ![JSON[EditorNamesKey] isKindOfClass:[NSArray class]] ||
             ![JSON[EditorPicsKey] isKindOfClass:[NSArray class]]) {
             return;
         }

         NSArray *pads = JSON[PadsKey];
         NSArray *collections = JSON[CollectionsKey];

         HPPadSynchronizer *padSync = [[HPPadSynchronizer alloc] initWithSpace:space
                                                                   padIDKey:LocalPadIdKey
                                                        padSynchronizerMode:HPFollowedPadsPadSynchronizerMode];
         padSync.editorNames = JSON[EditorNamesKey];
         padSync.editorPics = JSON[EditorPicsKey];

         HPCollectionSynchronizer *collectionSync = [[HPCollectionSynchronizer alloc] initWithSpace:space];
         padSync.delegate = collectionSync;

         TFLog(@"[%@] Received %lu pads, %lu collections, and %lu editors from %@",
               URL.host, (unsigned long)pads.count,
               (unsigned long)collections.count,
               (unsigned long)padSync.editorNames.count,
               URL.hp_fullPath);

         if (![padSync synchronizeObjects:pads
                    managedObjectContext:space.managedObjectContext
                                    error:error]) {
             padSync.delegate = nil;
             return;
         }
         padSync.delegate = nil;
         [collectionSync synchronizeObjects:collections
                       managedObjectContext:space.managedObjectContext
                                      error:error];
     } completion:handler];
}

- (void)requestPadsMatchingText:(NSString *)searchText
                        refresh:(BOOL)refresh
                     completion:(void (^)(HPSpace *, NSArray *, NSDictionary *, NSError *))handler
{
    NSDictionary *params = @{HPQueryParam: searchText};
    NSURL *URL = [NSURL URLWithString:HPPadAutocompletePath
                        relativeToURL:self.URL];
    NSMutableURLRequest *request = [NSMutableURLRequest hp_requestWithURL:URL
                                                               HTTPMethod:@"GET"
                                                               parameters:params];
    request.cachePolicy = refresh
        ? NSURLRequestReloadIgnoringCacheData
        : NSURLRequestUseProtocolCachePolicy;

    NSMutableArray * __block objectIDs;
    NSMutableDictionary *searchSnippets = [NSMutableDictionary dictionary];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         id JSON = [space.API parseJSONResponse:response
                                          data:data
                                       request:request
                                         error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[DataKey] isKindOfClass:[NSString class]]) {
             return;
         }
         JSON = [JSON[DataKey] componentsSeparatedByString:@"\n"];
         //HPLog(@"[%@] Lines: %@", request.URL.host, JSON);
         NSMutableArray *searchPads = [NSMutableArray arrayWithCapacity:[JSON count]];
         [JSON enumerateObjectsUsingBlock:^(NSString *line, NSUInteger idx, BOOL *stop) {
             if (!line.length) {
                 return;
             }
             NSArray *fields = [line componentsSeparatedByString:@"|"];
             if (fields.count < 2) {
                 HPLog(@"[%@], Could not parse line: %@", request.URL.host, line);
                 return;
             }
             NSString *padID = [fields[1] gtm_stringByUnescapingFromHTML];
             NSString *searchSnippet = (fields.count > 2) ? fields[2] : nil;
             if (searchSnippet) {
                 searchSnippets[padID] = searchSnippet;
             }
             [searchPads addObject:@{TitleKey:[fields[0] gtm_stringByUnescapingFromHTML],
                                     PadIDKey:padID}];

         }];
         HPPadSynchronizer *sync = [[HPPadSynchronizer alloc] initWithSpace:space
                                                                   padIDKey:PadIDKey
                                                        padSynchronizerMode:HPDefaultPadSynchronizerMode];
         [sync synchronizeObjects:searchPads
             managedObjectContext:space.managedObjectContext
                            error:error];
         NSArray *pads = [sync synchronizeObjects:searchPads
                             managedObjectContext:space.managedObjectContext
                                            error:error];
         if (!pads || ![space.managedObjectContext obtainPermanentIDsForObjects:pads
                                                                          error:error]) {
             return;
         }
         objectIDs = [NSMutableArray arrayWithCapacity:pads.count];
         [pads enumerateObjectsUsingBlock:^(HPPad *pad, NSUInteger idx, BOOL *stop) {
             [objectIDs addObject:pad.objectID];
         }];
     } completion:^(HPSpace *space, NSError *error) {
         if (handler) {
             handler(space, objectIDs, searchSnippets, error);
         }
     }];
}

- (void)createCollectionWithName:(NSString *)name
                             pad:(HPPad *)pad
                      completion:(void (^)(HPSpace *, HPCollection *, NSError *))handler
{
    NSError * __autoreleasing error;
    if (pad.objectID.isTemporaryID &&
        ![pad.managedObjectContext obtainPermanentIDsForObjects:@[pad]
                                                                 error:&error]) {
        if (handler) {
            handler(self, nil, error);
        }
        return;
    }

    NSURL *URL = [NSURL URLWithString:HPCreateCollectionPath
                        relativeToURL:self.URL];
    NSDictionary *params = @{HPCollectionNameParam: name,
                             HPPadIdParam: pad.padID,
                             HPAPIXSRFTokenParam: [HPAPI XSRFTokenForURL:URL]};
    NSURLRequest * request = [NSURLRequest hp_requestWithURL:URL
                                                  HTTPMethod:@"POST"
                                                  parameters:params];
    NSManagedObjectID *padObjectID = pad.objectID;
    NSManagedObjectID * __block collectionObjectID;
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         id JSON = [space.API parseJSONResponse:response
                                           data:data
                                        request:request
                                          error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[HPCollectionIdParam] isKindOfClass:[NSString class]]) {
             return;
         }
         HPPad *pad = (HPPad *)[space.managedObjectContext existingObjectWithID:padObjectID
                                                                          error:error];
         if (!pad) {
             return;
         }
         HPCollection *collection = [NSEntityDescription insertNewObjectForEntityForName:HPCollectionEntity
                                                                  inManagedObjectContext:space.managedObjectContext];
         collection.collectionID = JSON[HPCollectionIdParam];
         collection.title = name;
         collection.space = space;
         collection.followed = YES;
         [collection addPadsObject:pad];

         if (![space.managedObjectContext obtainPermanentIDsForObjects:@[collection]
                                                                 error:error]) {
             return;
         }
         collectionObjectID = collection.objectID;
     }
                          completion:^(HPSpace *space, NSError *error)
     {
         if (handler) {
             HPCollection *collection;
             if (!error && collectionObjectID) {
                 collection = (HPCollection *)[space.managedObjectContext existingObjectWithID:collectionObjectID
                                                                                         error:&error];
             }
             handler(space, collection, error);
         }
     }];
}

- (void)signOutWithCompletion:(void (^)(HPSpace *, NSError *))handler
{
    self.API.authenticationState = HPSigningOutAuthenticationState;

    NSURL *URL = [NSURL URLWithString:HPSignOutPath
                        relativeToURL:self.URL];
    NSString *XSRFToken = [HPAPI XSRFTokenForURL:URL];
    NSMutableDictionary *params = [HPAPI sharedDeviceTokenParams].mutableCopy;
    params[HPAPIXSRFTokenParam] = XSRFToken;
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         @synchronized (space.API) {
             if (space.API.authenticationState != HPSigningOutAuthenticationState) {
                 return;
             }
             space.API.authenticationState = HPRequiresSignInAuthenticationState;
         }
     } completion:handler];
}

- (void)leaveWithCompletion:(void (^)(HPSpace *, NSError *))handler
{
    static NSString * const HPDeleteAccountPath = @"/ep/account/settings/delete";

    self.API.authenticationState = HPSigningOutAuthenticationState;

    NSURL *URL = [NSURL URLWithString:HPDeleteAccountPath
                        relativeToURL:self.URL];
    NSString *XSRFToken = [HPAPI XSRFTokenForURL:URL];
    NSDictionary *params = @{HPAPIXSRFTokenParam:XSRFToken};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    HPAPI *API = self.API;
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         @synchronized (API) {
             if (API.authenticationState != HPSigningOutAuthenticationState) {
                 return;
             }
             [HPAPI removeAPIWithURL:API.URL];
         }
         [HPStaticCachingURLProtocol removeCacheWithHost:API.URL.host
                                                   error:nil];
         [space.managedObjectContext deleteObject:space];
     } completion:handler];
}

+ (NSArray *)createOrUpdateSpacesWithJSON:(id)JSON
                   inManagedObjectContext:(NSManagedObjectContext *)managedObjectContext
                                    error:(NSError * __autoreleasing *)error
{
    NSParameterAssert([JSON isKindOfClass:[NSArray class]]);
    NSMutableArray *spaces = [NSMutableArray arrayWithCapacity:[JSON count]];
    [JSON enumerateObjectsUsingBlock:^(NSDictionary *JSONSite, NSUInteger idx, BOOL *stop) {
        NSURL *URL = [NSURL URLWithString:JSONSite[URLKey]];
        HPSpace *space = [self spaceWithURL:URL
                     inManagedObjectContext:managedObjectContext
                                      error:nil];
        if (!space) {
            space = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass(self)
                                                  inManagedObjectContext:managedObjectContext];
            space.rootURL = [[NSURL URLWithString:@"/"
                                    relativeToURL:URL] absoluteString];
            space.name = JSONSite[SiteNameKey];
        }
        [spaces addObject:space];
    }];
    return spaces;
}

- (void)refreshSpacesWithCompletion:(void (^)(HPSpace *, NSError *))handler
{
    NSURL *URL = [NSURL URLWithString:HPUserSitesPath
                        relativeToURL:self.URL];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL
                                                           cachePolicy:NSURLRequestReloadIgnoringCacheData
                                                       timeoutInterval:60];
    [self.API.oAuth addResourceTokenHeaderToRequest:request];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSpace *space,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
     {
         id JSON = [space.API parseJSONResponse:response
                                          data:data
                                       request:request
                                         error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[SitesKey] isKindOfClass:[NSArray class]]) {
             return;
         }
         NSArray *JSONSites = JSON[SitesKey];
         TFLog(@"[%@] Received %lu sites from %@", URL.host,
               (unsigned long)[JSONSites count], URL.hp_fullPath);
         HPSpaceSynchronizer *sync = [HPSpaceSynchronizer new];
         [sync synchronizeObjects:JSONSites
             managedObjectContext:space.managedObjectContext
                            error:error];
     } completion:handler];
}

- (void)blankPadWithTitle:(NSString *)title
                 followed:(BOOL)followed
               completion:(void (^)(HPPad *, NSError *))handler
{
    NSManagedObjectID * __block padObjectID;
    [self hp_performBlock:^(HPSpace *space,
                            NSError *__autoreleasing *error)
     {
         HPPad *pad = (HPPad *)[NSEntityDescription insertNewObjectForEntityForName:HPPadEntity
                                                             inManagedObjectContext:space.managedObjectContext];
         pad.title = title;
         pad.space = space;
         pad.followed = followed;
         pad.lastEditedDate = [[NSDate date] timeIntervalSinceReferenceDate] - 60;
         if (![pad.managedObjectContext obtainPermanentIDsForObjects:@[pad]
                                                               error:error]) {
             return;
         }
         padObjectID = pad.objectID;
     } completion:^(HPSpace *space, NSError *error) {
         if (!space || !handler) {
             return;
         }
         if (error) {
             handler(nil, error);
             return;
         }
         HPPad *pad = (HPPad *)[space.managedObjectContext existingObjectWithID:padObjectID
                                                                          error:&error];
         if (!pad) {
             handler(nil, error);
             return;
         }
         handler(pad, nil);
     }];
}

- (void)requestContactsMatchingText:(NSString *)searchText
                         completion:(void (^)(HPSpace *, NSArray *, NSError *))handler
{
    static NSString * const HPInviteeAutocompletePath = @"/api/1.0/user/contacts";
    static NSString * const ContactsKey = @"contacts";

    NSURL *URL = [NSURL URLWithString:HPInviteeAutocompletePath
                        relativeToURL:self.URL];
    NSDictionary *params = @{HPQueryParam:searchText}; // HPLimitParam:@"10"}
    NSMutableURLRequest *request = [NSMutableURLRequest hp_requestWithURL:URL
                                                               HTTPMethod:@"GET"
                                                               parameters:params];
    [self.API.oAuth addResourceTokenHeaderToRequest:request];
    HPSpace * __weak weakSelf = self;
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         if (!weakSelf) {
             return;
         }
         id JSON = [weakSelf.API parseJSONResponse:response
                                              data:data
                                           request:request
                                             error:&error];
         if (!handler) {
             return;
         }
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[ContactsKey] isKindOfClass:[NSArray class]]) {
             handler(weakSelf, nil, error);
             return;
         }

         handler(weakSelf, JSON[ContactsKey], nil);
     }];
}

- (void)requestUserProfileWithID:(NSString *)encryptedUserID
                      completion:(void (^)(HPSpace *, NSDictionary *, NSError *))handler
{
    static NSString * const UserPath = @"/api/1.0/user";
    static NSString * const ProfilePathComponent = @"profile";
    static NSString * const ProfileKey = @"profile";

    NSURL *URL = [NSURL URLWithString:UserPath
                        relativeToURL:self.URL];
    URL = [[URL URLByAppendingPathComponent:encryptedUserID] URLByAppendingPathComponent:ProfilePathComponent];
    NSMutableURLRequest *request = [NSMutableURLRequest hp_requestWithURL:URL
                                                               HTTPMethod:@"GET"
                                                               parameters:nil];
    [self.API.oAuth addResourceTokenHeaderToRequest:request];
    HPSpace * __weak weakSelf = self;
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         if (!weakSelf) {
             return;
         }
         id JSON = [weakSelf.API parseJSONResponse:response
                                              data:data
                                           request:request
                                             error:&error];
         if (!handler) {
             return;
         }
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[ProfileKey] isKindOfClass:[NSDictionary class]]) {
             handler(weakSelf, nil, error);
             return;
         }
         handler(weakSelf, JSON[ProfileKey], nil);
     }];
}

@end
