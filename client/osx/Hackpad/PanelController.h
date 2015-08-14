#import <Cocoa/Cocoa.h>

#import "BackgroundView.h"
#import "StatusItemView.h"

@class PanelController;
@class ROTableView;
@class MenuArrayController;

@protocol PanelControllerDelegate <NSObject>

@optional

- (StatusItemView *)statusItemViewForPanelController:(PanelController *)controller;

@end

#pragma mark -

@interface PanelController : NSWindowController <NSWindowDelegate, NSTableViewDelegate>
{
    BOOL _hasActivePanel;
    BackgroundView *_backgroundView;
    id<PanelControllerDelegate> _delegate;
    NSSearchField *_searchField;
    NSTextField *_textField;
    NSMutableArray *_arraySource;
    NSMutableArray *_pads;
    NSMutableArray *_collections;
    MenuArrayController *_arrayController;
    NSString* _oauthToken;
    ROTableView* _tableView;
    NSButton* _loginButton;
    NSScrollView* _scrollView;
    NSProgressIndicator *_progress;
    NSButton *_newPadButton;
    dispatch_source_t timer_;
}

@property (assign) IBOutlet BackgroundView *backgroundView;
@property (assign) IBOutlet NSSearchField *searchField;
@property (assign) IBOutlet NSTextField *textField;
@property (retain) IBOutlet NSMutableArray *arraySource;
@property (retain) NSMutableArray *pads;
@property (retain) NSMutableArray *collections;
@property (retain) IBOutlet MenuArrayController *arrayController;
@property (retain) IBOutlet ROTableView *tableView;
@property (retain) IBOutlet NSScrollView *scrollView;
@property (retain) IBOutlet NSButton *loginButton;
@property (retain) NSString *oauthToken;
@property (retain) IBOutlet NSProgressIndicator *progress;
@property (retain) IBOutlet NSButton *createNewPadButton;

@property (nonatomic, assign) BOOL hasActivePanel;
@property (nonatomic, readonly) id<PanelControllerDelegate> delegate;

- (id)initWithDelegate:(id<PanelControllerDelegate>)delegate;
- (void) padSelected:(NSMutableDictionary*)row;

-(IBAction)login:(id)sender;
-(IBAction)createPad:(id)sender;
- (IBAction) handleTableClick:(id)sender;

- (void)openPanel;
- (void)closePanel;
- (void)refreshPadList;
- (void)refreshCollectionsList;

- (void)selectPreviousRow;
- (void)selectNextRow;
- (void)selectPadForSelectedRow;
- (void)resizePanelWithCount:(NSUInteger)count animated:(BOOL)animated duration:(NSTimeInterval)duration;

- (NSRect)statusRect;
- (NSRect)mainScreenRect;

@end
