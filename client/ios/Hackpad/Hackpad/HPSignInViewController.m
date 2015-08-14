//
//  HPSignInViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPSignInViewController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadUIAdditions.h"

#import "HPGoogleSignInViewController.h"

#import <AppleSampleCode/Reachability.h>
#import <FacebookSDK/FacebookSDK.h>
#import <MBProgressHUD/MBProgressHUD.h>
#import <TestFlight/TestFlight.h>

static NSString * const HPConnectFBSessionPath = @"/ep/account/connect-fb-session";
static NSString * const HPForgotPasswordPath = @"/ep/account/forgot-password";
static NSString * const HPPostSigninPath = @"/ep/account/signin";
static NSString * const HPResendEmailVerificationPath = @"/ep/account/resend-email-verification";
static NSString * const HPSignUpPath = @"/ep/account/signup";

static NSString * const SignedInPath = @"/ep/iOS/x-HackpadKit-signed-in";

static NSString * const HPAccessTokenParam = @"access_token";
static NSString * const HPEmailParam = @"email";
static NSString * const HPNameParam = @"name";
static NSString * const HPPasswordParam = @"password";

static NSString * const UserIdKey = @"userId";

static const NSUInteger BigFontSize = 30;
static const NSUInteger NormalFontSize = 17;
static const NSUInteger SmallFontSize = 14;
#define PADDING (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad ? @60 : @20)
#define SPACING (@24)

#define ALWAYS_SIGN_OUT 1

typedef NS_ENUM(NSUInteger, ActionType) {
    NoAction,
    VerifyEmailAction,
    RecoverPasswordAction
};

@interface HPSignInViewController () <UIAlertViewDelegate> {
    void (^_signInHandler)(BOOL, NSError *);
    ActionType _action;
    UIAlertView *_alert;
    BOOL _triedRenewing;
}

@property (nonatomic, readonly) BOOL hasGoogleCookies;
@property (nonatomic, assign, getter = isPasswordVerified) BOOL passwordVerified;
@property (nonatomic, strong) NSArray *topConstraints;
@property (nonatomic, strong) UILabel *titleLabel;

- (void)signInWithFacebook;
- (void)signOutOfGoogle;
- (void)dismissWithError:(NSError *)error
               cancelled:(BOOL)cancelled;
- (void)requestPasswordResetForEmail:(NSString *)email;
- (void)resendVerificationForEmail:(NSString *)email;
@end

@implementation HPSignInViewController

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)setPromptHidden:(BOOL)hidden
{
    // FIXME: figure out why color here is wrong on iOS 6
    if (hidden || self.space.URL.hp_isToplevelHackpadURL || HP_SYSTEM_MAJOR_VERSION() < 7) {
        self.navigationItem.prompt = nil;
        return;
    }
    self.navigationItem.prompt = @"WELCOME TO";
}

- (void)configureView
{
    self.googleButton.enabled = self.space.signInMethods & HPGoogleSignInMask;
    [self.facebookButton hp_setAlphaWithUserInteractionEnabled:self.space.signInMethods & HPFaceboookSignInMask];
    self.emailButton.enabled = self.space.signInMethods & HPPasswordSignInMask;

    [self updateSignUpItem:self];
    [self updateSignInItem:self];
}

- (NSUInteger)supportedInterfaceOrientations
{
    return UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone
        ? UIInterfaceOrientationMaskPortrait
        : UIInterfaceOrientationMaskAll;
}

