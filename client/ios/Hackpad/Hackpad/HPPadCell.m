//
//  HPPadCell.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadCell.h"

#import "HackpadKit.h"
#import "HackpadAdditions.h"

#import "HPUserInfoImageView.h"
#import "HPPadCellBackgroundView.h"

@interface HPPadCell () {
    UILongPressGestureRecognizer *_longPressGesture;
    NSString *loadedHTML;
    BOOL sortedUserImages;
}
@end

@implementation HPPadCell

- (void)awakeFromNib
{
    [super awakeFromNib];
    self.summaryLabel.font = [UIFont hp_UITextFontOfSize:self.summaryLabel.font.pointSize];
    self.titleLabel.font = [UIFont hp_padTitleFontOfSize:self.titleLabel.font.pointSize];
}

- (void)prepareForReuse
{
    [super prepareForReuse];
    loadedHTML = nil;
    [self.snippetView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"about:blank"]]];
}

- (void)setPad:(HPPad *)pad
{
    [self setPad:pad
        animated:^{ return NO; }];
}

- (void)setPad:(HPPad *)pad
      animated:(BOOL (^)(void))animated
{
    _pad = pad;
#if 0
    self.backgroundColor = [UIColor colorWithWhite:0.95
                                             alpha:1];
    self.snippetView.scrollView.scrollsToTop = NO;
    if ((self.snippetView.autoresizingMask & UIViewAutoresizingFlexibleWidth) &&
        [UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPhone) {
        // Otherwise it zooms when resizing larger?!
        self.snippetView.autoresizingMask &= ~UIViewAutoresizingFlexibleWidth;
    }

    if (![loadedHTML isEqualToString:pad.snippetHTML]) {
        loadedHTML = pad.snippetHTML;
        [self.snippetView loadHTMLString:pad.fullSnippetHTML
                                 baseURL:nil];
    }

    if (!_longPressGesture) {
        _longPressGesture = [[UILongPressGestureRecognizer alloc] initWithTarget:self
                                                                          action:@selector(longPress:)];
        _longPressGesture.delegate = self;
        [self.contentView addGestureRecognizer:_longPressGesture];
    }

    CGRect __block frame = self.titleLabel.frame;
    frame.size.width = CGRectGetWidth(self.snippetView.frame);
#endif
    if (!sortedUserImages) {
        sortedUserImages = YES;
        self.userInfoImageViews = [self.userInfoImageViews sortedArrayUsingComparator:^(HPUserInfoImageView *view1,
                                                                                        HPUserInfoImageView *view2)
                                   {
                                       return view1.frame.origin.x < view2.frame.origin.x
                                           ? NSOrderedAscending
                                           : view1.frame.origin.x > view2.frame.origin.x
                                               ? NSOrderedDescending
                                               : NSOrderedSame;
                                   }];
    }

    if (!self.backgroundView) {
        self.backgroundView = [[HPPadCellBackgroundView alloc] initWithFrame:self.bounds];
    }

    NSURL *URL;
    if (pad.authorPic) {
        URL = [NSURL URLWithString:pad.authorPic
                     relativeToURL:[pad.authorPic hasPrefix:@"/"] ? pad.URL : nil];
    } else {
        URL = [pad.snippetUserPics firstObject];
    }
    if ([URL isKindOfClass:[NSURL class]]) {
        [self.userInfoImageViews[0] setURL:URL
                                 connected:NO
                             animatedBlock:animated];
    } else {
        [[self.userInfoImageViews[0] imageView] setImage:nil];
    }

    //self.titleLabel.frame = frame;
    self.titleLabel.text = pad.title.length ? pad.title : @"Untitled";
    if (self.pad.hasMissedChanges) {
        self.summaryLabel.text = @"YOU have offline changes:";
        return;
    }
    if (!pad.authorName && ![pad.authorNames count]) {
        self.summaryLabel.text = nil;
        return;
    }
    NSString *authorName = pad.authorName;
    if (!authorName) {
        pad.authorName = [pad.authorNames firstObject];
    }
    self.summaryLabel.text = [NSString stringWithFormat:@"%@ edited:",
                              [authorName uppercaseStringWithLocale:[NSLocale currentLocale]]];
#if 0
    NSString *editedBy;
    switch ([pad.authorNames count]) {
        case 0:
            self.summaryLabel.text = nil;
            return;
        case 1:
            editedBy = pad.authorNames[0];
            break;
        case 2:
            editedBy = [pad.authorNames componentsJoinedByString:@" and "];
            break;
        default:
            editedBy = [[pad.authorNames subarrayWithRange:NSMakeRange(0, [pad.authorNames count] - 1)] componentsJoinedByString:@", "];
            editedBy = [editedBy stringByAppendingFormat:@", and %@", [pad.authorNames lastObject]];
            break;
    }
    [UIView transitionWithView:self.summaryLabel
                      duration:animated() ? 0.25 : 0
                       options:UIViewAnimationOptionTransitionCrossDissolve
                    animations:^{
                        self.summaryLabel.text = [NSString stringWithFormat:@"%@ edited:", pad.authorNames[0]];
                    }
                    completion:nil];
#endif
}

#if 0
- (void)setSelected:(BOOL)selected
           animated:(BOOL)animated
{
    [super setSelected:selected
              animated:animated];
    if (!selected && animated) {
        // Otherwise the background fades to gray (table background color)
        [UIView animateWithDuration:.25
                         animations:^
         {
             self.snippetBackgroundView.backgroundColor = [UIColor whiteColor];
         }];
    }
}

- (void)setHighlighted:(BOOL)highlighted
              animated:(BOOL)animated
{
    BOOL changing = highlighted != self.isHighlighted;
    [super setHighlighted:highlighted
                 animated:animated];
    // When scrolling, we want UIWebView to be opaque, but need it transparent
    // when highlighted.
    if (changing) {
        self.snippetView.opaque = !highlighted;
        // Doesn't automaticaly redraw without this...
        [self.snippetView loadHTMLString:self.pad.fullSnippetHTML
                                 baseURL:nil];
    }
}

- (void)setEditing:(BOOL)editing
          animated:(BOOL)animated
{
    CGRect oldFrame = self.contentView.frame;
    [super setEditing:editing
             animated:animated];
    if (!editing && animated) {
        // Otherwise the cell doesn't animate resizing?
        // FIXME: Still doesn't animate hiding the confirmation button...
        CGRect newFrame = self.contentView.frame;
        self.contentView.frame = oldFrame;
        [UIView animateWithDuration:0.25
                         animations:^
        {
            self.contentView.frame = newFrame;
        }];
    }
}

- (void)longPress:(UILongPressGestureRecognizer *)longPressGesture
{
    if (longPressGesture.state != UIGestureRecognizerStateBegan) {
        return;
    }
    [self showMore:longPressGesture];
}
#endif

- (IBAction)showMore:(id)sender
{
#if 0
    for (UIView *view = self.superview; view; view = view.superview) {
        if ([view isKindOfClass:[UITableView class]]) {
            UITableView *tableView = (UITableView *)view;
            if ([tableView.delegate respondsToSelector:@selector(tableView:accessoryButtonTappedForRowWithIndexPath:)]) {
                [tableView.delegate tableView:tableView
     accessoryButtonTappedForRowWithIndexPath:[tableView indexPathForCell:self]];
            }
            break;
        }
    }
#endif
}

@end
