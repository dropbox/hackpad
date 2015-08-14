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

import("cache_utils.syncedWithCache");
import("crypto");
import("dispatch.{Dispatcher,DirMatcher,forward}");
import("fastJSON");
import("funhtml.*");
import("email.sendEmail");
import("jsutils");
import("stringutils");
import("stringutils.*");
import("netutils.{urlGet,urlPost}");
import("oauth.OAuth");
import("etherpad.utils");
import("sync");

import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");

import("etherpad.helpers");
import("etherpad.helpers.modalDialog");
import("etherpad.utils.*");
import("etherpad.sessions.{getSession,saveSession,isAnEtherpadAdmin}");
import("etherpad.statistics.mixpanel");
import("etherpad.statistics.email_tracking");
import("etherpad.control.pro.account_settings_control");
import("etherpad.control.pro.access_request_control");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_invite");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_settings");
import("etherpad.pro.pro_oauth");
import("etherpad.pro.pro_oauth2")
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_padlist");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pad.pad_security");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.collab.collab_server");
import("etherpad.log");
import("etherpad.log.{logRequest,logException}");

import("etherpad.control.pro.pro_main_control.*");

jimport("org.mindrot.BCrypt");
jimport("com.mysql.jdbc.exceptions.jdbc4.MySQLIntegrityConstraintViolationException");

jimport("javax.crypto.Mac");
jimport("javax.crypto.spec.SecretKeySpec");
jimport("java.math.BigInteger");
jimport("org.apache.commons.lang.StringEscapeUtils.escapeHtml");


function onRequest() {
  if (!getSession().tempFormData) {
    getSession().tempFormData = {};
  }

  pro_accounts.requireAccount();

  var disp = new Dispatcher();
  disp.addLocations([
    [DirMatcher('/ep/account/settings/'), forward(account_settings_control)],
    [DirMatcher('/ep/account/guest/'), forward(access_request_control)],
  ]);

  return disp.dispatch();
}

//--------------------------------------------------------------------------------
// helpers
//--------------------------------------------------------------------------------

function setSigninNotice(m) {
  getSession().accountSigninNotice = m;
  saveSession();
}

function setSessionError(m) {
  getSession().accountFormError = m;
  saveSession();
}

function _topDiv(id, name) {
  var m = getSession()[name];
  if (m) {
    delete getSession()[name];
    saveSession();
    return DIV({id: id}, m);
  } else {
    return '';
  }
}

function _messageDiv() { return _topDiv('account-message', 'accountMessage'); }
function _errorDiv() { return _topDiv('account-error', 'accountFormError'); }
function _signinNoticeDiv() { return _topDiv('signin-notice', 'accountSigninNotice');}

function _renderTemplate(name, data) {
  data.messageDiv = _messageDiv;
  data.errorDiv = _errorDiv;
  data.signinNotice = _signinNoticeDiv;
  data.tempFormData = getSession().tempFormData;
  renderFramed('pro/account/'+name+'.ejs', data);
}

function renderTemplate(name, data) {
  return _renderTemplate(name, data);
}

function getValidCont() {
  if (request.params.cont){
    return pad_security.sanitizeContUrl(request.params.cont);
  } else {
    return '/';
  }
}

/**
 * Safe redirector for sanitizing client-side redirects
 *
 */
function render_safe_redirect_get() {
  response.redirect(getValidCont());
}

/* Sign in As
 *
 * Allows a user to sign using the same email address they're already using on
 * another subdomain.  Requires an active session on the other subdomain.
 */
function render_as_post() {
  var asAccountId = pro_accounts.getUserIdByEncryptedId(request.params.id);

  if (!asAccountId) {
    log.custom('accounts', 'Invalid account id: ' + request.params.id);
    setSigninNotice('Oops, you are no longer signed in with that email address.');
    response.redirect('/ep/account/sign-in');
    return true;
  }
  var asAccount = pro_accounts.getAccountById(asAccountId);
  var contParams = parseUrlParams(decodeURIComponent(request.params.cont));

  var otherSession;

  // If we're trying to sign in as an account that's no longer signed in,
  // stop
  var cookieAccts = pro_accounts.getCookieSignedInAccounts();
  var asAcctIsSignedInAccordingToCookie = false;
  cookieAccts.every(function (acct){
    if (acct.id == asAccountId) {
      asAcctIsSignedInAccordingToCookie = true;
      return false;
    }
    return true;
  });
  if (!asAcctIsSignedInAccordingToCookie) {
    log.custom('accounts', 'No longer signed in');
    setSigninNotice("Oops, you are no longer signed in with that email address.");
    response.redirect("/ep/account/sign-in");
    return true;
  }

  // Check for a valid matching signed in session
  var otherSession = pro_account_auto_signin.getSubdomainSession(asAccount.domainId);
  if (!(otherSession && otherSession.proAccount && otherSession.proAccount.id == asAccount.id)) {
    // Doesn't look like they're actually signed in there
    pro_accounts.updateCookieSignedInAcctsOnSignOut(asAccount.id);

    var here = request.url;
    redirectUrl = (request.scheme + "://" + domains.fqdnForDomainId(asAccount.domainId) + "/ep/account/sign-in?cont=" +
      encodeURIComponent(here));

    var redirects = request.params.cont ? ((request.params.cont.match(/cont/g)||[]).length) : 0;
    mixpanel.track("signInAsRedirect", {'redirects': redirects});

    response.redirect(redirectUrl);
    return true;
  }

  if (pro_accounts.maybeSignInBasedOnAccount(otherSession, true/*autoJoin*/)) {
    _redirectToPostSigninDestination();
  }

  // Request access on their behalf
  var orgName = domains.getRequestDomainRecord().orgName;
  setSigninNotice(SPAN(asAccount.email, " - is not a member of ", orgName,  ".", BR(), BR(), 'You can ', A({href: _requestToJoinUrl(asAccountId)}, 'request to join')));

  response.redirect("/ep/account/sign-in");
  return true;
}

