//
//  HPSharingOptions+Impl.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSharingOptions.h"

@class HPSpace;

typedef NS_ENUM(int32_t, HPSharingType) {
    HPInvalidSharingType   = 0,
    HPLinkSharingType      = 1,
    HPDenySharingType      = 1 << 1,
    HPAllowSharingType     = 1 << 2,
    HPDomainSharingType    = 1 << 3,
    HPAnonymousSharingType = 1 << 4,
    HPFriendsSharingType   = 1 << 5,
    HPAskSharingType       = 1 << 6
};

@interface HPSharingOptions (Impl)

@property (nonatomic, readonly) HPSpace *space;

+ (NSString *)stringWithSharingType:(HPSharingType)sharingType;
+ (HPSharingType)sharingTypeWithString:(NSString *)sharingType;

- (void)refreshWithCompletion:(void (^)(HPSharingOptions *, NSError *))handler;

- (void)setModerated:(BOOL)moderated
          completion:(void (^)(HPSharingOptions *, NSError *))handler;

- (void)setSharingType:(HPSharingType)sharingType
            completion:(void (^)(HPSharingOptions *, NSError *))handler;

@end
