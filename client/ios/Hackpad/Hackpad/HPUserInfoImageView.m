//
//  HPUserInfoImageView.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPUserInfoImageView.h"

#import <HackpadAdditions/HackpadUIAdditions.h>

#import "HPUserInfo.h"
#import "HPStaticCachingURLProtocol.h"
#import "NSURL+HackpadAdditions.h"

#import "UIImage+Resize.h"
#import <TestFlight/TestFlight.h>

static NSString * const AboutUnknown = @"about:unknown";
static CGFloat const ImageOffset = 4;
static CGFloat const CircleOffset = 1;
static CGFloat const ShadowOffset = 5;

@interface HPUserInfoImageView () {
    UIImageView *_connectedView;
    NSURL *_URL;
}
@property (nonatomic, strong, readwrite) UIImageView *imageView;
@property (nonatomic, readonly) UIImageView *connectedView;
@end

@implementation HPUserInfoImageView

+ (UIImage *)connectedImage
{
    return [UIImage imageNamed:@"online.png"];
}

+ (UIImage *)unknownImage
{
    return [UIImage imageNamed:@"nophoto.png"];
}

+ (NSCache *)imageCache
{
    static NSCache *cache;
    if (!cache) {
        cache = [[NSCache alloc] init];
        cache.countLimit = 32;
    }
    return cache;
}

+ (NSCache *)imageCacheAtSize:(CGFloat)size
{
    NSCache *cache = [self imageCache];
    NSNumber *key = [NSNumber numberWithFloat:size];
    NSCache *sizeCache = [cache objectForKey:key];
    if (!sizeCache) {
        sizeCache = [[NSCache alloc] init];
        sizeCache.countLimit = 32;
        [cache setObject:sizeCache
                  forKey:key];
    }
    return sizeCache;
}

+ (NSData *)cachedDataForURL:(NSURL *)URL
{
    return [HPStaticCachingURLProtocol cachedDataWithRequest:[NSURLRequest requestWithURL:URL]
                                           returningResponse:NULL
                                                       error:NULL];
}

+ (UIImage *)nonIndexedImageWithImage:(UIImage *)image
{
    // Thumbnailing doesn't work on indexed images.
    return CGColorSpaceGetModel(CGImageGetColorSpace(image.CGImage)) == kCGColorSpaceModelIndexed
        ? [UIImage imageWithData:UIImageJPEGRepresentation(image, 1)]
        : image;
}

+ (UIImage *)cachedImageForURL:(NSURL *)URL
{
    NSCache *cache = [self imageCache];
    UIImage *image = [cache objectForKey:URL.absoluteString];
    if (!image) {
        if ([URL.absoluteString isEqualToString:AboutUnknown]) {
            image = [self unknownImage];
        } else {
            NSData *data = [self cachedDataForURL:URL];
            if (data) {
                image = [UIImage imageWithData:data];
            }
        }
        if (image) {
            image = [self nonIndexedImageWithImage:image];
            [self setCachedImage:image
                          forURL:URL];
        }
    }
    return image;
}

+ (void)setCachedImage:(UIImage *)image
                forURL:(NSURL *)URL
{
    [[self imageCache] setObject:image
                          forKey:URL.absoluteString];
}

+ (UIImage *)thumbnailImageForURL:(NSURL *)URL
                             size:(CGFloat)size
{
    NSCache *sizeCache = [self imageCacheAtSize:size];
    UIImage *image = [sizeCache objectForKey:URL.absoluteString];
    if (!image) {
        image = [self cachedImageForURL:URL];
        if (image) {
            CGFloat scale = [UIScreen mainScreen].scale;
            image = [image thumbnailImage:size * scale
                        transparentBorder:0
                             cornerRadius:size * scale / 2
                     interpolationQuality:kCGInterpolationHigh];
            if (image) {
                [sizeCache setObject:image
                              forKey:URL.absoluteString];
            } else {
                TFLog(@"[%@] Could not create thumbnail image %@", URL.host,
                      URL.hp_fullPath);
            }
        }
    }
    return image;
}

- (BOOL)isOpaque
{
    return NO;
}

- (void)setStack:(BOOL)stack
{
    if (stack == _stack) {
        return;
    }
    _stack = stack;
    self.imageView.frame = self.imageFrame;
    [self setNeedsDisplay];
}

- (CGRect)imageFrame
{
    CGFloat scale = [UIScreen mainScreen].scale;
    CGFloat sizeOffset = 2 * ImageOffset;
    if (self.isStack) {
        sizeOffset += ShadowOffset;
    }
    return CGRectMake(ImageOffset / scale, ImageOffset / scale,
                      CGRectGetWidth(self.frame) - sizeOffset / scale,
                      CGRectGetHeight(self.frame) - sizeOffset / scale);
}

