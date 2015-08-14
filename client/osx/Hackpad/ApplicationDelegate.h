#import "MenubarController.h"
#import "PanelController.h"

@class PRHotkeyManager;

@interface ApplicationDelegate : NSObject <NSApplicationDelegate, PanelControllerDelegate> {
@private
    MenubarController *_menubarController;
    PanelController *_panelController;
    NSWindow *_splashLogo;
    struct timeval _lastKeyTime;
}

@property (nonatomic, retain) MenubarController *menubarController;
@property (nonatomic, readonly) PanelController *panelController;
@property (retain) IBOutlet NSWindow *splashLogo;

- (IBAction)togglePanel:(id)sender;

-(void) addAppAsLoginItem;    
-(void) deleteAppFromLoginItems;

@end