- (void)viewDidLoad
{
    static const CGFloat ButtonHeight = 44;

    [super viewDidLoad];

    NSDictionary *views = NSDictionaryOfVariableBindings(_googleButton, _facebookButton, _orView,
                                                         _emailButton, _forgotPasswordButton, _showSignUpButton,
                                                         _nameField, _emailField, _passwordField, _verifyField);
    // Reset IB constraints
    for (UIView *view in views.allValues) {
        [view removeFromSuperview];
        view.translatesAutoresizingMaskIntoConstraints = NO;
        [self.view addSubview:view];
    }
    NSDictionary *metrics = @{@"height":@(ButtonHeight),
                              @"spacing":SPACING,
                              @"padding":PADDING};
    NSArray *formats = @[@"V:[_googleButton(height)]-spacing-[_facebookButton(height)]-spacing-[_orView(height)]-spacing-[_emailButton(height)]",
                         @"V:[_orView]-spacing-[_emailField(height)][_passwordField(height)][_forgotPasswordButton(height)]",
                         @"V:[_passwordField][_showSignUpButton(height)]",
                         @"V:[_nameField(height)][_emailField][_passwordField][_verifyField(height)]",
                         @"|-padding-[_showSignUpButton(==_forgotPasswordButton)]-[_forgotPasswordButton]-padding-|"];
    for (NSString *format in formats) {
        NSArray *constraints = [NSLayoutConstraint constraintsWithVisualFormat:format
                                                                       options:0
                                                                       metrics:metrics
                                                                         views:views];
        [self.view addConstraints:constraints];
    }

    for (UIView *view in @[self.googleButton, self.facebookButton, self.orView, self.emailButton,
                           self.nameField, self.emailField, self.passwordField, self.verifyField]) {
        views = NSDictionaryOfVariableBindings(view);
        NSArray *constraints = [NSLayoutConstraint constraintsWithVisualFormat:@"|-padding-[view]-padding-|"
                                                                       options:0
                                                                       metrics:metrics
                                                                         views:views];
        [self.view addConstraints:constraints];
    }

    [self signOutOfFacebook];
    [self signOutOfGoogle];

    NSAttributedString *(^buttonLabel)(NSString *) = ^(NSString *type) {
        UIFont *font = [UIFont hp_UITextFontOfSize:NormalFontSize];
        NSMutableAttributedString *label;
        label = [[NSMutableAttributedString alloc] initWithString:@"Sign in with "
                                                       attributes:@{NSFontAttributeName:font}];
        font = [UIFont hp_prioritizedUITextFontOfSize:NormalFontSize];
        [label appendAttributedString:[[NSAttributedString alloc] initWithString:type
                                                                      attributes:@{NSFontAttributeName:font}]];
        return label;
    };

    self.googleButton.titleLabel.attributedText = buttonLabel(@"Google");
    self.facebookButton.titleLabel.attributedText = buttonLabel(@"Facebook");
    self.emailButton.titleLabel.attributedText = buttonLabel(@"email");

    UIFont *font = [UIFont hp_UITextFontOfSize:SmallFontSize];
    self.forgotPasswordButton.titleLabel.font = font;
    self.showSignUpButton.titleLabel.font = font;

    self.titleLabel = [UILabel new];
    self.titleLabel.font = [UIFont hp_prioritizedUITextFontOfSize:BigFontSize];
    self.titleLabel.adjustsFontSizeToFitWidth = YES;
    self.titleLabel.textColor = [UIColor whiteColor];
    self.titleLabel.backgroundColor = [UIColor clearColor];
    self.titleLabel.textAlignment = NSTextAlignmentCenter;
    self.navigationItem.titleView = self.titleLabel;

    UIImage *image = [UIImage imageNamed:@"google44"];
    UIEdgeInsets insets = UIEdgeInsetsMake(image.size.height / 2, image.size.width,
                                           image.size.height / 2, 0);
    [self.googleButton setBackgroundImage:[image resizableImageWithCapInsets:insets]
                                 forState:UIControlStateNormal];

    image = [[UIImage imageNamed:@"facebook44"] resizableImageWithCapInsets:insets];
    [self.facebookButton setBackgroundImage:image
                                   forState:UIControlStateNormal];

    image = [[UIImage imageNamed:@"email-button-white"] resizableImageWithCapInsets:insets];
    [self.emailButton setBackgroundImage:image
                                forState:UIControlStateNormal];

    UIImageView *(^imageViewNamed)(NSString * const) = ^(NSString * const imageName) {
        UIImageView *imageView = [[UIImageView alloc] initWithImage:[UIImage imageNamed:imageName]];
        imageView.frame = CGRectMake(0, 0, ButtonHeight, ButtonHeight);
        imageView.contentMode = UIViewContentModeCenter;
        return imageView;
    };

    void (^setImages)(UITextField *, NSString *, NSString *) = ^(UITextField *textField,
                                                                 NSString *leftImageName,
                                                                 NSString *rightImageName) {
        textField.leftView = imageViewNamed(leftImageName);
        textField.leftViewMode = UITextFieldViewModeAlways;
        textField.rightView = imageViewNamed(rightImageName);
        textField.rightView.hidden = YES;
        textField.rightViewMode = UITextFieldViewModeAlways;
    };

    setImages(self.nameField, @"user-green", @"check-green");
    setImages(self.emailField, @"email-green", @"check-green");
    setImages(self.passwordField, @"password-green", @"check-green");
    setImages(self.verifyField, @"password-green", @"x-red");

    self.signInItem.enabled = NO;
    self.signUpItem.enabled = NO;

    [self setPromptHidden:NO];
    [self showButtonsAnimated:NO];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(reachabilityDidChangeWithNotification:)
                                                 name:kReachabilityChangedNotification
                                               object:nil];
}

