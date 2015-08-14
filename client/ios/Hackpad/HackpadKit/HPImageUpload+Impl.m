//
//  HPImageUpload+Impl.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPImageUpload+Impl.h"

#import <HackpadKit/HackpadKit.h>
#import <HackpadAdditions/HackpadAdditions.h>

@implementation HPImageUpload (Impl)

- (NSString *)key
{
    NSParameterAssert(self.pad.padID);
    NSParameterAssert(self.attachmentID);
    NSParameterAssert(self.fileName);
    return [@[self.pad.URL.host, self.pad.padID, self.attachmentID, self.fileName] componentsJoinedByString:@"_"];
}

- (NSURL *)URL
{
    static NSString * const S3URL = @"<YOUR_AMAZON_BUCKET_HERE>";
    return [NSURL URLWithString:[(self.rootURL ?: S3URL) stringByAppendingString:self.key]];
}

- (void)uploadWithCompletion:(void (^)(NSError *))handler
{
    static NSString * const AmzAclHeader = @"x-amz-acl";
    static NSString * const ContentTypeHeader = @"Content-Type";
    static NSString * const PublicReadACL = @"public-read";

    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:self.URL
                                                           cachePolicy:NSURLRequestReloadIgnoringLocalAndRemoteCacheData
                                                       timeoutInterval:300];
    request.HTTPMethod = @"PUT";
    [request setValue:self.contentType
   forHTTPHeaderField:ContentTypeHeader];
    [request setValue:PublicReadACL
   forHTTPHeaderField:AmzAclHeader];
    request.HTTPBody = self.image;

    NSError * __block connectionError;
    [self hp_sendAsynchronousRequest:request
                               block:^(HPImageUpload *image,
                                       NSURLResponse *response,
                                       NSData *data,
                                       NSError *__autoreleasing *error)
    {
        if (*error) {
            connectionError = *error;
            return;
        }
        NSAssert([response isKindOfClass:[NSHTTPURLResponse class]],
                 @"Unexpected response type: %@",
                 NSStringFromClass(response.class));
        NSHTTPURLResponse *HTTPResponse = (NSHTTPURLResponse *)response;
        if (!HTTPResponse.statusCode == 200) {
            NSDictionary *userInfo = @{NSURLErrorFailingURLErrorKey:request.URL,
                                       NSURLErrorFailingURLStringErrorKey:request.URL.absoluteString,
                                       HPURLErrorFailingHTTPMethod:request.HTTPMethod,
                                       HPURLErrorFailingHTTPStatusCode:@(HTTPResponse.statusCode)};
            connectionError = [NSError errorWithDomain:HPHackpadErrorDomain
                                                  code:HPFailedRequestError
                                              userInfo:userInfo];
            return;
        }
        [image.managedObjectContext deleteObject:image];
    } completion:^(HPImageUpload *image, NSError *error) {
        if (handler) {
            if (!error) {
                error = connectionError;
            }
            handler(error);
        }
    }];
}

@end
