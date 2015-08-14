//
//  HPInvitationTableDataSource.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPInvitationController.h"

#import "HackpadKit.h"
#import "HackpadAdditions.h"

#import "HPInvitationTableViewDataSource.h"

#import <AddressBookUI/AddressBookUI.h>
#import <TestFlight/TestFlight.h>

@interface HPInvitationController () <ABPeoplePickerNavigationControllerDelegate, UIActionSheetDelegate> {
    ABPeoplePickerNavigationController *_peoplePicker;
    NSDictionary *_selectedResult;
}
@end

//ABAddressBookCopyPeopleWithName()

// Sources:
// 1. address book
// 2.

@implementation HPInvitationController

- (void)inviteResult:(NSDictionary *)result
{
    _selectedResult = result;
    UIView *view = _peoplePicker
        ? _peoplePicker.view
        : self.viewController.searchDisplayController.isActive
            ? self.viewController.searchDisplayController.searchResultsTableView
            : self.viewController.view;
    [[[UIActionSheet alloc] initWithTitle:nil
                                 delegate:self
                        cancelButtonTitle:@"Cancel"
                   destructiveButtonTitle:nil
                        otherButtonTitles:[NSString stringWithFormat:@"Invite %@", _selectedResult[HPInvitationNameKey]], nil] showInView:view];
}

#pragma mark - Table View Delegate

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    [tableView deselectRowAtIndexPath:indexPath
                             animated:YES];
    [self inviteResult:[self.dataSource invitationInfoAtIndexPath:indexPath]];
}

#pragma mark - Search Display delegate

- (BOOL)searchDisplayController:(UISearchDisplayController *)controller
shouldReloadTableForSearchString:(NSString *)searchString
{
    self.dataSource.searchText = searchString;
    return NO;
}

- (void)searchDisplayControllerWillBeginSearch:(UISearchDisplayController *)controller
{
    if (!self.dataSource) {
        self.dataSource = [HPInvitationTableViewDataSource new];
        self.dataSource.space = self.pad.space;
        self.dataSource.tableView = controller.searchResultsTableView;

        controller.searchResultsDataSource = self.dataSource;
    }
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        return;
    }
    controller.searchBar.searchBarStyle = UISearchBarStyleProminent;
    controller.searchBar.barTintColor = [UIColor whiteColor];
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        return;
    }
    // Bug fixes for iOS 7 on iPad: http://petersteinberger.com/blog/2013/fixing-uisearchdisplaycontroller-on-ios-7/
    [controller.searchContentsController hp_setNonSearchViewsHidden:YES
                                                           animated:YES];
    [UIView animateWithDuration:0.25f
                     animations:^{
                         controller.searchResultsTableView.alpha = 1;
                     }];
}

- (void)searchDisplayControllerWillEndSearch:(UISearchDisplayController *)controller
{
    if (HP_SYSTEM_MAJOR_VERSION() < 7) {
        return;
    }
    controller.searchBar.searchBarStyle = UISearchBarStyleMinimal;
    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPhone) {
        return;
    }
    [controller.searchContentsController hp_setNonSearchViewsHidden:NO
                                                           animated:YES];
    [UIView animateWithDuration:0.25f
                     animations:^{
                         controller.searchResultsTableView.alpha = 0;
                     }];
}

- (void)searchDisplayControllerDidEndSearch:(UISearchDisplayController *)controller
{
    if (controller.searchBar.superview == self.viewController.view) {
        return;
    }
    [self.viewController.view addSubview:controller.searchBar];
}

#pragma Search Bar delegate

- (void)searchBarBookmarkButtonClicked:(UISearchBar *)searchBar
{
    _peoplePicker = [[ABPeoplePickerNavigationController alloc] init];
    _peoplePicker.displayedProperties = @[@(kABPersonEmailProperty)];
    _peoplePicker.peoplePickerDelegate = self;

    [self.viewController presentViewController:_peoplePicker
                                      animated:YES
                                    completion:NULL];
}

#pragma People Picker delegate

