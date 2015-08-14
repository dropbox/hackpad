//
//  HPPadSharingViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadSharingViewController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadAdditions.h"

#import "HPInvitationController.h"
#import "HPUserInfoImageView.h"
#import "HPUserInfoCell.h"

#import <AppleSampleCode/Reachability.h>
#import <MBProgressHUD/MBProgressHUD.h>

enum {
    PeopleSection,
    SharingTypeSection,
    SwitchSection,

    SectionCount
};

enum {
    LabelTag = 1,
    DetailLabelTag,
    ImageTag
};

@interface HPPadSharingViewController ()
@property (nonatomic, strong) HPInvitationController *invitationController;
@property (nonatomic, strong) HPUserInfo *actionInfo;
@property (nonatomic, strong) NSMutableArray *cells;
@property (nonatomic, strong) id changeObserver;
@property (nonatomic, strong) id addObserver;
@property (nonatomic, strong) id removeObserver;
@property (nonatomic, assign) BOOL refreshing;
@property (nonatomic, assign) BOOL enabled;
@property (nonatomic, assign) BOOL configuredSharingOptions;
@end

@implementation HPPadSharingViewController

#pragma mark - Object

- (void)dealloc
{
    if (_changeObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_changeObserver];
    }
    if (_addObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_addObserver];
    }
    if (_removeObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:_removeObserver];
    }
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:kReachabilityChangedNotification
                                                  object:nil];
}

#pragma mark - View controller

- (void)viewDidLoad
{
    [super viewDidLoad];
    HPPadSharingViewController * __weak weakSelf = self;
    _changeObserver = [[NSNotificationCenter defaultCenter] addObserverForName:NSManagedObjectContextDidSaveNotification
                                                                        object:nil
                                                                         queue:nil
                                                                    usingBlock:^(NSNotification *note)
                       {
                           if ([note.object concurrencyType] != NSMainQueueConcurrencyType) {
                               return;
                           }
                           if (!weakSelf.sharingOptions) {
                               return;
                           }
                           if (note.object != weakSelf.sharingOptions.managedObjectContext) {
                               return;
                           }
                           if (![note.userInfo[NSUpdatedObjectsKey] member:weakSelf.sharingOptions]) {
                               return;
                           }
                           [weakSelf configureView];
                       }];
    _addObserver = [[NSNotificationCenter defaultCenter] addObserverForName:HPUserInfoCollectionDidAddUserInfoNotification
                                                                     object:nil
                                                                      queue:[NSOperationQueue mainQueue]
                                                                 usingBlock:^(NSNotification *note)
                    {
                        if (note.object != weakSelf.userInfos) {
                            return;
                        }
                        NSUInteger row = [note.userInfo[HPUserInfoCollectionUserInfoIndexKey] unsignedIntegerValue];
                        [weakSelf.tableView beginUpdates];
                        [weakSelf.tableView insertRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:row
                                                                                        inSection:PeopleSection]]
                                                  withRowAnimation:UITableViewRowAnimationAutomatic];
                        [weakSelf.tableView endUpdates];
                    }];
    _removeObserver = [[NSNotificationCenter defaultCenter] addObserverForName:HPUserInfoCollectionDidRemoveUserInfoNotification
                                                                        object:nil
                                                                         queue:[NSOperationQueue mainQueue]
                                                                    usingBlock:^(NSNotification *note)
                       {
                           if (note.object != weakSelf.userInfos) {
                               return;
                           }
                           NSUInteger row = [note.userInfo[HPUserInfoCollectionUserInfoIndexKey] unsignedIntegerValue];
                           [weakSelf.tableView beginUpdates];
                           [weakSelf.tableView deleteRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:row
                                                                                           inSection:PeopleSection]]
                                                     withRowAnimation:UITableViewRowAnimationAutomatic];
                           [weakSelf.tableView endUpdates];
                       }];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(reachabilityDidChangeWithNotification:)
                                                 name:kReachabilityChangedNotification
                                               object:nil];
    [@[self.linkCell, self.denyCell, self.allowCell, self.domainCell, self.anonymousCell, self.friendsCell, self.askCell, self.moderateCell] enumerateObjectsUsingBlock:^(UITableViewCell *cell, NSUInteger idx, BOOL *stop) {
        cell.textLabel.font = [UIFont hp_UITextFontOfSize:cell.textLabel.font.pointSize];
    }];
    [self configureView];
    [self refresh:self];
}

