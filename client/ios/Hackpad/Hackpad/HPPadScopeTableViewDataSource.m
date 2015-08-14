//
//  HPPadScopeTableViewDataSource.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadScopeTableViewDataSource.h"

#import "HPActionSheetBlockDelegate.h"

#import <HackpadKit/HackpadKit.h>

#import <MBProgressHUD/MBProgressHUD.h>
#import <TestFlight/TestFlight.h>

static NSString * const CollectionImageName = @"up-chevron";
static NSString * const SwitchUserImageName = @"user";

@interface HPPadScopeTableViewDataSource ()
@property (nonatomic, strong) NSFetchedResultsController *fetchedResultsController;
@property (nonatomic, strong) NSMutableDictionary *collectionFetchedResultsControllers;
@property (nonatomic, strong) NSMutableDictionary *collectionCounts;
@property (nonatomic, strong) NSMutableArray *deferredBlocks;
@property (nonatomic, strong) NSMutableSet *shownCollections;
@end

@implementation HPPadScopeTableViewDataSource

- (void)dealloc
{
    self.fetchedResultsController.delegate = nil;
    [self.collectionFetchedResultsControllers enumerateKeysAndObjectsUsingBlock:^(id key, NSFetchedResultsController *frc, BOOL *stop) {
        frc.delegate = nil;
    }];
}

#pragma mark - Implementation

- (NSFetchedResultsController *)fetchedResultsController
{
    if (_fetchedResultsController) {
        return _fetchedResultsController;
    }
    if (!self.managedObjectContext) {
        return nil;
    }
    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPSpaceEntity];
    fetchRequest.predicate = [NSPredicate predicateWithFormat:@"hidden == NO"];
    fetchRequest.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"domainType"
                                                                   ascending:YES],
                                     [NSSortDescriptor sortDescriptorWithKey:@"name"
                                                                   ascending:YES]];
    fetchRequest.shouldRefreshRefetchedObjects = YES;
    _fetchedResultsController = [[NSFetchedResultsController alloc] initWithFetchRequest:fetchRequest
                                                                    managedObjectContext:self.managedObjectContext
                                                                      sectionNameKeyPath:nil
                                                                               cacheName:nil];
    _fetchedResultsController.delegate = self;
    NSError * __autoreleasing error;
    if (![_fetchedResultsController performFetch:&error]) {
        TFLog(@"Couldn't perform fetch: %@", error);
    }
    [_fetchedResultsController.fetchedObjects enumerateObjectsUsingBlock:^(HPSpace *space, NSUInteger idx, BOOL *stop) {
        [self fetchedResultsControllerForSpace:space];
    }];
    return _fetchedResultsController;
}

- (HPSpace *)spaceForRowAtIndexPath:(NSIndexPath *)indexPath
{
    return self.fetchedResultsController.fetchedObjects[indexPath.section];
}

- (NSMutableDictionary *)collectionFetchedResultsControllers
{
    if (!_collectionFetchedResultsControllers) {
        _collectionFetchedResultsControllers = [NSMutableDictionary dictionary];
    }
    return _collectionFetchedResultsControllers;
}

- (NSMutableDictionary *)collectionCounts
{
    if (!_collectionCounts) {
        _collectionCounts = [NSMutableDictionary dictionary];
    }
    return _collectionCounts;
}

- (NSMutableSet *)shownCollections
{
    if (!_shownCollections) {
        _shownCollections = [NSMutableSet set];
    }
    return _shownCollections;
}

- (NSFetchedResultsController *)fetchedResultsControllerForSpace:(HPSpace *)space
{
    NSFetchedResultsController *collectionFetchedResultsController;
    collectionFetchedResultsController = [self.collectionFetchedResultsControllers objectForKey:space.objectID];
    if (collectionFetchedResultsController) {
        return collectionFetchedResultsController;
    }

    NSError * __autoreleasing error;
    if (![space.managedObjectContext obtainPermanentIDsForObjects:@[space]
                                                            error:&error]) {
        TFLog(@"[%@] Could not get permanent object id: %@", space.URL.host, error);
        return nil;
    }

    NSFetchRequest *fetchRequest = [NSFetchRequest fetchRequestWithEntityName:HPCollectionEntity];
    fetchRequest.predicate = [NSPredicate predicateWithFormat:@"space == %@ AND followed == YES", space];
    fetchRequest.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"title"
                                                                   ascending:YES]];
    fetchRequest.shouldRefreshRefetchedObjects = YES;
    collectionFetchedResultsController = [[NSFetchedResultsController alloc] initWithFetchRequest:fetchRequest
                                                                   managedObjectContext:self.fetchedResultsController.managedObjectContext
                                                                     sectionNameKeyPath:nil
                                                                              cacheName:nil];
    collectionFetchedResultsController.delegate = self;
    self.collectionFetchedResultsControllers[space.objectID] = collectionFetchedResultsController;
    if (![collectionFetchedResultsController performFetch:&error]) {
        TFLog(@"[%@] Couldn't perform fetch: %@", space.URL.host, error);
    }
    self.collectionCounts[space.objectID] = [NSNumber numberWithInteger:collectionFetchedResultsController.fetchedObjects.count];
    return collectionFetchedResultsController;
}

