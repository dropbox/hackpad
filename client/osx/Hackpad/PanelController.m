#import "PanelController.h"
#import "BackgroundView.h"
#import "StatusItemView.h"
#import "MenubarController.h"
#import "ASIHTTPRequest.h"
#import "ROTableView.h"
#import "MenuArrayController.h"
#import "NSString+SBJSON.h"
#import "NSString+URLEncoding.h"
#import "Chrome.h"
#import "Safari.h"
#import "NSStatusItem+Additions.h"
#import "NSView+AnimationBlock.h"

#define OPEN_DURATION .15
#define TRANSITION_DURATION .1
#define CLOSE_DURATION .1

#define HORIZONTAL_PADDING 0
#define VERTICAL_PADDING 12

#define POPUP_HEIGHT 222
#define PANEL_WIDTH 310
#define MENU_ANIMATION_DURATION .1

#pragma mark -

@implementation PanelController

@synthesize backgroundView = _backgroundView;
@synthesize delegate = _delegate;
@synthesize searchField = _searchField;
@synthesize textField = _textField;
@synthesize arraySource = _arraySource;
@synthesize arrayController = _arrayController;
@synthesize tableView = _tableView;
@synthesize scrollView = _scrollView;
@synthesize loginButton = _loginButton;
@synthesize progress = _progress;
@synthesize createNewPadButton = _newPadButton;
@synthesize collections = _collections;
@synthesize pads = _pads;

NSString *serverURL = @"https://hackpad.com";
//NSString *serverURL = @"http://bar.hackpad.com:9000"; //used for internal testing
NSString *FILLER = @"__FILLER__";

#pragma mark -

- (id)initWithDelegate:(id<PanelControllerDelegate>)delegate
{
    self = [super initWithWindowNibName:@"Panel"];
    if (self != nil)
    {
        _delegate = delegate;
        
        NSString* savedToken =  [[NSUserDefaults standardUserDefaults] objectForKey:@"oauthToken"];
        if (savedToken) {
            _oauthToken = [savedToken retain];
        }
        
        timer_ = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_global_queue(0, 0));
        dispatch_source_set_timer(timer_,
                                  DISPATCH_TIME_NOW,
                                  15 * 60 * NSEC_PER_SEC, 0);
        dispatch_source_set_event_handler(timer_, ^{  [self refreshPadList]; [self refreshCollectionsList];  });
        dispatch_resume(timer_);
        
    }
    return self;
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self name:NSControlTextDidChangeNotification object:self.searchField];
    dispatch_source_cancel(timer_);
    dispatch_release(timer_);
    timer_ = NULL;
    [super dealloc];
}

#pragma mark -

- (void)awakeFromNib
{
    [super awakeFromNib];
    
    
    // Make a fully skinned panel
    NSPanel *panel = (id)[self window];
    [panel setAcceptsMouseMovedEvents:YES];
    [panel setStyleMask:[panel styleMask] ^ NSTitledWindowMask];
    [panel setLevel:NSPopUpMenuWindowLevel];
    [panel setOpaque:NO];
    [panel setBackgroundColor:[NSColor clearColor]];
    
    [self.arrayController setDelegate:self];
    [[self.tableView.tableColumns objectAtIndex:0] setDelegate:self.arrayController];
    
    if (!self.oauthToken) {
        [self logout:nil];
    } else {
        self.arraySource = [NSMutableArray arrayWithCapacity:1];
        [self.arraySource addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:FILLER, @"title", nil]];
        [self.arrayController setSignedIn:true];
        [self.arrayController rearrangeObjects];
        //        [self.arrayController arrangeObjects:[NSMutableArray arrayWithCapacity:4]];
        [self runSearch];
        if (!self.arraySource || [self.arraySource count] == 1) {
            [self.progress setUsesThreadedAnimation:TRUE];
            [self.progress startAnimation:self];
        }
        
    }
    
    [[NSNotificationCenter defaultCenter] addObserverForName:NSControlTextDidChangeNotification object:self.searchField queue:nil usingBlock:^(NSNotification *note) {
        if([[[self searchField] stringValue] length] > 0)
        {
            [self.arrayController setSearchString:[[self searchField] stringValue]];
            [self.arrayController setSearching:YES];
        }
        else
        {
            [self.arrayController setSearchString:nil];
            [self.arrayController setSearching:NO];
        }
        [self runSearch];
        NSNumber* shouldResize = [[note userInfo] objectForKey:@"shouldResize"];
        if(shouldResize != nil)
        {
            if([shouldResize boolValue] == NO)
                return;
        }
        
        [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:NO duration:TRANSITION_DURATION];
    }];
    
    [self.scrollView setHasHorizontalScroller:NO];
    [self.scrollView setHasVerticalScroller:NO];
    [self refreshPadList];
    [self refreshCollectionsList];
}