function _requestToJoinUrl(asAccountId) {
  var queryDict = {};
  queryDict['uid'] = asAccountId;
  queryDict['t'] = (new Date()).getTime();
  queryDict['domainId'] = domains.getRequestDomainId();
  queryDict['sig'] =  crypto.signRequest(queryDict);
  return absoluteURL('/ep/invite/request-to-join', queryDict);
}

//--------------------------------------------------------------------------------
// signin/signout
//--------------------------------------------------------------------------------
// /sign-in
//
function render_sign_in_get() {
  var cont = getValidCont();

  var contParams = parseUrlParams(decodeURIComponent(cont));
  var asNewAccount = request.params.new;

  // deal with password reset
  if (request.params.euid && request.params.tp) {
    var accountId = pro_accounts.getUserIdByEncryptedId(request.params.euid);
    var passwordResetAccount = pro_accounts.getAccountById(accountId);

    var content = DIV(
        SPAN("Reset password and sign in as ", passwordResetAccount.email, "?"),
        FORM({action: '/ep/account/temp-signin', method:'POST'},
          INPUT({name: 'xsrf', type:'hidden', value:utils.currentXSRFToken()}),
          INPUT({name: 'cont', type:'hidden', value:cont}),
          INPUT({name: 'euid', type:'hidden', value:request.params.euid}),
          INPUT({name: 'tp', type:'hidden', value:request.params.tp}),
          BR(),
          BUTTON({className:'hp-ui-button hp-ui-button-primary', name:'deny', value:'deny'}, "Cancel"),
          BUTTON({className:'hp-ui-button hp-ui-button-primary', name:'allow', value:'allow', type: "submit"}, "Continue")));

      utils.renderFramedHtml(modalDialog("Reset Password", content, false, "block"));
      return true;

  }

  // Note: must check isAccountSignedIn before calling checkAutoSignin()!
  if (pro_accounts.isAccountSignedIn()) {
    _redirectToPostSigninDestination();
  }

  // Never universal auto-sign-in on the sign in page, so that the user can pick an account
  pro_account_auto_signin.checkAutoSignin(cont, true/*skipUniversal*/);

  var domainRecord = domains.getRequestDomainRecord();

  helpers.addClientVars({ facebookClientId: appjet.config.facebookClientId });
  var data = {cont:cont,
      email:contParams.email?contParams.email:"",
      inviteToken: contParams.token || request.params.inviteToken,
      googleSignInUrl: google_account.googleOAuth2URLForLogin(),
      isSubDomain: !domains.isPrimaryDomainRequest(),
      asNewAccount: asNewAccount
    };

  helpers.addBodyClass("mini-header");
  _renderTemplate('access', data);

}


function _handleSignupRequest(email, password, fullName, cont) {
  cont = pad_security.sanitizeContUrl(cont); // do this again, just to be extra careful

  var signup = sqlobj.selectSingle('email_signup', {email: email});
  if (signup) {
    // email still needs verification
    var data = {email:email};
    var error = "Please click on the link in the verification email we've sent you.";
    var html = renderTemplateAsString("pro/account/resend_verification_email_popup.ejs", data);
    renderJSON({success:false, html:html, error:error});

  } else {
    var token = stringutils.randomString(20);

    var signup = {
      fullName: fullName,
      email: email,
      passwordHash: password != null ? pro_accounts.computePasswordHash(password) : null,
      token: token,
      createdDate: new Date(),
    };

    var signupExists = false;
    try {
      sqlobj.insert('email_signup', signup);
      getSession().emailVerificationToken = token;
      _sendEmailVerification(email, token, cont, fullName);
    } catch (e) {
      if (e.javaException instanceof MySQLIntegrityConstraintViolationException) {
        signupExists = true;
      } else {
        throw e;
      }
    }

    if (signupExists) {
      var data = {email:email};
      var error = "Please click on the link in the verification email we've sent you.";
      var html = renderTemplateAsString("pro/account/resend_verification_email_popup.ejs", data);
      renderJSON({success:false, html:html});
    } else {
      // Succesful signup
      var error = "We've sent you a verification email.  Click on the link in that email to activate your account.";
      renderJSON({success:false, error:error, html:
        modalDialog("Welcome to hackpad!",error, true)});
    }
  }
}