- (id)objectAtIndexPath:(NSIndexPath *)indexPath
{
    HPSpace *space = [self spaceForRowAtIndexPath:indexPath];
    if (!indexPath.row) {
        return space;
    }

    NSFetchedResultsController *collectionFetchedResultsController;
    collectionFetchedResultsController = [self fetchedResultsControllerForSpace:space];
    return collectionFetchedResultsController.fetchedObjects[indexPath.row - 1];
}

- (void)configureCell:(UITableViewCell *)cell
          atIndexPath:(NSIndexPath *)indexPath
{
    id object = [self objectAtIndexPath:indexPath];
    NSAssert([object isKindOfClass:[HPSpace class]] || [object isKindOfClass:[HPCollection class]],
             @"Don't know how to handle %@ object.", [object class]);

    cell.textLabel.font = [UIFont hp_UITextFontOfSize:cell.textLabel.font.pointSize];
    cell.detailTextLabel.font = [UIFont hp_UITextFontOfSize:cell.detailTextLabel.font.pointSize];

    if ([object isKindOfClass:[HPCollection class]]) {
        HPCollection *collection = object;
        cell.textLabel.text = collection.title;
        cell.detailTextLabel.text = nil;
        return;
    }

    UIImage *image;
    UIButton *button;
    HPSpace *space = object;

    cell.textLabel.text = space.name;
    cell.detailTextLabel.text = space.URL.host;

    CGFloat buttonWidth = UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad ? 64 : 58;
    if (space.collections.count) {
        image = [UIImage imageNamed:CollectionImageName];
        button = [[UIButton alloc] initWithFrame:CGRectMake(0, 0, buttonWidth, 40)];
        [button setImage:image
                forState:UIControlStateNormal];
        UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self
                                                                              action:@selector(collectionButtonTapped:)];
        [button addGestureRecognizer:tap];
        if (![self.shownCollections member:space.objectID]) {
            button.transform = CGAffineTransformMakeRotation(M_PI);
        }
        button.tag = indexPath.section;
    }
    cell.accessoryView = button;

    image = [UIImage imageNamed:SwitchUserImageName];
    button = [[UIButton alloc] initWithFrame:CGRectMake(0, 0, buttonWidth, 40)];
    button.tag = indexPath.section;

    [button setImage:image
            forState:UIControlStateNormal];
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self
                                                                          action:@selector(switchUser:)];
    [button addGestureRecognizer:tap];

    cell.editingAccessoryView = button;
}

- (void)collectionButtonTapped:(UITapGestureRecognizer *)sender
{
    if (sender.state != UIGestureRecognizerStateEnded) {
        return;
    }
    UIButton *button = (UIButton *)sender.view;
    NSParameterAssert([button isKindOfClass:[UIButton class]]);
    NSInteger section = button.tag;
    HPSpace *space = [self spaceForRowAtIndexPath:[NSIndexPath indexPathForRow:0
                                                                     inSection:section]];
    NSUInteger rowsCount = [self.collectionCounts[space.objectID] integerValue];
    NSMutableArray *rows = [NSMutableArray arrayWithCapacity:rowsCount];
    for (NSUInteger row = 1; row <= rowsCount; row++) {
        [rows addObject:[NSIndexPath indexPathForRow:row
                                           inSection:section]];
    }
    CGAffineTransform transform = CGAffineTransformIdentity;
    [self.tableView beginUpdates];
    if ([self.shownCollections member:space.objectID]) {
        [self.shownCollections removeObject:space.objectID];
        [self.tableView deleteRowsAtIndexPaths:rows
                              withRowAnimation:UITableViewRowAnimationAutomatic];
        transform = CGAffineTransformMakeRotation(M_PI);
    } else {
        [self.shownCollections addObject:space.objectID];
        [self.tableView insertRowsAtIndexPaths:rows
                              withRowAnimation:UITableViewRowAnimationAutomatic];
    }
    [self.tableView endUpdates];
    [UIView animateWithDuration:0.25
                     animations:^{
                         button.transform = transform;
                     }];
}