- (void)clearSearchField
{
    if(![[self.searchField stringValue] isEqualToString:@""])
    {
        [self.searchField setStringValue:@""];
        [[NSNotificationCenter defaultCenter] postNotificationName:NSControlTextDidChangeNotification object:self.searchField userInfo:[NSDictionary dictionaryWithObject:[NSNumber numberWithBool:NO] forKey:@"shouldResize"]];
    }
}

#pragma mark - Public accessors

-(BOOL)tableView:(NSTableView *)tableView shouldSelectRow:(NSInteger)row
{
    if(row < 0)
        return NO;
    
    if ([[[self.arrayController.arrangedObjects objectAtIndex:row] objectForKey:@"type"] isEqualToString:@"separator"])
        return NO;
    if ([[[self.arrayController.arrangedObjects objectAtIndex:row] objectForKey:@"type"] isEqualToString:@"text"])
        return NO;
    return YES;
}

- (BOOL)hasActivePanel
{
    return _hasActivePanel;
}

- (void)setHasActivePanel:(BOOL)flag
{
    if (_hasActivePanel != flag)
    {
        _hasActivePanel = flag;
        
        if (_hasActivePanel)
        {
            [self openPanel];
        }
        else
        {
            [self closePanel];
        }
    }
}

#pragma mark - NSWindowDelegate

- (void)windowWillClose:(NSNotification *)notification
{
    self.hasActivePanel = NO;
}

- (void)windowDidResignKey:(NSNotification *)notification;
{
    if ([[self window] isVisible])
    {
        self.hasActivePanel = NO;
    }
}

- (BOOL)control:(NSControl *)control textView:(NSTextView *)textView doCommandBySelector:(SEL)commandSelector {
    if (commandSelector == @selector(moveUp:)) {
        [self selectPreviousRow];
        return YES;
    }
    if (commandSelector == @selector(moveDown:)) {
        [self selectNextRow];
        return YES;
    }
    if (commandSelector == @selector(insertNewline:)) {
        [self selectPadForSelectedRow];
        return YES;
    }
    
    return NO;
}

- (void)selectPreviousRow
{
    // Get the index of the previous row
    int newRow = MAX(0,(int)([self.tableView selectedRow] - 1));
    
    // Check to see if we can select the row at newRow index
    while(newRow >= 0 && ![self tableView:nil shouldSelectRow:newRow])
    {
        // If we can't, try the next one up
        newRow--;
    }
    
    // We can't select any rows above our current row, so don't do anything
    if(newRow < 0)
        return;
    
    [self.tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:newRow] byExtendingSelection:NO];
}
- (void)selectNextRow
{
    // Get the index of the next row
    int newRow = MIN((int)([self.tableView numberOfRows]),(int)([self.tableView selectedRow] + 1));
    NSUInteger count = [self.arrayController.arrangedObjects count];
    
    // Check to see if we can select the next row
    while(newRow != count && ![self tableView:nil shouldSelectRow:newRow])
    {
        // If we can't, try the next after that
        newRow++;
    }
    
    // There are no rows below our current row, so don't do anything
    if(newRow == count)
        return;
    
    
    [self.tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:newRow] byExtendingSelection:NO];
}

- (void)selectPadForSelectedRow
{
    [self padSelected:[[self.arrayController arrangedObjects] objectAtIndex:[self.tableView selectedRow]]];
}