- (void)viewWillAppear:(BOOL)animated
{
    [super viewWillAppear:animated];
    [self configureView];
    self.orLabel.font = [UIFont hp_prioritizedUITextFontOfSize:14];
    UIColor *dots = [UIColor colorWithPatternImage:[UIImage imageNamed:@"dot44"]];
    self.leftDots.backgroundColor = dots;
    self.rightDots.backgroundColor = dots;
}

- (void)viewDidDisappear:(BOOL)animated
{
    [super viewDidDisappear:animated];
    [self setPromptHidden:YES];
}

- (void)viewDidAppear:(BOOL)animated
{
    [super viewDidAppear:animated];
    [self setPromptHidden:NO];
    [self configureView];
}

- (void)reachabilityDidChangeWithNotification:(NSNotification *)note
{
    [[NSOperationQueue mainQueue] addOperationWithBlock:^{
        if (note.object != self.space.API.reachability ||
            !self.space.API.reachability.currentReachabilityStatus) {
            return;
        }
        [self.space refreshOptionsWithCompletion:^(HPSpace *space, NSError *error) {
            if (error) {
                [SignInAlertHelper showAlertWithSignInError:error];
            }
            [self configureView];
        }];
    }];
}

- (IBAction)showButtons:(id)sender
{
    [self showButtonsAnimated:YES];
}

- (void)showViews:(NSArray *)toShow
      hidingViews:(NSArray *)toHide
         animated:(BOOL)animated
       animations:(void (^)(void))animations
       completion:(void (^)(BOOL))completion
{
    for (UIView *view in toShow) {
        view.alpha = 0;
        view.hidden = NO;
    }
    [UIView animateWithDuration:animated ? 0.25 : 0
                     animations:^{
                         for (UIView *view in toShow) {
                             view.alpha = 1;
                         }
                         for (UIView *view in toHide) {
                             view.alpha = 0;
                         }
                         if (animations) {
                             animations();
                         }
                         [self.view layoutIfNeeded];
                     } completion:^(BOOL finished) {
                         for (UIView *view in toHide) {
                             view.hidden = YES;
                         }
                         if (!completion) {
                             return;
                         }
                         completion(finished);
                     }];
}

- (void)setTopView:(UIView *)view
{
    if (self.topConstraints) {
        [self.view removeConstraints:self.topConstraints];
    }
    NSDictionary *views;
    NSString *format;
    NSDictionary *metrics = @{@"padding":PADDING};
    if (HP_SYSTEM_MAJOR_VERSION() >= 7) {
        id top = self.topLayoutGuide;
        views = NSDictionaryOfVariableBindings(view, top);
        format = @"V:[top]-padding-[view]";
    } else {
        views = NSDictionaryOfVariableBindings(view);
        format = @"V:|-padding-[view]";
    }
    self.topConstraints = [NSLayoutConstraint constraintsWithVisualFormat:format
                                                                  options:0
                                                                  metrics:metrics
                                                                    views:views];
    [self.view addConstraints:self.topConstraints];
}

