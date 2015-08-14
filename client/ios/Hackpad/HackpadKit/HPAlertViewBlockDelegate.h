//
//  HPAlertViewBlockDelegate.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface HPAlertViewBlockDelegate : NSObject <UIAlertViewDelegate>
- (id)initWithBlock:(void (^)(UIAlertView *, NSInteger))handler;
@end