- (void) padSelected:(NSMutableDictionary*)row {
    if([[row objectForKey:@"ignoreClicks"] boolValue] == YES)
        return;
    if ([row objectForKey:@"selector"]) {
        // if the selected item is a
        [[row objectForKey:@"target"] performSelector:NSSelectorFromString([row objectForKey:@"selector"])];
        return;
    }
    
    NSString *localPadId = [row objectForKey:@"localPadId"];
    NSString *urlString = [NSString stringWithFormat:@"%@/%@", serverURL, localPadId];
    
    bool foundTab = false;
    
    if ([[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.google.Chrome"] count]) {
        ChromeApplication *chrome = [SBApplication applicationWithBundleIdentifier:@"com.google.Chrome"];
        for (ChromeWindow *window in [chrome windows]) {
            int tabIdx = 0;
            for (ChromeTab *tab in [window tabs]) {
                tabIdx++;
                if ([[tab URL] hasPrefix:urlString]) {
                    [window setActiveTabIndex: tabIdx];
                    [chrome activate];
                    [window setIndex:1];
                    foundTab = true;
                    break;
                }
            }
            if (foundTab) { break; }
        }
    }
    
    if (!foundTab && [[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.Safari"] count]) {
        SafariApplication *safari = [SBApplication applicationWithBundleIdentifier:@"com.apple.Safari"];
        for (SafariWindow *window in [safari windows]) {
            for (SafariTab *tab in [window tabs]) {
                if ([[tab URL] hasPrefix:urlString]) {
                    window.currentTab = tab;
                    [safari activate];
                    [window setIndex:1];
                    foundTab = true;
                    break;
                }
            }
            if (foundTab) { break; }
        }
    }
    
    if (!foundTab) {
        [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:urlString]];
    }
    
    [self closePanel];
}

- (void)collectionSelected:(id)sender
{
    NSMutableDictionary* selectedItem = [[self.arrayController arrangedObjects] objectAtIndex:[self.tableView selectedRow]];
    
    [NSView animateWithDuration:TRANSITION_DURATION animation:^{
        [[self.scrollView animator] setAlphaValue:0.0];
    } completion:^{
        [self clearSearchField];
        [self.arrayController setShowAllPadsOption:YES];
        [self.arrayController setShowCollectionsBackOption:YES];
        [self.arrayController setShowCollectionsOption:NO];
        self.arraySource = [selectedItem objectForKey:@"pads"];
        
        [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:YES duration:TRANSITION_DURATION];
    }];
    
    [self.tableView deselectAll:nil];
}

- (void) quitApplication {
    [[[NSApplication sharedApplication] delegate] performSelector:@selector(deleteAppFromLoginItems)];
    [[NSApplication sharedApplication] terminate:self];
}

- (void)windowDidResize:(NSNotification *)notification
{
    NSWindow *panel = [self window];
    NSRect statusRect = [self statusRect];
    NSRect panelRect = [panel frame];
    
    CGFloat statusX = roundf(NSMidX(statusRect));
    CGFloat panelX = statusX - NSMinX(panelRect);
    
    self.backgroundView.arrowX = panelX;
    
    NSRect searchRect = [self.searchField frame];
    searchRect.size.width = [self.backgroundView bounds].size.width - 21 * 2 -  [self.createNewPadButton frame].size.width - 10;
    searchRect.origin.x = 234;
    
    searchRect.origin.x = 21 + [self.createNewPadButton frame].size.width + 10; //HORIZONTAL_PADDING ;
    searchRect.origin.y = NSHeight([self.backgroundView bounds]) - ARROW_HEIGHT - VERTICAL_PADDING - NSHeight(searchRect);
    
    NSRect buttonRect = [self.createNewPadButton frame];
    buttonRect.origin.x = 21+1; //HORIZONTAL_PADDING ;
    buttonRect.origin.y = searchRect.origin.y ;
    
    if (NSIsEmptyRect(searchRect))
    {
        [self.searchField setHidden:YES];
        [self.createNewPadButton setHidden:YES];
        [self.progress setHidden:YES];
    }
    else
    {
        [self.searchField setFrame:searchRect];
        [self.searchField setHidden:NO];
        [self.createNewPadButton setFrame:buttonRect];
        [self.createNewPadButton setHidden:NO];
        [self.progress setHidden:NO];
        [self.progress setFrame:NSMakeRect(searchRect.origin.x + searchRect.size.width - self.progress.frame.size.width - 10, searchRect.origin.y+2, self.progress.frame.size.width, self.progress.frame.size.height)];
    }
    
    NSRect searchResRect = [self.scrollView frame];
    searchResRect.size.width = NSWidth([self.backgroundView bounds]) - HORIZONTAL_PADDING * 2;
    searchResRect.origin.x = HORIZONTAL_PADDING;
    searchResRect.size.height = NSHeight([self.backgroundView bounds]) - ARROW_HEIGHT - VERTICAL_PADDING * 3 - NSHeight(searchRect);
    searchResRect.origin.y = VERTICAL_PADDING;
    
    if (NSIsEmptyRect(searchResRect))
    {
        [self.scrollView setHidden:YES];
    }
    else
    {
        [self.scrollView setFrame:searchResRect];
        [self.scrollView setHidden:NO];
    }
    self.scrollView.contentView.frame = NSRectFromCGRect((CGRect){0,0,self.scrollView.frame.size.width, self.scrollView.frame.size.height});
    [self.scrollView.documentView setFrame:NSRectFromCGRect((CGRect){0,0,self.scrollView.frame.size.width, self.scrollView.frame.size.height})];
}

#pragma mark - Keyboard

- (void)cancelOperation:(id)sender
{
    self.hasActivePanel = NO;
}

- (IBAction) handleTableClick:(id)sender {
    if([self.tableView clickedRow] >= 0 && [self.tableView clickedRow] < [self.arrayController.arrangedObjects count])
        [self padSelected:[[self.arrayController arrangedObjects] objectAtIndex:[self.tableView clickedRow]]];
}

- (void)runSearch
{
    NSString *searchFormat = @"";
    NSString *searchString = [self.searchField stringValue];
    if ([searchString length] > 0)
    {
        self.arrayController.filterPredicate = [NSPredicate predicateWithFormat:@"(title contains[cd] %@) AND (title != %@)", searchString, FILLER];
        searchFormat = NSLocalizedString(@"Search for ‘%@’…", @"Format for search request");
        [self.tableView setSearching:YES];
    } else {
        self.arrayController.filterPredicate = [NSPredicate predicateWithFormat:@"(title != %@)", FILLER];
        [self.tableView setSearching:NO];
    }
    
    NSString *searchRequest = [NSString stringWithFormat:searchFormat, searchString];
    [self.textField setStringValue:searchRequest];
}

- (void)resizePanelWithCount:(NSUInteger)count animated:(BOOL)animated duration:(NSTimeInterval)duration
{
    // Resize panel
    NSWindow* panel = [self window];
    NSRect panelRect = [panel frame];
    NSRect statusRect = [self statusRect];
    NSRect screenRect = [self mainScreenRect];
    
    panelRect.size.width = PANEL_WIDTH;
    panelRect.origin.x = roundf(NSMidX(statusRect) - NSWidth(panelRect) / 2);
    
    if (NSMaxX(panelRect) > (NSMaxX(screenRect) - ARROW_HEIGHT))
        panelRect.origin.x -= NSMaxX(panelRect) - (NSMaxX(screenRect) - ARROW_HEIGHT);
    
    
    int panelHeight = ([self.tableView intercellSpacing].height + [self.tableView rowHeight]) * count +
    self.searchField.frame.size.height + 3 * VERTICAL_PADDING + ARROW_HEIGHT;
    
    panelRect.origin.y = NSMaxY(statusRect) - panelHeight;
    panelRect.size.height = panelHeight;
    
    if(animated)
    {
        [NSView animateWithDuration:duration animation:^{
            [[panel animator] setAlphaValue:1];
            [[panel animator] setFrame:panelRect display:YES];
        } completion:^{
            [NSView animateWithDuration:TRANSITION_DURATION animation:^{
                [[self.scrollView animator] setAlphaValue:1.0];
            }];
        }];
    }
    else
    {
        [panel setAlphaValue:1];
        [panel setFrame:panelRect display:YES];
    }
    
    [self.window makeFirstResponder:self.searchField];
    [[self.searchField currentEditor] setSelectedRange:NSMakeRange([[self.searchField stringValue] length], 0)];
}

#pragma mark - Public methods

- (NSRect)mainScreenRect
{
    StatusItemView *statusItemView = nil;
    if ([self.delegate respondsToSelector:@selector(statusItemViewForPanelController:)])
    {
        statusItemView = [self.delegate statusItemViewForPanelController:self];
    }
    
    return [[[[statusItemView statusItem] window] screen] frame];
}

- (NSRect)statusRect
{
    NSRect statusRect = NSZeroRect;
    
    StatusItemView *statusItemView = nil;
    if ([self.delegate respondsToSelector:@selector(statusItemViewForPanelController:)])
    {
        statusItemView = [self.delegate statusItemViewForPanelController:self];
    }
    
    if (statusItemView)
    {
        statusRect = statusItemView.globalRect;
        statusRect.origin.y = NSMinY(statusRect) - NSHeight(statusRect);
    }
    return statusRect;
}

-(IBAction)login:(id)sender {
    
    NSString* urlString = @"https://hackpad.com/ep/account/auth-token";
    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:urlString]];
    
    [self closePanel];
}


-(IBAction)logout:(id)sender {
    self.arraySource = [NSMutableArray arrayWithCapacity:1];
    [self.arraySource addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:FILLER, @"title", nil]];
    
    self.oauthToken =  nil;
    [self.pads removeAllObjects];
    [self.collections removeAllObjects];

    self.arrayController.showAllPadsOption = NO;
    self.arrayController.showCollectionsOption = NO;
    self.arrayController.showCollectionsBackOption = NO;

    [self.arrayController rearrangeObjects];
    [self runSearch];
    
    [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:YES duration:TRANSITION_DURATION];
}

