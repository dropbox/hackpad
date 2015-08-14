#import "NSStatusItem+Additions.h"

@implementation NSStatusItem (Additions)

- (NSWindow*)window {
	if ([self respondsToSelector: @selector(_window)]) {
		return [self performSelector: @selector(_window)];
	}
	return nil;
}

- (NSRect)frameInScreenCoordinates {
	NSWindow *theWindow = [self window];
	if (theWindow) {
		return [theWindow frame];
	}
	return NSZeroRect; 
}

@end