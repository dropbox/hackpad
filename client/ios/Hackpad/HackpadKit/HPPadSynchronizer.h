//
//  HPPadSynchronizer.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPSynchronizer.h"

typedef NS_ENUM(NSUInteger, HPPadSynchronizerMode) {
    HPDefaultPadSynchronizerMode,
    HPFollowedPadsPadSynchronizerMode,
    HPCollectionInfoPadSynchronizer
};

@interface HPPadSynchronizer : HPSynchronizer

@property (nonatomic, strong) NSArray *editorNames;
@property (nonatomic, strong) NSArray *editorPics;

- (id)initWithSpace:(HPSpace *)space
           padIDKey:(NSString *)padIDKey
padSynchronizerMode:(HPPadSynchronizerMode)padSynchronizerMode;

@end