-(IBAction)createPad:(id)sender {
    //TODO: modify the URL string to create pad with title of search (if exists)
    
    NSString *urlString = nil;
    
    if([[[self searchField] stringValue] length] > 0)
        urlString = [NSString stringWithFormat:@"%@/ep/pad/newpad?title=%@", serverURL, [[[self searchField] stringValue] stringByUrlEncoding]];
    else
        urlString = [serverURL stringByAppendingString:@"/ep/pad/newpad"];
    
    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:urlString]];
    [self closePanel];
}
-(void)showCollections:(id)sender {
    [NSView animateWithDuration:TRANSITION_DURATION animation:^{
        [[self.scrollView animator] setAlphaValue:0.0];
    } completion:^{
        [self clearSearchField];
        self.arrayController.showAllPadsOption = YES;
        self.arrayController.showCollectionsOption = NO;
        self.arrayController.showCollectionsBackOption = NO;
        
        self.arraySource = self.collections;
        [self.tableView deselectAll:nil];
        
        [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:YES duration:TRANSITION_DURATION];
    }];
}
-(void)showAllPads:(id)sender {
    [NSView animateWithDuration:TRANSITION_DURATION animation:^{
        [[self.scrollView animator] setAlphaValue:0.0];
    } completion:^{
        [self clearSearchField];
        self.arrayController.showAllPadsOption = NO;
        self.arrayController.showCollectionsBackOption = NO;
        if(self.collections)
            self.arrayController.showCollectionsOption = YES;
        
        self.arraySource = self.pads;
        [self.tableView deselectAll:nil];
        
        [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:YES duration:TRANSITION_DURATION];
    }];
}

