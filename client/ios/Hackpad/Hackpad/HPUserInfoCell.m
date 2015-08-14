//
//  HPUserInfoCell.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPUserInfoCell.h"

#import "HPUserInfoImageView.h"
#import "HPUserInfo.h"

@implementation HPUserInfoCell

@synthesize userInfoImageView = _userInfoImageView;

- (void)setUserInfo:(HPUserInfo *)userInfo
{
    [self setUserInfo:userInfo
             animated:NO];
}

- (void)setUserInfo:(HPUserInfo *)userInfo
           animated:(BOOL)animated
{
    _userInfo = userInfo;
    self.nameLabel.text = userInfo.name;
    self.nameLabel.font = [UIFont hp_UITextFontOfSize:self.nameLabel.font.pointSize];
    self.statusLabel.text = userInfo.statusText;
    self.statusLabel.font = [UIFont hp_UITextFontOfSize:self.statusLabel.font.pointSize];
    if (userInfo) {
        [self.userInfoImageView setURL:userInfo.userPicURL
                             connected:userInfo.status == HPConnectedUserInfoStatus
                              animated:animated];
    } else {
        [self.userInfoImageView setURL:nil
                             connected:NO
                              animated:animated];
    }
}

@end
