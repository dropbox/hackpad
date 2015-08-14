//
//  HPPadSearchTableViewDataSource.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPPadSearchTableViewDataSource.h"

#import "HPSearchResultsController.h"

#import <HackpadKit/HackpadKit.h>
#import <TestFlight/TestFlight.h>
#import <NSAttributedString+DDHTML/NSAttributedString+DDHTML.h>
#import <AppleSampleCode/Reachability.h>

static NSString *PadIDKey = @"padID";

static NSUInteger const MaxLengthOfKeywordRange = 40;

@interface HPPadSearchTableViewDataSource () <NSFetchedResultsControllerDelegate, HPSearchResultsControllerDelegate> {
    id _padScopeObserver;
    id _signInObserver;
    NSMutableDictionary *_snippets;
    HPSpace *_space;
    NSUInteger _generation;
}
@property (nonatomic, strong) HPSearchResultsController *searchResultsController;
@end

@implementation HPPadSearchTableViewDataSource

- (id)init
{
    self = [super init];
    if (self) {
        _snippets = [NSMutableDictionary dictionary];
        HPPadSearchTableViewDataSource * __weak weakSelf = self;
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        _padScopeObserver = [center addObserverForName:HPPadScopeDidChangeNotification
                                                object:nil
                                                 queue:[NSOperationQueue mainQueue]
                                            usingBlock:^(NSNotification *note)
                             {
                                 if (note.object == weakSelf.padScope) {
                                     [weakSelf reloadTable];
                                 }
                             }];
        _signInObserver = [center addObserverForName:HPAPIDidSignInNotification
                                              object:nil
                                               queue:[NSOperationQueue mainQueue]
                                          usingBlock:^(NSNotification *note)
                           {
                               if (note.object == weakSelf.padScope.space.API) {
                                   [weakSelf reloadTable];
                               }
                           }];
    }
    return self;
}

- (void)dealloc
{
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    if (_padScopeObserver) {
        [center removeObserver:_padScopeObserver];
    }
    if (_signInObserver) {
        [center removeObserver:_signInObserver];
    }
    _searchResultsController.delegate = nil;
}

#pragma mark - Implementation

- (void)reloadTable
{
    self.searchResultsController.delegate = nil;
    self.searchResultsController = nil;
    if (self.searchText) {
        self.searchText = self.searchText;
    }
}

- (HPSearchResultsController *)searchResultsController
{
    if (!self.padScope.space || !self.searchText.length) {
        return nil;
    }
    if (_searchResultsController) {
        return _searchResultsController;
    }

    NSError * __autoreleasing error;
    _space = (HPSpace *)[self.managedObjectContext existingObjectWithID:self.padScope.space.objectID
                                                                 error:&error];
    if (!_space) {
        TFLog(@"[%@] Could not fetch space: %@", self.padScope.space.URL.host, error);
    }

    NSFetchRequest *fetch = [NSFetchRequest fetchRequestWithEntityName:HPPadEntity];
    fetch.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"lastEditedDate"
                                                            ascending:NO]];
    _searchResultsController = [[HPSearchResultsController alloc] initWithFetchRequest:fetch
                                                                  managedObjectContext:self.managedObjectContext
                                                                    sectionNameKeyPath:nil
                                                                             cacheName:nil];
    _searchResultsController.baseSearchPredicate = self.padScope.collection
        ? [NSPredicate predicateWithFormat:@"ANY collections == %@", self.padScope.collection.objectID]
        : [NSPredicate predicateWithFormat:@"space == %@", self.padScope.space.objectID];

    _searchResultsController.delegate = self;
    return _searchResultsController;
}

- (HPPad *)padAtIndexPath:(NSIndexPath *)indexPath
{
    return [_searchResultsController objectAtIndexPath:indexPath];
}

- (void)configureCell:(UITableViewCell *)cell
          atIndexPath:(NSIndexPath *)indexPath
{
    HPPad *pad = [self padAtIndexPath:indexPath];
    cell.textLabel.font = [UIFont hp_padTitleFontOfSize:cell.textLabel.font.pointSize];
    cell.textLabel.text = pad.title;
    id snippet = _snippets[pad.padID];
    if (!snippet && (!self.searchText.length || !pad.search.content)) {
        cell.detailTextLabel.text = nil;
        return;
    }
    if ([snippet isKindOfClass:[NSAttributedString class]]) {
        cell.detailTextLabel.attributedText = snippet;
        return;
    }
    const CGFloat fontSize = 13;
    UIFont *regularFont = [UIFont hp_padTextFontOfSize:fontSize];
    UIFont *highlightingFont = [UIFont hp_UITextFontOfSize:fontSize];
    if (snippet) {
        snippet = [NSAttributedString attributedStringFromHTML:snippet
                                                      boldFont:highlightingFont
                                                   regularFont:regularFont];
    } else {
        snippet = [NSAttributedString hp_initWithString:pad.search.content
                                             attributes:@{NSFontAttributeName:regularFont}
                                   highlightingKeywords:self.searchText
                                 highlightingAttributes:@{NSFontAttributeName:highlightingFont}
                                maxLengthOfKeywordRange:MaxLengthOfKeywordRange];
    }
    if (snippet ) {
        _snippets[pad.padID] = snippet;
    }
    cell.detailTextLabel.attributedText = snippet;
}

