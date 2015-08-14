//
//  HPPadCollectionViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadCollectionViewController.h"

#import "HackpadKit/HackpadKit.h"
#import "HackpadAdditions/HackpadAdditions.h"

#import "HPPadCollectionCell.h"
#import "HPPadSharingViewController.h"
#import <TestFlight/TestFlight.h>

@interface HPPadCollectionViewController () <NSFetchedResultsControllerDelegate, UIAlertViewDelegate, UITextFieldDelegate> {
    BOOL _isRefreshing;
    UIAlertView *_createAlert;
}

@end

@implementation HPPadCollectionViewController

- (void)setPad:(HPPad *)pad
{
    _pad = pad;
    if (!_pad) {
        return;
    }

    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPCollectionEntity];
    fetch.predicate = [NSPredicate predicateWithFormat:@"space == %@", self.pad.space];
    NSSortDescriptor *sort = [NSSortDescriptor sortDescriptorWithKey:@"title"
                                                           ascending:YES];
    fetch.sortDescriptors = [NSArray arrayWithObject:sort];

    self.fetchedResultsController = [[NSFetchedResultsController alloc] initWithFetchRequest:fetch
                                                                        managedObjectContext:self.pad.managedObjectContext
                                                                          sectionNameKeyPath:nil
                                                                                   cacheName:nil];
    self.fetchedResultsController.delegate = self;

    NSError * __autoreleasing error;
    if (![self.fetchedResultsController performFetch:&error]) {
        TFLog(@"Could not request collections: %@", error);
    }

    [self.tableView reloadData];
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    // This is hooked up in the storyboard but doesn't work?
    [self.refreshControl addTarget:self
                            action:@selector(refreshCollections:)
                  forControlEvents:UIControlEventValueChanged];
}

#pragma mark - Table view data source

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return self.fetchedResultsController.sections.count;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section
{
    id<NSFetchedResultsSectionInfo> sectionInfo = [self.fetchedResultsController.sections objectAtIndex:section];
    return [sectionInfo numberOfObjects];
}

- (void)configureCell:(HPPadCollectionCell *)cell
          atIndexPath:(NSIndexPath *)indexPath
{
    HPCollection *collection = [self.fetchedResultsController objectAtIndexPath:indexPath];

    HPLog(@"[%@] Loading %@ => %@", collection.space.URL.host, indexPath, collection.collectionID);

    cell.collectionTextLabel.text = collection.title;

    cell.state = [_pad.collections member:collection]
        ? HPCheckedPadCollectionCell
        : HPUncheckedPadCollectionCell;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    static NSString *CellIdentifier = @"PadCollectionCell";
    HPPadCollectionCell *cell = [tableView dequeueReusableCellWithIdentifier:CellIdentifier
                                                              forIndexPath:indexPath];
    [self configureCell:cell
            atIndexPath:indexPath];
    return cell;
}


// Override to support conditional editing of the table view.
- (BOOL)tableView:(UITableView *)tableView
canEditRowAtIndexPath:(NSIndexPath *)indexPath
{
    return YES;
}

// Override to support editing the table view.
- (void)tableView:(UITableView *)tableView
commitEditingStyle:(UITableViewCellEditingStyle)editingStyle
forRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (editingStyle == UITableViewCellEditingStyleDelete) {
        HPCollection *collection = [self.fetchedResultsController objectAtIndexPath:indexPath];
        [collection deleteWithCompletion:^(HPCollection *collection, NSError *error) {
            if (error) {
                TFLog(@"[%@] Could not delete collection: %@",
                      collection.space.URL.host, error);
            }
        }];
    }
    else if (editingStyle == UITableViewCellEditingStyleInsert) {
        // Create a new instance of the appropriate class, insert it into the array, and add a new row to the table view
    }
}

/*
// Override to support rearranging the table view.
- (void)tableView:(UITableView *)tableView moveRowAtIndexPath:(NSIndexPath *)fromIndexPath toIndexPath:(NSIndexPath *)toIndexPath
{
}
*/

/*
// Override to support conditional rearranging of the table view.
- (BOOL)tableView:(UITableView *)tableView canMoveRowAtIndexPath:(NSIndexPath *)indexPath
{
    // Return NO if you do not want the item to be re-orderable.
    return YES;
}
*/

- (void)prepareForSegue:(UIStoryboardSegue *)segue
                 sender:(id)sender
{
    if ([segue.identifier isEqualToString:@"EditSharing"]) {
        HPPadSharingViewController *sharing = segue.destinationViewController;
        NSIndexPath *indexPath = [self.tableView indexPathForCell:sender];
        HPCollection *collection = [self.fetchedResultsController objectAtIndexPath:indexPath];
        if (!collection.sharingOptions) {
            [collection hp_performBlock:^(HPCollection *collection,
                                          NSError *__autoreleasing *error)
             {
                 if (collection.sharingOptions) {
                     return;
                 }
                 collection.sharingOptions = [NSEntityDescription insertNewObjectForEntityForName:NSStringFromClass([HPSharingOptions class])
                                                                           inManagedObjectContext:collection.managedObjectContext];
             }
                             completion:^(HPCollection *collection, NSError *error)
             {
                 if (error) {
                     TFLog(@"[%@] Could not create sharing options: %@",
                           collection.space.URL.host, error);
                     return;
                 }
                 sharing.sharingOptions = collection.sharingOptions;
             }];
        } else {
            sharing.sharingOptions = collection.sharingOptions;
        }
    }
}

