//
//  NSAttributedString+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSAttributedString (HackpadAdditions)

+ (NSAttributedString *)hp_initWithString:(NSString *)string
                               attributes:(NSDictionary *)attributes
                     highlightingKeywords:(NSString *)highlightingKeywords
                   highlightingAttributes:(NSDictionary *)highlightingAttributes
                  maxLengthOfKeywordRange:(NSUInteger)maxLengthOfKeywordRange;

@end
