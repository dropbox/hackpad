//
//  HPActionSheetBlockDelegate.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface HPActionSheetBlockDelegate : NSObject <UIActionSheetDelegate>
- (id)initWithBlock:(void (^)(UIActionSheet *, NSInteger))handler;
@end