- (UIImageView *)imageView
{
    if (_imageView) {
        return _imageView;
    }

    _imageView = [[UIImageView alloc] initWithFrame:self.imageFrame];
    [self addSubview:_imageView];

    return _imageView;
}

- (UIImageView *)connectedView
{
    if (!_connectedView) {
        _connectedView = [[UIImageView alloc] initWithImage:[self.class connectedImage]];
        _connectedView.autoresizingMask =
            UIViewAutoresizingFlexibleLeftMargin |
            UIViewAutoresizingFlexibleTopMargin;
        _connectedView.hidden = YES;
        CGRect frame = _connectedView.frame;
        frame.origin.x = self.frame.size.width - frame.size.width;
        frame.origin.y = self.frame.size.height - frame.size.height;
        _connectedView.frame = frame;
        [self addSubview:_connectedView];
    }
    return _connectedView;
}

- (void)requestImageWithAnimated:(BOOL (^)(void))animated
{
    NSURL *URL = _URL;
    NSURLRequest *request = [NSURLRequest requestWithURL:URL
                                             cachePolicy:NSURLRequestReturnCacheDataElseLoad
                                         timeoutInterval:60];
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         if (error) {
             TFLog(@"[%@] Could not load image %@: %@", URL.host,
                   URL.hp_fullPath, error);
             return;
         }
         UIImage *image;
         if ([response isKindOfClass:[NSHTTPURLResponse class]] &&
             [(NSHTTPURLResponse *)response statusCode] == 200) {
             image = [UIImage imageWithData:data];
         }
         if (image) {
             image = [self.class nonIndexedImageWithImage:image];
             [self.class setCachedImage:image
                                 forURL:URL];
         }
         if (!image || ![URL isEqual:_URL]) {
             return;
         }
         image = [self.class thumbnailImageForURL:URL
                                             size:self.frame.size.height];
         if (animated()) {
             [UIView transitionWithView:self
                               duration:0.25
                                options:UIViewAnimationOptionTransitionCrossDissolve
                             animations:^{
                                 self.imageView.image = image;
                             }
                             completion:NULL];
         } else {
             self.imageView.image = image;
         }
     }];
}

- (void)setURL:(NSURL *)URL
     connected:(BOOL)connected
      animated:(BOOL)animated
{
    [self setURL:URL
       connected:connected
   animatedBlock:^{ return animated; }];
}

- (void)setURL:(NSURL *)URL
     connected:(BOOL)connected
 animatedBlock:(BOOL (^)(void))animated
{
    UIImage *image;
    BOOL setImage = ![_URL isEqual:URL] || !URL != !self.imageView.image;
    if (setImage) {
        _URL = URL;
        if (URL) {
            image = [self.class thumbnailImageForURL:URL
                                                size:self.frame.size.height];
        }
        if (!image) {
            image = [self.class thumbnailImageForURL:[NSURL URLWithString:AboutUnknown]
                                                size:self.frame.size.height];
            if (URL) {
                HPLog(@"[%@] Need to download %@", URL.host, URL.hp_fullPath);
                [self requestImageWithAnimated:animated];
            }
        }
    }
    void (^animations)(void) = ^{
        if (setImage) {
            self.imageView.image = image;
        }
        self.connectedView.hidden = !connected;
    };
    if (animated()) {
        [UIView transitionWithView:self
                          duration:0.25
                           options:UIViewAnimationOptionTransitionCrossDissolve
                        animations:animations
                        completion:NULL];
    } else {
        animations();
    }
}

- (void)drawRect:(CGRect)rect
{
    CGFloat scale = [UIScreen mainScreen].scale;
    CGContextRef ctx = UIGraphicsGetCurrentContext();

    [[UIColor hp_darkGreenColor] setStroke];
    [[UIColor whiteColor] setFill];
    CGContextSetLineWidth(ctx, 1 / scale);

    CGFloat size = 2 * CircleOffset;
    if (self.isStack) {
        size += ShadowOffset;
#if 1
        CGContextAddEllipseInRect(ctx, CGRectMake(rect.origin.x + (CircleOffset + 3) / scale,
                                                  rect.origin.y + (CircleOffset + 4) / scale,
                                                  rect.size.width - size / scale,
                                                  rect.size.height - size / scale));
        CGContextDrawPath(ctx, kCGPathFillStroke);
#endif
        CGContextSetShadow(ctx, CGSizeMake(0, 1), 1);
    }

    CGContextAddEllipseInRect(ctx, CGRectMake(rect.origin.x + CircleOffset / scale,
                                              rect.origin.y + CircleOffset / scale,
                                              rect.size.width - size / scale,
                                              rect.size.height - size / scale));
    CGContextDrawPath(ctx, kCGPathFillStroke);
}

@end