function normalize_email(email) {
  return trim(email).toLowerCase();
}

function _handleError(error) {
  if (error) {
    log.custom('signin', error);
    var obj = {success:false, error:error};
    renderJSON(obj);
    response.stop();
  }
}

// This doesn't account for the even more complicated case of
// "We found an account with this email, but they have never logged in and don't have a password"
// found below in render_signin_post.  If that happens we send a
// 'moreInfo' flag back to the frontend to try signing up instead.
function render_login_or_signup_post() {
  var email = requireEmailParam();

  var u = pro_accounts.getAccountByEmail(email);
  if (!u) {
    u = pro_accounts.maybeAutocreateUser(email);
    if (!u) {
      var signup = sqlobj.selectSingle('email_signup', {email: email});
      if (!signup) {
        renderJSON({signup:true});
        return true;
      }
    }
  }

  renderJSON({signup:false});
  return true;
}

MAX_LOGIN_ATTEMPTS_PER_DAY = 15;
function _getExpiringLogginAttemptMap() {
  var ONE_DAY = 1000*60*60*24;
  sync.callsyncIfTrue(appjet.cache,
    function() { return (!appjet.cache.loginAttempts); },
    function() { appjet.cache.loginAttempts = new net.appjet.common.util.ExpiringMapping(ONE_DAY); });
  return appjet.cache.loginAttempts;
}

function resetLoginAttempts(email) {
  // reset the login attempt count
  _getExpiringLogginAttemptMap().remove(email);
}

// password reset endpoint
function render_temp_signin_post() {
  var euid = requireParam('euid');
  var tp = requireParam('tp');
  var accountId = pro_accounts.getUserIdByEncryptedId(request.params.euid);

  // Let the user cancel
  var allow = request.params.allow == "allow";
  if (!allow) {
    response.redirect('/');
    return;
  }

  if (getSessionProAccount()) {
    pro_accounts.signOut();
  }

  var m = pro_accounts.authenticateTempSignIn(Number(accountId), request.params.tp);
  if (m) {
    getSession().accountFormError = m;
  }
  if (!pro_accounts.isAccountSignedIn()) {
    response.redirect('/ep/account/sign-in');
  }

  _redirectToPostSigninDestination();
}

function render_signin_post() {
  var email = requireEmailParam();
  var password = requireParam('password');
  var cont = getValidCont();

  // If this email address has had over MAX_LOGIN_ATTEMPTS_PER_DAY
  // We refuse to log them in and tell them to contact support
  //
  // Note: ExpiringMapping doesn't checkExpiry before touching the
  // entry on get, so in a test environment, the count will never expire if
  // you keep doing get() and never do a single put()
  var loginAttempts = _getExpiringLogginAttemptMap().get(email) || 0;
  if (loginAttempts > MAX_LOGIN_ATTEMPTS_PER_DAY) {
    _handleError("Too many login attempts.  Please contact " + helpers.supportEmailAddress() + ".");
  }
  _getExpiringLogginAttemptMap().put(email, loginAttempts + 1);

  var u = pro_accounts.getAccountByEmail(email);

  if (!u) {
    u = pro_accounts.maybeAutocreateUser(email);

    if (!u) {
      // is there a signup?
      var signup = sqlobj.selectSingle('email_signup', {email: email});
      if (signup) {
        // we don't track domains for signups, so it's possible we're on a different domain
        // but if there's an unconfirmed email reg for any domain, we might as well confirm it
        // and go from there
        mixpanel.track("signInFail", {'reason': 'unverified email'});
        log.custom('accounts', "Sign in failed due to unverified email: " + email);

        // email still needs verification
        var data = {email:email};
        var html = renderTemplateAsString("pro/account/resend_verification_email_popup.ejs", data);
        renderJSON({success:false, html:html});
      } else {

        var mainSiteAccount = pro_accounts.ensureMainSiteAccount(email);
        if (mainSiteAccount) {
          pro_invite.notifyAdminsOfDomainJoinRequest(mainSiteAccount.id);

          renderJSON({success:false, html:
            modalDialog("Access Requested", "We have sent your request to join " + domains.getRequestDomainRecord().orgName + ". We will let you know as soon as you have been added." , true)});


        } else {
          mixpanel.track("signInFail", {'reason': 'no account found'});
          log.custom('accounts', "Sign in failed due to account not found for email: " + email);
          _handleError("Email or password incorrect.  Please try again.");
        }
      }
      return true;
    }
  } // if (!u)

  // do we only have an invite here?
  // (this won't happen if we auto-create the acct above)
  if (u && !u.lastLoginDate) {
    u = inTransaction(function() {
      var updatedUser = null;
      // if this user has an account that they've used to login elsewhere
      // on hackpad, let's link them
      var mainSiteAccount = pro_accounts.ensureMainSiteAccount(u.email);
      if (mainSiteAccount && !domains.isPrimaryDomainRequest()) {
        log.custom('accounts', 'Upgrading invite to account (2) for: ' + email);
        pro_accounts.upgradeInviteToAccountBasedOnAccount(u, mainSiteAccount);
        // mark us as linked to the mainsite account
        pro_accounts.setIsLinkedAccount(u.id);
        // reload
        updatedUser = pro_accounts.getAccountById(u.id);
      }
      return updatedUser;
    }) || u;
  }

  // is this an existing regular email/password account
  // XXX: check that underlying account has password
  if (u.passwordHash || pro_accounts.isLinkedAccount(u) && pro_accounts.getAccountByEmail(u.email, 1).passwordHash) {
    // we're logging in
    _handleError(pro_accounts.authenticateSignIn(email, password));
    pro_accounts.updateCookieSignedInAcctsOnSignIn();

    pro_account_auto_signin.setAutoSigninCookie(request.params.rememberMe);

    // reset the login attempt count
    resetLoginAttempts(email);

    renderJSON({success:true, cont:cont});
  } else {

    var backingAccount = u;
    if (pro_accounts.isLinkedAccount(u)) {
      backingAccount = pro_accounts.getAccountByEmail(u.email, 1);
    }
    if (backingAccount.fbid) {
      // if this account is fb-connected tell em to use that
      renderJSON({success:false, error:"Oops!  You created this account with Facebook, so please sign in with Facebook.\n\nIf you'd like to switch to email sign-in, click on 'Forgot password?' and reset your password."});
      mixpanel.track("signInFail", {'reason': 'fbAccount'});
    } else if (backingAccount.lastLoginDate) {
      renderJSON({success:false, error:"Oops!  You created this account with Google, so please sign in with Google.\n\nIf you'd like to switch to email sign-in, click on 'Forgot password?' and reset your password."});
      mixpanel.track("signInFail", {'reason': 'googAccount'});
    } else {
      // Maybe they haven't confirmed their email?
      var signup = sqlobj.selectSingle('email_signup', {email: email});
      if (signup) {
        mixpanel.track("signInFail", {'reason': 'unverified email'});

        // email still needs verification
        var data = {email:email};
        var html = renderTemplateAsString("pro/account/resend_verification_email_popup.ejs", data);
        renderJSON({success:false, html:html});
      } else {

        mixpanel.track("signInFail", {'reason': "invited hasn't signed up"});
        // We found an account with this email, but they have never logged in and don't have a password
        // We need to tell them to register.
        renderJSON({success:false, error:"Oops!  It doesn't look like you have an account yet.  Go ahead and create one - we'd love to have you!", moreInfo: true});
      }
    }
  }

  return true;
}


