//
//  NSString+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSString+HackpadAdditions.h"

#import  <CommonCrypto/CommonDigest.h>

@implementation NSString (HackpadAdditions)

- (NSString *)hp_stringByAddingPercentEscapes
{
    CFStringRef str;
    str = CFURLCreateStringByAddingPercentEscapes(NULL,
                                                  (CFStringRef)self,
                                                  NULL,
                                                  CFSTR("!*'\"();:@&=+$,/?%#[]% "),
                                                  kCFStringEncodingUTF8);
    return CFBridgingRelease(str);
}

- (NSString *)hp_stringByReplacingPercentEscapes
{
    CFStringRef str;
    str = CFURLCreateStringByReplacingPercentEscapesUsingEncoding(NULL,
                                                                  (CFStringRef)[self stringByReplacingOccurrencesOfString:@"+"
                                                                                                               withString:@" "],
                                                                  CFSTR(""),
                                                                  kCFStringEncodingUTF8);
    return CFBridgingRelease(str);
}

+ (NSString *)hp_stringWithURLParameters:(NSDictionary *)parameters
{
    if (!parameters.count) {
        return @"";
    }
    NSMutableArray *a = [NSMutableArray arrayWithCapacity:parameters.count];
    for (NSString *key in [parameters keysSortedByValueUsingComparator:^NSComparisonResult(id obj1, id obj2) {
        return [(NSString *)obj1 compare:obj2];
    }]) {
        [a addObject:[@[[key hp_stringByAddingPercentEscapes],
                      [(NSString *)[parameters valueForKey:key] hp_stringByAddingPercentEscapes]]componentsJoinedByString:@"="]];
    }
    return [a componentsJoinedByString:@"&"];
}

- (NSDictionary *)hp_dictionaryByParsingURLParameters
{
    NSArray *keyvals = [self componentsSeparatedByString:@"&"];
    NSMutableDictionary *params = [NSMutableDictionary dictionaryWithCapacity:keyvals.count];
    for (NSString *keyvalStr in keyvals) {
        NSArray *keyval = [keyvalStr componentsSeparatedByString:@"="];
        if (keyval.count > 1) {
            params[[keyval[0] hp_stringByReplacingPercentEscapes]] = [keyval[1] hp_stringByReplacingPercentEscapes];
        }
    }
    return params;
}

- (NSString *)hp_stringByAppendingPathComponents:(NSArray *)components
{
    NSString *ret = self;
    for (NSString *component in components) {
        ret = [ret stringByAppendingPathComponent:component];
    }
    return ret;
}

- (BOOL)hp_isValidEmailAddress
{
    static NSRegularExpression *regexp;
    if (!regexp) {
        regexp = [NSRegularExpression regularExpressionWithPattern:@"^[\\w\\_\\.\\+\\-]+\\@[\\w\\_\\-]+\\.[\\w\\_\\=\\/]+$"
                                                           options:0
                                                             error:nil];
    }
    return [regexp numberOfMatchesInString:self
                                   options:0
                                     range:NSMakeRange(0, self.length)] > 0;

}

- (NSString *)hp_SHA1Digest
{
    if ([self lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > UINT32_MAX) {
        return nil;
    }
    NSData *data = [self dataUsingEncoding:NSUTF8StringEncoding];
    unsigned char digest[CC_SHA1_DIGEST_LENGTH];
    CC_SHA1(data.bytes, (CC_LONG)data.length, digest);
    NSMutableString *ret = [NSMutableString stringWithCapacity:CC_SHA1_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA1_DIGEST_LENGTH; i++) {
        [ret appendFormat:@"%02x", (unsigned int)digest[i]];
    }
    return ret;
}

+ (NSString *)hp_stringNamed:(NSString *)name
{
    static NSCache *cache;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        cache = [[NSCache alloc] init];
        cache.name = @"hp_stringNamed:";
    });
    NSString *ret = [cache objectForKey:name];
    if (!ret) {
        ret = [[NSBundle mainBundle] pathForResource:name
                                              ofType:nil];
        ret = [NSString stringWithContentsOfFile:ret
                                        encoding:NSUTF8StringEncoding
                                           error:nil];
        if (ret) {
            [cache setObject:ret
                      forKey:name];
        }
    }
    return ret;
}

@end