- (void)openPanel
{
    [self refreshCollectionsList];
    [self refreshPadList];
    
    NSRect statusRect = [self statusRect];
    
    NSWindow *panel = [self window];
    
    [NSApp activateIgnoringOtherApps:NO];
    [panel setAlphaValue:0];
    [panel setFrame:statusRect display:YES];
    [panel makeKeyAndOrderFront:nil];
    [self.scrollView setAlphaValue:1.0];
    
    NSTimeInterval openDuration = OPEN_DURATION;
    
    NSEvent *currentEvent = [NSApp currentEvent];
    if ([currentEvent type] == NSLeftMouseDown)
    {
        NSUInteger clearFlags = ([currentEvent modifierFlags] & NSDeviceIndependentModifierFlagsMask);
        BOOL shiftPressed = (clearFlags == NSShiftKeyMask);
        BOOL shiftOptionPressed = (clearFlags == (NSShiftKeyMask | NSAlternateKeyMask));
        if (shiftPressed || shiftOptionPressed)
        {
            openDuration *= 10;
        }
    }
    
    self.arrayController.showAllPadsOption = NO;
    self.arrayController.showCollectionsBackOption = NO;
    if(self.collections.count)
        self.arrayController.showCollectionsOption = YES;

    if (self.pads.count)
        self.arraySource = self.pads;
    [self.tableView deselectAll:nil];
    
    [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:YES duration:TRANSITION_DURATION];
    
    [panel performSelector:@selector(makeFirstResponder:) withObject:self.searchField afterDelay:openDuration];
    self.tableView.allowsEmptySelection = TRUE;
    [self.tableView deselectAll:self];
}

- (void)closePanel
{
    [NSAnimationContext beginGrouping];
    [[NSAnimationContext currentContext] setDuration:CLOSE_DURATION];
    [[[self window] animator] setAlphaValue:0];
    [NSAnimationContext endGrouping];
    
    dispatch_after(dispatch_walltime(NULL, NSEC_PER_SEC * CLOSE_DURATION * 2), dispatch_get_main_queue(), ^{
        
        [self close];
    });
}


