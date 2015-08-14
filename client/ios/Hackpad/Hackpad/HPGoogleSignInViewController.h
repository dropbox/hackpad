//
//  HPGoogleSignInViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface HPGoogleSignInViewController : UIViewController

@property (weak, nonatomic) IBOutlet UIWebView *webView;
@property (strong, nonatomic, readonly) NSURL *URL;

- (void)signInToSpaceWithURL:(NSURL *)URL
                  completion:(void (^)(BOOL, NSError *))handler;

@end
