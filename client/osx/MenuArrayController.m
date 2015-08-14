//
//  MenuArrayController.m
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//

#import "MenuArrayController.h"

#define SEPARATOR [NSMutableDictionary dictionaryWithObjectsAndKeys:@"separator", @"type", [NSNumber numberWithBool:YES], @"ignoreClicks", nil]

@implementation MenuArrayController

@synthesize signedIn = _signedIn;
@synthesize delegate = _delegate;
@synthesize searching = _searching;
@synthesize searchString = _searchString;
@synthesize showCollectionsOption = _showCollectionsOption;
@synthesize showCollectionsBackOption = _showCollectionsBackOption;
@synthesize showAllPadsOption = _showAllPadsOption;

- (id)init
{
    self = [super init];
    if (self) {
        // Initialization code here.
    }

    return self;
}

- (NSArray *)arrangeObjects:(NSArray *)objects {
    NSArray *superArrangedObjects = [super arrangeObjects:objects];
    if ([superArrangedObjects count] > 19) {
        superArrangedObjects =  [superArrangedObjects subarrayWithRange:NSMakeRange(0, 19)];
    } /*else
       {
       return superArrangedObjects;
       }*/

    NSMutableArray *result = [NSMutableArray arrayWithArray:superArrangedObjects];

    if([self signedIn] && [self isSearching])
    {
        [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:[NSString stringWithFormat:@"Create pad \"%@\"",[self searchString]], @"title",
                           @"createPad:", @"selector", self.delegate, @"target", nil]];
    }


    if (!self.signedIn){
        [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:@"Login...", @"title",
                           @"login:", @"selector", self.delegate, @"target", nil]];
    }

    [result addObject:SEPARATOR];

    if (self.signedIn){
        if (!self.searching)
        {

            BOOL addSeparator = NO;
            if(self.showCollectionsOption)
            {
                [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:@"Collections                                           ▶", @"title",
                                   @"showCollections:", @"selector", self.delegate, @"target", nil]];
                addSeparator = YES;
            }
            if(self.showCollectionsBackOption)
            {
                [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:@"◀ Collections", @"title",
                                   @"showCollections:", @"selector", self.delegate, @"target", nil]];
                addSeparator = YES;
            }
            if(self.showAllPadsOption)
            {
                [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:@"◀ All Pads", @"title",
                                   @"showAllPads:", @"selector", self.delegate, @"target", nil]];
                addSeparator = YES;
            }

            if(addSeparator)
            {
                [result addObject:SEPARATOR];
            }
        }

        [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:@"Logout", @"title",
                           @"logout:", @"selector", self.delegate, @"target", nil]];

    }

    [result addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:@"Quit", @"title",
                       @"quitApplication", @"selector", self.delegate, @"target", nil]];

    return result;
}

@end
