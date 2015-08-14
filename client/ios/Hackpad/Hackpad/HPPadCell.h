//
//  HPPadCell.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPPad;
@class HPUserInfoImageView;

@interface HPPadCell : UITableViewCell

@property (nonatomic, strong) HPPad *pad;

@property (nonatomic, weak) IBOutlet UIView *snippetBackgroundView;
@property (nonatomic, weak) IBOutlet UILabel *titleLabel;
@property (nonatomic, weak) IBOutlet UILabel *summaryLabel;
@property (nonatomic, strong) IBOutlet UIWebView *snippetView;
@property (nonatomic, strong) IBOutletCollection(HPUserInfoImageView) NSArray *userInfoImageViews;
@property (nonatomic, weak) IBOutlet UIButton *moreButton;
- (IBAction)showMore:(id)sender;
- (void)setPad:(HPPad *)pad
      animated:(BOOL (^)(void))animated;
@end
