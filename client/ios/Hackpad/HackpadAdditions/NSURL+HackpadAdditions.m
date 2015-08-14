//
//  NSURL+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSURL+HackpadAdditions.h"

static NSString * const BaseURL = @"https://hackpad.com/";
#if TARGET_IPHONE_SIMULATOR
static NSString * const DevServerKey = @"devServer";
static NSString * const DevBaseURL = @"http://bar.hackpad.com:9000/";
#endif
static NSString * const URLsKey = @"com.hackpad.hackpadURLs";

@implementation NSURL (HackpadAdditions)

+ (void)hp_syncHackpadURLs
{
    NSMutableArray *URLs = [NSMutableArray arrayWithCapacity:[[self hp_sharedHackpadURLs] count]];
    [[self hp_sharedHackpadURLs] enumerateObjectsUsingBlock:^(NSURL *URL, BOOL *stop) {
        [URLs addObject:URL.absoluteString];
    }];
    [[NSUserDefaults standardUserDefaults] setObject:URLs
                                              forKey:URLsKey];
    [[NSUserDefaults standardUserDefaults] synchronize];
}

+ (NSMutableSet *)hp_sharedHackpadURLs
{
    static NSMutableSet *URLs;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        NSArray *saved = [[NSUserDefaults standardUserDefaults] arrayForKey:URLsKey];
        if (!saved) {
            saved = @[[[self hp_sharedHackpadURL] absoluteString]];
        }
        URLs = [NSMutableSet setWithCapacity:saved.count];
        [saved enumerateObjectsUsingBlock:^(NSString *URL, NSUInteger idx, BOOL *stop) {
            [URLs addObject:[NSURL URLWithString:URL]];
        }];
    });
    return URLs;
}

+ (void)hp_addHackpadURL:(NSURL *)URL
{
    NSParameterAssert([URL isKindOfClass:[NSURL class]]);
    [[self hp_sharedHackpadURLs] addObject:[NSURL URLWithString:@"/"
                                                  relativeToURL:URL]];
    [self hp_syncHackpadURLs];
}

+ (void)hp_removeHackpadURL:(NSURL *)URL
{
    NSParameterAssert([URL isKindOfClass:[NSURL class]]);
    [[self hp_sharedHackpadURLs] removeObject:[NSURL URLWithString:@"/"
                                                     relativeToURL:URL]];
    [self hp_syncHackpadURLs];
}

+ (void)hp_clearHackpadURLs
{
    [[self hp_sharedHackpadURLs] removeAllObjects];
    [self hp_addHackpadURL:[self hp_sharedHackpadURL]];
}

+ (id)hp_sharedHackpadURL
{
    static NSURL *sharedURL;
    if (!sharedURL) {
        NSString *baseURL = BaseURL;
#if TARGET_IPHONE_SIMULATOR
        if ([[NSUserDefaults standardUserDefaults] boolForKey:DevServerKey]) {
            baseURL = DevBaseURL;
        }
#endif
        sharedURL = [NSURL URLWithString:baseURL];
    }
    return sharedURL;
}

- (void)hp_dumpCookies
{
#if DEBUG
    NSHTTPCookieStorage *jar = [NSHTTPCookieStorage sharedHTTPCookieStorage];
    @synchronized (jar) {
        HPLog(@"[%@] ---- Cookies for %@ ----", self.host, self.hp_fullPath);
        for (NSHTTPCookie *cookie in [jar cookiesForURL:self]) {
            HPLog(@"[%@] %@[%@]: %@", self.host, cookie.domain, cookie.name, cookie.value);
        }
        HPLog(@"[%@] ---------------- %@ ----", self.host, self.hp_fullPath);
    }
#endif
}

- (void)hp_deleteCookies
{
    NSHTTPCookieStorage *jar = [NSHTTPCookieStorage sharedHTTPCookieStorage];
    @synchronized (jar) {
        HPLog(@"[%@] ---- Deleting Cookies for %@ ----", self.host, self.hp_fullPath);
        for (NSHTTPCookie *cookie in [jar cookiesForURL:self]) {
            HPLog(@"[%@] %@[%@]: %@", self.host, cookie.domain, cookie.name, cookie.value);
            [jar deleteCookie:cookie];
        }
        HPLog(@"[%@] ---------------- %@ ----", self.host, self.hp_fullPath);
        [self hp_dumpCookies];
    }
}

+ (id)hp_URLForSubdomain:(NSString *)subdomain
           relativeToURL:(NSURL *)URL
{
    if (!subdomain.length) {
        return [URL copy];
    }
    NSString *str;
    // This is dumb.
    if (URL.port) {
        str = [NSString stringWithFormat:@"%@://%@.%@:%@%@",
               URL.scheme, subdomain, URL.host, URL.port, URL.path];
    } else {
        str = [NSString stringWithFormat:@"%@://%@.%@%@",
               URL.scheme, subdomain, URL.host, URL.path];
    }
    return [NSURL URLWithString:str];
}

- (BOOL)hp_isOriginEqualToURL:(NSURL *)URL
{
    return [self.scheme isEqualToString:URL.scheme] &&
        [self.host isEqualToString:URL.host] &&
        (self.port == URL.port || [self.port isEqualToNumber:URL.port]);
}

- (BOOL)hp_isHackpadURL
{
    return [[self.class hp_sharedHackpadURLs] member:[[NSURL URLWithString:@"/"
                                                             relativeToURL:self] absoluteURL]] ||
        self.hp_isHackpadSubdomain;
}

- (BOOL)hp_isHackpadSubdomain
{
    return [self.host hasSuffix:[@"." stringByAppendingString:[[self.class hp_sharedHackpadURL] host]]];
}

- (BOOL)hp_isToplevelHackpadURL
{
    return [self.host isEqualToString:[[self.class hp_sharedHackpadURL] host]];
}

- (NSString *)hp_fullPath
{
    NSMutableString *fullPath = self.path.mutableCopy;
    if (self.query.length) {
        [fullPath appendString:@"?"];
        [fullPath appendString:self.query];
    }
    if (self.fragment.length) {
        [fullPath appendString:@"#"];
        [fullPath appendString:self.fragment];
    }
    return fullPath;
}

@end

@implementation NSURL (HackpadDeprecatedAdditions)
- (NSString *)hp_hackpadSubdomain
{
    NSString *domain = [[self.class hp_sharedHackpadURL] host];
    if ([self.host isEqualToString:domain]) {
        return @"";
    }
    if ([self.host hasSuffix:domain]) {
        return [self.host substringToIndex:self.host.length - domain.length - 1];
    }
    return nil;
}
@end