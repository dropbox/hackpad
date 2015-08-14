//
//  HPPadEditorViewController.h
//  Hackpad
//
//
//  Copyright (c) 2012 Hackpad. All rights reserved.
//

#import "HPPadWebController.h"

@class HPPad;
@class HPUserInfoImageView;

typedef NS_ENUM(NSUInteger, PadEditorAction) {
    BoldEditorAction = 10,
    ItalicsEditorAction,
    UnderlineEditorAction,
    StrikethroughEditorAction,

    BulletedListEditorAction = 20,
    NumberedListEditorAction,
    TaskListEditorAction,
    CommentEditorAction,

    IndentEditorAction = 30,
    OutdentEditorAction,

    LinkEditorAction = 40,
    InsertTableAction,
    InsertPhotoAction,
    InsertLinkAction,
    InsertDropboxAction,
    TagEditorAction,

    Heading1EditorAction = 50,
    Heading2EditorAction,
    Heading3EditorAction
};


@interface HPPadEditorViewController : UIViewController <HPPadWebControllerDelegate, UITextFieldDelegate, UITableViewDelegate, UISearchDisplayDelegate>
@property (nonatomic, strong) HPPadWebController *padWebController;
@property (strong, nonatomic) HPPad *pad;
@property (nonatomic, strong) HPSpace *defaultSpace;

// Left navbar items
@property (nonatomic, weak) IBOutlet UIBarButtonItem *backItem;
@property (nonatomic, weak) IBOutlet UIBarButtonItem *searchItem;

// Right navbar items
@property (nonatomic, strong) IBOutlet UIBarButtonItem *followedItem;
@property (nonatomic, strong) IBOutlet UIBarButtonItem *photoItem;

// Toolbars
@property (weak, nonatomic) IBOutlet UIToolbar *toolbar;
@property (weak, nonatomic) IBOutlet UIToolbar *editorAccessoryToolbar;
@property (weak, nonatomic) IBOutlet UIToolbar *formattingToolbar;
@property (weak, nonatomic) IBOutlet UIToolbar *listsToolbar;
@property (weak, nonatomic) IBOutlet UIToolbar *insertToolbar;

@property (nonatomic, weak) IBOutlet UIBarButtonItem *leftPaddingItem;
@property (nonatomic, weak) IBOutlet UIBarButtonItem *rightPaddingItem;

@property (nonatomic, weak) IBOutlet HPUserInfoImageView *userInfoImageView;

@property (nonatomic, weak) IBOutlet UITextField *focusWorkaroundTextField;
@property (weak, nonatomic) IBOutlet UITableView *autocompleteTableView;

@property (nonatomic, weak) IBOutlet NSLayoutConstraint *searchBarConstraint;
@property (nonatomic, weak) IBOutlet NSLayoutConstraint *autocompleteTableHeightConstraint;
@property (nonatomic, weak) IBOutlet NSLayoutConstraint *autocompleteTableTopConstraint;

// Regular toolbar.
- (IBAction)createPad:(id)sender;
- (IBAction)signIn:(id)sender;
- (IBAction)togglePadFollowed:(id)sender;
- (IBAction)searchPads:(id)sender;
- (IBAction)goBack:(id)sender;

// Keyboard toolbar.
- (IBAction)toolbarEditorAction:(id)sender;
- (IBAction)keyboardDone:(id)sender;

- (IBAction)toggleUserInfos:(id)sender;

@end
