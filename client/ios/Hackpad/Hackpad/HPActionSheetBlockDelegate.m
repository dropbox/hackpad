//
//  HPActionSheetBlockDelegate.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPActionSheetBlockDelegate.h"

@interface HPActionSheetBlockDelegate ()
@property (nonatomic, copy) void (^didDismissBlock)(UIActionSheet *, NSInteger);
@property (nonatomic, strong) HPActionSheetBlockDelegate *strongSelf;
@end

@implementation HPActionSheetBlockDelegate

- (id)initWithBlock:(void (^)(UIActionSheet *, NSInteger))handler
{
    self = [super init];
    if (self) {
        self.strongSelf = self;
        self.didDismissBlock = handler;
    }
    return self;
}

- (void)actionSheet:(UIActionSheet *)actionSheet
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
    actionSheet.delegate = nil;
    self.didDismissBlock(actionSheet, buttonIndex);
    self.strongSelf = nil;
}

@end
