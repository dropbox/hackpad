//
//  HPPadCollectionViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPPad;

@interface HPPadCollectionViewController : UITableViewController

@property (strong, nonatomic) NSFetchedResultsController *fetchedResultsController;

@property (strong, nonatomic) HPPad *pad;

- (IBAction)refreshCollections:(id)sender;
- (IBAction)onDone:(id)sender;
- (IBAction)addCollection:(id)sender;

@end
