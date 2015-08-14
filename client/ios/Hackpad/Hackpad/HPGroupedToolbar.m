//
//  HPGroupedToolbar.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPGroupedToolbar.h"

NSTimeInterval const HPGroupedToolbarDefaultAnimationDuration = 0.4;

@interface HPGroupedToolbar ()
@property (nonatomic, weak) UIBarButtonItem *selectedItem;
@property (nonatomic, weak) UIControl *selectedButton;
@property (nonatomic, weak) UIToolbar *selectedGroup;
@property (nonatomic, strong) UIColor *originalSelectedGroupColor;
@end

@implementation HPGroupedToolbar

- (NSTimeInterval)animationDuration
{
    if (!_animationDuration) {
        _animationDuration = HPGroupedToolbarDefaultAnimationDuration;
    }
    return _animationDuration;
}

- (void)setToolbar:(UIToolbar *)toolbar
{
    toolbar.center = CGPointMake(CGRectGetMidX(self.bounds), CGRectGetMidY(self.bounds));
    [self addSubview:toolbar];
    NSUInteger __block nonButtonItems = 0;
    [toolbar.items enumerateObjectsUsingBlock:^(UIBarButtonItem *item, NSUInteger idx, BOOL *stop) {
        if (item.width <= 0) {
            ++nonButtonItems;
            return;
        }
        if (item.action) {
            return;
        }
        item.target = self;
        item.action = @selector(toggleGroupWithItem:);
        item.tag = idx - nonButtonItems;
    }];
    _toolbar = toolbar;
}

- (NSArray *)buttons
{
    NSPredicate *predicate = [NSPredicate predicateWithBlock:^BOOL(id evaluatedObject, NSDictionary *bindings) {
        return [evaluatedObject isKindOfClass:[UIControl class]];
    }];
    NSArray *buttons = [self.toolbar.subviews filteredArrayUsingPredicate:predicate];
    return [buttons sortedArrayUsingComparator:^NSComparisonResult(UIControl *obj1, UIControl *obj2) {
        CGFloat x1 = CGRectGetMinX(obj1.frame);
        CGFloat x2 = CGRectGetMinX(obj2.frame);
        return x1 < x2 ? NSOrderedAscending : x1 > x2 ? NSOrderedDescending : NSOrderedSame;
    }];
}

- (void)showRootToolbarAnimated:(BOOL)animated
{
    if (!self.selectedGroup) {
        return;
    }
    HPGroupedToolbar * __weak weakSelf = self;
    [UIView animateWithDuration:animated ? self.animationDuration / 2 : 0
                     animations:^{
                         weakSelf.toolbar.frame = weakSelf.toolbar.bounds;
                         if (self.selectedGroupTintColor) {
                             weakSelf.selectedItem.tintColor = weakSelf.originalSelectedGroupColor;
                         } else if (self.selectedGroupBackgroundColor) {
                             weakSelf.selectedButton.backgroundColor = weakSelf.originalSelectedGroupColor;
                         }
                         if (![weakSelf.selectedGroup isKindOfClass:[UIToolbar class]]) {
                             return;
                         }
                         CGRect frame = weakSelf.selectedGroup.bounds;
                         frame.origin.x = CGRectGetWidth(weakSelf.bounds);
                         weakSelf.selectedGroup.frame = frame;
                     } completion:^(BOOL finished) {
                         weakSelf.selectedGroup.autoresizingMask = UIViewAutoresizingFlexibleLeftMargin | UIViewAutoresizingFlexibleHeight;
                         weakSelf.selectedGroup = nil;
                         weakSelf.selectedItem = nil;
                         [UIView animateWithDuration:animated ? weakSelf.animationDuration / 2 : 0
                                          animations:^{
                                              [[weakSelf buttons] enumerateObjectsUsingBlock:^(UIControl *button, NSUInteger idx, BOOL *stop) {
                                                  button.alpha = 1;
                                              }];
                                          }];
                     }];
}

- (void)toggleGroupWithItem:(UIBarButtonItem *)sender
{
    if (self.selectedGroup) {
        [self showRootToolbarAnimated:YES];
        return;
    }

    UIToolbar *selectedGroup = self.groups[sender.tag];
    if (![selectedGroup isKindOfClass:[UIToolbar class]]) {
        return;
    }

    self.selectedGroup = selectedGroup;
    self.selectedItem = sender;

    NSArray *buttons = [self buttons];
    self.selectedButton = buttons[sender.tag];
    self.selectedButton.layer.cornerRadius = 5;
    self.selectedButton.layer.masksToBounds = YES;

    CGRect toolbarFrame = self.bounds;
    toolbarFrame.origin.x -= CGRectGetMinX(self.selectedButton.frame);
    // hack. should be controlled with a property or something.
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        // Don't move 1st button on phone.
        toolbarFrame.origin.x += CGRectGetMinX([buttons[0] frame]);
    }

    CGFloat offset = CGRectGetWidth(self.selectedButton.frame);
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        // Don't move 1st button on phone.
        offset += CGRectGetMinX([buttons[0] frame]);
    }
    CGRect groupFrame = self.bounds;
    groupFrame.size.width -= offset;

    if (!self.selectedGroup.superview) {
        self.selectedGroup.center = self.toolbar.center;
        groupFrame.origin.x = CGRectGetMaxX(self.bounds);
        self.selectedGroup.frame = groupFrame;
        self.selectedGroup.autoresizingMask = UIViewAutoresizingFlexibleLeftMargin | UIViewAutoresizingFlexibleHeight;
        [self addSubview:self.selectedGroup];
    }

    groupFrame.origin.x = offset;

    [UIView animateWithDuration:self.animationDuration / 2
                     animations:^{
                         [buttons enumerateObjectsUsingBlock:^(UIControl *button, NSUInteger idx, BOOL *stop) {
                             if (idx == sender.tag) {
                                 return;
                             }
                             button.alpha = 0;
                         }];
                     } completion:^(BOOL finished) {
                         [UIView animateWithDuration:self.animationDuration / 2
                                          animations:^{
                                              if (self.selectedGroupTintColor) {
                                                  self.originalSelectedGroupColor = sender.tintColor;
                                                  sender.tintColor = self.selectedGroupTintColor;
                                              } else if (self.selectedGroupBackgroundColor) {
                                                  self.originalSelectedGroupColor = self.selectedButton.backgroundColor;
                                                  self.selectedButton.backgroundColor = self.selectedGroupBackgroundColor;
                                              }
                                              self.toolbar.frame = toolbarFrame;
                                              self.selectedGroup.frame = groupFrame;
                                          } completion:^(BOOL finished) {
                                              self.selectedGroup.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
                                          }];
                     }];
}

- (void)setFrame:(CGRect)frame
{
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
        // Hack.
        frame.size.width = 320;
    }
    [super setFrame:frame];
}

@end