- (void)switchUser:(UITapGestureRecognizer *)sender
{
    if (sender.state != UIGestureRecognizerStateEnded) {
        return;
    }
    UIButton *button = (UIButton *)sender.view;
    NSParameterAssert([button isKindOfClass:[UIButton class]]);
    NSInteger section = button.tag;
    HPSpace *space = [self spaceForRowAtIndexPath:[NSIndexPath indexPathForRow:0
                                                                     inSection:section]];
    HPAPI *API = space.API;
    HPPadScopeTableViewDataSource * __weak weakSelf = self;
    HPActionSheetBlockDelegate *delegate = [[HPActionSheetBlockDelegate alloc] initWithBlock:^(UIActionSheet *sheet, NSInteger button) {
        if (button == sheet.cancelButtonIndex) {
            return;
        }
        [weakSelf.tableView setEditing:NO
                              animated:YES];
        @synchronized (API) {
            API.authenticationState = HPRequiresSignInAuthenticationState;
            API.userID = space.userID;
            API.authenticationState = HPSignInPromptAuthenticationState;
        }
    }];
    // Showing from the clipped view displays wrong in iOS 7.
    UIView *view = self.tableView;
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone && HP_SYSTEM_MAJOR_VERSION() >= 7) {
        view = view.window;
    }

    [[[UIActionSheet alloc] initWithTitle:space.name
                                 delegate:delegate
                        cancelButtonTitle:@"Cancel"
                   destructiveButtonTitle:@"Switch Accounts"
                        otherButtonTitles:nil] showInView:view];
}

#pragma mark - Table view data source implementation

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return self.fetchedResultsController.fetchedObjects.count;
}

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section
{
    /*
     We can't just use the fetchedResultController's count because we get
     updates from the space controller and collection controllers separately.
     For example, we'll see the updated count here after getting the space's
     changed callback, but before getting the collection's, so we don't return
     the value UITableView expects.
     */
    HPSpace *space = self.fetchedResultsController.fetchedObjects[section];

    return [self.shownCollections member:space.objectID]
        ? [self.collectionCounts[space.objectID] integerValue] + 1
        : 1;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    static NSString * const SpaceCellIdentifier = @"SpaceCell";
    static NSString * const CollectionCellIdentifier = @"CollectionCell";
    UITableViewCell *cell;
    // Search results doesn't have a table view, so just use main view w/o indexPath.
    cell = [tableView dequeueReusableCellWithIdentifier:indexPath.row ? CollectionCellIdentifier : SpaceCellIdentifier
                                           forIndexPath:indexPath];
    [self configureCell:cell
            atIndexPath:indexPath];

    return cell;
}

- (void)tableView:(UITableView *)tableView
commitEditingStyle:(UITableViewCellEditingStyle)editingStyle
forRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (editingStyle != UITableViewCellEditingStyleDelete) {
        return;
    }
    NSManagedObject *object = [self objectAtIndexPath:indexPath];
    if ([object isKindOfClass:[HPCollection class]]) {
        [(HPCollection *)object setFollowed:NO
                                 completion:^(HPCollection *collection, NSError *error)
         {
             if (error) {
                 TFLog(@"[%@] Error unfollowing collection: %@",
                       collection.space.URL.host, error);
             }
         }];
         return;
    }
    HPSpace *space = (HPSpace *)object;
    @synchronized ([space API]) {
        if (space.API.authenticationState != HPRequiresSignInAuthenticationState) {
            MBProgressHUD *HUD = [MBProgressHUD showHUDAddedTo:tableView
                                                      animated:YES];
            [space signOutWithCompletion:^(HPSpace *space, NSError *error) {
                [HUD hide:YES];
                if (error) {
                    TFLog(@"[%@] Error signing out of space: %@",
                          space.URL.host, error);
                }
            }];
            return;
        }
        NSAssert(indexPath.section, @"Shouldn't remove root space");
        [space hp_performBlock:^(HPSpace *space, NSError *__autoreleasing *error) {
            space.hidden = YES;
        } completion:^(HPSpace *space, NSError *error) {
            if (error) {
                TFLog(@"[%@] Could not hide space: %@", space.URL.host, error);
            }
        }];
    }
}

#pragma mark - Fetched results controller delegate

/*
 Assume self has a property 'tableView' -- as is the case for an instance of a UITableViewController
 subclass -- and a method configureCell:atIndexPath: which updates the contents of a given cell
 with information from a managed object at the given index path in the fetched results controller.
 */

- (void)controllerWillChangeContent:(NSFetchedResultsController *)controller
{
    HPLog(@"%s", __PRETTY_FUNCTION__);
    NSAssert(!self.deferredBlocks, @"Recursively changing content");
    self.deferredBlocks = [NSMutableArray array];
    [self.tableView beginUpdates];
}