- (UITableViewCell *)cellWithSharingType:(HPSharingType)sharingType
{
    NSUInteger i = [self rowWithSharingType:sharingType];
    return i == NSNotFound ? nil : _cells[i];
}

- (NSUInteger)rowWithSharingType:(HPSharingType)sharingType
{
    return [_cells indexOfObjectPassingTest:^BOOL(id obj, NSUInteger idx, BOOL *stop) {
        return [obj tag] == sharingType;
    }];
}

- (void)maybeAddCell:(UITableViewCell *)cell
         sharingType:(HPSharingType)sharingType
{
    if (self.sharingOptions.allowedSharingTypes & sharingType) {
        [_cells addObject:cell];
        cell.tag = sharingType;
        cell.accessoryType = sharingType == self.sharingOptions.sharingType
            ? UITableViewCellAccessoryCheckmark
            : UITableViewCellAccessoryNone;
    }
}

- (void)setEnabled:(BOOL)enabled
{
    _enabled = enabled;
    self.moderateSwitch.enabled = enabled;
    self.editButtonItem.enabled = enabled;
    self.searchDisplayController.searchBar.userInteractionEnabled = enabled;
    self.searchDisplayController.searchBar.alpha = enabled ? 1 : .7;
    if (enabled) {
        return;
    }
    [self setEditing:NO
            animated:YES];
}

- (void)configureView
{
    HPPad *pad = self.sharingOptions.pad;
    self.enabled = pad.padID && pad.space.API.reachability.currentReachabilityStatus;

    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        self.navigationItem.title = self.sharingOptions.pad.title;
    }

    [self.moderateSwitch setOn:self.sharingOptions.moderated
                      animated:YES];

    if (!self.sharingOptions.space.URL.hp_isToplevelHackpadURL) {
        self.linkCell.textLabel.text = [NSString stringWithFormat:@"Anyone at %@", self.sharingOptions.space.name];
        self.domainCell.textLabel.text = [NSString stringWithFormat:@"Everyone at %@", self.sharingOptions.space.name];
        if (self.sharingOptions.space.public) {
            self.allowCell.textLabel.text = @"Everyone (public)";
        } else if (self.sharingOptions.collection) {
            self.allowCell.textLabel.text = [NSString stringWithFormat:@"Everyone at %@", self.sharingOptions.space.name];
        } else {
            self.allowCell.textLabel.text = @"Everyone (readonly)";
        }
    }

    _cells = [NSMutableArray arrayWithCapacity:7];

    [self maybeAddCell:self.denyCell
            sharingType:HPDenySharingType];
    [self maybeAddCell:self.linkCell
           sharingType:HPLinkSharingType];
    [self maybeAddCell:self.domainCell
            sharingType:HPDomainSharingType];
    [self maybeAddCell:self.allowCell
           sharingType:HPAllowSharingType];
    [self maybeAddCell:self.anonymousCell
            sharingType:HPAnonymousSharingType];
    [self maybeAddCell:self.friendsCell
            sharingType:HPFriendsSharingType];
    [self maybeAddCell:self.askCell
            sharingType:HPAskSharingType];

    BOOL reload = !self.configuredSharingOptions;
    self.configuredSharingOptions = !!self.sharingOptions;
    if (reload) {
        [self.tableView reloadData];
    } else if (self.sharingOptions.pad.isCreator) {
        [self.tableView reloadSections:[NSIndexSet indexSetWithIndex:SharingTypeSection]
                      withRowAnimation:UITableViewRowAnimationNone];
    }
}

- (void)reachabilityDidChangeWithNotification:(NSNotification *)note
{
    [[NSOperationQueue mainQueue] addOperationWithBlock:^{
        if (note.object != self.sharingOptions.pad.space.API.reachability) {
            return;
        }
        [self configureView];
    }];
}

