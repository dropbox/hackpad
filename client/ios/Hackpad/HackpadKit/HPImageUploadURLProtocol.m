//
//  HPImageUploadURLProtocol.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPImageUploadURLProtocol.h"

#import <HackpadKit/HackpadKit.h>

#if 0
#define d(x) x
#else
#define d(x)
#endif

NSString * const HPImageUploadScheme = @"x-hackpad-image-upload";

static HPCoreDataStack *CoreDataStack;

@interface HPImageUploadURLProtocol ()
@property (nonatomic, assign) BOOL stopped;
@end

@implementation HPImageUploadURLProtocol

+ (void)setSharedCoreDataStack:(HPCoreDataStack *)coreDataStack
{
    CoreDataStack = coreDataStack;
}

+ (NSURL *)coreDataURLWithRequestURL:(NSURL *)URL
{
    static NSString * const XCoreDataScheme = @"x-coredata";
    NSString *URLString = [NSString stringWithFormat:@"%@://%@%@",
                           XCoreDataScheme, URL.host, URL.path];
    return [NSURL URLWithString:URLString];
}

+ (NSManagedObjectID *)objectIDWithRequestURL:(NSURL *)URL
{
    URL = [self coreDataURLWithRequestURL:URL];
    return [CoreDataStack.persistentStoreCoordinator managedObjectIDForURIRepresentation:URL];
}

+ (BOOL)canInitWithRequest:(NSURLRequest *)request
{
    d(HPLog(@"%s %@", __PRETTY_FUNCTION__, request.URL));
    if (![request.URL.scheme isEqualToString:HPImageUploadScheme]) {
        return NO;
    }
    NSManagedObjectID *objectID = [self objectIDWithRequestURL:request.URL];
    return [objectID.entity.name isEqualToString:HPImageUploadEntity];
}

+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request
{
    return request;
}

- (void)startLoading
{
    d(HPLog(@"%s %@", __PRETTY_FUNCTION__, self.request.URL));
    id<NSURLProtocolClient> client = self.client;
    NSURLRequest *request = self.request;
    HPImageUploadURLProtocol * __weak weakSelf = self;
    [CoreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        d(HPLog(@"%s %@", __PRETTY_FUNCTION__, request.URL));
        HPImageUploadURLProtocol *strongSelf = weakSelf;
        if (!strongSelf) {
            return;
        }
        NSManagedObjectID *objectID = [HPImageUploadURLProtocol objectIDWithRequestURL:request.URL];
        NSError * __autoreleasing error;
        HPImageUpload *imageUpload = (HPImageUpload *)[localContext existingObjectWithID:objectID
                                                                                   error:&error];
        if (error) {
            [client URLProtocol:weakSelf
               didFailWithError:error];
            return;
        }
        NSURLResponse *response = [[NSURLResponse alloc] initWithURL:request.URL
                                                            MIMEType:imageUpload.contentType
                                               expectedContentLength:imageUpload.image.length
                                                    textEncodingName:nil];
        @synchronized (strongSelf) {
            // The docs say "should" but not "must" - so races are acceptable?
            if (strongSelf.stopped) {
                return;
            }
        }
        [client URLProtocol:strongSelf
         didReceiveResponse:response
         cacheStoragePolicy:NSURLCacheStorageAllowedInMemoryOnly];
        [client URLProtocol:strongSelf
                didLoadData:imageUpload.image];
        [client URLProtocolDidFinishLoading:strongSelf];
    } completion:nil];
}

- (void)stopLoading
{
    d(HPLog(@"%s %@", __PRETTY_FUNCTION__, self.request.URL));
    @synchronized (self) {
        self.stopped = YES;
    }
}

@end