- (void)controller:(NSFetchedResultsController *)controller
   didChangeObject:(id)anObject
       atIndexPath:(NSIndexPath *)indexPath
     forChangeType:(NSFetchedResultsChangeType)type
      newIndexPath:(NSIndexPath *)newIndexPath
{
    HPLog(@"%s %@ (%lu) %@ => %@", __PRETTY_FUNCTION__, [anObject class], (unsigned long)type, indexPath, newIndexPath);
    if ([anObject isKindOfClass:[HPSpace class]]) {
        if (indexPath) {
            indexPath = [NSIndexPath indexPathForRow:0
                                           inSection:indexPath.row];
        }
        if (newIndexPath) {
            newIndexPath = [NSIndexPath indexPathForRow:0
                                              inSection:newIndexPath.row];
        }
        switch (type) {
            case NSFetchedResultsChangeInsert: {
                HPPadScopeTableViewDataSource * __weak weakSelf = self;
                [self.deferredBlocks addObject:^{
                    [weakSelf fetchedResultsControllerForSpace:anObject];
                }];
                [self.tableView insertSections:[NSIndexSet indexSetWithIndex:newIndexPath.section]
                              withRowAnimation:UITableViewRowAnimationFade];
                return;
            }
            case NSFetchedResultsChangeDelete:
                [self.collectionCounts removeObjectForKey:[anObject objectID]];
                [self.collectionFetchedResultsControllers removeObjectForKey:[anObject objectID]];
                [self.tableView deleteSections:[NSIndexSet indexSetWithIndex:indexPath.section]
                              withRowAnimation:UITableViewRowAnimationFade];
                return;
            default:
                break;
        }
    } else {
        HPSpace *space = [(HPCollection *)anObject space];
        if (!space) {
            space = [anObject changedValuesForCurrentEvent][@"space"];
            if (space.isDeleted) {
                HPLog(@"[%@] Ignoring collection change for deleted space.",
                      space.URL.host);
                return;
            }
        }
        NSIndexPath *spaceIndexPath = [self.fetchedResultsController indexPathForObject:space];
        NSAssert(spaceIndexPath, @"[%@] Could not find space index path for collection: %@",
                 space.URL.host, [anObject title]);
        if (indexPath) {
            indexPath = [NSIndexPath indexPathForRow:indexPath.row + 1
                                           inSection:spaceIndexPath.row];
        }
        if (newIndexPath) {
            newIndexPath = [NSIndexPath indexPathForRow:newIndexPath.row + 1
                                              inSection:spaceIndexPath.row];
        }
        BOOL shown = !![self.shownCollections member:space.objectID];
        switch(type) {
            case NSFetchedResultsChangeInsert:
                if (!newIndexPath) {
                    return;
                }
                self.collectionCounts[space.objectID] = [NSNumber numberWithInteger:[self.collectionCounts[space.objectID] integerValue] + 1];
                if (!shown) {
                    return;
                }
                [self.tableView insertRowsAtIndexPaths:@[newIndexPath]
                                      withRowAnimation:UITableViewRowAnimationFade];
                return;

            case NSFetchedResultsChangeDelete: {
                if (!indexPath) {
                    return;
                }
                self.collectionCounts[space.objectID] = [NSNumber numberWithInteger:[self.collectionCounts[space.objectID] integerValue] - 1];
                if (!shown) {
                    return;
                }
                [self.tableView deleteRowsAtIndexPaths:@[indexPath]
                                          withRowAnimation:UITableViewRowAnimationFade];
                return;
            }
            default:
                if (!shown) {
                    return;
                }
                break;
        }
    }

    HPLog(@" => %@ => %@", indexPath, newIndexPath);

    UITableViewCell *cell;
    switch (type) {
        case NSFetchedResultsChangeMove:
            if (indexPath && newIndexPath) {
                [self.tableView deleteRowsAtIndexPaths:@[indexPath]
                                      withRowAnimation:UITableViewRowAnimationFade];
                [self.tableView insertRowsAtIndexPaths:@[newIndexPath]
                                      withRowAnimation:UITableViewRowAnimationFade];
            }
            break;
        case NSFetchedResultsChangeUpdate:
            cell = [self.tableView cellForRowAtIndexPath:indexPath];
            if (cell) {
                [self configureCell:[self.tableView cellForRowAtIndexPath:indexPath]
                        atIndexPath:indexPath];
            }
            break;
        default:
            break;
    }
}

- (void)controllerDidChangeContent:(NSFetchedResultsController *)controller
{
    HPLog(@"%s", __PRETTY_FUNCTION__);
    [self.tableView endUpdates];
    NSAssert(self.deferredBlocks, @"Not changing content");
    NSArray *blocks = self.deferredBlocks;
    self.deferredBlocks = nil;
    [blocks enumerateObjectsUsingBlock:^(void (^deferredBlock)(void), NSUInteger idx, BOOL *stop) {
        deferredBlock();
    }];
}

@end
