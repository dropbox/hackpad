//
//  HPPadTableViewDataSource.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadTableViewDataSource.h"

#import "HPActionSheetBlockDelegate.h"
#import "HPPadCell.h"

#import <HackpadKit/HackpadKit.h>
#import <AppleSampleCode/Reachability.h>
#import <TestFlight/TestFlight.h>

static NSString * const CellID = @"PadCell";

@interface HPPadTableViewDataSource () <NSFetchedResultsControllerDelegate> {
    id selectedObject;
    id padScopeObserver;
}
@property (nonatomic, strong) NSFetchedResultsController *fetchedResultsController;
@property (nonatomic, strong) id fetchedObject;
@property (nonatomic, assign, getter = isUpdating) BOOL updating;
@end

@implementation HPPadTableViewDataSource

- (id)init
{
    self = [super init];
    if (!self) {
        return self;
    }
    HPPadTableViewDataSource * __weak weakSelf = self;
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    padScopeObserver = [center addObserverForName:HPPadScopeDidChangeNotification
                                           object:nil
                                            queue:[NSOperationQueue mainQueue]
                                       usingBlock:^(NSNotification *note)
                        {
                            if (note.object != weakSelf.padScope) {
                                return;
                            }
                            [weakSelf performSelector:@selector(reloadTable)
                                           withObject:nil
                                           afterDelay:0];
                        }];
    return self;
}

- (void)dealloc
{
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    if (padScopeObserver) {
        [center removeObserver:padScopeObserver];
    }
    _fetchedResultsController.delegate = nil;
}

- (void)setTableView:(UITableView *)tableView
{
    _tableView = tableView;
    UINib *nib = [UINib nibWithNibName:CellID
                                bundle:nil];
    [tableView registerNib:nib
    forCellReuseIdentifier:CellID];
}

- (void)reloadTable
{
    if ((self.padScope.collection && [self.padScope.collection isEqual:self.fetchedObject]) ||
        (!self.padScope.collection && [self.padScope.space isEqual:self.fetchedObject])) {
        return;
    }

    // reloadData abandons editing, but tries to reset the editing cell first,
    // calling tableView:canEditRowAtIndexPath: with an indexPath that no longer
    // exists. so do that before resetting the FRC.
    self.tableView.editing = NO;
    _fetchedResultsController.delegate = nil;
    self.fetchedResultsController = nil;
    [self.tableView scrollRectToVisible:CGRectMake(0, 0, 1, 1)
                               animated:NO];
    [self.tableView reloadData];
}

- (NSFetchedResultsController *)fetchedResultsController
{
    if (_fetchedResultsController) {
        return _fetchedResultsController;
    }
    if (!self.padScope.space) {
        return nil;
    }
    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetch.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"lastEditedDate"
                                                            ascending:NO]];
    fetch.shouldRefreshRefetchedObjects = YES;
    if (self.padScope.collection) {
        self.fetchedObject = self.padScope.collection;
        fetch.predicate = [NSPredicate predicateWithFormat:@"ANY collections == %@", self.padScope.collection];
    } else {
        self.fetchedObject = self.padScope.space;
        fetch.predicate = [NSPredicate predicateWithFormat:@"space == %@ && followed == YES", self.padScope.space];
    }
    fetch.fetchBatchSize = 12;
    _fetchedResultsController = [[NSFetchedResultsController alloc] initWithFetchRequest:fetch
                                                                    managedObjectContext:self.managedObjectContext
                                                                      sectionNameKeyPath:nil
                                                                               cacheName:nil];
    _fetchedResultsController.delegate = self;
    NSError * __autoreleasing error;
    if (![_fetchedResultsController performFetch:&error]) {
        TFLog(@"[%@] Couldn't perform fetch: %@", self.padScope.space.URL.host, error);
    }
    return _fetchedResultsController;
}

- (HPPad *)padAtIndexPath:(NSIndexPath *)indexPath
{
    return [self.fetchedResultsController objectAtIndexPath:indexPath];
}

- (NSIndexPath *)indexPathForPad:(HPPad *)pad
{
    return [self.fetchedResultsController indexPathForObject:pad];
}

