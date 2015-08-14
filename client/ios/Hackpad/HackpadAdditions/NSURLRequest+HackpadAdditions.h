//
//  NSURLRequest+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSURLRequest (HackpadAdditions)

+ (id)hp_requestWithURL:(NSURL *)URL
             HTTPMethod:(NSString *)HTTPMethod
             parameters:(NSDictionary *)parameters;

@end
