//
//  HPAddSpaceViewController.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPAddSpaceViewController.h"
#import "HPTextFieldCell.h"

static NSString * const HPTextFieldCellIdentifier = @"HPTextFieldCell";

@interface HPAddSpaceViewController () <UITextFieldDelegate>

@end

@implementation HPAddSpaceViewController

- (id)init
{
    self = [super initWithStyle:UITableViewStyleGrouped];
    if (self != nil) {
        ;
    }
    return self;
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    self.title = NSLocalizedString(@"Sign In", nil);

    UINib *cellNib = [UINib nibWithNibName:HPTextFieldCellIdentifier bundle:nil];
    [self.tableView registerNib:cellNib forCellReuseIdentifier:HPTextFieldCellIdentifier];

    UIBarButtonItem *doneItem = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone target:self action:@selector(doneAction:)];
    doneItem.enabled = NO;
    self.navigationItem.rightBarButtonItem = doneItem;

    if ([self.delegate addSpaceViewControllerCanCancel:self]) {
        UIBarButtonItem *cancelItem = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemCancel target:self action:@selector(cancelAction:)];
        self.navigationItem.leftBarButtonItem = cancelItem;
    }
}

#pragma mark - Actions

- (void)doneAction:(id)sender
{
    HPTextFieldCell *cell = (HPTextFieldCell *)[self.tableView cellForRowAtIndexPath:[NSIndexPath indexPathForRow:0 inSection:0]];
    NSString *name = cell.textField.text;
    [self.delegate addSpaceViewController:self didFinishWithSpaceName:name];
}

- (void)cancelAction:(id)sender
{
    [self.delegate addSpaceViewControllerDidCancel:self];
}

#pragma mark - Table view data source

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section
{
    return 1;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    HPTextFieldCell *cell = [tableView dequeueReusableCellWithIdentifier:HPTextFieldCellIdentifier forIndexPath:indexPath];
    cell.textField.placeholder = NSLocalizedString(@"your workspace", nil);
    cell.textField.keyboardType = UIKeyboardTypeURL;
    cell.textField.enablesReturnKeyAutomatically = YES;
    cell.textField.delegate = self;
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(textFieldTextDidChange:) name:UITextFieldTextDidChangeNotification object:cell.textField];
    [cell.textField becomeFirstResponder];
    return cell;
}

- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section
{
    return NSLocalizedString(@"Enter a Workspace name or address", nil);
}

#pragma mark - UITextFieldDelegate

- (BOOL)textFieldShouldReturn:(UITextField *)textField
{
    [self doneAction:nil];
    return YES;
}

#pragma mark - Notifications

- (void)textFieldTextDidChange:(NSNotification *)notification
{
    self.navigationItem.rightBarButtonItem.enabled = [notification.object text].length > 0;
}

@end