- (void)showButtonsAnimated:(BOOL)animated
{
    self.topView = self.googleButton;
    [self.view.hp_firstResponderSubview resignFirstResponder];
    [self.navigationItem setLeftBarButtonItem:self.space.URL.hp_isToplevelHackpadURL ? nil: self.cancelItem
                                     animated:animated];
    [self.navigationItem setRightBarButtonItem:nil
                                      animated:animated];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [self setPromptHidden:NO];
    }
    [self showViews:@[self.googleButton, self.facebookButton, self.orView, self.emailButton]
        hidingViews:@[self.nameField, self.emailField, self.passwordField, self.verifyField,
                      self.forgotPasswordButton, self.showSignUpButton]
           animated:animated
         animations:^{
             if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
                 return;
             }
             self.titleLabel.font = [UIFont hp_prioritizedUITextFontOfSize:BigFontSize];
             self.titleLabel.textColor = [UIColor whiteColor];
         } completion:^(BOOL finished) {
             self.signInItem.enabled = NO;
             self.signUpItem.enabled = NO;
         }];
}

- (IBAction)showSignIn:(id)sender
{
    self.topView = self.emailField;

    [self.navigationItem setLeftBarButtonItem:self.backItem
                                     animated:YES];
    [self.navigationItem setRightBarButtonItem:self.signInItem
                                      animated:YES];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        [self setPromptHidden:YES];
    }
    self.passwordField.returnKeyType = UIReturnKeySend;
    [self showViews:@[self.emailField, self.passwordField, self.forgotPasswordButton, self.showSignUpButton]
        hidingViews:@[self.googleButton, self.facebookButton, self.orView, self.emailButton]
           animated:YES
         animations:^{
             if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
                 return;
             }
             self.titleLabel.font = [UIFont hp_UITextFontOfSize:20];
             self.titleLabel.textColor = [UIColor hp_lightGreenGrayColor];
         } completion:^(BOOL finished) {
             [self updateSignInItem:self];
             if (!self.emailField.text.length) {
                 [self.emailField becomeFirstResponder];
             } else {
                 [self.passwordField becomeFirstResponder];
             }
         }];
}

- (void)showSignUp:(id)sender
{
    self.topView = self.nameField;

    [self.navigationItem setRightBarButtonItem:self.signUpItem
                                      animated:YES];
    self.passwordField.returnKeyType = UIReturnKeyNext;
    [self showViews:@[self.nameField, self.verifyField]
        hidingViews:@[self.forgotPasswordButton, self.showSignUpButton]
           animated:YES
         animations:NULL
         completion:^(BOOL finished) {
             [self updateSignUpItem:self];
             if (!self.nameField.text.length) {
                 [self.nameField becomeFirstResponder];
             } else if (!self.emailField.text.length) {
                 [self.emailField becomeFirstResponder];
             } else if (!self.passwordField.text.length) {
                 [self.passwordField becomeFirstResponder];
             } else {
                 [self.verifyField becomeFirstResponder];
             }
         }];
}

- (void)signInToSpace:(HPSpace *)space
           completion:(void (^)(BOOL, NSError *))handler
{
    NSParameterAssert(handler);
    _signInHandler = handler;
    _space = space;
    _URL = space.URL;
    [_URL hp_dumpCookies];
    if (!self.isViewLoaded) {
        [self view];
    }
    [self setPromptHidden:NO];
    self.titleLabel.attributedText = [[NSAttributedString alloc] initWithString:self.space.name.uppercaseString
                                                                     attributes:@{NSKernAttributeName:@(4)}];
    [self.titleLabel sizeToFit];
    if (self.isViewLoaded) {
        [self configureView];
    }
}

