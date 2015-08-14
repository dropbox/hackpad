//
//  HPCollection+Impl.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPCollection+Impl.h"

#import "HackpadKit.h"
#import "HackpadAdditions.h"

static NSString * const HPAddPadToCollectionPath = @"/ep/group/add-pad";
static NSString * const HPCollectionAPIPath = @"/api/1.0/group";
static NSString * const HPDeleteCollectionPath = @"/ep/group/destroy";
static NSString * const HPFollowCollectionPath = @"/ep/group/join";
static NSString * const HPRemovePadFromCollectionPath = @"/ep/group/removepad";
static NSString * const HPUnfollowCollectionPath = @"/ep/group/remove";

NSString * const HPCollectionIdParam = @"groupId";

static NSString * const HPReallySureParam = @"reallySure";

@implementation HPCollection (Impl)

- (NSURL *)APIURL
{
    return [NSURL URLWithString:[HPCollectionAPIPath stringByAppendingPathComponent:self.collectionID]
                  relativeToURL:self.space.URL];
}

- (void)deleteWithCompletion:(void (^)(HPCollection *, NSError *))handler
{
    NSURL *URL = [NSURL URLWithString:HPDeleteCollectionPath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPCollectionIdParam:self.collectionID,
                             HPReallySureParam:@"yes",
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPCollection *collection,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![collection.space.API parseJSONResponse:response
                                                 data:data
                                              request:request
                                                error:error]) {
             return;
         }
         [collection.managedObjectContext deleteObject:collection];
     }
                          completion:handler];
}

- (void)addPadsObject:(HPPad *)pad
           completion:(void (^)(HPCollection *, NSError *))handler
{
    NSError * __autoreleasing error;
    if (pad.objectID.isTemporaryID &&
        ![pad.managedObjectContext obtainPermanentIDsForObjects:@[pad]
                                                          error:&error]) {
        if (handler) {
            handler(self, error);
        }
        return;
    }
    NSURL *URL = [NSURL URLWithString:HPAddPadToCollectionPath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPCollectionIdParam: self.collectionID,
                             HPPadIdParam: pad.padID,
                             HPAPIXSRFTokenParam: [HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    NSManagedObjectID *padObjectID = pad.objectID;
    [self hp_sendAsynchronousRequest:request
                               block:^(HPCollection *collection,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![collection.space.API parseJSONResponse:response
                                                 data:data
                                              request:request
                                                error:error]) {
             return;
         }
         HPPad *pad = (HPPad *)[collection.managedObjectContext existingObjectWithID:padObjectID
                                                                               error:error];
         if (!pad) {
             return;
         }
         [collection addPadsObject:pad];
     }
                          completion:handler];
}

- (void)removePadsObject:(HPPad *)pad
              completion:(void (^)(HPCollection *, NSError *))handler
{
    NSError * __autoreleasing error;
    if (pad.objectID.isTemporaryID &&
        ![pad.managedObjectContext obtainPermanentIDsForObjects:@[pad]
                                                          error:&error]) {
        if (handler) {
            handler(self, error);
        }
        return;
    }

    NSURL *URL = [NSURL URLWithString:HPRemovePadFromCollectionPath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{HPCollectionIdParam: self.collectionID,
                             HPPadIdParam: pad.padID,
                             HPAPIXSRFTokenParam: [HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    NSManagedObjectID *padObjectID = pad.objectID;
    [self hp_sendAsynchronousRequest:request
                               block:^(HPCollection *collection,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![collection.space.API parseJSONResponse:response
                                                 data:data
                                              request:request
                                                error:error]) {
             return;
         }
         HPPad *pad = (HPPad *)[collection.managedObjectContext existingObjectWithID:padObjectID
                                                                               error:error];
         if (!pad) {
             return;
         }
         [collection removePadsObject:pad];
     }
                          completion:handler];
}

- (void)setFollowed:(BOOL)followed
         completion:(void (^)(HPCollection *, NSError *))handler
{
    if (self.followed == followed) {
        if (handler) {
            handler(self, nil);
        }
        return;
    }

    NSURL *URL = [NSURL URLWithString:followed ? HPFollowCollectionPath : HPUnfollowCollectionPath
                        relativeToURL:self.space.URL];
    NSDictionary *params = @{ HPCollectionIdParam: self.collectionID,
                              HPUserIdParam: self.space.userID,
                              HPAPIXSRFTokenParam: [HPAPI XSRFTokenForURL:URL] };
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [self hp_sendAsynchronousRequest:request
                               block:^(HPCollection *collection,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError * __autoreleasing *error)
     {
         if (![collection.space.API parseJSONResponse:response
                                                 data:data
                                              request:request
                                                error:error]) {
             return;
         }
         collection.followed = followed;
     }
                          completion:handler];
}

@end
