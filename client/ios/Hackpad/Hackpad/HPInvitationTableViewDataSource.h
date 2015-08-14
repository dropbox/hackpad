//
//  HPInvitationTableViewDataSource.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPSpace;

UIKIT_EXTERN NSString * const HPInvitationEmailKey;
UIKIT_EXTERN NSString * const HPInvitationFacebookIDKey;
UIKIT_EXTERN NSString * const HPInvitationLabelKey;
UIKIT_EXTERN NSString * const HPInvitationNameKey;
UIKIT_EXTERN NSString * const HPInvitationUserIDKey;

@interface HPInvitationTableViewDataSource : NSObject <UITableViewDataSource>
@property (nonatomic, strong) HPSpace *space;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) NSString *searchText;
- (NSDictionary *)invitationInfoAtIndexPath:(NSIndexPath *)indexPath;
@end