- (void)dismissWithError:(NSError *)error
               cancelled:(BOOL)cancelled
{
    // We don't want to get any more notifications.
    void (^handler)(BOOL, NSError *) = _signInHandler;
    _signInHandler = nil;
    if (handler) {
        handler(cancelled, error);
    }
}

- (IBAction)cancelSignIn:(id)sender
{
    [self dismissWithError:nil
                 cancelled:YES];
}

- (BOOL)hasGoogleCookies
{
    NSHTTPCookieStorage *jar = [NSHTTPCookieStorage sharedHTTPCookieStorage];
    HPLog(@"---- Cookies for google.com ----");
    for (NSHTTPCookie *cookie in jar.cookies) {
        if ([cookie.domain isEqualToString:@"google.com"] ||
            [cookie.domain hasSuffix:@".google.com"]) {
            HPLog(@"%@[%@]: %@", cookie.domain, cookie.name, cookie.value);
            HPLog(@"---------------- google.com ----");
            return YES;
        }
    }
    HPLog(@"---------------- google.com ----");
    return NO;
}

- (void)signOutOfGoogle
{
    NSHTTPCookieStorage *jar = [NSHTTPCookieStorage sharedHTTPCookieStorage];
    HPLog(@"---- Cookies for google.com ----");
    for (NSHTTPCookie *cookie in jar.cookies) {
        if ([cookie.domain isEqualToString:@"google.com"] ||
            [cookie.domain hasSuffix:@".google.com"]) {
            HPLog(@"XXX %@[%@]: %@", cookie.domain, cookie.name, cookie.value);
            [jar deleteCookie:cookie];
        }
    }
    HPLog(@"---------------- google.com ----");
//    self.googleCell.accessoryType = UITableViewCellAccessoryNone;
}

- (IBAction)updateSignInItem:(id)sender
{
    self.signInItem.enabled = self.space.signInMethods & HPPasswordSignInMask &&
        self.emailField.text.length && self.passwordField.text.length;
}

- (IBAction)updateSignUpItem:(id)sender
{
    self.signUpItem.enabled = self.space.signInMethods & HPPasswordSignInMask &&
        self.nameField.text.length &&
        self.emailField.text.length &&
        self.passwordField.text.length &&
        [self.passwordField.text isEqualToString:self.verifyField.text];
}

- (IBAction)updateCheckbox:(UITextField *)textField
{
    if (textField.isSecureTextEntry) {
        self.passwordVerified = [self.passwordField.text isEqualToString:self.verifyField.text];
    }
    textField.rightView.hidden = !textField.text.length;
}

- (void)prepareForSegue:(UIStoryboardSegue *)segue
                 sender:(id)sender
{
    if ([segue.identifier isEqualToString:@"GoogleSignIn"]) {
        HPGoogleSignInViewController *googleSignIn = segue.destinationViewController;
        //googleSignIn.navigationItem.title = self.titleLabel.text;
        googleSignIn.title = self.titleLabel.text;
        [self setPromptHidden:YES];
        [googleSignIn signInToSpaceWithURL:self.URL
                                completion:_signInHandler];
    }
}

#pragma mark - Text field delegate

- (void)textFieldDidBeginEditing:(UITextField *)textField
{
    textField.backgroundColor = [UIColor whiteColor];
}