function render_signup_post() {
  var email = requireEmailParam();
  var password = requireParam('password');
  var name = requireParam('name');
  var inviteToken = request.params.inviteToken;
  var cont = getValidCont();
  var error;

  _handleError(pro_accounts.validateEmail(email));
  _handleError(pro_accounts.validatePassword(password));

  var u = pro_accounts.getAccountByEmail(email);

  if (!u) {
    // let them register to the mainsite, then we'll bring them back here
    return _handleSignupRequest(email, password, name, cont);
  }

  if (u && !u.lastLoginDate) {
    // someone has been invited by email (and is trying to login for the first time
    // since the email addresses match, if they have the invite token, we'll consider
    // the email verified.
    if (inviteToken && pad_security.isInviteTokenValidForUserId(inviteToken, u.id) && password) {
      // to be precise:  we've looked up an account by email and the invite token being
      // presented to us is the same as one of the tokens which were used to invite this
      // user to some pad (we should expire those guys).

      // this can be misused in the following way:  let's say user a@domain.com was invited to a pad
      // let's say they forward the email to a friend, saying "look at this"
      // let's say the friend clicks on the link to the pad and enters some name, a@domain.com, &a password
      // they will now have access to everything shared with a@domain.com and will have their password.
      // todo: fix it.
      var uid = pro_accounts.upgradeSignupToAccount(email, name, pro_accounts.computePasswordHash(password));
      // if we have a uid, go ahead and sign-in the user
      u = pro_accounts.getAccountById(uid);
      if (!u) { throw Error("Failed to create pro account"); }
      pro_accounts.signInSession(u);
      pro_accounts.updateCookieSignedInAcctsOnSignIn();
      log.custom('accounts', 'Upgrading pad invite to account for: '+email);
      renderJSON({success:true, cont:cont});
    } else {
      // new signup
      return _handleSignupRequest(email, password, name, cont);
    }
  } else {
    //
    error = "You already have a Hackpad account.  Go ahead and sign in!";
    renderJSON({success:false, error:error, reset: true});

  }

  return true;
}


function _redirectToPostSigninDestination() {
  response.redirect(getValidCont());
}


function _updateIOSDeviceToken() {
  if (!request.isPost) {
    return;
  }
  if (!request.params.iosDeviceToken || !request.params.iosAppId) {
    return;
  }
  if (!pro_tokens.addIOSDeviceToken(getSessionProAccount(),
                                    request.params.iosDeviceToken,
                                    request.params.iosAppId)) {
    log.info('Invalid app ID: ' + request.params.iosAppId);
  }
}

