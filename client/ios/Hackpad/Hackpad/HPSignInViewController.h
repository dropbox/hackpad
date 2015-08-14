//
//  HPSignInViewController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPSpace;

@interface HPSignInViewController : UIViewController <UITextFieldDelegate>

@property (strong, nonatomic, readonly) HPSpace *space;
@property (strong, nonatomic, readonly) NSURL *URL;

@property (weak, nonatomic) IBOutlet UIButton *googleButton;
@property (weak, nonatomic) IBOutlet UIButton *facebookButton;
@property (weak, nonatomic) IBOutlet UIView *orView;
@property (weak, nonatomic) IBOutlet UILabel *orLabel;
@property (weak, nonatomic) IBOutlet UIView *leftDots;
@property (weak, nonatomic) IBOutlet UIView *rightDots;
@property (weak, nonatomic) IBOutlet UIButton *emailButton;
@property (weak, nonatomic) IBOutlet UIButton *forgotPasswordButton;
@property (weak, nonatomic) IBOutlet UIButton *showSignUpButton;

@property (weak, nonatomic) IBOutlet UITextField *nameField;
@property (weak, nonatomic) IBOutlet UITextField *emailField;
@property (weak, nonatomic) IBOutlet UITextField *passwordField;
@property (weak, nonatomic) IBOutlet UITextField *verifyField;

@property (nonatomic, strong) IBOutlet UIBarButtonItem *cancelItem;
@property (nonatomic, strong) IBOutlet UIBarButtonItem *backItem;
@property (nonatomic, strong) IBOutlet UIBarButtonItem *signInItem;
@property (nonatomic, strong) IBOutlet UIBarButtonItem *signUpItem;

- (IBAction)showButtons:(id)sender;
- (IBAction)cancelSignIn:(id)sender;

- (IBAction)signInToFacebook:(id)sender;

- (IBAction)showSignIn:(id)sender;
- (IBAction)signIn:(id)sender;
- (IBAction)showForgottenPassword:(id)sender;

- (IBAction)showSignUp:(id)sender;
- (IBAction)signUp:(id)sender;
- (IBAction)resendVerification:(id)sender;

- (IBAction)updateCheckbox:(UITextField *)sender;
- (IBAction)updateSignInItem:(id)sender;
- (IBAction)updateSignUpItem:(id)sender;

- (void)signInToSpace:(HPSpace *)space
           completion:(void (^)(BOOL, NSError *))handler;

@end

@interface SignInAlertHelper : NSObject <UIAlertViewDelegate>
@property (strong, nonatomic) UIAlertView *alertView;
@property (strong, nonatomic) NSError *error;
@property (strong, nonatomic) SignInAlertHelper *cycle;

+ (void)showAlertWithSignInError:(NSError *)error;
@end
