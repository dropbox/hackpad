//
//  NSAttributedString+HTML.m
//
//  Created by Derek Bowen
//  Copyright (c) 2012, Deloitte Digital
//  All rights reserved.
//
//  Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions are met:
//  * Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
//  * Redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//  * Neither the name of the <organization> nor the
//    names of its contributors may be used to endorse or promote products
//    derived from this software without specific prior written permission.
//
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
//  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
//  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
//  DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
//  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
//  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
//  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
//  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
//  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
//  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//

#import "NSAttributedString+DDHTML.h"
#include <libxml/HTMLparser.h>

@implementation NSAttributedString (DDHTML)

+ (NSAttributedString *)attributedStringFromHTML:(NSString *)htmlString boldFont:(UIFont *)boldFont regularFont:(UIFont *)regularFont
{
    NSUInteger length = [htmlString lengthOfBytesUsingEncoding:NSUTF8StringEncoding];
    if (length > INT32_MAX) {
        return nil;
    }
    xmlDoc *document = htmlReadMemory([htmlString cStringUsingEncoding:NSUTF8StringEncoding], (int32_t)length, nil, NULL, HTML_PARSE_NOWARNING | HTML_PARSE_NOERROR);

    if (document == NULL)
        return nil;

    NSMutableAttributedString *finalAttributedString = [[NSMutableAttributedString alloc] init];

    xmlNodePtr currentNode = document->children;
    while (currentNode != NULL) {
        NSAttributedString *childString = [self attributedStringFromNode:currentNode boldFont:boldFont regularFont:regularFont];
        [finalAttributedString appendAttributedString:childString];

        currentNode = currentNode->next;
    }

    return finalAttributedString;
}

+ (NSAttributedString *)attributedStringFromHTML:(NSString *)htmlString boldFont:(UIFont *)boldFont 
{
    return [self.class attributedStringFromHTML:htmlString boldFont:boldFont regularFont:nil];
}

