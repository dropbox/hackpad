//
//  HPPadSourceViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadScopeViewController.h"

#import "HPDrawerController.h"
#import "HPPadScopeTableViewDataSource.h"
#import "HPAddSpaceViewController.h"
#import "HPWhiteNavigationController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadAdditions.h"

#import "Reachability.h"
#import <TestFlight/TestFlight.h>

@interface HPPadScopeViewController () <HPAddSpaceViewControllerDelegate>
@end

@implementation HPPadScopeViewController

#pragma mark - UIViewController

- (void)viewDidLoad
{
    self.tableView.backgroundColor = [UIColor hp_darkGrayColor];
    [super viewDidLoad];
    [self.refreshControl addTarget:self
                            action:@selector(refresh:)
                  forControlEvents:UIControlEventValueChanged];
}

#pragma mark - Implementation

- (IBAction)cancel:(id)sender
{
    [self dismissViewControllerAnimated:YES
                             completion:NULL];
}

- (IBAction)refresh:(id)sender
{
    NSUInteger spaces = [self.dataSource numberOfSectionsInTableView:self.tableView];
    NSUInteger __block requests = spaces;
    HPPadScopeViewController * __weak weakSelf = self;
    for (NSUInteger i = 0; i < spaces; i++) {
        NSIndexPath *indexPath = [NSIndexPath indexPathForRow:0
                                                    inSection:i];
        HPSpace *space = [self.dataSource objectAtIndexPath:indexPath];
        NSAssert([space isKindOfClass:[HPSpace class]], @"Row 0 should always be a space");
        if (!space.API.isSignedIn || !space.API.reachability.currentReachabilityStatus) {
            --requests;
            continue;
        }
        [space requestFollowedPadsWithRefresh:YES
                                  completion:^(HPSpace *space,
                                               NSError *error)
         {
             if (!--requests) {
                 [weakSelf.refreshControl endRefreshing];
             }
         }];
    }
    if (!requests) {
        [self.refreshControl endRefreshing];
    }
}

- (IBAction)addSpace:(id)sender
{
    HPAddSpaceViewController *viewController = [[HPAddSpaceViewController alloc] init];
    viewController.delegate = self;
    HPWhiteNavigationController *navigationController = [[HPWhiteNavigationController alloc] initWithRootViewController:viewController];
    navigationController.modalPresentationStyle = UIModalPresentationFormSheet;
    [self presentViewController:navigationController
                       animated:YES
                     completion:nil];
}

- (void)setEditing:(BOOL)editing
          animated:(BOOL)animated
{
    [super setEditing:editing
             animated:animated];
    [self.navigationItem setRightBarButtonItem:editing ? self.editButtonItem : self.accountsItem
                                      animated:animated];
}

- (void)editAccounts:(id)sender
{
    [self setEditing:YES
            animated:YES];
}

- (void)showHiddenSpaces:(id)sender
{
    [self setEditing:YES
            animated:YES];
    return;
    [self.padScope.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:NSStringFromClass([HPSpace class])];
        fetch.predicate = [NSPredicate predicateWithFormat:@"hidden == YES"];
        NSError *error = nil;
        NSArray *spaces = [localContext executeFetchRequest:fetch error:&error];
        if (!spaces) {
            TFLog(@"Error fetching spaces: %@", error);
        }
        [spaces enumerateObjectsUsingBlock:^(HPSpace *space, NSUInteger idx, BOOL *stop) {
            space.hidden = NO;
        }];
    } completion:^(NSError *error) {
        if (error) {
            TFLog(@"Could not show hidden spaces: %@", error);
        }
    }];
}

#pragma mark - Table view delegate

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    [tableView deselectRowAtIndexPath:indexPath
                             animated:YES];
    HPDrawerController *drawer = (HPDrawerController *)self.navigationController.parentViewController;
    // Works around sliding label w/ autolayout?
    if ([drawer isKindOfClass:[HPDrawerController class]]) {
        [drawer.view layoutIfNeeded];
        [drawer setLeftDrawerShown:NO
                          animated:YES];
    }
    id object = [self.dataSource objectAtIndexPath:indexPath];
    if ([object isKindOfClass:[HPSpace class]]) {
        if (self.padScope.collection || self.padScope.space != object) {
            self.padScope.space = object;
        }
    } else {
        if (self.padScope.collection != object) {
            self.padScope.collection = object;
        }
    }
    [self.padScope.space.API signInEvenIfSignedIn:NO];
}

