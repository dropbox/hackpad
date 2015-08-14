//
//  NSString+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSString (HackpadAdditions)

+ (NSString *)hp_stringWithURLParameters:(NSDictionary *)parameters;

- (NSString *)hp_stringByAddingPercentEscapes;
- (NSString *)hp_stringByReplacingPercentEscapes;
- (NSDictionary *)hp_dictionaryByParsingURLParameters;
- (NSString *)hp_stringByAppendingPathComponents:(NSArray *)components;
- (BOOL)hp_isValidEmailAddress;
- (NSString *)hp_SHA1Digest;
+ (NSString *)hp_stringNamed:(NSString *)name;
@end