- (void)textFieldDidEndEditing:(UITextField *)textField
{
    textField.backgroundColor = textField.text.length ? [UIColor hp_mediumGreenGrayColor] : [UIColor whiteColor];
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField
{
    if (textField == [_alert textFieldAtIndex:0]) {
        [_alert dismissWithClickedButtonIndex:_alert.firstOtherButtonIndex
                                     animated:YES];
    } else if (!self.nameField.isHidden && self.signUpItem.enabled) {
        [textField resignFirstResponder];
        [self signUp:textField];
    } else if (self.nameField.isHidden && self.signInItem.enabled) {
        [textField resignFirstResponder];
        [self signIn:textField];
    } else if (textField == self.nameField && self.nameField.text.length) {
        [self.emailField becomeFirstResponder];
    } else if (textField == self.emailField && self.emailField.text.length) {
        [self.passwordField becomeFirstResponder];
    } else if (textField == self.passwordField && self.passwordField.text.length) {
        if (self.verifyField.isHidden) {
            [self.emailField becomeFirstResponder];
        } else {
            [self.verifyField becomeFirstResponder];
        }
    } else if (textField == self.verifyField && self.verifyField.text.length) {
        [self.nameField becomeFirstResponder];
    }
    return YES;
}

- (void)setPasswordVerified:(BOOL)passwordVerified
{
    if (passwordVerified == _passwordVerified) {
        return;
    }
    _passwordVerified = passwordVerified;
    UIImageView *imageView = (UIImageView *)self.verifyField.rightView;
    imageView.image = [UIImage imageNamed:passwordVerified ? @"check-green" : @"x-red"];
}

- (IBAction)signIn:(id)sender
{
    NSURL *URL = [NSURL URLWithString:HPPostSigninPath
                        relativeToURL:self.URL];
    NSDictionary *params = @{HPEmailParam:self.emailField.text,
                             HPPasswordParam:self.passwordField.text,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:self.view
                                              animated:YES];
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         [HUD hide:YES];
         if (!error && [HPAPI JSONObjectWithResponse:response
                                                data:data
                                         JSONOptions:0
                                             request:request
                                               error:&error]) {
             [self dismissWithError:nil
                          cancelled:NO];
         } else if (error) {
             [SignInAlertHelper showAlertWithSignInError:error];
         }
    }];
}

- (IBAction)showForgottenPassword:(id)sender
{
    _action = RecoverPasswordAction;
    _alert = [[UIAlertView alloc] initWithTitle:@"Recover Password"
                                        message:@"You will receive a link to reset your password."
                                       delegate:self
                              cancelButtonTitle:@"Cancel"
                              otherButtonTitles:@"Send Email", nil];
    _alert.alertViewStyle = UIAlertViewStylePlainTextInput;
    UITextField *text = [_alert textFieldAtIndex:0];
    text.keyboardType = UIKeyboardTypeEmailAddress;
    text.returnKeyType = UIReturnKeySend;
    text.placeholder = @"user@example.com";
    text.delegate = self;
    [_alert show];
}

- (void)requestPasswordResetForEmail:(NSString *)email
{
    NSURL *URL = [NSURL URLWithString:HPForgotPasswordPath
                        relativeToURL:self.URL];
    NSDictionary *params = @{HPEmailParam:email,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    // FIXME: This returns 200 w/ HTML whether or not the email was invalid.
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:nil
                           completionHandler:NULL];
}

- (IBAction)signUp:(id)sender
{
    NSURL *URL = [NSURL URLWithString:HPSignUpPath
                        relativeToURL:self.URL];
    NSDictionary *params = @{HPNameParam:self.nameField.text,
                             HPEmailParam:self.emailField.text,
                             HPPasswordParam:self.passwordField.text,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:[NSURL URLWithString:HPSignUpPath
                                                                   relativeToURL:self.URL]
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         if (!error && [HPAPI JSONObjectWithResponse:response
                                                data:data
                                         JSONOptions:0
                                             request:request
                                               error:&error]) {
             [self.navigationController popViewControllerAnimated:YES];
         } else if (error) {
             [SignInAlertHelper showAlertWithSignInError:error];
         }
     }];
}

- (IBAction)resendVerification:(id)sender
{
    if (self.emailField.text.length) {
        [self resendVerificationForEmail:self.emailField.text];
        return;
    }

    _action = VerifyEmailAction;
    _alert = [[UIAlertView alloc] initWithTitle:@"Verify Email"
                                        message:@"You will receive a link to verify your address."
                                       delegate:self
                              cancelButtonTitle:@"Cancel"
                              otherButtonTitles:@"Send Email", nil];
    _alert.alertViewStyle = UIAlertViewStylePlainTextInput;
    UITextField *text = [_alert textFieldAtIndex:0];
    text.keyboardType = UIKeyboardTypeEmailAddress;
    text.returnKeyType = UIReturnKeySend;
    text.placeholder = @"user@example.com";
    text.delegate = self;
    [_alert show];
}

