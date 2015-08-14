//
//  HPEmptySearchViewController.m
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPEmptySearchViewController.h"

@interface HPEmptySearchViewController ()

@end

@implementation HPEmptySearchViewController

- (void)viewDidAppear:(BOOL)animated
{
    [self.searchDisplayController.searchBar becomeFirstResponder];
}

@end
