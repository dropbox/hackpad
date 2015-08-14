//
//  NSURLRequest+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSURLRequest+HackpadAdditions.h"

#import "HackpadAdditions.h"

@implementation NSURLRequest (HackpadAdditions)

+ (id)hp_requestWithURL:(NSURL *)URL
             HTTPMethod:(NSString *)HTTPMethod
             parameters:(NSDictionary *)parameters
{
    NSMutableURLRequest *request;
    BOOL isPost = [HTTPMethod isEqualToString:@"POST"];
    NSString *params = [NSString hp_stringWithURLParameters:parameters];
    if (!isPost && params.length) {
        URL = [NSURL URLWithString:[@"?" stringByAppendingString:params]
                     relativeToURL:URL];
    }
    request = [NSMutableURLRequest requestWithURL:URL];
    request.HTTPMethod = HTTPMethod;
    if (isPost && params.length) {
        [request setValue:@"application/x-www-form-urlencoded"
       forHTTPHeaderField:@"Content-Type"];
        request.HTTPBody = [params dataUsingEncoding:NSASCIIStringEncoding];
    }
    return request;
}

@end
