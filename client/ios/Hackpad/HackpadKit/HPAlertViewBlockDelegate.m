//
//  HPAlertViewBlockDelegate.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPAlertViewBlockDelegate.h"

@interface HPAlertViewBlockDelegate ()
@property (nonatomic, copy) void (^didDismissBlock)(UIAlertView *, NSInteger);
@property (nonatomic, strong) HPAlertViewBlockDelegate *strongSelf;
@end

@implementation HPAlertViewBlockDelegate

- (id)initWithBlock:(void (^)(UIAlertView *, NSInteger))handler
{
    self = [super init];
    if (self) {
        self.strongSelf = self;
        self.didDismissBlock = handler;
    }
    return self;
}

- (void)alertView:(UIAlertView *)alertView
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
    alertView.delegate = nil;
    self.didDismissBlock(alertView, buttonIndex);
    self.strongSelf = nil;
}

@end