+ (NSAttributedString *)attributedStringFromNode:(xmlNodePtr)xmlNode boldFont:(UIFont *)boldFont regularFont:(UIFont *)regularFont
{
    NSMutableAttributedString *nodeAttributedString = [[NSMutableAttributedString alloc] init];

    if ((xmlNode->type != XML_ENTITY_REF_NODE) && ((xmlNode->type != XML_ELEMENT_NODE) && xmlNode->content != NULL)) {
        [nodeAttributedString appendAttributedString:[[NSAttributedString alloc] initWithString:[NSString stringWithCString:(const char *)xmlNode->content encoding:NSUTF8StringEncoding]]];
    }

    // Handle children
    xmlNodePtr currentNode = xmlNode->children;
    while (currentNode != NULL) {
        NSAttributedString *childString = [self attributedStringFromNode:currentNode boldFont:boldFont regularFont:regularFont];
        [nodeAttributedString appendAttributedString:childString];

        currentNode = currentNode->next;
    }

    if (xmlNode->type == XML_ELEMENT_NODE) {

        NSRange nodeAttributedStringRange = NSMakeRange(0, nodeAttributedString.length);

        // Build dictionary to store attributes
        NSMutableDictionary *attributeDictionary = [NSMutableDictionary dictionary];
        if (xmlNode->properties != NULL) {
            xmlAttrPtr attribute = xmlNode->properties;

            while (attribute != NULL) {
                NSString *attributeValue = @"";

                if (attribute->children != NULL) {
                    attributeValue = [NSString stringWithCString:(const char *)attribute->children->content encoding:NSUTF8StringEncoding];
                }
                NSString *attributeName = [[NSString stringWithCString:(const char*)attribute->name encoding:NSUTF8StringEncoding] lowercaseString];
                [attributeDictionary setObject:attributeValue forKey:attributeName];

                attribute = attribute->next;
            }
        }

        // Bold Tag
        if (strncmp("b", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            if (boldFont) {
                [nodeAttributedString addAttribute:NSFontAttributeName value:boldFont range:nodeAttributedStringRange];
            }
        }

        // Underline Tag
        else if (strncmp("u", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            [nodeAttributedString addAttribute:NSUnderlineStyleAttributeName value:@(NSUnderlineStyleSingle) range:nodeAttributedStringRange];
        }

        // Stike Tag
        else if (strncmp("strike", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            [nodeAttributedString addAttribute:NSStrikethroughStyleAttributeName value:@(YES) range:nodeAttributedStringRange];
        }

        // Stoke Tag
        else if (strncmp("stroke", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            UIColor *strokeColor = [UIColor purpleColor];
            NSNumber *strokeWidth = @(1.0);

            if ([attributeDictionary objectForKey:@"color"]) {
                strokeColor = [self colorFromHexString:[attributeDictionary objectForKey:@"color"]];
            }
            if ([attributeDictionary objectForKey:@"width"]) {
                strokeWidth = @(fabs([[attributeDictionary objectForKey:@"width"] doubleValue]));
            }
            if (![attributeDictionary objectForKey:@"nofill"]) {
                strokeWidth = @(-fabs([strokeWidth doubleValue]));
            }

            [nodeAttributedString addAttribute:NSStrokeColorAttributeName value:strokeColor range:nodeAttributedStringRange];
            [nodeAttributedString addAttribute:NSStrokeWidthAttributeName value:strokeWidth range:nodeAttributedStringRange];
        }

        // Shadow Tag
        else if (strncmp("shadow", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            NSShadow *shadow = [[NSShadow alloc] init];
            shadow.shadowOffset = CGSizeMake(0, 0);
            shadow.shadowBlurRadius = 2.0;
            shadow.shadowColor = [UIColor blackColor];

            if ([attributeDictionary objectForKey:@"offset"]) {
                shadow.shadowOffset = CGSizeFromString([attributeDictionary objectForKey:@"offset"]);
            }
            if ([attributeDictionary objectForKey:@"blurradius"]) {
                shadow.shadowBlurRadius = [[attributeDictionary objectForKey:@"blurradius"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"color"]) {
                shadow.shadowColor = [self colorFromHexString:[attributeDictionary objectForKey:@"color"]];
            }

            [nodeAttributedString addAttribute:NSShadowAttributeName value:shadow range:nodeAttributedStringRange];
        }

        // Font Tag
        else if (strncmp("font", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            NSString *fontName = nil;
            NSNumber *fontSize = nil;
            UIColor *foregroundColor = nil;
            UIColor *backgroundColor = nil;

            if ([attributeDictionary objectForKey:@"face"]) {
                fontName = [attributeDictionary objectForKey:@"face"];
            }
            if ([attributeDictionary objectForKey:@"size"]) {
                fontSize = @([[attributeDictionary objectForKey:@"size"] doubleValue]);
            }
            if ([attributeDictionary objectForKey:@"color"]) {
                foregroundColor = [self colorFromHexString:[attributeDictionary objectForKey:@"color"]];
            }
            if ([attributeDictionary objectForKey:@"backgroundcolor"]) {
                backgroundColor = [self colorFromHexString:[attributeDictionary objectForKey:@"backgroundcolor"]];
            }

            if (fontName == nil && fontSize != nil) {
                [nodeAttributedString addAttribute:NSFontAttributeName value:[UIFont systemFontOfSize:[fontSize doubleValue]] range:nodeAttributedStringRange];
            }
            else if (fontName != nil && fontSize == nil) {
                [nodeAttributedString addAttribute:NSFontAttributeName value:[UIFont fontWithName:fontName size:12.0] range:nodeAttributedStringRange];
            }
            else if (fontName != nil && fontSize != nil) {
                [nodeAttributedString addAttribute:NSFontAttributeName value:[UIFont fontWithName:fontName size:[fontSize doubleValue]] range:nodeAttributedStringRange];
            }

            if (foregroundColor) {
                [nodeAttributedString addAttribute:NSForegroundColorAttributeName value:foregroundColor range:nodeAttributedStringRange];
            }
            if (backgroundColor) {
                [nodeAttributedString addAttribute:NSBackgroundColorAttributeName value:backgroundColor range:nodeAttributedStringRange];
            }
        }

        // Paragraph Tag
        else if (strncmp("p", (const char *)xmlNode->name, strlen((const char *)xmlNode->name)) == 0) {
            NSMutableParagraphStyle *paragraphStyle = [[NSParagraphStyle defaultParagraphStyle] mutableCopy];

            if ([attributeDictionary objectForKey:@"align"]) {
                NSString *alignString = [[attributeDictionary objectForKey:@"align"] lowercaseString];

                if ([alignString isEqualToString:@"left"]) {
                    paragraphStyle.alignment = NSTextAlignmentLeft;
                }
                else if ([alignString isEqualToString:@"center"]) {
                    paragraphStyle.alignment = NSTextAlignmentCenter;
                }
                else if ([alignString isEqualToString:@"right"]) {
                    paragraphStyle.alignment = NSTextAlignmentRight;
                }
                else if ([alignString isEqualToString:@"justify"]) {
                    paragraphStyle.alignment = NSTextAlignmentJustified;
                }
            }
            if ([attributeDictionary objectForKey:@"linebreakmode"]) {
                NSString *lineBreakModeString = [[attributeDictionary objectForKey:@"linebreakmode"] lowercaseString];

                if ([lineBreakModeString isEqualToString:@"wordwrapping"]) {
                    paragraphStyle.lineBreakMode = NSLineBreakByWordWrapping;
                }
                else if ([lineBreakModeString isEqualToString:@"charwrapping"]) {
                    paragraphStyle.lineBreakMode = NSLineBreakByCharWrapping;
                }
                else if ([lineBreakModeString isEqualToString:@"clipping"]) {
                    paragraphStyle.lineBreakMode = NSLineBreakByClipping;
                }
                else if ([lineBreakModeString isEqualToString:@"truncatinghead"]) {
                    paragraphStyle.lineBreakMode = NSLineBreakByTruncatingHead;
                }
                else if ([lineBreakModeString isEqualToString:@"truncatingtail"]) {
                    paragraphStyle.lineBreakMode = NSLineBreakByTruncatingTail;
                }
                else if ([lineBreakModeString isEqualToString:@"truncatingmiddle"]) {
                    paragraphStyle.lineBreakMode = NSLineBreakByTruncatingMiddle;
                }
            }

            if ([attributeDictionary objectForKey:@"firstlineheadindent"]) {
                paragraphStyle.firstLineHeadIndent = [[attributeDictionary objectForKey:@"firstlineheadindent"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"headindent"]) {
                paragraphStyle.headIndent = [[attributeDictionary objectForKey:@"headindent"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"hyphenationfactor"]) {
                paragraphStyle.hyphenationFactor = [[attributeDictionary objectForKey:@"hyphenationfactor"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"lineheightmultiple"]) {
                paragraphStyle.lineHeightMultiple = [[attributeDictionary objectForKey:@"lineheightmultiple"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"linespacing"]) {
                paragraphStyle.lineSpacing = [[attributeDictionary objectForKey:@"linespacing"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"maximumlineheight"]) {
                paragraphStyle.maximumLineHeight = [[attributeDictionary objectForKey:@"maximumlineheight"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"minimumlineheight"]) {
                paragraphStyle.minimumLineHeight = [[attributeDictionary objectForKey:@"minimumlineheight"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"paragraphspacing"]) {
                paragraphStyle.paragraphSpacing = [[attributeDictionary objectForKey:@"paragraphspacing"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"paragraphspacingbefore"]) {
                paragraphStyle.paragraphSpacingBefore = [[attributeDictionary objectForKey:@"paragraphspacingbefore"] doubleValue];
            }
            if ([attributeDictionary objectForKey:@"tailindent"]) {
                paragraphStyle.tailIndent = [[attributeDictionary objectForKey:@"tailindent"] doubleValue];
            }
            
            [nodeAttributedString addAttribute:NSParagraphStyleAttributeName value:paragraphStyle range:nodeAttributedStringRange];
        }
    }
    
    return nodeAttributedString;
}

+ (NSAttributedString *)attributedStringFromNode:(xmlNodePtr)xmlNode boldFont:(UIFont *)boldFont
{
    return [self.class attributedStringFromNode:xmlNode boldFont:boldFont regularFont:nil];
}

+ (UIColor *)colorFromHexString:(NSString *)hexString
{
    if (hexString == nil)
        return nil;

    hexString = [hexString stringByReplacingOccurrencesOfString:@"#" withString:@""];
    char *p;
    NSUInteger hexValue = strtoul([hexString cStringUsingEncoding:NSUTF8StringEncoding], &p, 16);

    return [UIColor colorWithRed:((hexValue & 0xff0000) >> 16) / 255.0 green:((hexValue & 0xff00) >> 8) / 255.0 blue:(hexValue & 0xff) / 255.0 alpha:1.0];
}

@end
