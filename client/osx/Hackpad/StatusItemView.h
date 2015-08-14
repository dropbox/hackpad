@interface StatusItemView : NSView {
@private
    NSImage *_image;
    NSImage *_alternateImage;
    NSStatusItem *_statusItem;
    BOOL _isHighlighted;
    SEL _action;
    id _target;
}

- (id)initWithStatusItem:(NSStatusItem *)statusItem;

@property (nonatomic, readonly) NSStatusItem *statusItem;
@property (nonatomic, retain) NSImage *image;
@property (nonatomic, retain) NSImage *alternateImage;
@property (nonatomic, setter = setHighlighted:) BOOL isHighlighted;
@property (nonatomic, readonly) NSRect globalRect;
@property (nonatomic) SEL action;
@property (nonatomic, assign) id target;

@end
