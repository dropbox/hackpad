//
//  MenuArrayController.h
//  HackPad
//
//
//  Copyright 2011 Hackpad. All rights reserved.
//



@interface MenuArrayController : NSArrayController
{
    BOOL _signedIn;
    id _delegate;
    BOOL _searching;
    NSString* _searchString;

    BOOL _showCollectionsOption;
    BOOL _showCollectionsBackOption;
    BOOL _showAllPadsOption;
}

@property (assign) BOOL signedIn;
@property (assign) id delegate;
@property (readwrite, assign, getter = isSearching) BOOL searching;
@property (readwrite, copy) NSString* searchString;
@property (readwrite, copy) NSString* title;
@property (readwrite, assign) BOOL showCollectionsOption;
@property (readwrite, assign) BOOL showCollectionsBackOption;
@property (readwrite, assign) BOOL showAllPadsOption;
@end
