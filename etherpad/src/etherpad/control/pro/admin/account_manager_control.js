/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import("dispatch.{Dispatcher}");
import("funhtml.*");
import("stringutils");
import("stringutils.*");
import("email");
import("email.sendEmail");
import("fastJSON");

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.utils");
import("etherpad.sessions.{getSession,saveSession}");

import("etherpad.control.pro.admin.pro_admin_control");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_invite");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");
import("etherpad.log");


function _err(m) {
  if (m) {
    getSession().accountManagerError = m;
    saveSession();
    response.redirect("/ep/admin/account-manager/");
  }
}

function _renderTopDiv(mid, htmlId) {
  var m = getSession()[mid];
  if (m) {
    delete getSession()[mid];
    saveSession();
    return DIV({id: htmlId}, m);
  } else {
    return '';
  }
}

function _errorDiv() { return _renderTopDiv('accountManagerError', 'error-message'); }
function _messageDiv() { return _renderTopDiv('accountManagerMessage', 'message'); }
function _warningDiv() { return _renderTopDiv('accountManagerWarning', 'warning'); }


function onRequest() {
  pro_accounts.requireAdminAccount();

  var disp = new Dispatcher();
  disp.addLocations([
    [new RegExp('/ep/admin/account-manager/delete-account/([0-9]+)'), render_delete_account_post],
    [new RegExp('/ep/admin/account-manager/account/([0-9]+)'), render_account_post],
  ]);

  if (disp.dispatch()) {
    return true;
  }

}

function render_main_get() {

  var accountList = pro_accounts.listNewestDomainAccounts(1000);
  var count = pro_accounts.countOfDomainAccounts();
  var accessiblePads = {};
  accountList.forEach(function(acct) {
    if (pro_accounts.getIsDomainGuest(acct)) {
      accessiblePads[acct.id] = pro_pad_db.listAccessiblePads([], 100, acct.id, true/*userIsGuest*/);
    } else {
      accessiblePads[acct.id] = [];
    }
  });

  if (startsWith(request.path, "/admin")) {
    renderHtml("admin/dynamic.ejs", {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Accounts',
      content: renderTemplateAsString('pro/admin/account-manager.ejs', {
        accountList: accountList,
        count: count,
        messageDiv: _messageDiv,
        warningDiv: _warningDiv,
        errorDiv: _errorDiv,
      })
    });
  } else {
    pro_admin_control.renderAdminPage("pro-account-manager", { accountList: accountList,
      accessiblePads: accessiblePads,
      count: count,
      messageDiv: _messageDiv,
      warningDiv: _warningDiv,
      errorDiv: _errorDiv,
      tempPass: stringutils.randomString(6).toUpperCase(),
      IS_DOMAIN_GUEST: pro_accounts.IS_DOMAIN_GUEST
    });
  }
}

function render_new_post() {

  utils.validateXSRFToken();

  if (request.params.cancel) {
    response.redirect('/ep/admin/account-manager/');
  }

  var tempPass = stringutils.randomString(10);
  var email = requireEmailParam();
  var fullName = request.params.fullName;
  var isAdmin = request.params.role == "admin";
  var isDomainGuest = request.params.role == "guest";

  _err(pro_accounts.validateEmail(email));
  _err(pro_accounts.validateFullName(fullName));
  _err(pro_accounts.validatePassword(tempPass));

  var existingAccount = pro_accounts.getAccountByEmail(email, null);
  if (existingAccount) {
    _err("There is already a account with that email address.");
  }

  pro_accounts.createNewAccount(null, fullName, email, tempPass, isAdmin, false, null /*fbid*/, isDomainGuest);
  var account = pro_accounts.getAccountByEmail(email, null);
  pro_accounts.setTempPassword(account, tempPass);
  sendWelcomeEmail(account, tempPass);

  getSession().accountManagerMessage = "Account "+fullName+" ("+email+") created successfully.";
  saveSession();

  response.redirect('/ep/admin/account-manager/');
}