- (void)resendVerificationForEmail:(NSString *)email
{
    NSURL *URL = [NSURL URLWithString:HPResendEmailVerificationPath
                        relativeToURL:self.URL];
    NSDictionary *params = @{HPEmailParam:email,
                             HPAPIXSRFTokenParam:[HPAPI XSRFTokenForURL:URL]};
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"POST"
                                                 parameters:params];
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         if (!error && [HPAPI JSONObjectWithResponse:response
                                                data:data
                                         JSONOptions:0
                                             request:request
                                               error:&error]) {
             [self.navigationController popViewControllerAnimated:YES];
         } else if (error) {
             [SignInAlertHelper showAlertWithSignInError:error];
         }
     }];
}

#pragma mark - Facebook stuffs

- (void)loginView:(FBLoginView *)loginView
      handleError:(NSError *)error
{
    [self dismissWithError:error
                 cancelled:NO];
}

- (void)loginViewShowingLoggedInUser:(FBLoginView *)loginView
{
    [self signInWithFacebook];
}

- (void)loginViewShowingLoggedOutUser:(FBLoginView *)loginView
{
    [self signOutOfFacebook];
}

/*
 * Opens a Facebook session and optionally shows the login UX.
 */

- (IBAction)signInToFacebook:(id)sender
{
    HPSignInViewController * __weak weakSelf = self;
    MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:self.view
                                              animated:YES];
    [FBSession openActiveSessionWithReadPermissions:nil
                                       allowLoginUI:YES
                                  completionHandler:^(FBSession *session,
                                                      FBSessionState state,
                                                      NSError *error)
     {
         [HUD hide:YES];
#if !ALWAYS_SIGN_OUT
         self.facebookCell.accessoryType = [FBSession activeSession].isOpen
             ? UITableViewCellAccessoryDetailDisclosureButton
             : UITableViewCellAccessoryNone;
#endif
         switch (state) {
         case FBSessionStateOpen:
             [weakSelf signInWithFacebook];
             break;
         case FBSessionStateClosed:
         case FBSessionStateClosedLoginFailed:
             [self signOutOfFacebook];
             break;
         default:
             break;
         }
         if (error) {
             [weakSelf dismissWithError:error
                              cancelled:NO];
         }
     }];
}

- (void)signInWithFacebook
{
    NSParameterAssert([FBSession activeSession].isOpen);

    HPSignInViewController * __weak weakSelf = self;
    MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:self.view
                                              animated:YES];
    NSURL *URL = [NSURL URLWithString:HPConnectFBSessionPath
                        relativeToURL:self.URL];
    NSURLRequest *request = [NSURLRequest hp_requestWithURL:URL
                                                 HTTPMethod:@"GET"
                                                 parameters:@{
                                         HPAccessTokenParam:[FBSession activeSession].accessTokenData.accessToken}];
    [NSURLConnection sendAsynchronousRequest:request
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse *response,
                                               NSData *data,
                                               NSError *error)
     {
         [HUD hide:YES];
         if (weakSelf && (error || ![HPAPI JSONObjectWithResponse:response
                                                             data:data
                                                      JSONOptions:0
                                                          request:request
                                                            error:&error])) {
             TFLog(@"[%@] Facebook sign in failed.", URL.host);
             /*
              * The cached FB token can get out of sync with ACAccountStore if
              * we never call -closeAndClearTokenInformation:. In that case, we
              * will send an invalid token to the server, but since we're not
              * requesting something withFBSession, it won't realize it's out of
              * sync. So clear the token, try to renew it, and try to sign in
              * again. If that fails, give up.
              *
              * This can be reproduced by signing out of hackpad, deleting your
              * Facebook account in Settings, adding your account again, and
              * trying to sign in to hackpad using Facebook.
              */
#if 0
             HPLog(@"[%@] Token from FB: %@", URL.host,
                   [FBSession activeSession].accessTokenData.accessToken);
             ACAccountStore *store = [[ACAccountStore alloc] init];
             ACAccountType *accountType = [store accountTypeWithAccountTypeIdentifier:ACAccountTypeIdentifierFacebook];
             for (ACAccount *account in [store accountsWithAccountType:accountType]) {
                 HPLog(@"[%@] Token from system: %@", URL.host,
                       account.credential.oauthToken);
             }
#endif
             [self signOutOfFacebook];
             HPSignInViewController *blockSelf = weakSelf;
             if (!blockSelf->_triedRenewing) {
                 blockSelf->_triedRenewing = YES;
                 HPLog(@"[%@] Renewing credentials...", URL.host);
                 [FBSession renewSystemCredentials:^(ACAccountCredentialRenewResult result,
                                                     NSError *renewError)
                  {
                      if (result == ACAccountCredentialRenewResultRenewed) {
                          HPLog(@"[%@] Trying to sign in with renewed credentials.",
                                URL.host);
                          [weakSelf signInToFacebook:nil];
                      } else {
                          [weakSelf dismissWithError:renewError ? renewError : error
                                           cancelled:NO];
                      }
                  }];
                 return;
             }
         }
         [weakSelf dismissWithError:error
                          cancelled:NO];
     }];
}