function render_api_key_get () {
  if (!pro_accounts.getSessionProAccount()) {
    renderJSONError(401, "User must sign in.");
  }
  var apiTokenInfo = pro_tokens.getToken(getSessionProAccount().id, pro_tokens.HACKPAD_API_TOKEN);
  var apiToken;
  if (apiTokenInfo) {
    apiToken = apiTokenInfo.token;
  } else {
    apiToken = stringutils.randomString(32);
    pro_tokens.setToken(getSessionProAccount().id, pro_tokens.HACKPAD_API_TOKEN, apiToken);
  }

  _updateIOSDeviceToken();

  var clientId = pro_accounts.getEncryptedUserId(getSessionProAccount().id);
  renderJSON({ success: true, key: clientId, secret: apiToken });
}


function render_session_sign_in_post() {
  var clientId = pro_oauth.clientIdFromSignature();
  if (!clientId) {
    renderJSONError(401, "Invalid signature");
  }
  var userId = pro_accounts.getUserIdByEncryptedId(clientId);
  if (getSessionProAccount() && getSessionProAccount().id != userId) {
    // Maybe this should be an error?
    pro_accounts.signOut();
  }
  if (!getSessionProAccount()) {
    var u = pro_accounts.getAccountById(userId);
    if (!u) {
      renderJSONError(401, "Invalid account");
    }
    pro_accounts.signInSession(u, true/*skipLastLoginUpdate*/);
    pro_accounts.updateCookieSignedInAcctsOnSignIn();
    saveSession();
  }

  _updateIOSDeviceToken();

  if (request.params.cont) {
    var cont = pad_security.sanitizeContUrl(request.params.cont);
    response.redirect(cont);
  }
  return renderJSON({ success: true });
}

function render_sign_out_get() {

  // Sign out locally
  var wasAlreadySignedOut = true;
  if (getSessionProAccount()) {
    wasAlreadySignedOut = false;
    if (request.params.iosDeviceToken) {
      pro_tokens.removeIOSDeviceTokenForUser(getSessionProAccount().id,
                                             request.params.iosDeviceToken);
    }
    pro_accounts.signOut();
  }

  pro_account_auto_signin.resetAutoSignInState();

  var cont = getValidCont();
  // If we're switching users, take the user to the login page
  if (request.params['switch']) {
    response.redirect('/ep/account/sign-in?cont=' + encodeURIComponent(cont) + "&switch=1");
  }

  // See what other accounts we need to log out of
  var accts = pro_accounts.getCookieSignedInAccounts();

  // todo clean up cookie
  // Filter out deleted domains
  var domainRecords = domains.getDomainRecordsForIds(accts.map(function(a){return a.domainId;}));
  var domainRecordsById = jsutils.dictByProperty(domainRecords, "id");
  accts = accts.filter(function(acct){
    return domainRecordsById[acct.domainId] &&
        domainRecordsById[acct.domainId].isDeleted == false;
  });

  // Find the next one to sign out of (ordered by increasing domainId)
  var nextAcctToSignOut;
  if (accts.length) {
    accts = jsutils.sortBy(accts, "domainId");
    nextAcctToSignOut = accts[0]; // fallback & wraparound
    for (var i=0; i<accts.length; i++){
      // mark the current domain as signed out
      // this should have happened above in "sign out locally",
      // but if the cookie is somehow out of sync - we clean it up here
      if (accts[i].domainId == domains.getRequestDomainId()) {
        pro_accounts.updateCookieSignedInAcctsOnSignOut(accts[i].id);
      }
      if (accts[i].domainId > domains.getRequestDomainId()) {
        var nextAcctToSignOut = accts[i];
        break;
      }
    }
  }

  var origin = request.params.origin || domains.getRequestDomainRecord().subDomain;
  var redirectUrl;
  if (nextAcctToSignOut && nextAcctToSignOut.domainId != domains.getRequestDomainId()) {
    redirectUrl = request.scheme + "://" + domains.fqdnForDomainId(nextAcctToSignOut.domainId) + "/ep/account/sign-out?origin=" + origin;
  } else {
    // The cookie was out of sync with reality
    // TODO (remove this check i don't think it's needed anymore)
    if (nextAcctToSignOut && wasAlreadySignedOut) {
      pro_accounts.updateCookieSignedInAcctsOnSignOut(nextAcctToSignOut.id);
    }
    // We're done signing out!
    pro_accounts.setCookieSignedInAccts([]);
    var originId = domains.getDomainRecordFromSubdomain(origin).id;
    redirectUrl = request.scheme + "://" + domains.fqdnForDomainId(originId) + "/";
  }
  response.redirect(redirectUrl);
}

function _sendEmailVerification(email, token, cont, fullName) {
  cont = getValidCont();

  var eid = email_tracking.trackEmailSent(email, email_tracking.EMAIL_VERIFICATION, 0);

  var validationUrl = utils.absoluteURL('/ep/account/validate-email',
      {email: email, token: token, cont: cont, eid: eid});

  var subj = "Welcome to Hackpad! Verify your email to get started";
  utils.sendHtmlTemplateEmail(email, subj, 'email/welcome.ejs', {
    name: fullName,
    validationUrl: validationUrl,
    logoURL: utils.absoluteURL('/static/img/email-logo.png', {eid: eid})
  });
}