- (void)setSearchText:(NSString *)searchText
{
    _searchText = [searchText copy];
    [_snippets removeAllObjects];
    if (!searchText.length) {
        self.searchResultsController.delegate = nil;
        self.searchResultsController = nil;
        [self.tableView reloadData];
        return;
    }
    [self.searchResultsController setSearchText:searchText
                                       variable:@"search.content"];

    NSInteger myGeneration = ++_generation;

    if (!_space.API.reachability.currentReachabilityStatus) {
        self.searchResultsController.searchResultsPredicate = nil;
        return;
    }

    [_space requestPadsMatchingText:searchText
                           refresh:NO
                        completion:^(HPSpace *space,
                                     NSArray *pads,
                                     NSDictionary *serverSnippets,
                                     NSError *error)
     {
         if (_generation != myGeneration) {
             return;
         }
         if (error) {
             TFLog(@"[%@] Could not search: %@", space.URL.host, error);
         }
         [serverSnippets enumerateKeysAndObjectsUsingBlock:^(id key, id obj, BOOL *stop) {
             if (!_snippets[key]) {
                 _snippets[key] = obj;
             }
         }];
         HPLog(@"[%@] Found %lu search results; updating predicate",
               space.URL.host, (unsigned long)pads.count);
         self.searchResultsController.searchResultsPredicate = pads.count
             ? [NSPredicate predicateWithFormat:@"SELF IN %@", pads]
             : nil;
     }];
}

#pragma mark - Table view data source

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
    return self.searchResultsController.sections.count;
}

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section
{
    id <NSFetchedResultsSectionInfo> sectionInfo;
    sectionInfo = self.searchResultsController.sections[section];
    return [sectionInfo numberOfObjects];
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    static NSString * const SearchCellIdentifier = @"SearchCell";
    UITableViewCell *cell;
    cell = [tableView dequeueReusableCellWithIdentifier:SearchCellIdentifier];
    if (!cell) {
        if (self.prototypeTableView) {
            cell = [self.prototypeTableView dequeueReusableCellWithIdentifier:SearchCellIdentifier];
        } else {
            cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle
                                          reuseIdentifier:SearchCellIdentifier];
        }
    }
    [self configureCell:cell
            atIndexPath:indexPath];
    return cell;
}

#pragma mark - Fetched results delegate

- (void)controllerWillChangeContent:(NSFetchedResultsController *)controller
{
    //HPLog(@"%s", __PRETTY_FUNCTION__);
    [self.tableView beginUpdates];
}


- (void)controller:(NSFetchedResultsController *)controller
  didChangeSection:(id <NSFetchedResultsSectionInfo>)sectionInfo
           atIndex:(NSUInteger)sectionIndex
     forChangeType:(NSFetchedResultsChangeType)type
{
    //HPLog(@"%s", __PRETTY_FUNCTION__);
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
    //HPLog(@"%s %@ (%lu) %@ => %@", __PRETTY_FUNCTION__, [anObject class], (unsigned long)type, indexPath, newIndexPath);
    UITableViewCell *cell;
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
            cell = [self.tableView cellForRowAtIndexPath:indexPath];
            if (cell) {
                [self configureCell:cell
                        atIndexPath:indexPath];
            }
            break;
    }
}

- (void)controllerDidChangeContent:(NSFetchedResultsController *)controller
{
    //HPLog(@"%s", __PRETTY_FUNCTION__);
    [self.tableView endUpdates];
}

#pragma mark - Search results controller delegte

- (void)controllerDidChangePredicate:(HPSearchResultsController *)controller
{
    //HPLog(@"Search predicate: %@", self.searchResultsController.fetchRequest.predicate);
    NSError * __autoreleasing error;
    if (![self.searchResultsController performFetch:&error]) {
        TFLog(@"Could not perform search: %@", error);
    }
    [self.tableView reloadData];
}

@end
