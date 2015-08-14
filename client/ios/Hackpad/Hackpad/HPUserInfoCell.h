//
//  HPUserInfoCell.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPUserInfoImageView;
@class HPUserInfo;

@interface HPUserInfoCell : UITableViewCell
@property (nonatomic, weak) IBOutlet HPUserInfoImageView *userInfoImageView;
@property (nonatomic, weak) IBOutlet UILabel *nameLabel;
@property (nonatomic, weak) IBOutlet UILabel *statusLabel;
@property (nonatomic, strong) HPUserInfo *userInfo;

- (void)setUserInfo:(HPUserInfo *)userInfo
           animated:(BOOL)animated;
@end
