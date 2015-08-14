#import <Cocoa/Cocoa.h>

@interface NSView (AnimationBlock)

+ (void)animation:(void (^)(void))animationBlock;
+ (void)animation:(void (^)(void))animationBlock
       completion:(void (^)(void))completionBlock;
+ (void)animateWithDuration:(NSTimeInterval)duration 
                  animation:(void (^)(void))animationBlock;
+ (void)animateWithDuration:(NSTimeInterval)duration 
                  animation:(void (^)(void))animationBlock
                 completion:(void (^)(void))completionBlock;
@end
