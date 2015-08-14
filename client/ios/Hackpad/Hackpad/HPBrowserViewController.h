//
//  HPBrowserViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@protocol HPBrowserViewControllerDelegate;

@interface HPBrowserViewController : UIViewController <UIWebViewDelegate>
@property (weak, nonatomic) IBOutlet UIWebView *webView;
@property (weak, nonatomic) IBOutlet UIBarButtonItem *backButton;
@property (weak, nonatomic) IBOutlet UIBarButtonItem *forwardButton;
@property (copy, nonatomic) NSURLRequest *initialRequest;
@property (weak, nonatomic) id<HPBrowserViewControllerDelegate> delegate;

- (IBAction)close:(id)sender;
- (IBAction)share:(id)sender;
@end

@protocol HPBrowserViewControllerDelegate <NSObject>

- (BOOL)browserViewController:(HPBrowserViewController *)browserViewController
shouldStartLoadWithHackpadRequest:(NSURLRequest *)request;

@end