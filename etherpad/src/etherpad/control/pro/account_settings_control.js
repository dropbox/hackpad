import("s3");
import("email.sendEmail");
import("funhtml.*");
import("crypto");
import("stringutils");


import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.pro.domains");
import("etherpad.pad.pad_security");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pro.pro_settings");
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_utils");

import("etherpad.log");
import("etherpad.utils");
import("etherpad.helpers");
import("etherpad.utils.{requireParam,requireEmailParam,renderTemplateAsString,absoluteURL,renderHtml}");
import("etherpad.control.pro.account_control.renderTemplate")
import("etherpad.control.pro.account_control");

import("sqlbase.sqlcommon.inTransaction");
import("sqlbase.sqlobj");

jimport("org.mindrot.BCrypt");

function render_main_get() {
  absoluteURL("/");
  var account = getSessionProAccount();
  var apiTokenInfo = pro_tokens.getToken(account.id, pro_tokens.HACKPAD_API_TOKEN);
  var apiToken;
  if (apiTokenInfo) {
    apiToken = apiTokenInfo.token;
  } else {
    apiToken = stringutils.randomString(32);
    pro_tokens.setToken(account.id, pro_tokens.HACKPAD_API_TOKEN, apiToken);
  }

  var clientId = pro_accounts.getEncryptedUserId(account.id);

  var dropboxToken = pro_tokens.getDropboxKeyAndSecretForProUserId(account.id);
  var passwordHash = pro_accounts.getPasswordHash(account);

  renderTemplate('my-account', {
    account: account,
    hasCurrentPassword: !!passwordHash,
    changePass: getSession().passwordReset,
    apiToken: apiToken,
    clientId: clientId,
    orgName: domains.getRequestDomainRecord().orgName || "Hackpad",
    wantsFollowEmail: !pro_accounts.getAccountDoesNotWantFollowEmail(account),
    dropboxConnected: Boolean(dropboxToken),
    dropboxSyncEnabled: pro_accounts.isDropboxSyncEnabled(account),
  });
}


function render_update_info_get() {
  response.redirect('/ep/account/settings/');
}

function _redirOnError(m, clearQuery) {
  if (m) {
    getSession().accountFormError = m;
    saveSession();

    var dest = request.url;
    if (clearQuery) {
      dest = request.path;
    }
    response.redirect(dest);
  }
}
function render_delete_post() {
  utils.validateXSRFToken();

  pro_accounts.setDeleted(getSessionProAccount());
  pro_accounts.signOut();

  // Go to hackpad.com
  var superDomainUrl = utils.absoluteURL('/',{},"");

  response.redirect(superDomainUrl);
}

function render_update_info_post() {

  utils.validateXSRFToken();

  var fullName = requireParam('fullName');
  var email = requireEmailParam('email');
  var wantsFollowEmail = request.params.followemail;

  getSession().tempFormData.email = email;
  getSession().tempFormData.fullName = fullName;

  _redirOnError(pro_accounts.validateEmail(email));
  _redirOnError(pro_accounts.validateFullName(fullName));

  inTransaction(function () {
    if (pro_accounts.getSessionProAccount().email != email &&
      pro_accounts.getAccountByEmail(email)) {
      _redirOnError("There is already an account with that email address.");
    }

    pro_accounts.setFullName(getSessionProAccount(), fullName);

    var followsEmailNow = !pro_accounts.getAccountDoesNotWantFollowEmail(getSessionProAccount());
    // Don't always change this, as it overrides preference for all pads.
    if (wantsFollowEmail != followsEmailNow) {
      pro_settings.setAccountGetsFollowEmails(getSessionProAccount().id, wantsFollowEmail);
    }

    getSession().accountMessage = "Info updated.";

    var u = pro_accounts.getSessionProAccount();
    if (u.email != email) {
      var token = stringutils.randomString(10);
      var signup = {
        fullName: u.fullName,
        email: email,
        passwordHash: null,
        token: token,
        createdDate: new Date(),
      };
      sqlobj.insertOrUpdate('email_signup', signup);

      var subj = "hackpad: Please verify your email address"
      if (!domains.isPrimaryDomainRequest()) {
        subj += " on "+request.domain;
      }

      var body = renderTemplateAsString('pro/account/update-email-email.ejs', {
                                          account: u,
                                          validateUrl: absoluteURL('/ep/account/settings/validate-email-change', {
                                              'uid': u.id,
                                              'newEmail': email,
                                              'email': u.email,
                                              'token': token}),
                                          supportAddress: pro_utils.getSupportEmailFromAddr()
                                        });
      var fromAddr = pro_utils.getSupportEmailFromAddr();

      sendEmail(email, fromAddr, subj, {}, body);
      getSession().accountMessage = "Check "+email+" to verify your new email address.";
    }
  });

  saveSession();
  response.redirect('/ep/account/settings/');
}


function render_update_profile_photo_post() {

  var u = pro_accounts.getSessionProAccount();
  var upload = utils.getMultipartUpload();
  if (upload.length) {
    s3.put("hackpad-profile-photos", u.email, upload[0].file, true, upload[0].type);
  }

  pro_accounts.setAccountHasPhotoByEmail(u.id);

  return true;
}

