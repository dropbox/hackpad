//
//  HPPadWebController.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import <UIKit/UIKit.h>

@class HPImageUpload;
@class HPPad;
@class HPPadAutocompleteTableViewDataSource;
@class HPUserInfo;
@class HPUserInfoCollection;

@protocol HPPadWebControllerDelegate;
@protocol HPPadWebControllerCollabClientDelegate;

@interface HPPadWebController : NSObject <UIWebViewDelegate>
@property (nonatomic, strong, readonly) HPPad *pad;
@property (nonatomic, strong, readonly) HPSpace *space;
@property (nonatomic, strong, readonly) UIWebView *webView;
@property (nonatomic, strong) UISearchBar *searchBar;
@property (nonatomic, strong, readonly) HPPadAutocompleteTableViewDataSource *autocompleteDataSource;
@property (nonatomic, strong, readonly) HPUserInfoCollection *userInfos;

@property (nonatomic, assign) id<HPPadWebControllerDelegate> delegate;
@property (nonatomic, assign) id<HPPadWebControllerCollabClientDelegate> collabClientDelegate;
@property (nonatomic, assign, readonly, getter = hasNetworkActivity) BOOL networkActivity;
@property (nonatomic, assign) CGFloat visibleEditorHeight;
@property (nonatomic, assign, readonly, getter = isLoading) BOOL loading;
@property (nonatomic, assign, readonly, getter = isLoaded) BOOL loaded;

+ (id)sharedPadWebControllerWithPad:(HPPad *)pad;
+ (id)sharedPadWebControllerWithPad:(HPPad *)pad
                   padWebController:(HPPadWebController *)padWebController;

- (id)initWithSpace:(HPSpace *)space
              frame:(CGRect)frame;

- (void)loadWithCompletion:(void (^)(NSError *))handler;
- (void)loadWithCachePolicy:(NSURLRequestCachePolicy)cachePolicy
                 completion:(void (^)(NSError *))handler;
- (void)reloadDiscardingChanges:(BOOL)discardChanges
                    cachePolicy:(NSURLRequestCachePolicy)cachePolicy
                     completion:(void (^)(NSError *))handler;

- (void)reconnectCollabClient;
- (void)updateViewportWidth;
- (void)quickCam;
- (void)clickToolbarWithCommand:(NSString *)command;
- (void)insertImage:(UIImage *)image;
- (void)insertString:(NSString *)text;
- (void)deleteText;
- (void)insertNewLine;
- (void)selectAutocompleteData:(NSString *)selectedData
                       atIndex:(NSUInteger)index;
- (void)canUndoOrRedoWithCompletion:(void (^)(BOOL canUndo, BOOL canRedo))handler;
- (void)undo;
- (void)redo;

- (void)getClientVarsAndTextWithCompletion:(void (^)(NSDictionary *, NSString *))handler;
- (void)saveClientVarsAndTextWithCompletion:(void (^)(void))handler;

- (BOOL)saveFocus;
- (void)restoreFocus;

- (void)updateAttachmentWithID:(NSString *)attachmentID
                           URL:(NSURL *)URL
                           key:(NSString *)key
                    completion:(void (^)(void))handler;

- (void)setSearchBarScrolledOffScreen:(BOOL)scrolledOffScreen
                             animated:(BOOL)animated;

@end

@protocol HPPadWebControllerDelegate <UIWebViewDelegate>
@optional
- (void)padWebControllerDidUpdateUserInfo:(HPPadWebController *)padWebController;
- (void)padWebController:(HPPadWebController *)padWebController
   didUpdateChannelState:(NSString *)channelState
             collabState:(NSString *)collabState;

- (void)padWebController:(HPPadWebController *)padWebController
              didOpenURL:(NSURL *)URL;

- (void)padWebControllerDidBeginAutocomplete:(HPPadWebController *)padWebController;
- (void)padWebControllerDidUpdateAutocomplete:(HPPadWebController *)padWebController;
- (void)padWebControllerDidFinishAutocomplete:(HPPadWebController *)padWebController;
- (void)padWebControllerDidDeletePad:(HPPadWebController *)padWebController;
- (void)padWebControllerDidFreakOut:(HPPadWebController *)padWebController;
@end

@protocol HPPadWebControllerCollabClientDelegate <NSObject>
@optional
- (void)padWebControllerCollabClientDidConnect:(HPPadWebController *)padWebController;
- (void)padWebControllerCollabClientDidSynchronize:(HPPadWebController *)padWebController;
- (void)padWebController:(HPPadWebController *)padWebController
collabClientDidDisconnectWithUncommittedChanges:(BOOL)hasUncommittedChanges;
@end