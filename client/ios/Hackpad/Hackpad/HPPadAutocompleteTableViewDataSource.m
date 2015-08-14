//
//  HPPadAutocompleteTableViewDataSource.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadAutocompleteTableViewDataSource.h"

#import <HackpadAdditions/HackpadUIAdditions.h>

@interface HPPadAutocompleteTableViewDataSource ()
@property (nonatomic, strong) NSCache *iconsCache;
@end

@implementation HPPadAutocompleteTableViewDataSource

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return 1;
}

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section
{
    return self.autocompleteData.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    static NSString * const identifier = @"AutocompleteCell";

    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:identifier];

    if (!cell) {
        cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault
                                      reuseIdentifier:identifier];
        cell.textLabel.font = [UIFont hp_UITextFontOfSize:14];
    }
    NSDictionary *contact = self.autocompleteData[indexPath.row];
    cell.textLabel.text = contact[@"title"];
    NSString *imageString = contact[@"image"];
    if (!imageString) {
        cell.imageView.image = nil;
        return cell;
    }
    if (self.iconsCache) {
        cell.imageView.image = [self.iconsCache objectForKey:imageString];
        if (cell.imageView.image) {
            return cell;
        }
    } else {
        self.iconsCache = [[NSCache alloc] init];
    }
    cell.imageView.image = nil;

    NSURL *URL = [imageString hasPrefix:@"/"]
        ? [NSURL URLWithString:imageString
                 relativeToURL:self.baseURL]
        : [NSURL URLWithString:imageString];
    dispatch_queue_t queue = dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0ul);
    HPPadAutocompleteTableViewDataSource * __weak weakSelf = self;
    dispatch_async(queue, ^{
        UIImage *image = [UIImage imageWithData:[NSData dataWithContentsOfURL:URL]];
        if (!image) {
            return;
        }
        [weakSelf.iconsCache setObject:image
                                forKey:imageString];
        dispatch_async(dispatch_get_main_queue(), ^{
            if (indexPath.row >= _autocompleteData.count ||
                weakSelf.autocompleteData[indexPath.row] != contact) {
                return;
            }
            UITableViewCell *cell = [tableView cellForRowAtIndexPath:indexPath];
            cell.imageView.image = image;
            [cell setNeedsLayout];
        });
    });
    return cell;
}

@end
