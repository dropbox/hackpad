//
//  HPUserInfoCollection.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>

@class HPUserInfo;

FOUNDATION_EXTERN NSString * const HPUserInfoCollectionDidAddUserInfoNotification;
FOUNDATION_EXTERN NSString * const HPUserInfoCollectionDidRemoveUserInfoNotification;

FOUNDATION_EXTERN NSString * const HPUserInfoCollectionUserInfoIndexKey;

@interface HPUserInfoCollection : NSObject
@property (nonatomic, readonly) NSArray *userInfos;
@property (nonatomic, readonly) NSDictionary *userInfosByID;

- (id)initWithArray:(NSArray *)userInfos;
- (NSUInteger)addUserInfo:(HPUserInfo *)userInfo;
- (NSUInteger)removeUserInfo:(HPUserInfo *)userInfo;
@end

