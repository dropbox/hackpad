//
//  NSURLResponse+HackpadAdditions.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSURLResponse (HackpadAdditions)
@property (nonatomic, readonly) NSStringEncoding hp_textEncoding;
@end
