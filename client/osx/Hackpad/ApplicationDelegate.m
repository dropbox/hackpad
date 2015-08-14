#include <sys/time.h>
#include <Carbon/Carbon.h>

#import "ApplicationDelegate.h"
#import "Sparkle/Sparkle.h"
#import "PreferenceKeys.h"

void *kContextActivePanel = &kContextActivePanel;


OSStatus HotkeyPressedHandler(EventHandlerCallRef inCaller, EventRef inEvent, void* inUserData);
OSStatus HotkeyPressedHandler(EventHandlerCallRef inCaller, EventRef inEvent, void* inUserData)
{
    [(ApplicationDelegate*)inUserData performSelectorOnMainThread:@selector(togglePanel:) withObject:nil waitUntilDone:NO];
	return noErr;
}
EventHotKeyRef hotKeyRef = NULL;

@implementation ApplicationDelegate

@synthesize menubarController = _menubarController;
@synthesize splashLogo = _splashLogo;

#pragma mark -

- (void)dealloc
{
    [_menubarController release];
    [_panelController removeObserver:self forKeyPath:@"hasActivePanel"];
    [_panelController release];
    
    [super dealloc];
}

#pragma mark -

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context
{
    if (context == kContextActivePanel)
    {
        self.menubarController.hasActiveIcon = self.panelController.hasActivePanel;
    }
    else
    {
        [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
    }
}

#pragma mark - NSApplicationDelegate

+ (void)initialize
{
    // Set up User Defaults
    NSMutableDictionary* defaults = [NSMutableDictionary dictionaryWithContentsOfFile:
                                     [[NSBundle mainBundle] pathForResource:@"Defaults" ofType:@"plist"]];
    [DEFAULTS registerDefaults:defaults];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
    // Install icon into the menu bar
    [self.menubarController = [[MenubarController alloc] init] release];
    
    // Make us auto-launch
    [self addAppAsLoginItem];
    
    // Register for URL invocations
	[[NSAppleEventManager sharedAppleEventManager] 
     setEventHandler:self andSelector:@selector(getUrl:withReplyEvent:) 
     forEventClass:kInternetEventClass andEventID:kAEGetURL];
    
    
    [[SUUpdater sharedUpdater] checkForUpdatesInBackground];
    
    [self togglePanel:self];
    
    if(FIRST_RUN)
    {
        [self togglePanel:self];
        [DEFAULTS setBool:NO forKey:FIRST_RUN_KEY];
    }
    
    //Install the hotkey
    
    EventTypeSpec eventType = {kEventClassKeyboard,kEventHotKeyPressed};
    OSStatus err = InstallApplicationEventHandler(HotkeyPressedHandler, 1, &eventType, self, NULL);
    if(!err)
    {        
        RegisterEventHotKey(kVK_Escape, cmdKey, (EventHotKeyID){0,0}, GetEventDispatcherTarget(), 0, &hotKeyRef);        
    }
}



- (void)getUrl:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent
{
	NSString *url = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
    //    NSURL *callbackURL = [NSURL URLWithString:url];
	// Now you can parse the URL and perform whatever action is needed
    // save the token and mark ourselves as logged in
    self.panelController.oauthToken = [url substringFromIndex:[@"hackpad://auth/" length]];
    [self togglePanel:self];
}



- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender
{
    // Explicitly remove the icon from the menu bar
    self.menubarController = nil;
    
    UnregisterEventHotKey(hotKeyRef);
    
    [DEFAULTS synchronize];
    
    return NSTerminateNow;
}

#pragma mark - Actions

- (IBAction)togglePanel:(id)sender
{
    self.menubarController.hasActiveIcon = !self.menubarController.hasActiveIcon;
    self.panelController.hasActivePanel = self.menubarController.hasActiveIcon;
}

#pragma mark - Public accessors

- (PanelController *)panelController
{
    if (_panelController == nil)
    {
        _panelController = [[PanelController alloc] initWithDelegate:self];
        [_panelController addObserver:self forKeyPath:@"hasActivePanel" options:NSKeyValueObservingOptionInitial context:kContextActivePanel];
    }
    return _panelController;
}

#pragma mark - PanelControllerDelegate

- (StatusItemView *)statusItemViewForPanelController:(PanelController *)controller
{
    return self.menubarController.statusItemView;
}

// via http://cocoatutorial.grapewave.com/tag/lssharedfilelistinsertitemurl/
-(void) addAppAsLoginItem {
	NSString * appPath = [[NSBundle mainBundle] bundlePath];
    
	// This will retrieve the path for the application
	// For example, /Applications/test.app
	CFURLRef url = (CFURLRef)[NSURL fileURLWithPath:appPath]; 
    
	// Create a reference to the shared file list.
    // We are adding it to the current user only.
    // If we want to add it all users, use
    // kLSSharedFileListGlobalLoginItems instead of
    //kLSSharedFileListSessionLoginItems
	LSSharedFileListRef loginItems = LSSharedFileListCreate(NULL,
                                                            kLSSharedFileListSessionLoginItems, NULL);
	if (loginItems) {
        
        //Check whether we're already in the list
        BOOL found = NO;
        UInt32 seedValue;
        NSArray  *loginItemsArray = (NSArray *)LSSharedFileListCopySnapshot(loginItems, &seedValue);
		for(int i = 0; i< [loginItemsArray count]; i++){
			LSSharedFileListItemRef itemRef = (LSSharedFileListItemRef)[loginItemsArray
                                                                        objectAtIndex:i];
			//Resolve the item with URL
            CFURLRef currentUrl;
			if (LSSharedFileListItemResolve(itemRef, 0, (CFURLRef*) &currentUrl, NULL) == noErr) {
				NSString * urlPath = [(NSURL*)currentUrl path];
				if ([urlPath compare:appPath] == NSOrderedSame){
                    CFRelease(currentUrl);
                    found = YES;
                    break;
				}
                CFRelease(currentUrl);
			}
		}
		[loginItemsArray release];
		
        //Insert an item to the list.
        if (!found) {
            LSSharedFileListItemRef item = LSSharedFileListInsertItemURL(loginItems,
                                                                         kLSSharedFileListItemLast, NULL, NULL,
                                                                         url, NULL, NULL);
            if (item){
                CFRelease(item);
            }
        }
        CFRelease(loginItems);
	}	    
	
}


-(void) deleteAppFromLoginItems{
	NSString * appPath = [[NSBundle mainBundle] bundlePath];
    
	// This will retrieve the path for the application
	// For example, /Applications/test.app
	CFURLRef url = (CFURLRef)[NSURL fileURLWithPath:appPath]; 
    
	// Create a reference to the shared file list.
	LSSharedFileListRef loginItems = LSSharedFileListCreate(NULL,
                                                            kLSSharedFileListSessionLoginItems, NULL);
    
	if (loginItems) {
		UInt32 seedValue;
		//Retrieve the list of Login Items and cast them to
		// a NSArray so that it will be easier to iterate.
		NSArray  *loginItemsArray = (NSArray *)LSSharedFileListCopySnapshot(loginItems, &seedValue);
		for(int i =0; i< [loginItemsArray count]; i++){
			LSSharedFileListItemRef itemRef = (LSSharedFileListItemRef)[loginItemsArray
                                                                        objectAtIndex:i];
			//Resolve the item with URL
			if (LSSharedFileListItemResolve(itemRef, 0, (CFURLRef*) &url, NULL) == noErr) {
				NSString * urlPath = [(NSURL*)url path];
				if ([urlPath compare:appPath] == NSOrderedSame){
					LSSharedFileListItemRemove(loginItems,itemRef);
				}
                CFRelease(url);
			}
		}
		[loginItemsArray release];
	}
}

@end
