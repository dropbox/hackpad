//
//  HPImageUpload+Impl.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPImageUpload.h"

#define HPImageUploadEntity (NSStringFromClass([HPImageUpload class]))

@interface HPImageUpload (Impl)
@property (nonatomic, readonly) NSString *key;
@property (nonatomic, readonly) NSURL *URL;
- (void)uploadWithCompletion:(void (^)(NSError *))handler;
@end