- (void)setSharingOptions:(HPSharingOptions *)sharingOptions
{
    _sharingOptions = sharingOptions;
    [(HPInvitationController *)self.searchDisplayController.delegate setPad:sharingOptions.pad];
    if (self.isViewLoaded) {
        [self configureView];
        [self refresh:self];
    }
}

- (void)refresh:(id)sender
{
    if (_refreshing) {
        return;
    }
    if (!self.sharingOptions) {
        return;
    }
    _refreshing = YES;
    [self.sharingOptions refreshWithCompletion:^(HPSharingOptions *sharingOptions,
                                                 NSError *error)
     {
         _refreshing = NO;
     }];
}

- (void)setEditing:(BOOL)editing
          animated:(BOOL)animated
{
    [super setEditing:editing
             animated:animated];
    [self.navigationItem setRightBarButtonItem:editing ? nil : self.doneItem
                                      animated:animated];
}

- (void)done:(id)sender
{
    if ([self.delegate respondsToSelector:@selector(padSharingViewControllerDidFinish:)]) {
        [self.delegate padSharingViewControllerDidFinish:self];
    }
}

#pragma mark - Table view data source

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return self.sharingOptions.pad.isCreator ? SectionCount : 1;
}

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section
{
    switch (section) {
        case SharingTypeSection:
            return _cells.count;

        case SwitchSection:
            return 1;

        case PeopleSection:
            return self.userInfos.userInfos.count;

    }
    return 0;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    switch (indexPath.section) {
        case SharingTypeSection:
            return _cells[indexPath.row];

        case SwitchSection:
            return self.moderateCell;
    }

    static NSString *CellIdentifier = @"PeopleCell";
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
    HPPadSharingViewController * __weak weakSelf = self;

    HPUserInfo *userInfo = self.userInfos.userInfos[indexPath.row];
    [self.sharingOptions.pad removeUserWithId:userInfo.userID
                                   completion:^(HPPad *pad, NSError *error)
     {
         if (error) {
             [[[UIAlertView alloc] initWithTitle:@"Request Failed"
                                         message:error.localizedDescription
                                        delegate:nil
                               cancelButtonTitle:nil
                               otherButtonTitles:@"OK", nil] show];
             return;
         }
         [weakSelf.userInfos removeUserInfo:userInfo];
     }];
}

- (NSString *)tableView:(UITableView *)tableView
titleForHeaderInSection:(NSInteger)section
{
    switch (section) {
        case PeopleSection:
            return @"Shared With";

        case SharingTypeSection:
            return @"Open To";

        default:
            return nil;
    }
}

#pragma mark - Table view delegate

- (BOOL)tableView:(UITableView *)tableView
shouldHighlightRowAtIndexPath:(NSIndexPath *)indexPath
{
    return self.enabled && indexPath.section == SharingTypeSection;
}

- (BOOL)tableView:(UITableView *)tableView
canEditRowAtIndexPath:(NSIndexPath *)indexPath
{
    return self.enabled && indexPath.section == PeopleSection;
}

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    [tableView deselectRowAtIndexPath:indexPath
                             animated:YES];
    if (!self.enabled || indexPath.section != SharingTypeSection) {
        return;
    }
    [self.sharingOptions setSharingType:(HPSharingType)[_cells[indexPath.row] tag]
                             completion:nil];
}

- (NSString *)tableView:(UITableView *)tableView
titleForDeleteConfirmationButtonForRowAtIndexPath:(NSIndexPath *)indexPath
{
    return @"Remove";
}

#pragma mark - UI actions

- (IBAction)toggleModerated:(id)sender
{
    [self.sharingOptions setModerated:[(UISwitch *)sender isOn]
                           completion:nil];
}

- (IBAction)share:(id)sender
{
    UIActivityViewController *controller = [[UIActivityViewController alloc] initWithActivityItems:@[self.sharingOptions.pad.URL]
                                                                             applicationActivities:nil];
    [self presentViewController:controller
                       animated:YES
                     completion:nil];
}

@end