function render_resend_email_verification_both() {
  var email = normalize_email(request.params.email);

  var signup = sqlobj.selectSingle('email_signup', {email:email});
  getSession().emailVerificationToken = signup.token;
  saveSession();
  _sendEmailVerification(email, signup.token, null /*cont*/, signup.fullName);
  var text = "We've re-sent your verification email.  Click on the link in that email to activate your account.";
  renderJSON({success:true, text:text, html:
    modalDialog("Done!",text, true)});
}


/* User just clicked the email verification link in their inbox. */
function render_validate_email_both() {    // token
  var token = request.params.token;
  var cont = getValidCont();
  var email = normalize_email(request.params.email);
  var password = request.params.password; // this is only set on a repost if we have to prompt

  if (request.params.eid) {
    email_tracking.trackEmailClick(request.params.eid);
  }

  function _createAccountAndSignIn() {
    // clean up signup row
    sqlobj.deleteRows('email_signup', {email: email});

    // they're using the same browser and everything matches; we can go ahead
     var uid = pro_accounts.upgradeSignupToAccount(signup['email'], signup['fullName'], signup['passwordHash']);
     u = pro_accounts.getAccountById(uid);
     if (!u) { throw Error("Failed to create pro account"); }

     pro_accounts.signInSession(u);
     pro_accounts.updateCookieSignedInAcctsOnSignIn();
  }

  var u = pro_accounts.getAccountByEmail(email);
  if (!u) {
    if (!pro_accounts.allowRegistration(email)) {
      response.redirect(utils.absoluteURL('/ep/account/validate-email', {
        email:email, token:request.params.token, cont: utils.absoluteURL('/ep/account/sign-in', {cont:cont})
      }, ""/*primary domain*/));
    }
  }

  var signup = sqlobj.selectSingle('email_signup', {email: email});
  if (!signup) {
    response.redirect('/');
  }
  var sessionEmailToken = getSession().emailVerificationToken;
  if (sessionEmailToken && sessionEmailToken == token && signup.token == token) {
    _createAccountAndSignIn();
    _redirectToPostSigninDestination();
  } else if (password && (token == signup.token) && request.method == "POST") {
    var loginAttempts = _getExpiringLogginAttemptMap().get(email) || 0;
    if (loginAttempts > MAX_LOGIN_ATTEMPTS_PER_DAY) {
      _handleError("Too many login attempts.  Please contact support@hackpad.com");
    }
    _getExpiringLogginAttemptMap().put(email, loginAttempts + 1);

    if (BCrypt.checkpw(password, signup.passwordHash)){
      resetLoginAttempts(email);
      _createAccountAndSignIn();
      _redirectToPostSigninDestination();
    } else {
      // we need to get the user to enter their password before we can verify the email
      renderHtml('pro/account/verify_email_enter_password.ejs', {
        email: email,
        token: token,
        cont: cont
      });
    }
  } else {
    // we need to get the user to enter their password before we can verify the email
    renderHtml('pro/account/verify_email_enter_password.ejs', {
      email: email,
      token: token,
      cont: cont
    });
  }

}


function _exchangeFacebookExchangeTokenForAccessToken(exchangeToken) {
  var args = {client_id: appjet.config.facebookClientId,
      client_secret: appjet.config.facebookClientSecret,
      grant_type:"fb_exchange_token",
      fb_exchange_token:exchangeToken};
  var exchangeResult = urlGet("https://graph.facebook.com/oauth/access_token", args);
  var exchangeResultValues = {};
  exchangeResult.content.split("&").map(function(kv) {
    var keyValue = kv.split("=");
    exchangeResultValues[keyValue[0]] = keyValue[1];
  });
  var accessToken = exchangeResultValues['access_token'];
  var expirationSeconds =  exchangeResultValues['expires'];
  var expirationDate = new Date(+(new Date()) + (expirationSeconds * 1000));

  return {accessToken: accessToken, expirationDate: expirationDate};
}

function render_connect_fb_session_get() {
  //check the UA to make sure this is safe to do and avoid breaking the app
  if (request.isHackpadApp) {
    return render_connect_fb_session_post();
  }
}