function render_accept_join_request_get() { // token protected
  var token = request.params.token;

  var joinRequest = pro_invite.joinRequestForToken(token);
  if (!(joinRequest && (joinRequest.domainId == domains.getRequestDomainId()))) {
    getSession().accountManagerMessage = "Could not find a matching request to join.";
    saveSession();
    response.redirect('/ep/admin/account-manager/');
  }

  var existingAcct = pro_accounts.getAccountById(joinRequest.accountId);
  var account = pro_accounts.getAccountByEmail(existingAcct.email);
  if (account) {
    // ensure they're not a guest
    if (pro_accounts.getIsDomainGuest(account)) {
      pro_accounts.setIsDomainGuest(account, false);
      getSession().accountManagerMessage = account.fullName+" ("+account.email+") has been made a full member of your site.";
    } else {
      getSession().accountManagerMessage = account.fullName+" ("+account.email+") is already a full member of your site.";
    }
    response.redirect('/ep/admin/account-manager/');
  }

  var accountId = pro_accounts.createLinkedAccount(joinRequest.accountId, domains.getRequestDomainId(), false /*isAdmin*/, false /*isGuest*/);
  account = pro_accounts.getAccountById(accountId);

  getSession().accountManagerMessage = account.fullName+" ("+account.email+") added successfully.";
  saveSession();

  // send email to requesting user!
  sendWelcomeEmail(account);

  response.redirect('/ep/admin/account-manager/');
}


function sendWelcomeEmail(account, tempPass) {
  var domainRecord = domains.getDomainRecord(account.domainId);

  var subj = "Welcome to "+domainRecord.subDomain+"!";
  var toAddr = account.email;
  var fromAddr = pro_utils.getSupportEmailFromAddr();
  var host = domainRecord.subDomain+"."+appjet.config['etherpad.canonicalDomain'];

  var body = renderTemplateAsString('pro/account/account-welcome-email.ejs', {
    account: account,
    adminAccount: getSessionProAccount() && getSessionProAccount().id != account.id && getSessionProAccount(),
    signinLink: tempPass ? pro_accounts.getTempSigninUrl(account, tempPass, host) : utils.absoluteURL("/", {}, domainRecord.subDomain),
    toEmail: toAddr,
    siteName: pro_config.getConfig(account.domainId).siteName
  });
  try {
    email.sendAsyncEmail(toAddr, fromAddr, subj, {}, body);
  } catch (ex) {
    var d = DIV();
    d.push(P("Warning: unable to send welcome email."));
    getSession().accountManagerWarning = d;
    saveSession();
    log.logException(ex);
  }
}

function render_account_post(accountId) {
  utils.validateXSRFToken();

  if (request.params.cancel) {
    response.redirect('/ep/admin/account-manager/');
  }
  var newFullName = request.params.newFullName;
  /*var newEmail = request.params.newEmail;*/
  var newRole = request.params.newRole;

  //  _err(pro_accounts.validateEmail(newEmail));
  _err(pro_accounts.validateFullName(newFullName));

  if ((newRole != "admin") && (accountId == getSessionProAccount().id)) {
    _err("You cannot remove your own administrator privileges.");
  }

  var account = pro_accounts.getAccountById(accountId);
  if (!account) {
    response.write("Account not found.");
    return true;
  }

  //  pro_accounts.setEmail(account, newEmail);
  pro_accounts.setFullName(account, newFullName);
  pro_accounts.setIsAdmin(account, newRole == "admin");
  pro_accounts.setIsDomainGuest(account, newRole == "guest");

  getSession().accountManageMessage = "Info updated.";
  saveSession();

  response.redirect('/ep/admin/account-manager/');
}


function render_delete_account_post(accountId) {
  utils.validateXSRFToken();

  if (request.params.cancel) {
    response.redirect("/ep/admin/account-manager/");
  }

  if (accountId == getSessionProAccount().id) {
    getSession().accountManagerError = "You cannot delete your own account.";
    saveSession();
    response.redirect("/ep/admin/account-manager/");
  }

  var account = pro_accounts.getAccountById(accountId);
  if (!account) {
    response.write("Account not found.");
    return true;
  }

  pro_accounts.setDeleted(account);
  getSession().accountManagerMessage = "The account "+account.fullName+" <"+account.email+"> has been deleted.";
  saveSession();

  response.redirect("/ep/admin/account-manager/");
}