- (void)signOutOfFacebook
{
    [[FBSession activeSession] closeAndClearTokenInformation];
}

#pragma mark - Alert view delegate

- (void)alertView:(UIAlertView *)alertView
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
    if (alertView == _alert) {
        _alert = nil;
    } else {
        return;
    }
    if (buttonIndex == alertView.cancelButtonIndex) {
        return;
    }
    if (_action == RecoverPasswordAction) {
        [self requestPasswordResetForEmail:[alertView textFieldAtIndex:0].text];
    } else {
        [self resendVerificationForEmail:[alertView textFieldAtIndex:0].text];
    }
}

@end

@implementation SignInAlertHelper

- (void)alertView:(UIAlertView *)alertView
clickedButtonAtIndex:(NSInteger)buttonIndex
{
    NSParameterAssert(alertView == self.alertView);
    if (buttonIndex == 0) {
        NSString *message = self.error.localizedDescription;
        if (self.error.fberrorUserMessage) {
            message = self.error.fberrorUserMessage;
        }
        if (self.error.localizedFailureReason) {
            message = [message stringByAppendingFormat:@" %@", self.error.localizedFailureReason];
        }
        if (self.error.localizedRecoverySuggestion) {
            message = [message stringByAppendingFormat:@" %@", self.error.localizedRecoverySuggestion];
        }
        [alertView dismissWithClickedButtonIndex:buttonIndex
                                        animated:NO];
        [[[UIAlertView alloc] initWithTitle:@"Error Details"
                                    message:message
                                   delegate:nil
                          cancelButtonTitle:nil
                          otherButtonTitles:@"OK", nil] show];
    }
    alertView.delegate = nil;
    self.cycle = nil;
}

- (void)showAlertWithSignInError:(NSError *)error
{
    self.cycle = self;
    self.error = error.userInfo[NSUnderlyingErrorKey];

    self.alertView = [[UIAlertView alloc] initWithTitle:@"Try Signing In Again"
                                                message:error.localizedDescription
                                               delegate:self
                                      cancelButtonTitle:nil
                                      otherButtonTitles:@"Details", @"OK", nil];
    [self.alertView show];
}

+ (void)showAlertWithSignInError:(NSError *)error
{
    TFLog(@"Sign in error: %@", error);
    if (error.userInfo[NSUnderlyingErrorKey]) {
        [[[self alloc] init] showAlertWithSignInError:error];
    } else if ([error.domain isEqualToString:HPHackpadErrorDomain]) {
        [[[UIAlertView alloc] initWithTitle:@"Try Signing In Again"
                                    message:error.localizedDescription
                                   delegate:nil
                          cancelButtonTitle:nil
                          otherButtonTitles:@"OK", nil] show];
    }
}

@end
