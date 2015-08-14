//
//  HPUserInfo.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPUserInfo.h"

#import <HackpadAdditions/HackpadAdditions.h>

#import "GTMNSString+HTML.h"

static NSString *NameKey = @"name";
static NSString *StatusKey = @"status";
static NSString *UserIDKey = @"userId";
static NSString *UserPicKey = @"userPic";

@interface HPUserInfo () {
    NSMutableSet *_handlers;
}
@end

@implementation HPUserInfo

@synthesize status = _status;

- (id)initWithDictionary:(NSDictionary *)userInfo
{
    self = [super init];
    if (self) {
        _userInfo = userInfo;
    }
    return self;
}

- (HPUserInfoStatus)status
{
    if (_status == HPUnknownUserInfoStatus) {
        NSString *status = self.statusText;
        if ([status isEqualToString:@"invited"]) {
            _status = HPInvitedUserInfoStatus;
        } else if ([status isEqualToString:@"following"]) {
            _status = HPFollowingUserInfoStatus;
        } else if ([status isEqualToString:@"creator"]) {
            _status = HPCreatorUserInfoStatus;
        } else if ([status isEqualToString:@"connected"]) {
            _status = HPConnectedUserInfoStatus;
        }
    }
    return _status;
}

- (NSString *)userID
{
    return _userInfo[UserIDKey];
}

- (NSString *)userPic
{
    return _userInfo[UserPicKey];
}

- (NSURL *)userPicURL
{
    NSString *userPic = self.userPic;
    return userPic.length
        ? [NSURL URLWithString:userPic
                 relativeToURL:[userPic hasPrefix:@"/"] ? [NSURL hp_sharedHackpadURL] : nil]
        : nil;
}

- (NSString *)name
{
    return [_userInfo[NameKey] gtm_stringByUnescapingFromHTML];
}

- (NSString *)statusText
{
    return _userInfo[StatusKey];
}

- (NSString *)description
{
    return [NSString stringWithFormat:@"%@ '%@' %@ %@",
            self.userID, self.name, self.statusText,
            self.userPic];
}

@end
