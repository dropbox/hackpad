//
//  HPUserInfo.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

typedef NS_ENUM(NSUInteger, HPUserInfoStatus) {
    HPUnknownUserInfoStatus,
    HPInvitedUserInfoStatus,
    HPFollowingUserInfoStatus,
    HPCreatorUserInfoStatus,
    HPConnectedUserInfoStatus
};

@interface HPUserInfo : NSObject
@property (nonatomic, readonly) NSDictionary *userInfo;
@property (nonatomic, readonly) NSString *userID;
@property (nonatomic, readonly) NSString *name;
@property (nonatomic, readonly) NSString *userPic;
@property (nonatomic, readonly) NSString *statusText;
@property (nonatomic, readonly) HPUserInfoStatus status;
@property (nonatomic, readonly) NSURL *userPicURL;

- (id)initWithDictionary:(NSDictionary *)userInfo;
@end
