#import "NSView+AnimationBlock.h"

typedef void(^VoidBlock)(void);

@interface NSView (AnimationBlockInternal)
+ (void)runEndBlock:(void (^)(void))completionBlock;
@end

@implementation NSView (AnimationBlock)

+ (void)animation:(void (^)(void))animationBlock
{
  [self animateWithDuration:0.25 animation:animationBlock];
}
+ (void)animation:(void (^)(void))animationBlock
       completion:(void (^)(void))completionBlock
{
  [self animateWithDuration:0.25 animation:animationBlock completion:completionBlock];
}


+ (void)animateWithDuration:(NSTimeInterval)duration
                  animation:(void (^)(void))animationBlock
{
  [self animateWithDuration:duration animation:animationBlock completion:nil];
}
+ (void)animateWithDuration:(NSTimeInterval)duration
                  animation:(void (^)(void))animationBlock
                 completion:(void (^)(void))completionBlock
{
  [NSAnimationContext beginGrouping];
  [[NSAnimationContext currentContext] setDuration:duration];
  animationBlock();
  [NSAnimationContext endGrouping];
  
  if(completionBlock)
  {
    VoidBlock completionBlockCopy = [[completionBlock copy] autorelease];
    
    double delayInSeconds = duration;
    dispatch_time_t popTime = dispatch_time(DISPATCH_TIME_NOW, delayInSeconds * NSEC_PER_SEC);
    dispatch_after(popTime, dispatch_get_main_queue(), ^(void){
      completionBlockCopy();
    });
  }
}

@end

@implementation NSView (AnimationBlockInternal)

+ (void)runEndBlock:(void (^)(void))completionBlock
{
  completionBlock();
}

@end