function render_connect_fb_session_post() {
  var accessToken = requireParam("access_token");

  // quietly eat attempts to connect with fb in the background on subdomains
  if (!domains.supportsFacebookSignin()) {
    return true;
  }

  var existingSignedInAccount = getSessionProAccount();
  var me = pro_facebook.getUserInfo(null, accessToken);

  if (me.length === 0) {
    log.logException("Facebook gave us a bad access token: " +accessToken);
    return true;
  }
  // ignore the token if the fb user has changed & doesn't match our user
  if (existingSignedInAccount && existingSignedInAccount.fbid != me.id) {
    return true;
  }
  if (!me.email) {
    renderJSON({success:false, error:"error", html:
          modalDialog("Facebook Sign-in Failed ", "Please sign in using another method.", true)});
    return true;
  }

  log.info("Facebook User Info: " + fastJSON.stringify(me));
  me.email = me.email.toLowerCase();

  // exchange for longer term token
  var tokenInfo = _exchangeFacebookExchangeTokenForAccessToken(accessToken);

  getSession().facebookInfo = {user: me, accessToken: tokenInfo.accessToken};

  var u = pro_facebook.getAccountByFacebookId(me.id);
  var cont = getValidCont();

  if (!u) {
    // There is no connected facebook user with this facebook user id
    u = pro_accounts.getAccountByEmail(me.email);
    if (u) {
      // User has email account but is logging in for the first time via facebook
      u.fbid = me.id;
      u.fullName = me.name;
    }
  }

  if (u) {
    // if needed, add the user's new fb email addy to the list of email addys
    if (u.email != me.email) {
      // TODO: we only do it if the email wasn't already set
      // Invited user with virtual email address has joined, or user changed primary email.
      if (u.email.match(RegExp("^\\d+@virtual.facebook.com$"))) {
        u.email = me.email;
      }
    }
  } else {
    if (!pro_accounts.allowRegistration(me.email)) {

      // let's make them a mainsite account so we can refer to them
      var acct = pro_accounts.ensureMainSiteAccount(me.email);
      if (!acct) {
        var acctForFbId = pro_facebook.getAccountByFacebookId(me.id, domains.getPrimaryDomainId());
        if (acctForFbId) {
          log.warn("This should never happen.");
          uid = acctForFbId.id;
        } else {
          uid = pro_accounts.createNewAccount(domains.getPrimaryDomainId(), me.name, me.email, null/*password*/, false/*isAdmin*/, true/*skipValidation*/, me.id/*fbid*/);
        }
      } else {
        uid = acct.id;
      }

      setSigninNotice(SPAN(me.email, " - is not a member of ", domains.getRequestDomainRecord().orgName, ".", BR(),BR(), A({href:  _requestToJoinUrl(uid)},  "Request to join"), "."));

      renderJSON({"success":true, cont:cont});
      return true;
    }

    // hopefully the user really does mean to create a new account?
    var uid = pro_accounts.createNewAccount(null, me.name, me.email, null, false, true, me.id);
    u = pro_accounts.getAccountById(uid);
    if (!u) { throw Error("Failed to create pro account"); }

    // clear new user's friends' friends_who_use and friends cache
    pro_facebook.getFacebookFriendsWhoUseApp(me.id, accessToken).forEach(function(friendId) {
      pro_facebook.clearFriendCache(friendId);
    });
  }

  pro_tokens.setFacebookTokenForProUserId (u.id, tokenInfo.accessToken, tokenInfo.expirationDate);
  // This writes the user back to the database
  pro_accounts.signInSession(u);
  pro_accounts.updateCookieSignedInAcctsOnSignIn();

  renderJSON({"success":true, cont:(!existingSignedInAccount) && cont});

  pro_account_auto_signin.setFacebookAutoSigninCookie(true);
  pro_account_auto_signin.setAutoSigninCookie(true);

  return true;
}

// Redirects to Google for oAuth2, will use current URL (or valid cont param as destination)
// URL is fixed to avoid breaking the iOS app
function render_google_sign_in_get() {
  response.redirect(google_account.googleOAuth2URLForLogin());
}

// Google oAuth2 callback
// URL is fixed to avoid breaking the iOS app
function render_openid_get() {
  return google_account.handleLoginCallback();
}

 // Once Google oAuth2 flow is completed, we proceed here
function completeGoogleSignIn(email, fullName, tryAgainUrl) {
  // Google returns mixed case emails
  email = email.toLowerCase();

  var u = pro_accounts.getAccountByEmail(email);

  // There is not currently an account for this user in this domain
  if (!u) {
    // We'll create one if we're allowed to
    if (pro_accounts.allowRegistration(email, request.params['inviteToken'])) {
      var domainId = domains.getRequestDomainId();
      var uid = pro_accounts.createNewAccount(domainId, fullName, email,
        null/*password*/, false/*isAdmin*/, true/*skipValidation*/, null/*fbid*/);
      u = pro_accounts.getAccountById(uid);
      if (!u) { throw Error("Failed to create account"); }

    // Failing that - tell them we can't find an account for them and offer
    // that they can sign in with a different account
    } else {
      var reAuthURL = google_account.googleOAuth2URLForLogin();

      // Let's make them a mainsite account so we can refer to them
      var acct = pro_accounts.ensureMainSiteAccount(email);
      if (!acct) {
        var u = pro_accounts.getAccountByEmail(email, domains.getPrimaryDomainId());
        if (u && !u.lastLoginDate) {
          log.warn("This should never happen.");
          uid = u.id;
        } else {
          uid = pro_accounts.createNewAccount(domains.getPrimaryDomainId(), fullName,
              email, null/*password*/, false/*isAdmin*/, true/*skipValidation*/, null/*fbid*/);
        }
      } else {
        uid = acct.id;
      }

      setSigninNotice(
        SPAN(
          B(email), " - is not a member of ", domains.getRequestDomainRecord().orgName, ".", BR(), BR(),
          A({href:reAuthURL}, "Sign in with another google account"), BR(), BR(),
          "Or ", A({href:  _requestToJoinUrl(uid)}, "request to join")));

      response.redirect(tryAgainUrl);
    }

  } else if (!u.lastLoginDate) {
    // there is an account for them and this is the first time they're logging in!
    var uid = pro_accounts.upgradeSignupToAccount(email, fullName, null);
    u = pro_accounts.getAccountById(uid);
    if (!u) { throw Error("Failed to upgrade pro account"); }
  }

  pro_accounts.signInSession(u);
  pro_accounts.updateCookieSignedInAcctsOnSignIn();

  pro_account_auto_signin.setAutoSigninCookie(true);
  pro_account_auto_signin.setGoogleAutoSigninCookie(true);

  return u;
}

