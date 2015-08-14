//
//  HPInvitationTableViewDataSource.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPInvitationTableViewDataSource.h"

#import <AddressBookUI/AddressBookUI.h>
#import <TestFlight/TestFlight.h>

NSString * const HPInvitationEmailKey = @"email";
NSString * const HPInvitationFacebookIDKey = @"fbid";
NSString * const HPInvitationLabelKey = @"label";
NSString * const HPInvitationNameKey = @"name";
NSString * const HPInvitationUserIDKey = @"userId";

@interface HPInvitationTableViewDataSource ()
@property (nonatomic, assign) ABAddressBookRef addressBook;
@property (nonatomic, strong) ABPeoplePickerNavigationController *peoplePicker;
@property (nonatomic, strong) NSMutableArray *results;
@property (nonatomic, assign) NSUInteger requestID;
@property (nonatomic, strong) NSMutableDictionary *seenEmail;
@end

@implementation HPInvitationTableViewDataSource

#pragma mark - NSObject

- (id)init
{
    self = [super init];
    if (!self) {
        return nil;
    }
    CFErrorRef errorRef = NULL;
    _addressBook = ABAddressBookCreateWithOptions(NULL, &errorRef);
    NSError *error = (__bridge_transfer NSError *)errorRef;
    if (error) {
        TFLog(@"[%@] Could not create address book: %@", self.space.URL.host, error);
    }
    if (ABAddressBookGetAuthorizationStatus() == kABAuthorizationStatusNotDetermined) {
        ABAddressBookRequestAccessWithCompletion(self.addressBook, NULL);
    }
    self.results = [NSMutableArray array];
    self.seenEmail = [NSMutableDictionary dictionary];
    return self;
}

- (void)dealloc
{
    if (_addressBook) {
        CFRelease(_addressBook);
        _addressBook = NULL;
    }
}

#pragma mark - Implementation

static CFComparisonResult
HPInvitationTableViewDataSourcePersonComparator(const void *val1,
                                                const void *val2,
                                                void *context)
{
    return ABPersonComparePeopleByName(val1, val2, ABPersonGetSortOrdering());
}

