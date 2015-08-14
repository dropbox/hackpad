//
//  HPUserInfosViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPUserInfosViewController.h"

#import <HackpadKit/HackpadKit.h>

#import "HPUserInfoImageView.h"
#import "HPUserInfoCell.h"

enum {
    LabelTag = 1,
    DetailLabelTag,
    ImageTag
};

@interface HPUserInfosViewController () <UIActionSheetDelegate> {
    HPUserInfo *_actionInfo;
    id _addObserver;
    id _removeObserver;
}
@end

@implementation HPUserInfosViewController

#pragma mark - User infos

- (IBAction)done:(id)sender
{
    [self dismissViewControllerAnimated:YES
                             completion:NULL];
}

#pragma mark - Object

- (void)dealloc
{
    if (_addObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_addObserver];
    }
    if (_removeObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_removeObserver];
    }
}

#pragma mark - View controller

- (void)viewDidLoad
{
    [super viewDidLoad];
    [self.navigationItem setRightBarButtonItem:self.editButtonItem
                                      animated:YES];
    _addObserver = [[NSNotificationCenter defaultCenter] addObserverForName:HPUserInfoCollectionDidAddUserInfoNotification
                                                                     object:nil
                                                                      queue:[NSOperationQueue mainQueue]
                                                                 usingBlock:^(NSNotification *note)
                    {
                        if (note.object != self.userInfos) {
                            return;
                        }
                        NSUInteger row = [note.userInfo[HPUserInfoCollectionUserInfoIndexKey] unsignedIntegerValue];
                        [self.tableView beginUpdates];
                        [self.tableView insertRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:row
                                                                                    inSection:0]]
                                              withRowAnimation:UITableViewRowAnimationAutomatic];
                        [self.tableView endUpdates];
                    }];
    _removeObserver = [[NSNotificationCenter defaultCenter] addObserverForName:HPUserInfoCollectionDidRemoveUserInfoNotification
                                                                        object:nil
                                                                         queue:[NSOperationQueue mainQueue]
                                                                    usingBlock:^(NSNotification *note)
                       {
                           if (note.object != self.userInfos) {
                               return;
                           }
                           NSUInteger row = [note.userInfo[HPUserInfoCollectionUserInfoIndexKey] unsignedIntegerValue];
                           [self.tableView beginUpdates];
                           [self.tableView deleteRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:row
                                                                                       inSection:0]]
                                                 withRowAnimation:UITableViewRowAnimationAutomatic];
                           [self.tableView endUpdates];
                       }];
}

- (void)setEditing:(BOOL)editing
          animated:(BOOL)animated
{
    [super setEditing:editing
             animated:animated];
    [self.navigationItem setLeftBarButtonItem:editing ? nil : self.doneItem
                                     animated:animated];
}

#pragma mark - Table view data source

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return 1;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section
{
    return self.userInfos.userInfos.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    static NSString *CellIdentifier = @"Cell";
    HPUserInfoCell *cell = [tableView dequeueReusableCellWithIdentifier:CellIdentifier
                                                         forIndexPath:indexPath];
    if (cell.userInfo) {
        cell.userInfo = nil;
    }
    HPUserInfo *userInfo = self.userInfos.userInfos[indexPath.row];
    [cell setUserInfo:userInfo
             animated:!userInfo.userPicURL];

    return cell;
}

- (void)tableView:(UITableView *)tableView
commitEditingStyle:(UITableViewCellEditingStyle)editingStyle
forRowAtIndexPath:(NSIndexPath *)indexPath
{
    NSParameterAssert(editingStyle == UITableViewCellEditingStyleDelete);
    HPUserInfo *userInfo = self.userInfos.userInfos[indexPath.row];
    [self.pad removeUserWithId:userInfo.userID
                    completion:^(HPPad *pad, NSError *error)
     {
         if (error) {
             [[[UIAlertView alloc] initWithTitle:@"Request Failed"
                                         message:error.localizedDescription
                                        delegate:nil
                               cancelButtonTitle:nil
                               otherButtonTitles:@"OK", nil] show];
         } else {
             [self.userInfos removeUserInfo:userInfo];
         }
     }];
}

#pragma mark - Table view delegate

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    // Navigation logic may go here. Create and push another view controller.
    /*
     <#DetailViewController#> *detailViewController = [[<#DetailViewController#> alloc] initWithNibName:@"<#Nib name#>" bundle:nil];
     // ...
     // Pass the selected object to the new view controller.
     [self.navigationController pushViewController:detailViewController animated:YES];
     */
}

- (BOOL)tableView:(UITableView *)tableView
shouldHighlightRowAtIndexPath:(NSIndexPath *)indexPath
{
    return NO;
}

- (NSString *)tableView:(UITableView *)tableView
titleForDeleteConfirmationButtonForRowAtIndexPath:(NSIndexPath *)indexPath
{
    return @"Remove";
}

@end