#pragma mark - Table view delegate

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    HPCollection *collection = [self.fetchedResultsController objectAtIndexPath:indexPath];
    if ([collection.pads member:self.pad]) {
        [collection removePadsObject:self.pad
                          completion:nil];
    } else {
        [collection addPadsObject:self.pad
                       completion:nil];
    }
    [tableView reloadRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
                     withRowAnimation:UITableViewRowAnimationAutomatic];
}

#pragma mark - Fetched results delegate

/*
 Assume self has a property 'tableView' -- as is the case for an instance of a UITableViewController
 subclass -- and a method configureCell:atIndexPath: which updates the contents of a given cell
 with information from a managed object at the given index path in the fetched results controller.
 */

- (void)controllerWillChangeContent:(NSFetchedResultsController *)controller
{
    HPLog(@"[%@] %s", self.pad.URL.host, __PRETTY_FUNCTION__);
    [self.tableView beginUpdates];
}


- (void)controller:(NSFetchedResultsController *)controller
  didChangeSection:(id <NSFetchedResultsSectionInfo>)sectionInfo
           atIndex:(NSUInteger)sectionIndex
     forChangeType:(NSFetchedResultsChangeType)type
{
    HPLog(@"[%@] %s", self.pad.URL.host, __PRETTY_FUNCTION__);

    switch(type) {
        case NSFetchedResultsChangeInsert:
            [self.tableView insertSections:[NSIndexSet indexSetWithIndex:sectionIndex]
                          withRowAnimation:UITableViewRowAnimationFade];
            break;

        case NSFetchedResultsChangeDelete:
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
    HPLog(@"[%@] %s", self.pad.URL.host, __PRETTY_FUNCTION__);

    switch(type) {

        case NSFetchedResultsChangeInsert:
            [self.tableView insertRowsAtIndexPaths:[NSArray arrayWithObject:newIndexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            break;

        case NSFetchedResultsChangeDelete:
            [self.tableView deleteRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            break;

        case NSFetchedResultsChangeMove:
            [self.tableView deleteRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            [self.tableView insertRowsAtIndexPaths:[NSArray arrayWithObject:newIndexPath]
                                  withRowAnimation:UITableViewRowAnimationFade];
            break;
        case NSFetchedResultsChangeUpdate:
            [self configureCell:(HPPadCollectionCell *)[self.tableView cellForRowAtIndexPath:indexPath]
                    atIndexPath:indexPath];
            break;

    }
}

- (void)controllerDidChangeContent:(NSFetchedResultsController *)controller
{
    HPLog(@"[%@] %s", self.pad.URL.host, __PRETTY_FUNCTION__);
    [self.tableView endUpdates];
}

#pragma mark - Object methods

- (IBAction)refreshCollections:(id)sender
{
    if (_isRefreshing) {
        return;
    }
    [self.pad.space requestFollowedPadsWithRefresh:YES
                                       completion:^(HPSpace *space,
                                                    NSError *error)
     {
         _isRefreshing = NO;
         [self.refreshControl endRefreshing];
         if (error) {
             TFLog(@"[%@] Could not request collections: %@",
                   space.URL.host, error);
         }
     }];
}

- (IBAction)onDone:(id)sender
{
#if DEBUG
    for (NSManagedObject *obj in self.fetchedResultsController.managedObjectContext.updatedObjects) {
        HPLog(@"[%@] changes: %@", self.pad.URL.host, obj.changedValues);
    }
#endif
    [self dismissViewControllerAnimated:YES
                             completion:^{}];
}

- (void)alertView:(UIAlertView *)alertView
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
    if (alertView == _createAlert) {
        alertView.delegate = nil;
        _createAlert = nil;
        if (buttonIndex == alertView.cancelButtonIndex) {
            return;
        }
        NSString *name = [alertView textFieldAtIndex:0].text;
        if (!name.length) {
            return;
        }

        [self.pad.space createCollectionWithName:name
                                             pad:self.pad
                                      completion:^(HPSpace *space,
                                                   HPCollection *collection,
                                                   NSError *error)
         {
             if (error) {
                 TFLog(@"[%@] Error creating collection: %@",
                       space.URL.host, error);
             }
         }];
    }
}

- (IBAction)addCollection:(id)sender
{
    _createAlert = [[UIAlertView alloc] initWithTitle:@"Create Collection"
                                              message:@"Enter the name for your new collection."
                                             delegate:self
                                    cancelButtonTitle:@"Cancel"
                                    otherButtonTitles:@"Create",
                    nil];
    _createAlert.alertViewStyle = UIAlertViewStylePlainTextInput;
    UITextField *text = [_createAlert textFieldAtIndex:0];
    text.returnKeyType = UIReturnKeyDone;
    text.placeholder = @"Collection Name";
    text.delegate = self;
    [_createAlert show];
}

#pragma mark - Text field delegate

- (BOOL)textFieldShouldReturn:(UITextField *)textField
{
    if (textField == [_createAlert textFieldAtIndex:0]) {
        [_createAlert dismissWithClickedButtonIndex:_createAlert.firstOtherButtonIndex
                                           animated:YES];
    }
    return YES;
}

@end