- (void)configureCell:(UITableViewCell *)cell
          atIndexPath:(NSIndexPath *)indexPath
{
    NSParameterAssert([cell isKindOfClass:[HPPadCell class]]);
    HPPadCell *padCell = (HPPadCell *)cell;
    HPPad *pad = [self padAtIndexPath:indexPath];
    UITableView * __weak tableView = self.tableView;
    [padCell setPad:pad
           animated:^BOOL{
               return !tableView.decelerating;
           }];
    padCell.moreButton.hidden = pad.snippetHeight >= pad.expandedSnippetHeight;
}

#pragma mark - Table view data source

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return self.fetchedResultsController.sections.count;
}

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section
{
    id <NSFetchedResultsSectionInfo> sectionInfo;
    sectionInfo = self.fetchedResultsController.sections[section];
    return [sectionInfo numberOfObjects];
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    UITableViewCell *cell;
    cell = [self.tableView dequeueReusableCellWithIdentifier:CellID
                                                forIndexPath:indexPath];
    [self configureCell:cell
            atIndexPath:indexPath];
    return cell;
}

- (BOOL)tableView:(UITableView *)tableView
canEditRowAtIndexPath:(NSIndexPath *)indexPath
{
    return YES;
}

- (void)tableView:(UITableView *)tableView
commitEditingStyle:(UITableViewCellEditingStyle)editingStyle
forRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (editingStyle != UITableViewCellEditingStyleDelete) {
        return;
    }
    HPPad *pad = [self padAtIndexPath:indexPath];
    if (pad.hasMissedChanges) {
        [self confirmAndAbandonMissedChangesWithPad:pad];
    } else {
        [self confirmAndDeleteOrUnfollowPad:pad];
    }
}

- (void)confirmAndAbandonMissedChangesWithPad:(HPPad *)pad
{
    HPPadTableViewDataSource * __weak weakSelf = self;
    HPActionSheetBlockDelegate *delegate = [[HPActionSheetBlockDelegate alloc] initWithBlock:^(UIActionSheet *actionSheet, NSInteger button) {
        if (button == actionSheet.cancelButtonIndex) {
            return;
        }
        [pad discardMissedChangesWithCompletion:^(HPPad *pad, NSError *error) {
            NSIndexPath *indexPath = [weakSelf.fetchedResultsController indexPathForObject:pad];
            if (!indexPath) {
                return;
            }
            [weakSelf.tableView reloadRowsAtIndexPaths:@[indexPath]
                                      withRowAnimation:UITableViewRowAnimationAutomatic];
        }];
    }];
    [[[UIActionSheet alloc] initWithTitle:@"Your unsaved changes will be lost. This cannot be undone."
                                 delegate:delegate
                        cancelButtonTitle:@"Cancel"
                   destructiveButtonTitle:@"Discard Changes"
                        otherButtonTitles:nil] showInView:self.tableView];
}

- (void)confirmAndDeleteOrUnfollowPad:(HPPad *)pad
{
    void (^delegateBlock)(UIActionSheet *, NSInteger) = ^(UIActionSheet *actionSheet,
                                                          NSInteger buttonIndex) {
        if (buttonIndex == actionSheet.firstOtherButtonIndex) {
            [pad setFollowed:NO
                  completion:^(HPPad *pad, NSError *error)
             {
                 if (error) {
                     [[[UIAlertView alloc] initWithTitle:@"Unfollowing Error"
                                                 message:[NSString stringWithFormat:@"The pad could not be unfollowed: %@", error.localizedDescription]
                                                delegate:nil
                                       cancelButtonTitle:nil
                                       otherButtonTitles:@"OK", nil] show];
                 }
             }];
        } else if (buttonIndex != actionSheet.cancelButtonIndex) {
            [pad deleteWithCompletion:^(HPPad *pad, NSError *error) {
                if (error) {
                    [[[UIAlertView alloc] initWithTitle:@"Oops"
                                                message:[NSString stringWithFormat:@"The pad could not be deleted: %@", error.localizedDescription]
                                               delegate:nil
                                      cancelButtonTitle:nil
                                      otherButtonTitles:@"OK", nil] show];
                }
            }];
        }
    };
    [[[UIActionSheet alloc] initWithTitle:nil
                                 delegate:[[HPActionSheetBlockDelegate alloc] initWithBlock:delegateBlock]
                        cancelButtonTitle:@"Cancel"
                   destructiveButtonTitle:@"Delete"
                        otherButtonTitles:@"Unfollow", nil] showInView:self.tableView.superview];
}

