//
//  HPSearchSnippetsTests.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "NSAttributedString+HackpadAdditions.h"

#import <UIKit/UIKit.h>

#import <SenTestingKit/SenTestingKit.h>

static NSUInteger const MaxLengthOfKeywordRange = 40;

@interface HPSearchSnippetsTests : SenTestCase {
    NSDictionary *_regularAttributes;
    NSDictionary *_highlightingAttributes;
}

@end

@implementation HPSearchSnippetsTests

- (void)setUp
{
    [super setUp];
    _regularAttributes = @{NSUnderlineStyleAttributeName:@1};
    _highlightingAttributes = @{NSUnderlineStyleAttributeName:@2};
}

- (void)testOneKeyword
{
    NSString *string = @"hey there dog hey";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"hey"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    NSMutableAttributedString *expectedSearchSnippets = [[NSMutableAttributedString alloc] initWithString:string
                                                                                               attributes:_regularAttributes];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(0, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(14, 3)];

    STAssertEqualObjects(searchSnippets, expectedSearchSnippets,
                         @"Failed to find search snippets with one keyword");
}

- (void)testFewKeywords
{
    NSString *string = @"hey there dog hey";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"hey-dog"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    NSMutableAttributedString *expectedSearchSnippets = [[NSMutableAttributedString alloc] initWithString:string
                                                                                               attributes:_regularAttributes];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(0, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(14, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(10, 3)];

    STAssertEqualObjects(searchSnippets, expectedSearchSnippets,
                         @"Failed to find search snippets with few keywords");
}

- (void)testFewKeywordsAndFewLines
{
    NSString *string = @"hey there dog hey \n hey mr Smith";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"hey dog"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    NSMutableAttributedString *expectedSearchSnippets = [[NSMutableAttributedString alloc] initWithString:@"hey there dog hey hey mr Smith"
                                                                                               attributes:_regularAttributes];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(0, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(14, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(10, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(18, 3)];

    STAssertEqualObjects(searchSnippets, expectedSearchSnippets,
                         @"Failed to find search snippets in few lines with few keywords");
}

- (void)testOneKeywordAtTheEndOfLongLine
{
    NSString *string = @"There is no one who loves pain itself, who seeks after it and wants"
    "to have it, simply because it is pain...Lorem ipsum dolor sit amet, consectetuer adipiscing "
    "elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. "
    "Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut "
    "aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit "
    "esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et "
    "iusto odio dignissim qui blandit praesent luptatum zzril delenit augue duis dolore te feugait "
    "nulla facilisi. Nam liber tempor cum soluta nobis eleifend option congue nihil imperdiet doming "
    "id quod mazim placerat facer possim assum. Typi non habent claritatem insitam; est usus legentis "
    "in iis qui facit eorum claritatem. Investigationes demonstraverunt lectores legere me lius quod "
    "ii legunt saepius. Claritas est etiam processus dynamicus, qui sequitur mutationem consuetudium "
    "lectorum. Mirum est notare quam littera gothica, quam nunc putamus parum claram, anteposuerit "
    "litterarum formas humanitatis per seacula quarta decima et quinta decima. Eodem modo typi, qui "
    "nunc nobis videntur parum clari, fiant sollemnes in futurum. Heytheredog";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"dog"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    NSMutableAttributedString *expectedSearchSnippets = [[NSMutableAttributedString alloc] initWithString:@"n futurum. Heytheredog"
                                                                                               attributes:_regularAttributes];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(19, 3)];

    STAssertEqualObjects(searchSnippets, expectedSearchSnippets,
                         @"Failed to find search snippets in the one long line with the one keyword");
    //STAssertEquals(searchSnippets.length, MaxLengthOfKeywordRange,
    //               @"Snippet length is incorrect");
}

- (void)testFewKeywordsWithLongGapInBetween
{
    NSString *string = @"There is no one                                                                who loves pain itself";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"one, who"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    NSMutableAttributedString *expectedSearchSnippets = [[NSMutableAttributedString alloc] initWithString:@"There is no one who loves pain itself"
                                                                                               attributes:_regularAttributes];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(12, 3)];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(16, 3)];

    STAssertEqualObjects(searchSnippets, expectedSearchSnippets,
                         @"Failed to find search snippets in the long line with the gap in between");
    //STAssertEquals(searchSnippets.length, MaxLengthOfKeywordRange,
    //               @"Snippet length is incorrect");
}

- (void)testNoResultsFoundInLongLineWithoutKeywords
{
    NSString *string = @"There is no one who loves pain itself, who seeks after it and wants"
    "to have it, simply because it is pain...Lorem ipsum dolor sit amet, consectetuer adipiscing "
    "elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. "
    "Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut "
    "aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit "
    "esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et "
    "iusto odio dignissim qui blandit praesent luptatum zzril delenit augue duis dolore te feugait "
    "nulla facilisi. Nam liber tempor cum soluta nobis eleifend option congue nihil imperdiet doming "
    "id quod mazim placerat facer possim assum. Typi non habent claritatem insitam; est usus legentis "
    "in iis qui facit eorum claritatem. Investigationes demonstraverunt lectores legere me lius quod "
    "ii legunt saepius. Claritas est etiam processus dynamicus, qui sequitur mutationem consuetudium "
    "lectorum. Mirum est notare quam littera gothica, quam nunc putamus parum claram, anteposuerit "
    "litterarum formas humanitatis per seacula quarta decima et quinta decima. Eodem modo typi, qui "
    "nunc nobis videntur parum clari, fiant sollemnes in futurum.";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"hey dog"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    STAssertNil(searchSnippets,
                @"Found search snippets in the long line without keywords");
}

- (void)testFewKeywordsAreIntersectedInOneWord
{
    NSString *string = @"hey alonsky mr Smith";

    NSAttributedString *searchSnippets = [NSAttributedString hp_initWithString:string
                                                                    attributes:_regularAttributes
                                                          highlightingKeywords:@"lonsky alo"
                                                        highlightingAttributes:_highlightingAttributes
                                                       maxLengthOfKeywordRange:MaxLengthOfKeywordRange];

    NSMutableAttributedString *expectedSearchSnippets = [[NSMutableAttributedString alloc] initWithString:string
                                                                                               attributes:_regularAttributes];
    [expectedSearchSnippets setAttributes:_highlightingAttributes
                                    range:NSMakeRange(4, 7)];

    STAssertEqualObjects(searchSnippets, expectedSearchSnippets,
                         @"Failed to find search snippets when two keywords are intersected in one word");
}

@end