- (void)refreshPadList {
    if (!self.oauthToken) {
        return;
    }
    // make a request
    //
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"%@/ep/api/pad-list?token=%@", serverURL, self.oauthToken]];
    ASIHTTPRequest *request = [ASIHTTPRequest requestWithURL:url];
    [request setAllowCompressedResponse:YES];
    [request setDelegate:self];
    [request startAsynchronous];
    [[NSApplication sharedApplication] updateWindows];
    if (!self.arraySource || [self.arraySource count] == 1) {
        [self.progress setUsesThreadedAnimation:TRUE];
        [self.progress startAnimation:self];
    }
}
- (void)refreshCollectionsList {
    if (!self.oauthToken) {
        return;
    }
    // make a request
    //
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"%@/ep/api/collection-info?token=%@", serverURL, self.oauthToken]];
    ASIHTTPRequest *request = [ASIHTTPRequest requestWithURL:url];
    [request setAllowCompressedResponse:YES];
    [request setDelegate:self];
    [request startAsynchronous];
    [request setUserInfo:[NSDictionary dictionaryWithObject:[NSNumber numberWithBool:YES] forKey:@"collection"]];
}

//- (void)statusItemClicked {
//    [NSTimer scheduledTimerWithTimeInterval:0.01 target:self selector:@selector(showMenu) userInfo:nil repeats:NO];
//    [NSApp activateIgnoringOtherApps:YES];
//}

- (void)requestFinished:(ASIHTTPRequest *)request
{
    if (!self.oauthToken) {
        return;
    }

    BOOL shouldResize = NO;
    
    if (![request.url.host isEqualToString:request.originalURL.host]) {
        [serverURL release];
        serverURL = [[[[[NSURL alloc] initWithString:@"/" relativeToURL:request.url] autorelease] absoluteString] autorelease];
        serverURL = [[serverURL substringToIndex:[serverURL length] - 1] retain]; // trailing '/'
        //NSLog(@"setting serverURL to %@", serverURL);
    }

    // Use when fetching text data
    NSString *responseString = [request responseString];
    
    if([[[request userInfo] objectForKey:@"collection"] boolValue] == YES)
    {
        NSMutableArray* collections = [responseString JSONValue];
        if(collections)
        {
            for(NSMutableDictionary* item in collections)
            {
                [item setObject:self forKey:@"target"];
                [item setObject:@"collectionSelected:" forKey:@"selector"];
                
                for(NSMutableDictionary* pad in [item objectForKey:@"pads"])
                {
                    if([[pad objectForKey:@"title"] isEqualToString:@""])
                        [pad setObject:@"Untitled" forKey:@"title"];
                }
            }
            
            if(self.collections.count != collections.count)
                shouldResize = YES;
            
            self.collections = collections;
            if(!self.arrayController.showAllPadsOption)
            {
                self.arrayController.showCollectionsOption = YES;
                [self.tableView reloadData];
            }
        }
    }
    else
    {
        if(!self.arrayController.showAllPadsOption)
        {
            NSMutableArray* pads = [responseString JSONValue];
            
            for(NSMutableDictionary* pad in pads)
            {
                if([[pad objectForKey:@"title"] isEqualToString:@""])
                    [pad setObject:@"Untitled" forKey:@"title"];
            }
            
            if(self.pads.count != pads.count)
                shouldResize = YES;
            
            self.pads = pads;
            self.arraySource = self.pads;
            [self.tableView reloadData];
            
            [self.progress stopAnimation:self];
        }
    }
    
    [self runSearch];
    
    if(shouldResize)
    {
        [self resizePanelWithCount:[self.arrayController.arrangedObjects count] animated:YES duration:TRANSITION_DURATION];
    }
    
}


- (void)requestFailed:(ASIHTTPRequest *)request
{
    //    NSError *error = [request error];
    [self.progress stopAnimation:self];
}

- (NSString*) oauthToken {
    return _oauthToken;
}

- (void) setOauthToken:(NSString *)oauthToken {
    [_oauthToken release];
    _oauthToken = [oauthToken retain];
    [[NSUserDefaults standardUserDefaults] setObject:oauthToken forKey:@"oauthToken"];
    [[NSUserDefaults standardUserDefaults] synchronize];
    if (self.oauthToken) {
        [self.arrayController setSignedIn:true];
        self.arraySource = [NSMutableArray arrayWithCapacity:1];
        [self.arraySource addObject:[NSMutableDictionary dictionaryWithObjectsAndKeys:FILLER, @"title", nil]];
        [self.arrayController rearrangeObjects];
        [self runSearch];
        [self refreshPadList];
        
        
    } else {
        [self.arrayController setSignedIn:false];
        [self refreshPadList];
    }
}

@end