#pragma mark - Fetched results delegate

- (void)controllerWillChangeContent:(NSFetchedResultsController *)controller
{
    //HPLog(@"%s", __PRETTY_FUNCTION__);
    NSIndexPath *indexPath = self.tableView.indexPathForSelectedRow;
    if (indexPath) {
        selectedObject = [controller objectAtIndexPath:indexPath];
    }
//    [self.tableView beginUpdates];
}

- (void)setUpdating:(BOOL)updating
{
    if (_updating == updating) {
        return;
    }
    _updating = updating;
    if (updating) {
        [self.tableView beginUpdates];
    } else {
        [self.tableView endUpdates];
    }
}

- (void)controller:(NSFetchedResultsController *)controller
  didChangeSection:(id <NSFetchedResultsSectionInfo>)sectionInfo
           atIndex:(NSUInteger)sectionIndex
     forChangeType:(NSFetchedResultsChangeType)type
{
    //HPLog(@"%s", __PRETTY_FUNCTION__);
    switch(type) {
        case NSFetchedResultsChangeInsert:
            self.updating = YES;
            [self.tableView insertSections:[NSIndexSet indexSetWithIndex:sectionIndex]
                          withRowAnimation:UITableViewRowAnimationFade];
            break;

        case NSFetchedResultsChangeDelete:
            self.updating = YES;
            [self.tableView deleteSections:[NSIndexSet indexSetWithIndex:sectionIndex]
                          withRowAnimation:UITableViewRowAnimationFade];
            break;
    }
}


- (void)controller:(NSFetchedResultsController *)controller
   didChangeObject:(id)anObject
       atIndexPath:(NSIndexPath *)indexPath
     forChangeType:(NSFetchedResultsChangeType)type
      newIndexPath:(NSIndexPath *)newIndexPath
{
    //HPLog(@"%s %@ (%lu) %@ => %@", __PRETTY_FUNCTION__, [anObject class], (unsigned long)type, indexPath, newIndexPath);
    UITableViewCell *cell;
    switch(type) {
        case NSFetchedResultsChangeInsert:
            self.updating = YES;
            [self.tableView insertRowsAtIndexPaths:[NSArray arrayWithObject:newIndexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            break;

        case NSFetchedResultsChangeDelete:
            self.updating = YES;
            [self.tableView deleteRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            break;

        case NSFetchedResultsChangeMove:
            self.updating = YES;
            [self.tableView deleteRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            [self.tableView insertRowsAtIndexPaths:[NSArray arrayWithObject:newIndexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            break;
        case NSFetchedResultsChangeUpdate:
            cell = [self.tableView cellForRowAtIndexPath:indexPath];
            if (cell) {
                self.updating = YES;
                [self configureCell:cell
                        atIndexPath:indexPath];
            }
            break;
    }
}

- (void)controllerDidChangeContent:(NSFetchedResultsController *)controller
{
    //HPLog(@"%s", __PRETTY_FUNCTION__);
    NSDate *date = [NSDate new];
    self.updating = NO;
    //[self.tableView endUpdates];
    NSTimeInterval delta = -date.timeIntervalSinceNow;
    if (delta > .1) {
        HPLog(@"Ending updates took %.3fs", delta);
    }
    if (selectedObject) {
        NSIndexPath *indexPath = [controller indexPathForObject:selectedObject];
        selectedObject = nil;
        if (indexPath) {
            [self.tableView selectRowAtIndexPath:indexPath
                                        animated:NO
                                  scrollPosition:UITableViewScrollPositionNone];
        }
    }
}

@end