/**
 * For the native OSX app
 */
function render_auth_token_get () {
  if (!pro_accounts.getSessionProAccount() || isAnEtherpadAdmin()) {
    return;
  }
  response.redirect("hackpad://auth/" + pro_oauth.generateToken());
}

/**
 * Generate an OAuth2 token for the user to use with the API
 */
function render_oauth_authorize_get() {
  var clientId = request.params.client_id;

  var client = pro_oauth2.clientForClientId(clientId);
  if (!client) {
    return render400('No client id speicified');
  }

  // Auto approved apps
  if (client && client.autoApprove) {
    var redirectDestination = pro_oauth2.generateAuthorizationRedirectUri(
      clientId,
      request.params.redirect_uri, /*user specified*/
      "code", /*responseType*/
      "", /*accessType*/
      "", /*scope*/
      request.params.state || "");
    if (redirectDestination) {
      response.redirect(redirectDestination);
    } else {
      return render400('Invalid request');
    }
  }

  // Render approval dialog
  var clientAppName = client.clientName;
  var workspaceName = domains.getRequestDomainRecord().subDomain;

  var content = DIV(
      SPAN("Allow ", clientAppName, " access to all the pads in ", workspaceName, "?"),
      FORM({action: '/ep/account/oauth-authorize', method:'POST'},
        INPUT({name: 'xsrf', type:'hidden', value:utils.currentXSRFToken()}),
        INPUT({name: 'redirectUri', type:'hidden', value:request.params.redirect_uri}),
        INPUT({name: 'clientId', type:'hidden', value:clientId}),
        BR(),
        BUTTON({className:'hp-ui-button hp-ui-button-primary', name:'deny', value:'deny'}, "Deny"),
        BUTTON({className:'hp-ui-button hp-ui-button-primary', name:'allow', value:'allow', type: "submit"}, "Allow")));

  utils.renderFramedHtml(modalDialog("Authorize External App", content, false, "block"));
}

/**
 * Token authorization step of oAuth2 flow
 */
function render_oauth_authorize_post() {
  if (request.params.allow != 'allow') {
    return false;
  }

  var redirectDestination = pro_oauth2.generateAuthorizationRedirectUri(
      request.params.clientId,
      request.params.redirectUri,
      "code", /*responseType*/
      "", /*accessType*/
      "", /*scope*/
      request.params.state || "");

  if (redirectDestination) {
    response.redirect(redirectDestination);
  } else {
    return render400('Invalid request');
  }
}

/**
 * Access code to token step of oAuth2 flow
 */
function render_oauth_token_post() {
  var authorizationCode = request.params.code;
  var clientId = request.params.client_id;
  var clientSecret = request.params.client_secret;
  var redirectUri = request.params.redirect_uri;
  var grantType = request.params.grant_type;

  var tokenResponse = pro_oauth2.generateAccessToken(clientId, clientSecret, redirectUri, grantType, authorizationCode);
  if (tokenResponse) {
    return renderJSON(tokenResponse);
  } else {
    return render400('Invalid request');
  }
}

//--------------------------------------------------------------------------------
// forgot password
//--------------------------------------------------------------------------------

function render_forgot_password_get() {
  _renderTemplate('forgot-password', {
    email: getSession().tempFormData.email || ""
  });
}

function render_forgot_password_post() {
  var email = normalize_email(request.params.email);
  getSession().tempFormData.email = email;

  var u = pro_accounts.getAccountByEmail(email);
  var invalidEmail = false;
  if (!u) {
    // this does require the user to have logged in somewhere
    // at some point!  this is not strictly necessary
    u = pro_accounts.maybeAutocreateUser(email);
    if (!u) {
      invalidEmail = true;
    }
  }

  if (!invalidEmail) {
    var tempPass = stringutils.randomString(20);
    pro_accounts.setTempPassword(u, tempPass);

    var subj = "hackpad: Request to reset your password on "+request.domain;

    sendHtmlTemplateEmail(u.email, subj, 'pro/account/forgot-password-email.ejs', {
      name: u.fullName,
      account: u,
      recoverUrl: pro_accounts.getTempSigninUrl(u, tempPass)
    });

    getSession().accountMessage = "An email has been sent to "+(email)+" with instructions to reset the password.";
  } else {
    getSession().accountMessage = "Oops! We don't have an account for "+(email)+".";
  }

  saveSession();
  response.redirect(request.path);
}