- (void)dismissPeoplePicker:(void (^)(void))handler
{
    _peoplePicker.delegate = nil;
    _peoplePicker = nil;
    [self.viewController dismissViewControllerAnimated:YES
                                            completion:handler];
}

- (BOOL)peoplePickerNavigationController:(ABPeoplePickerNavigationController *)peoplePicker
      shouldContinueAfterSelectingPerson:(ABRecordRef)person
{
    NSString *email;
    CFArrayRef people = ABPersonCopyArrayOfAllLinkedPeople(person);
    for (NSUInteger i = 0; i < CFArrayGetCount(people); i++) {
        person = CFArrayGetValueAtIndex(people, i);
        ABMultiValueRef multi = ABRecordCopyValue(person, kABPersonEmailProperty);
        CFIndex count = ABMultiValueGetCount(multi);
        if (count == 1 && !email) {
            email = (__bridge_transfer NSString *)ABMultiValueCopyValueAtIndex(multi, 0);
        } else if (count) {
            email = nil;
            // break loop.
            i = CFArrayGetCount(people);
        }
        CFRelease(multi);
    }
    CFRelease(people);
    if (!email) {
        return YES;
    }

    NSString *name = (__bridge_transfer NSString *)ABRecordCopyCompositeName(person);
    if (!name.length) {
        name = email;
    }
    [self inviteResult:@{HPInvitationNameKey:name,
                         HPInvitationEmailKey:email}];
    return NO;
}

- (BOOL)peoplePickerNavigationController:(ABPeoplePickerNavigationController *)peoplePicker
      shouldContinueAfterSelectingPerson:(ABRecordRef)person
                                property:(ABPropertyID)property
                              identifier:(ABMultiValueIdentifier)identifier
{
    ABMultiValueRef multi = ABRecordCopyValue(person, property);
    CFIndex index = ABMultiValueGetIndexForIdentifier(multi, identifier);
    NSString *email = (__bridge_transfer NSString *)ABMultiValueCopyValueAtIndex(multi, index);
    CFRelease(multi);
    NSString *name = (__bridge_transfer NSString *)ABRecordCopyCompositeName(person);
    if (!name.length) {
        name = email;
    }
    [self inviteResult:@{HPInvitationNameKey:name,
                         HPInvitationEmailKey:email}];
    return NO;
}

- (void)peoplePickerNavigationControllerDidCancel:(ABPeoplePickerNavigationController *)peoplePicker
{
    [self dismissPeoplePicker:NULL];
}

#pragma mark Alert delegate

- (void)actionSheet:(UIActionSheet *)actionSheet
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
    if (buttonIndex == actionSheet.cancelButtonIndex) {
        return;
    }
    void (^handler)(HPPad *, NSError *) = ^(HPPad *pad, NSError *error) {
        if (error) {
            [[[UIAlertView alloc] initWithTitle:@"Invitation Error"
                                        message:error.localizedDescription
                                       delegate:nil
                              cancelButtonTitle:nil
                              otherButtonTitles:@"OK", nil] show];
        } else {
            void (^handler2)(void) = ^{
                self.viewController.searchDisplayController.searchBar.text = nil;
                [self.viewController.searchDisplayController setActive:NO
                                                              animated:YES];
            };
            if (_peoplePicker) {
                [self dismissPeoplePicker:handler2];
            } else {
                handler2();
            }
        }
    };
    if (_selectedResult[HPInvitationUserIDKey]) {
        [self.pad sendInvitationWithUserId:_selectedResult[HPInvitationUserIDKey]
                                completion:handler];
    } else if (_selectedResult[HPInvitationEmailKey]) {
        [self.pad sendInvitationWithEmail:_selectedResult[HPInvitationEmailKey]
                               completion:handler];
    } else if (_selectedResult[HPInvitationFacebookIDKey]) {
        [self.pad sendInvitationWithFacebookID:_selectedResult[HPInvitationFacebookIDKey]
                                          name:_selectedResult[HPInvitationNameKey]
                                    completion:handler];
    }
}

@end
