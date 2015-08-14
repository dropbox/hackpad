//
//  HPSharingOptions+Impl.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSharingOptions+Impl.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadAdditions.h"

#import "GTMOAuthAuthentication.h"

static NSString * const HPCollectionSearchPath = @"/ep/invite/group_autocomplete";
static NSString * const HPCollectionOptionsPathComponent = @"options";
static NSString * const HPPadOptionsPathComponent = @"options";

static NSString * const LinkSharingName = @"link";
static NSString * const DenySharingName = @"deny";
static NSString * const AllowSharingName = @"allow";
static NSString * const DomainSharingName = @"domain";

static NSString * const IsModeratedKey = @"isModerated";
static NSString * const IsPublicKey = @"isPublic";
static NSString * const IsSubdomainKey = @"isSubdomain";
static NSString * const GuestPolicyKey = @"guestPolicy";
static NSString * const GuestPoliciesKey = @"guestPolicies";
static NSString * const PadOptionsKey = @"options";
static NSString * const SiteOptionsKey = @"siteOptions";

@interface HPSharingOptions ()
@property (nonatomic, readonly) NSURL *APIURL;
@end

@implementation HPSharingOptions (Impl)

+ (NSString *)stringWithSharingType:(HPSharingType)sharingType
{
    switch (sharingType) {
    case HPLinkSharingType: return LinkSharingName;
    case HPDenySharingType: return DenySharingName;
    case HPAllowSharingType: return AllowSharingName;
    case HPDomainSharingType: return DomainSharingName;
    default: return nil;
    }
}

+ (HPSharingType)sharingTypeWithString:(NSString *)sharingType
{
    switch ([sharingType characterAtIndex:0]) {
    case 'l': return [sharingType isEqualToString:LinkSharingName] ? HPLinkSharingType : HPInvalidSharingType;
    case 'd':
        return [sharingType isEqualToString:DenySharingName]
            ? HPDenySharingType
            : [sharingType isEqualToString:DomainSharingName]
                ? HPDomainSharingType
                : HPInvalidSharingType;
    case 'a': return [sharingType isEqualToString:AllowSharingName] ? HPAllowSharingType : HPInvalidSharingType;
    default: return HPInvalidSharingType;
    }
}

- (void)setJSON:(id)JSON
{
    if (!JSON) {
        return;
    }
}

- (NSURL *)APIURL
{
    if (self.pad) {
        return [self.pad.APIURL URLByAppendingPathComponent:HPPadOptionsPathComponent];
    } else if (self.collection) {
        return [self.collection.APIURL URLByAppendingPathComponent:HPCollectionOptionsPathComponent];
    }
    return nil;
}

- (HPSpace *)space
{
    return self.pad ? self.pad.space : self.collection.space;
}

- (void)refreshWithCompletion:(void (^)(HPSharingOptions *, NSError *))handler
{
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:self.APIURL
                                                           cachePolicy:NSURLRequestReloadIgnoringCacheData
                                                       timeoutInterval:60];
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSharingOptions *sharingOptions,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         id JSON = [sharingOptions.space.API parseJSONResponse:response
                                                          data:data
                                                       request:request
                                                         error:error];
         if (![JSON isKindOfClass:[NSDictionary class]] ||
             ![JSON[PadOptionsKey] isKindOfClass:[NSDictionary class]] ||
             ![JSON[SiteOptionsKey] isKindOfClass:[NSDictionary class]]) {
             return;
         }

         NSDictionary *options = JSON[PadOptionsKey];
         if ([options[GuestPolicyKey] isKindOfClass:[NSString class]]) {
             sharingOptions.sharingType = [sharingOptions.class sharingTypeWithString:options[GuestPolicyKey]];
         }
         if ([options[IsModeratedKey] isKindOfClass:[NSNumber class]]) {
             sharingOptions.moderated = [options[IsModeratedKey] boolValue];
         }
         options = JSON[SiteOptionsKey];
         if ([options[GuestPoliciesKey] isKindOfClass:[NSArray class]]) {
             sharingOptions.allowedSharingTypes = 0;
                 [options[GuestPoliciesKey] enumerateObjectsUsingBlock:^(NSString *guestPolicy, NSUInteger idx, BOOL *stop) {
                     if ([guestPolicy isKindOfClass:[NSString class]]) {
                         sharingOptions.allowedSharingTypes |= [sharingOptions.class sharingTypeWithString:guestPolicy];
                     }
                 }];
         }
         if ([options[IsSubdomainKey] isKindOfClass:[NSNumber class]] &&
             [options[IsSubdomainKey] boolValue]) {
             sharingOptions.space.public = [options[IsPublicKey] boolValue];
         }
     }
                          completion:handler];
}

- (void)setModerated:(BOOL)moderated
          completion:(void (^)(HPSharingOptions *, NSError *))handler
{
    NSMutableURLRequest *request = [NSMutableURLRequest hp_requestWithURL:self.APIURL
                                                               HTTPMethod:@"POST"
                                                               parameters:@{IsModeratedKey:moderated ? @"true" : @"false"}];
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSharingOptions *sharingOptions,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![sharingOptions.space.API parseJSONResponse:response
                                                     data:data
                                                  request:request
                                                    error:error]) {
             return;
         }
         sharingOptions.moderated = moderated;
     }
                          completion:handler];
}

- (void)setSharingType:(HPSharingType)sharingType
            completion:(void (^)(HPSharingOptions *, NSError *))handler
{
    NSString *guestPolicy = [self.class stringWithSharingType:sharingType];
    NSMutableURLRequest *request = [NSMutableURLRequest hp_requestWithURL:self.APIURL
                                                               HTTPMethod:@"POST"
                                                               parameters:@{GuestPolicyKey:guestPolicy}];
    [self.space.API.oAuth addResourceTokenHeaderToRequest:request];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPSharingOptions *sharingOptions,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![sharingOptions.space.API parseJSONResponse:response
                                                     data:data
                                                  request:request
                                                    error:error]) {
             return;
         }
         sharingOptions.sharingType = sharingType;
     }
                          completion:handler];
}

@end
