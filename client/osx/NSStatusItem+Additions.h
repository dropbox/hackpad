#import <Cocoa/Cocoa.h>


@interface NSStatusItem (Additions)
- (NSWindow*)window;
- (NSRect)frameInScreenCoordinates;
@end