function render_validate_email_change_get() {
  var accountId = requireParam('uid');
  var token = requireParam('token');
  var email = requireEmailParam('newEmail');

  if (!getSessionProAccount() || getSessionProAccount().id != accountId) {
    pro_accounts.signOut();
    account_control.setSigninNotice("Please sign in using your old email address.");
    response.redirect('/ep/account/sign-in?cont='+encodeURIComponent(request.url));
  }

  inTransaction(function () {
    var signup = sqlobj.selectSingle('email_signup', {email: email});
    if (signup && token && token == signup.token) {
      if (pro_accounts.getAccountByEmail(email)) {
        getSession().accountFormError = "There is already an account with that email address.";
      } else {
        pro_accounts.setEmail(getSessionProAccount(), email);
        getSession().accountMessage = "Your email has been updated.";
        sqlobj.deleteRows('email_signup', {email: email});
      }
    } else {
      getSession().accountMessage = "Your email could not be verified. You can try changing your email again.";
    }
  });

  saveSession();
  response.redirect('/ep/account/settings/');
}

function render_update_password_get() {
  response.redirect('/ep/account/settings/');
}

function _sendPasswordChangeConfirmation() {
  var subj = "hackpad: Your password has been updated"
  var body = renderTemplateAsString('pro/account/update-password-confirm-email.ejs', {
                                      account: getSessionProAccount() ,
                                      supportAddress: appjet.config.supportEmailAddress
                                    });
  var fromAddr = pro_utils.getSupportEmailFromAddr();

  sendEmail(getSessionProAccount().email, fromAddr, subj, null, body,"text/html; charset=utf-8");
}
function render_update_password_post() {

  utils.validateXSRFToken();

  var passwordCurrent = request.params.passwordCurrent;
  var password = request.params.password;
  var passwordConfirm = request.params.passwordConfirm;

  var account = getSessionProAccount();
  var passwordHash = pro_accounts.getPasswordHash(account);
  if ((!getSession().passwordReset) && passwordHash && BCrypt.checkpw(passwordCurrent, passwordHash) != true) { _redirOnError('Incorrect current password.'); }

  if (password != passwordConfirm) { _redirOnError('Passwords did not match.'); }

  _redirOnError(pro_accounts.validatePassword(password));

  _sendPasswordChangeConfirmation();

  pro_accounts.getAllAccountsWithEmail(account.email).forEach(function(acct) {
    pro_accounts.setPassword(acct, password);
  });
  pro_account_auto_signin.clearOtherAutoSigninCookies();

  delete getSession().passwordReset;

  if (request.params.cont) {
    var cont = pad_security.sanitizeContUrl(request.params.cont);
    response.redirect(cont);
  }
  getSession().accountMessage = "Password updated.";
  saveSession();

  response.redirect('/ep/account/settings');
}

// ordinarily you'd want XSRF protections via a verification step here,
// but this is pretty harmless
function render_unsub_whats_new_get() {
  if (request.params.email && !crypto.isValidSignedRequest(request.params, request.params.sig)) {
    utils.render401("Invalid Request.");
  }

  var email = request.params.email || getSessionProAccount().email;

  pro_accounts.getAllAccountsWithEmail(email).forEach(function(acct) {
    pro_accounts.setAccountDoesNotWantWhatsNew(acct.id);
  });
  renderHtml('pro/settings/whats_new_unsubscribed.ejs', {
    resubscribeUrl: utils.absoluteSignedURL('/ep/account/settings/sub_whats_new', {email:email})
  });
}

// ordinarily you'd want XSRF protections via a verification step here,
// but this is pretty harmless
function render_sub_whats_new_get() {
  if (request.params.email && !crypto.isValidSignedRequest(request.params, request.params.sig)) {
    utils.render401("Invalid Request.");
  }

  var email = request.params.email || getSessionProAccount().email;

  pro_accounts.getAllAccountsWithEmail(email).forEach(function(acct) {
    pro_accounts.setAccountWantsWhatsNew(acct.id);
  });

  var msg= DIV({style: "font-size: 16px; margin: 20px 20px; padding: 1em;"},
        P({style: "margin-bottom:20px"}, "Thanks!  You've been subscribed."));
  msg.push(A({href:'/'}, "Return to the homepage."));
  utils.renderNoticeString(msg);
  response.stop();
}



function render_unsub_new_pads_get() {
  if (request.params.accountId && !crypto.isValidSignedRequest(request.params, request.params.sig)) {
    utils.render401("Invalid Request.");
  }

  var acctId = pro_accounts.getUserIdByEncryptedId(request.params.accountId);
  pro_settings.setAccountDoesNotWantNewPadsDigest(acctId, true);

  utils.renderFramedHtml(helpers.modalDialog("Unsubscribe Confirmation",
    DIV(
      SPAN("You have been unsubscribed from the site activity digest.")
    ), false, "block"));
}

function render_sub_new_pads_get() {
  var accountId = getSessionProAccount().id;
  pro_settings.setAccountDoesNotWantNewPadsDigest(accountId, false);
  response.write("Yeah, ok");
}


function render_no_email_get() {
  var accountId = getSessionProAccount().id;
  var unsubCount = pro_settings.setAccountGetsFollowEmails(accountId, false);
  response.write("Unsubscribed from " + unsubCount + " pads.  Have set default to no email.");
  return true;
}

function render_ok_to_email_get() {
  var accountId = getSessionProAccount().id;
  pro_settings.setAccountGetsFollowEmails(accountId, true);
  response.write("Have set default to email.");
  return true;
}