- (void)addAddressBookResultsForSearchText:(NSString *)searchText
{
    CFArrayRef unsorted = ABAddressBookCopyPeopleWithName(self.addressBook, (__bridge CFStringRef)searchText);
    CFIndex count = CFArrayGetCount(unsorted);

    CFMutableArrayRef sorted = CFArrayCreateMutableCopy(kCFAllocatorDefault, count, unsorted);
    CFRelease(unsorted);

    CFArraySortValues(sorted, CFRangeMake(0, count),
                      HPInvitationTableViewDataSourcePersonComparator, NULL);

    for (CFIndex i = 0; i < count; i++) {
        ABRecordRef person = CFArrayGetValueAtIndex(sorted, i);
        ABMultiValueRef emailValue = ABRecordCopyValue(person, kABPersonEmailProperty);
        if (!ABMultiValueGetCount(emailValue)) {
            CFRelease(emailValue);
            continue;
        }
        NSString *name = (__bridge_transfer NSString *)ABRecordCopyCompositeName(person);
        name = [name stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        for (CFIndex j = 0; j < ABMultiValueGetCount(emailValue); j++) {
            NSString *label = (__bridge_transfer NSString *)ABMultiValueCopyLabelAtIndex(emailValue, j);
            label = (__bridge_transfer NSString *)ABAddressBookCopyLocalizedLabel((__bridge CFStringRef)label);
            NSString *email = (__bridge_transfer NSString *)ABMultiValueCopyValueAtIndex(emailValue, j);
            NSDictionary *info = @{HPInvitationNameKey:name.length ? name : email,
                                   HPInvitationEmailKey:email,
                                   HPInvitationLabelKey:label};
            if (!self.seenEmail[email]) {
                [self.results addObject:info];
                self.seenEmail[email] = info;
            }
        }
        CFRelease(emailValue);
    }
    CFRelease(sorted);
}

- (void)addServerResultsForSearchText:(NSString *)searchText
{
    HPInvitationTableViewDataSource * __weak weakSelf = self;
    NSUInteger requestID = ++self.requestID;
    [self.space requestContactsMatchingText:searchText
                                 completion:^(HPSpace *space,
                                              NSArray *contacts,
                                              NSError *error)
     {
         if (!weakSelf || weakSelf.requestID != requestID) {
             return;
         }
         if (error) {
             TFLog(@"[%@] Could not find contacts for search string %@: %@",
                   space.URL.host, searchText, error);
             return;
         }

         NSMutableArray *indexPaths = [NSMutableArray arrayWithCapacity:contacts.count];
         [contacts enumerateObjectsUsingBlock:^(NSDictionary *contact, NSUInteger idx, BOOL *stop) {
             if (![contact isKindOfClass:[NSDictionary class]]) {
                 return;
             }
             NSString *email = contact[HPInvitationEmailKey];
             NSString *facebookID = contact[HPInvitationFacebookIDKey];
             NSString *userID = contact[HPInvitationUserIDKey];
             if (!([email isKindOfClass:[NSString class]] && email.length) &&
                 !([facebookID isKindOfClass:[NSString class]] && facebookID.length) &&
                 !([userID isKindOfClass:[NSString class]] && userID.length)) {
                 return;
             }

             [indexPaths addObject:[NSIndexPath indexPathForRow:weakSelf.results.count
                                                      inSection:0]];
             [weakSelf.results addObject:contact];
             if ([email isKindOfClass:[NSString class]] && email.length) {
                 _seenEmail[email] = contact;
             }
         }];
         if (!indexPaths.count) {
             return;
         }
         [weakSelf.tableView beginUpdates];
         [weakSelf.tableView insertRowsAtIndexPaths:indexPaths
                                   withRowAnimation:UITableViewRowAnimationAutomatic];
         [weakSelf.tableView endUpdates];
     }];
}

- (void)setSearchText:(NSString *)searchText
{
    [self.results removeAllObjects];
    [self.seenEmail removeAllObjects];

    NSUInteger requestID = ++self.requestID;

    if (ABAddressBookGetAuthorizationStatus() == kABAuthorizationStatusAuthorized) {
        [self addAddressBookResultsForSearchText:searchText];
    }
    if (!searchText.length) {
        [self.tableView reloadData];
        return;
    }

    HPInvitationTableViewDataSource * __weak weakSelf = self;
    double delayInSeconds = .4;
    dispatch_time_t popTime = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delayInSeconds * NSEC_PER_SEC));
    dispatch_after(popTime, dispatch_get_main_queue(), ^(void){
        if (!weakSelf || weakSelf.requestID != requestID) {
            return;
        }
        [weakSelf addServerResultsForSearchText:searchText];
    });

    if ([searchText rangeOfString:@"@"].location == NSNotFound) {
        [self.tableView reloadData];
        return;
    }
    NSDictionary *info = @{HPInvitationEmailKey:searchText,
                           HPInvitationNameKey:searchText};
    [self.results addObject:info];

    self.seenEmail[searchText] = info;

    [self.tableView reloadData];
}

- (NSDictionary *)invitationInfoAtIndexPath:(NSIndexPath *)indexPath
{
    return self.results[indexPath.row];
}

#pragma mark - Table view data source

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section
{
    return [self.results count];
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    static NSString * const CellIdentifier = @"Cell";
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:CellIdentifier];
    if (!cell) {
        cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle
                                      reuseIdentifier:CellIdentifier];
        cell.backgroundColor = tableView.backgroundColor;
    }
    cell.accessoryView = nil;
    cell.textLabel.font = [UIFont hp_padTitleFontOfSize:cell.textLabel.font.pointSize];
    cell.detailTextLabel.font = [UIFont hp_padTitleFontOfSize:cell.detailTextLabel.font.pointSize];

    NSDictionary *result = _results[indexPath.row];
    NSString *name = result[HPInvitationNameKey];
    NSString *email = result[HPInvitationEmailKey];
    cell.textLabel.text = name;
    if ([name isEqualToString:email]) {
        cell.detailTextLabel.text = nil;
        return cell;
    }

    NSString *label = result[HPInvitationEmailKey];
    [NSString stringWithFormat:@"%@ %@", label ? label : @"", email ? email : @""];
    NSCharacterSet *ws = [NSCharacterSet whitespaceAndNewlineCharacterSet];
    cell.detailTextLabel.text = [label stringByTrimmingCharactersInSet:ws];
    return cell;
}

@end