- (UITableViewCellEditingStyle)tableView:(UITableView *)tableView
           editingStyleForRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (indexPath.row) {
        return UITableViewCellEditingStyleDelete;
    }
    HPSpace *space = [self.dataSource objectAtIndexPath:indexPath];
    return space.userID ? UITableViewCellEditingStyleDelete : UITableViewCellEditingStyleNone;
}

- (NSString *)tableView:(UITableView *)tableView
titleForDeleteConfirmationButtonForRowAtIndexPath:(NSIndexPath *)indexPath
{
    return indexPath.row
        ? NSLocalizedString(@"Unfollow", nil)
        : NSLocalizedString(@"Sign Out", nil);
}

- (CGFloat)tableView:(UITableView *)tableView
heightForHeaderInSection:(NSInteger)section
{
    return 0;
}

- (void)tableView:(UITableView *)tableView
  willDisplayCell:(UITableViewCell *)cell
forRowAtIndexPath:(NSIndexPath *)indexPath
{
    cell.backgroundColor = indexPath.row ? [UIColor hp_reallyDarkGrayColor] : tableView.backgroundColor;
}

#pragma mark - HPAddSpaceViewControllerDelegate

- (void)addSpaceViewController:(HPAddSpaceViewController *)viewController
        didFinishWithSpaceName:(NSString *)name
{
    [self dismissViewControllerAnimated:YES
                             completion:nil];
    if (!name.length) {
        return;
    }
    NSURL *spaceURL;
    if ([name hasPrefix:[[NSURL hp_sharedHackpadURL] scheme]]) {
        spaceURL = [NSURL URLWithString:name];
    } else if ([name rangeOfString:@"."].location != NSNotFound) {
        spaceURL = [[NSURL alloc] initWithScheme:[[NSURL hp_sharedHackpadURL] scheme]
                                            host:name
                                            path:@"/"];
    } else {
        spaceURL = [NSURL hp_URLForSubdomain:name
                               relativeToURL:[NSURL hp_sharedHackpadURL]];
    }
    NSManagedObjectID * __block objectID;
    HPPadScopeViewController * __weak weakSelf = self;

    [self.padScope.coreDataStack saveWithBlock:^(NSManagedObjectContext *localContext) {
        NSError *error = nil;
        HPSpace *space = [HPSpace spaceWithURL:spaceURL
                        inManagedObjectContext:localContext
                                         error:&error];
        if (error) {
            return;
        }
        if (space) {
            space.hidden = NO;
        } else {
            space = [HPSpace insertSpaceWithURL:spaceURL
                                           name:nil
                           managedObjectContext:localContext];
            if (![localContext obtainPermanentIDsForObjects:@[space]
                                                      error:&error]) {
                TFLog(@"Error obtaining permanent IDs: %@", error);
                return;
            }
        }
        objectID = space.objectID;
    } completion:^(NSError *error) {
        if (error) {
            TFLog(@"[%@] Could not add space: %@", spaceURL.host, error);
            return;
        }
        if (!objectID) {
            return;
        }
        if (!weakSelf) {
            return;
        }
        HPSpace *space = (HPSpace *)[self.padScope.coreDataStack.mainContext existingObjectWithID:objectID
                                                                                            error:&error];
        if (!space) {
            TFLog(@"[%@] Could not look up space: %@", spaceURL.host, error);
            return;
        }
        [NSURL hp_addHackpadURL:space.URL];
        [space.API signInEvenIfSignedIn:NO];
        weakSelf.padScope.space = space;
    }];
}

- (void)addSpaceViewControllerDidCancel:(HPAddSpaceViewController *)viewController
{
    [self dismissViewControllerAnimated:YES
                             completion:nil];
}

- (BOOL)addSpaceViewControllerCanCancel:(HPAddSpaceViewController *)viewController
{
    NSManagedObjectContext *context = self.padScope.coreDataStack.mainContext;
    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    NSError *error = nil;
    NSUInteger count = [context countForFetchRequest:fetchRequest error:&error];
    return count > 0 || error != nil;
}

@end
