//
//  HPPadAutocompleteTableViewDataSource.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>
#import <CoreData/CoreData.h>

@interface HPPadAutocompleteTableViewDataSource : NSObject <UITableViewDataSource>
@property (nonatomic, strong) NSArray *autocompleteData;
@property (nonatomic, strong) NSURL *baseURL;
@end
