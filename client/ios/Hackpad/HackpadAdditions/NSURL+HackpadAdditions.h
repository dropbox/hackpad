//
//  NSURL+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSURL (HackpadAdditions)

+ (void)hp_addHackpadURL:(NSURL *)URL;
+ (void)hp_removeHackpadURL:(NSURL *)URL;
+ (void)hp_clearHackpadURLs;

+ (instancetype)hp_sharedHackpadURL;

+ (instancetype)hp_URLForSubdomain:(NSString *)subdomain
                     relativeToURL:(NSURL *)URL;

- (void)hp_dumpCookies;
- (void)hp_deleteCookies;

@property (nonatomic, readonly) NSString *hp_fullPath;
@property (nonatomic, readonly) BOOL hp_isHackpadURL;
@property (nonatomic, readonly) BOOL hp_isToplevelHackpadURL;
@property (nonatomic, readonly) BOOL hp_isHackpadSubdomain;

- (BOOL)hp_isOriginEqualToURL:(NSURL *)URL;

@end

@interface NSURL (HackpadDeprecatedAdditions)
@property (nonatomic, readonly) NSString *hp_hackpadSubdomain;
@end