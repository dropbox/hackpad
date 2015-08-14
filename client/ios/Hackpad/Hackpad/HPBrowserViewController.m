//
//  HPBrowserViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPBrowserViewController.h"

#import "HackpadAdditions/HackpadAdditions.h"

@interface HPBrowserViewController () <UIPopoverControllerDelegate>

@property (nonatomic, strong) UIPopoverController *activityPopover;

@end

@implementation HPBrowserViewController

- (void)viewDidLoad
{
    if (self.initialRequest) {
        [self.webView loadRequest:self.initialRequest];
        self.initialRequest = nil;
    }
}

- (void)dealloc
{
    self.webView.delegate = nil;
}

- (void)updateToolbar
{
    self.forwardButton.enabled = self.webView.canGoForward;
    self.backButton.enabled = self.webView.canGoBack;
    [self.navigationController setToolbarHidden:!(self.webView.canGoBack || self.webView.canGoForward)
                                       animated:YES];
}

- (BOOL)webView:(UIWebView *)webView
shouldStartLoadWithRequest:(NSURLRequest *)request
 navigationType:(UIWebViewNavigationType)navigationType
{
    HPLog(@"[%@] Loading %@...", request.URL.host, request.URL.absoluteString);
    if (request.URL.hp_isHackpadURL && self.delegate) {
        return [self.delegate browserViewController:self
                  shouldStartLoadWithHackpadRequest:request];
    }
    return YES;
}

- (void)webView:(UIWebView *)webView
didFailLoadWithError:(NSError *)error
{
    UIApplication.sharedApplication.networkActivityIndicatorVisible = NO;
    [self updateToolbar];
}

- (void)webViewDidFinishLoad:(UIWebView *)webView
{
    self.navigationItem.title = [self.webView stringByEvaluatingJavaScriptFromString:@"document.title"];
    UIApplication.sharedApplication.networkActivityIndicatorVisible = NO;
    [self updateToolbar];
}

- (void)webViewDidStartLoad:(UIWebView *)webView
{
    UIApplication.sharedApplication.networkActivityIndicatorVisible = YES;
}

- (IBAction)close:(id)sender
{
    [self dismissViewControllerAnimated:YES
                             completion:^{}];
}

- (IBAction)share:(id)sender
{
    if (self.activityPopover) {
        [self.activityPopover dismissPopoverAnimated:YES];
        self.activityPopover = nil;
        return;
    }

    UIActivityViewController *activity = [[UIActivityViewController alloc] initWithActivityItems:@[self.webView.request.URL]
                                                                           applicationActivities:nil];
    if (UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPad) {
        self.activityPopover = [[UIPopoverController alloc] initWithContentViewController:activity];
        self.activityPopover.delegate = self;
        [self.activityPopover presentPopoverFromBarButtonItem:sender
                                 permittedArrowDirections:UIPopoverArrowDirectionAny
                                                 animated:YES];
    } else {
        [self presentViewController:activity
                           animated:YES
                         completion:^{}];
    }
}

- (void)popoverControllerDidDismissPopover:(UIPopoverController *)popoverController
{
    if (popoverController == self.activityPopover) {
        self.activityPopover = nil;
    }
}

@end
