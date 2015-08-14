//
//  HPPadCollectionCell.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

typedef enum {
    HPUncheckedPadCollectionCell = 0,
    HPCheckedPadCollectionCell,
    HPSpinningPadCollectionCell
} HPPadCollectionCellState;

@interface HPPadCollectionCell : UITableViewCell
@property(weak, nonatomic) IBOutlet UIActivityIndicatorView *activityIndicationView;
@property(weak, nonatomic) IBOutlet UILabel *collectionTextLabel;
@property(weak, nonatomic) IBOutlet UIImageView *collectionImageView;
@property(assign, nonatomic) HPPadCollectionCellState state;
@end
