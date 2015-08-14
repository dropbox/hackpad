/*
 * Chrome.h
 */

#import <AppKit/AppKit.h>
#import <ScriptingBridge/ScriptingBridge.h>


@class ChromeApplication, ChromeWindow, ChromeTab, ChromeBookmarkFolder, ChromeBookmarkItem;



/*
 * Standard Suite
 */

// The application's top-level scripting object.
@interface ChromeApplication : SBApplication

- (SBElementArray *) windows;

@property (copy, readonly) NSString *name;  // The name of the application.
@property (readonly) BOOL frontmost;  // Is this the frontmost (active) application?
@property (copy, readonly) NSString *version;  // The version of the application.

- (void) open:(NSArray *)x;  // Open a document.
- (void) quit;  // Quit the application.
- (BOOL) exists:(id)x;  // Verify if an object exists.

@end

// A window.
@interface ChromeWindow : SBObject

- (SBElementArray *) tabs;

@property (copy, readonly) NSString *name;  // The full title of the window.
- (NSInteger) id;  // The unique identifier of the window.
@property NSInteger index;  // The index of the window, ordered front to back.
@property NSRect bounds;  // The bounding rectangle of the window.
@property (readonly) BOOL closeable;  // Whether the window has a close box.
@property (readonly) BOOL minimizable;  // Whether the window can be minimized.
@property BOOL minimized;  // Whether the window is currently minimized.
@property (readonly) BOOL resizable;  // Whether the window can be resized.
@property BOOL visible;  // Whether the window is currently visible.
@property (readonly) BOOL zoomable;  // Whether the window can be zoomed.
@property BOOL zoomed;  // Whether the window is currently zoomed.
@property (copy, readonly) ChromeTab *activeTab;  // Returns the currently selected tab
@property (copy) NSString *mode;  // Represents the mode of the window which can be 'normal' or 'incognito', can be set only once during creation of the window.
@property NSInteger activeTabIndex;  // The index of the active tab.

- (void) saveIn:(NSURL *)in_ as:(NSString *)as;  // Save an object.
- (void) close;  // Close a window.
- (void) delete;  // Delete an object.
- (SBObject *) duplicateTo:(SBObject *)to withProperties:(NSDictionary *)withProperties;  // Copy object(s) and put the copies at a new location.
- (SBObject *) moveTo:(SBObject *)to;  // Move object(s) to a new location.
- (void) print;  // Print an object.
- (void) reload;  // Reload a tab.
- (void) goBack;  // Go Back (If Possible).
- (void) goForward;  // Go Forward (If Possible).
- (void) selectAll;  // Select all.
- (void) cutSelection;  // Cut selected text (If Possible).
- (void) copySelection;  // Copy text.
- (void) pasteSelection;  // Paste text (If Possible).
- (void) undo;  // Undo the last change.
- (void) redo;  // Redo the last change.
- (void) stop;  // Stop the current tab from loading.
- (void) viewSource;  // View the HTML source of the tab.
- (id) executeJavascript:(NSString *)javascript;  // Execute a piece of javascript.
- (void) enterPresentationMode;  // Enter presentation mode in window.
- (void) exitPresentationMode;  // Exit presentation mode in window.

@end



/*
 * Chromium Suite
 */

// The application's top-level scripting object.
@interface ChromeApplication (ChromiumSuite)

- (SBElementArray *) bookmarkFolders;

@property (copy, readonly) ChromeBookmarkFolder *bookmarksBar;  // The bookmarks bar bookmark folder.
@property (copy, readonly) ChromeBookmarkFolder *otherBookmarks;  // The other bookmarks bookmark folder.

@end

// A tab.
@interface ChromeTab : SBObject

- (NSInteger) id;  // Unique ID of the tab.
@property (copy, readonly) NSString *title;  // The title of the tab.
@property (copy) NSString *URL;  // The url visible to the user.
@property (readonly) BOOL loading;  // Is loading?

