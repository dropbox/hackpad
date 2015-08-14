//
//  HPPadCollectionCell.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadCollectionCell.h"

@implementation HPPadCollectionCell

- (id)initWithStyle:(UITableViewCellStyle)style
    reuseIdentifier:(NSString *)reuseIdentifier
{
    self = [super initWithStyle:style reuseIdentifier:reuseIdentifier];
    return self;
}

- (void)setState:(HPPadCollectionCellState)state
{
    _state = state;
    self.collectionImageView.hidden = state == HPSpinningPadCollectionCell;
    self.collectionImageView.image = [UIImage imageNamed:state == HPCheckedPadCollectionCell
                            ? @"checked.png" : @"unchecked.png" ];
    if (state == HPSpinningPadCollectionCell) {
        [self.activityIndicationView startAnimating];
    } else {
        [self.activityIndicationView stopAnimating];
    }
}
@end
