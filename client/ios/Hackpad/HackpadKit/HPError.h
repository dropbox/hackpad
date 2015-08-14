//
//  HPError.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

FOUNDATION_EXTERN NSString * const HPHackpadErrorDomain;

FOUNDATION_EXTERN NSString * const HPURLErrorFailingHTTPStatusCode;
FOUNDATION_EXTERN NSString * const HPURLErrorFailingHTTPMethod;

enum {
    HPFailedRequestError = 0,
    HPSignInRequired,
    HPDeletedObjectError,
    HPDuplicateEntityError,
    HPInvalidURLError,
    HPPadInitializationError
};