- (void) saveIn:(NSURL *)in_ as:(NSString *)as;  // Save an object.
- (void) close;  // Close a window.
- (void) delete;  // Delete an object.
- (SBObject *) duplicateTo:(SBObject *)to withProperties:(NSDictionary *)withProperties;  // Copy object(s) and put the copies at a new location.
- (SBObject *) moveTo:(SBObject *)to;  // Move object(s) to a new location.
- (void) print;  // Print an object.
- (void) reload;  // Reload a tab.
- (void) goBack;  // Go Back (If Possible).
- (void) goForward;  // Go Forward (If Possible).
- (void) selectAll;  // Select all.
- (void) cutSelection;  // Cut selected text (If Possible).
- (void) copySelection;  // Copy text.
- (void) pasteSelection;  // Paste text (If Possible).
- (void) undo;  // Undo the last change.
- (void) redo;  // Redo the last change.
- (void) stop;  // Stop the current tab from loading.
- (void) viewSource;  // View the HTML source of the tab.
- (id) executeJavascript:(NSString *)javascript;  // Execute a piece of javascript.
- (void) enterPresentationMode;  // Enter presentation mode in window.
- (void) exitPresentationMode;  // Exit presentation mode in window.

@end

// A bookmarks folder that contains other bookmarks folder and bookmark items.
@interface ChromeBookmarkFolder : SBObject

- (SBElementArray *) bookmarkFolders;
- (SBElementArray *) bookmarkItems;

- (NSNumber *) id;  // Unique ID of the bookmark folder.
@property (copy) NSString *title;  // The title of the folder.
@property (copy, readonly) NSNumber *index;  // Returns the index with respect to its parent bookmark folder

- (void) saveIn:(NSURL *)in_ as:(NSString *)as;  // Save an object.
- (void) close;  // Close a window.
- (void) delete;  // Delete an object.
- (SBObject *) duplicateTo:(SBObject *)to withProperties:(NSDictionary *)withProperties;  // Copy object(s) and put the copies at a new location.
- (SBObject *) moveTo:(SBObject *)to;  // Move object(s) to a new location.
- (void) print;  // Print an object.
- (void) reload;  // Reload a tab.
- (void) goBack;  // Go Back (If Possible).
- (void) goForward;  // Go Forward (If Possible).
- (void) selectAll;  // Select all.
- (void) cutSelection;  // Cut selected text (If Possible).
- (void) copySelection;  // Copy text.
- (void) pasteSelection;  // Paste text (If Possible).
- (void) undo;  // Undo the last change.
- (void) redo;  // Redo the last change.
- (void) stop;  // Stop the current tab from loading.
- (void) viewSource;  // View the HTML source of the tab.
- (id) executeJavascript:(NSString *)javascript;  // Execute a piece of javascript.
- (void) enterPresentationMode;  // Enter presentation mode in window.
- (void) exitPresentationMode;  // Exit presentation mode in window.

@end

// An item consists of an URL and the title of a bookmark
@interface ChromeBookmarkItem : SBObject

- (NSInteger) id;  // Unique ID of the bookmark item.
@property (copy) NSString *title;  // The title of the bookmark item.
@property (copy) NSString *URL;  // The URL of the bookmark.
@property (copy, readonly) NSNumber *index;  // Returns the index with respect to its parent bookmark folder

- (void) saveIn:(NSURL *)in_ as:(NSString *)as;  // Save an object.
- (void) close;  // Close a window.
- (void) delete;  // Delete an object.
- (SBObject *) duplicateTo:(SBObject *)to withProperties:(NSDictionary *)withProperties;  // Copy object(s) and put the copies at a new location.
- (SBObject *) moveTo:(SBObject *)to;  // Move object(s) to a new location.
- (void) print;  // Print an object.
- (void) reload;  // Reload a tab.
- (void) goBack;  // Go Back (If Possible).
- (void) goForward;  // Go Forward (If Possible).
- (void) selectAll;  // Select all.
- (void) cutSelection;  // Cut selected text (If Possible).
- (void) copySelection;  // Copy text.
- (void) pasteSelection;  // Paste text (If Possible).
- (void) undo;  // Undo the last change.
- (void) redo;  // Redo the last change.
- (void) stop;  // Stop the current tab from loading.
- (void) viewSource;  // View the HTML source of the tab.
- (id) executeJavascript:(NSString *)javascript;  // Execute a piece of javascript.
- (void) enterPresentationMode;  // Enter presentation mode in window.
- (void) exitPresentationMode;  // Exit presentation mode in window.

@end

@interface ChromeWindow (ChromiumSuite)

@property (readonly) BOOL presenting;  // Whether the window is in presentation mode.

@end

