//
//  HPUserInfoCollection.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPUserInfoCollection.h"
#import "HPUserInfo.h"

NSString * const HPUserInfoCollectionDidAddUserInfoNotification = @"HPUserInfoCollectionDidAddUserInfoNotification";
NSString * const HPUserInfoCollectionDidRemoveUserInfoNotification = @"HPUserInfoCollectionDidRemoveUserInfoNotification";

NSString * const HPUserInfoCollectionUserInfoIndexKey = @"HPUserInfoCollectionUserInfoIndexKey";

@interface HPUserInfoCollection () {
    NSMutableArray *_userInfos;
    NSMutableDictionary *_userInfosByID;
}

@end

@implementation HPUserInfoCollection

- (id)initWithArray:(NSArray *)userInfos
{
    self = [super init];
    if (self) {
        _userInfos = [userInfos mutableCopy];
        _userInfosByID = [NSMutableDictionary dictionaryWithCapacity:_userInfos.count];
        for (HPUserInfo *userInfo in _userInfos) {
            NSParameterAssert([userInfo isKindOfClass:[HPUserInfo class]]);
            _userInfosByID[userInfo.userID] = userInfo;
        }
        [_userInfos sortUsingComparator:[self.class comparator]];
    }
    return self;
}

- (NSUInteger)addUserInfo:(HPUserInfo *)userInfo
{
    NSParameterAssert(!_userInfosByID[userInfo.userID]);
    NSUInteger i = [_userInfos indexOfObject:userInfo
                               inSortedRange:NSMakeRange(0, _userInfos.count)
                                     options:NSBinarySearchingInsertionIndex
                             usingComparator:[self.class comparator]];
    [_userInfos insertObject:userInfo
                     atIndex:i];
    _userInfosByID[userInfo.userID] = userInfo;
    [[NSNotificationCenter defaultCenter] postNotificationName:HPUserInfoCollectionDidAddUserInfoNotification
                                                        object:self
                                                      userInfo:@{HPUserInfoCollectionUserInfoIndexKey:[NSNumber numberWithUnsignedInteger:i]}];
    return i;
}

- (NSUInteger)removeUserInfo:(HPUserInfo *)userInfo
{
    HPUserInfo *oldInfo = _userInfosByID[userInfo.userID];
    NSUInteger ret = NSNotFound;
    if (oldInfo) {
        ret = [_userInfos indexOfObject:oldInfo
                          inSortedRange:NSMakeRange(0, _userInfos.count)
                                options:NSBinarySearchingFirstEqual
                        usingComparator:[self.class comparator]];
        if (ret != NSNotFound) {
            [_userInfos removeObjectAtIndex:ret];
        }
    }
    [_userInfosByID removeObjectForKey:userInfo.userID];
    if (ret != NSNotFound) {
        [[NSNotificationCenter defaultCenter] postNotificationName:HPUserInfoCollectionDidRemoveUserInfoNotification
                                                            object:self
                                                          userInfo:@{HPUserInfoCollectionUserInfoIndexKey:[NSNumber numberWithUnsignedInteger:ret]}];
    }
    return ret;
}

+ (NSComparator)comparator
{
    return ^(id obj1, id obj2)
    {
#define IS_CONNECTED(obj) ([obj status] == HPConnectedUserInfoStatus)
#define HAS_PIC(obj) (!![[obj userPic] length])

        NSParameterAssert([obj1 isKindOfClass:[HPUserInfo class]]);
        NSParameterAssert([obj2 isKindOfClass:[HPUserInfo class]]);
        BOOL obj1connected = IS_CONNECTED(obj1);
        if (obj1connected != IS_CONNECTED(obj2)) {
            return (NSComparisonResult)(obj1connected ? NSOrderedAscending : NSOrderedDescending);
        }

        BOOL obj1hasPic = HAS_PIC(obj1);
        if (obj1hasPic != HAS_PIC(obj2)) {
            return (NSComparisonResult)(obj1hasPic ? NSOrderedAscending : NSOrderedDescending);
        }

        NSComparisonResult ret = [[obj1 name] caseInsensitiveCompare:[obj2 name]];
        return (NSComparisonResult)(ret == NSOrderedSame ? [[obj1 userID] compare:[obj2 userID]] : ret);

#undef IS_CONNECTED
#undef HAS_PIC
    };
}

@end
