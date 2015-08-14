//
//  HPGoogleSignInViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPGoogleSignInViewController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadUIAdditions.h"

#import <MBProgressHUD/MBProgressHUD.h>

static NSString * const HPGoogleSignInPath = @"/ep/account/google-sign-in";

static NSString * const HPContParam = @"cont";

// From WebKitErrors.h
static NSString *HPWebKitErrorDomain = @"WebKitErrorDomain";
enum {
    HPWebKitErrorCannotShowMIMEType =                             100,
    HPWebKitErrorCannotShowURL =                                  101,
    HPWebKitErrorFrameLoadInterruptedByPolicyChange =             102,
};

static NSString * const SignedInPath = @"/ep/iOS/x-HackpadKit-signed-in";
static NSString * const UserIdKey = @"userId";

@interface HPGoogleSignInViewController () <UIWebViewDelegate> {
    void (^_signInHandler)(BOOL, NSError *);
}

@property (nonatomic, readonly) BOOL hasGoogleCookies;

- (void)dismissWithError:(NSError *)error
               cancelled:(BOOL)cancelled;
- (void)loadRequest;

@end

@implementation HPGoogleSignInViewController

- (void)loadRequest
{
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:[NSURL URLWithString:HPGoogleSignInPath
                                                                   relativeToURL:self.URL]
                                                 HTTPMethod:@"GET"
                                                 parameters:@{
                                                HPContParam:[[NSURL URLWithString:SignedInPath
                                                                    relativeToURL:self.URL] absoluteString]
                             }];
    [MBProgressHUD showHUDAddedTo:self.view
                         animated:YES];
    [self.webView loadRequest:request];
}

- (void)viewDidLoad
{
    [super viewDidLoad];
    if (self.URL) {
        [self loadRequest];
    }
}

- (void)signInToSpaceWithURL:(NSURL *)URL
                  completion:(void (^)(BOOL, NSError *))handler
{
    NSParameterAssert(handler);
    _signInHandler = handler;
    _URL = URL;
    if (self.isViewLoaded) {
        [self loadRequest];
    }
}

- (void)dismissWithError:(NSError *)error
               cancelled:(BOOL)cancelled
{
    // We don't want to get any more notifications.
    self.webView.delegate = nil;
     void (^handler)(BOOL, NSError *) = _signInHandler;
     _signInHandler = nil;
     if (handler) {
         handler(cancelled, error);
     }
}

#pragma mark - Web view delegate methods

- (BOOL)webView:(UIWebView *)webView
shouldStartLoadWithRequest:(NSURLRequest *)request
 navigationType:(UIWebViewNavigationType)navigationType
{
    static NSString * const OpenIDPath = @"/ep/account/openid";
    HPLog(@"[%@] Should load %@?", self.URL.host, request.URL.absoluteString);
    if (![request.URL hp_isOriginEqualToURL:self.URL]) {
        return YES;
    }
    if ([request.URL.path isEqualToString:SignedInPath]) {
        [self dismissWithError:nil
                     cancelled:NO];
        return NO;
    }
    if ([request.URL.path isEqualToString:OpenIDPath]) {
        [MBProgressHUD showHUDAddedTo:self.view
                             animated:YES];
    }
    return YES;
}

- (void)webViewDidStartLoad:(UIWebView *)webView
{
    HPLog(@"[%@] Loading %@...", self.URL.host, webView.request.URL.absoluteString);
}

- (void)webViewDidFinishLoad:(UIWebView *)webView
{
    [MBProgressHUD hideAllHUDsForView:self.view
                             animated:YES];
    HPLog(@"[%@] Loaded %@.", self.URL.host, webView.request.URL.absoluteString);
    // Workaround in case of some server bug where we get redrected to /.
    if ([webView.request.URL hp_isOriginEqualToURL:self.URL] &&
        /* [webView.request.URL.path isEqualToString:@"/"] && */
        [webView hp_clientVarValueForKey:UserIdKey].length) {
        HPLog(@"[%@] Signed in, but to %@ and not %@.",
              self.URL.host, webView.request.URL.absoluteString,
              [[NSURL URLWithString:SignedInPath
                      relativeToURL:self.URL] absoluteString]);
        [self dismissWithError:nil
                     cancelled:NO];
    }
}

- (void)webView:(UIWebView *)webView
didFailLoadWithError:(NSError *)error
{
    if ([error.domain isEqualToString:HPWebKitErrorDomain] &&
        error.code == HPWebKitErrorFrameLoadInterruptedByPolicyChange) {
        return;
    }
    [self dismissWithError:error
                 cancelled:NO];
}

@end
