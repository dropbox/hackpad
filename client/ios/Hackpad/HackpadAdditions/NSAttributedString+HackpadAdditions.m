//
//  NSAttributedString+HackpadAdditions.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSAttributedString+HackpadAdditions.h"

@implementation NSAttributedString (HackpadAdditions)

+ (NSAttributedString *)hp_initWithString:(NSString *)string
                               attributes:(NSDictionary *)attributes
                     highlightingKeywords:(NSString *)highlightingKeywords
                   highlightingAttributes:(NSDictionary *)highlightingAttributes
                  maxLengthOfKeywordRange:(NSUInteger)maxLengthOfKeywordRange;
{
    maxLengthOfKeywordRange /= 2;
    NSParameterAssert(string.length);

    string = [string stringByReplacingOccurrencesOfString:@"\\s+"
                                               withString:@" "
                                                  options:NSRegularExpressionSearch
                                                    range:NSMakeRange(0, string.length)];
    /**
     * Find all keywords' occurrences.
     */
    NSMutableIndexSet *snippetRanges = [NSMutableIndexSet indexSet];
    NSMutableIndexSet *highlightedRanges = [NSMutableIndexSet indexSet];
    [highlightingKeywords enumerateSubstringsInRange:NSMakeRange(0, highlightingKeywords.length)
                                             options:NSStringEnumerationByWords
                                          usingBlock:^(NSString *keywordSubstring,
                                                       NSRange keywordSubstringRange,
                                                       NSRange keywordEnclosingRange,
                                                       BOOL *stop)
     {
         NSRange searchRange = NSMakeRange(0, string.length);
         NSRange highlightedRange;
         NSRange snippetRange;
         while (searchRange.location < string.length) {
             searchRange.length = string.length - searchRange.location;
             highlightedRange = [string rangeOfString:keywordSubstring
                                        options:NSCaseInsensitiveSearch
                                          range:searchRange];
             if (highlightedRange.location == NSNotFound) {
                 break;
             }
             [highlightedRanges addIndexesInRange:highlightedRange];
             searchRange.location = highlightedRange.location + highlightedRange.length;

             snippetRange.location = highlightedRange.location + highlightedRange.length / 2;
             if (snippetRange.location < maxLengthOfKeywordRange) {
                 snippetRange.location = 0;
             } else {
                 snippetRange.location -= maxLengthOfKeywordRange;
             }
             snippetRange.length = 2 * maxLengthOfKeywordRange;
             snippetRange = NSIntersectionRange(snippetRange, NSMakeRange(0, string.length));
             [snippetRanges addIndexesInRange:snippetRange];
         }
     }];

    if (!highlightedRanges.count) {
        return nil;
    }

    NSMutableAttributedString * __block searchSnippets;
    [snippetRanges enumerateRangesUsingBlock:^(NSRange range, BOOL *stop) {
        if (searchSnippets) {
            [searchSnippets appendAttributedString:[[NSAttributedString alloc] initWithString:@"..."
                                                                                   attributes:attributes]];
        }
        NSMutableAttributedString *snippet = [[NSMutableAttributedString alloc] initWithString:[string substringWithRange:range]
                                                                                    attributes:attributes];
        [highlightedRanges enumerateRangesInRange:range
                                          options:0
                                       usingBlock:^(NSRange highlightRange, BOOL *stop)
         {
             highlightRange.location -= range.location;
             [snippet addAttributes:highlightingAttributes
                              range:highlightRange];
         }];
        if (searchSnippets) {
            [searchSnippets appendAttributedString:snippet];
        } else {
            searchSnippets = snippet;
        }
    }];

    return searchSnippets.length ? searchSnippets : nil;
}

@end
