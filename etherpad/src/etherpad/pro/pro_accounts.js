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

// library for pro accounts
import("crypto");
import("funhtml.*");
import("jsutils");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");
import("email.sendEmail");
import("cache_utils.syncedWithCache");
import("stringutils.*");
import("s3");

import("etherpad.globals.*");
import("etherpad.sessions");
import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.statistics.mixpanel");
import("etherpad.utils");
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("etherpad.control.pro.account_control");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_friends");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_onramp");
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_ldap_support.*");
import("etherpad.pad.padusers");
import("etherpad.log");
import("etherpad.pad.pad_security");

import("process.*");
import("fastJSON")
import("underscore._");

jimport("org.mindrot.BCrypt");
jimport("java.lang.System.out.println");
jimport("javax.crypto.IllegalBlockSizeException");
jimport("javax.crypto.BadPaddingException");
jimport("javax.xml.bind.DatatypeConverter");

function _dmesg(m) {
  if (!isProduction()) {
    println(m);
  }
}

function computePasswordHash(p) {
  return BCrypt.hashpw(p, BCrypt.gensalt(10));
}

function _withCache(name, fn) {
  return syncedWithCache('pro_accounts.'+name, fn);
}

//----------------------------------------------------------------
// validation
//----------------------------------------------------------------

function validateEmail(email) {
  if (!email) { return "Email is required."; }
  if (!isValidEmail(email)) { return "\""+email+"\" does not look like a valid email address."; }
  return null;
}

function validateFullName(name) {
  if (!name) { return "Full name is required."; }
  if (name.length < 2) { return "Full name must be at least 2 characters."; }
  return null;
}

function validatePassword(p) {
  if (!p) { return "Password is required."; }
  if (p.length < 6) { return "Passwords must be at least 6 characters."; }
  return null;
}

function _createNewAccount(domainId, fullName, email, passwordHash, isAdmin, fbid, isDomainGuest, isLinkedAccount, opt_lastLoginDate) {

  /* if domainId is null, then use domainId of current request. */
  if (!domainId) {
    domainId = domains.getRequestDomainId();
  }

  /* set domain guest and linked account flags */
  var flags = ((domainId != domains.getPrimaryDomainId()) && isDomainGuest) ? IS_DOMAIN_GUEST : 0;
  if (isLinkedAccount) {
    flags = flags | IS_LINKED_ACCOUNT;
  }

  mixpanel.track("new-account", {fb:Boolean(fbid), pwd: Boolean(passwordHash), admin:isAdmin, domainGuest:isDomainGuest, linked: isLinkedAccount});

  // make sure account does not already exist on this domain.
  var ret = inTransaction(function() {
    var existingAccount = getAccountByEmail(email, domainId);
    if (existingAccount) {
      throw Error("There is already an account with that email address.");
    }
    // No existing account.  Proceed.
    var now = new Date();
    var account = {
      domainId: domainId,
      fullName: fullName,
      email: email,
      passwordHash: passwordHash,
      createdDate: now,
      isAdmin: isAdmin,
      fbid: fbid,
      lastLoginDate: opt_lastLoginDate || null,
      flags: flags
    };
    return sqlobj.insert('pro_accounts', account);
  });

  _withCache('does-domain-admin-exist', function(cache) {
    delete cache[domainId];
  });

  updateCachedActiveCount(domainId);

  if (ret) {
    log.custom('pro-accounts',
              {type: "account-created",
               accountId: ret,
               domainId: domainId,
               name: fullName,
               email: email,
               admin: isAdmin,
               domainGuest: isDomainGuest
              });
  }

  return ret;
}

function isAPIAccount(account) {
  return account.email.indexOf("|API") > -1;
}

function copyAccountToPrimaryDomain(account) {
  return _createNewAccount(1, account.fullName, account.email, account.passwordHash, false/*isAdmin*/, account.fbid, false/*isDomainGuest*/, false/*isLinkedAccount*/, account.lastLoginDate);
}


function upgradeInviteToAccountBasedOnAccount(inviteAccount, activeAccount) {
  if (!activeAccount.lastLoginDate) {
    throw Error("Invalid account");
  }

  return sqlobj.update('pro_accounts', {'id': inviteAccount.id}, {fbid: activeAccount.fbid || inviteAccount.fbid, passwordHash: activeAccount.passwordHash, lastLoginDate: activeAccount.lastLoginDate, fullName: activeAccount.fullName});
}


function createNewAccount(domainId, fullName, email, password, isAdmin, skipValidation, fbid, isDomainGuest, isLinkedAccount) {
  if (!skipValidation) {
    skipValidation = false;
  }
  email = trim(email);
  isAdmin = !!isAdmin; // convert to bool

  // validation
  if (!skipValidation) {
    var e;
    e = validateEmail(email); if (e) { throw new ValidationError(e); }
    e = validateFullName(fullName); if (e) { throw new ValidationError(e); }
    e = validatePassword(password); if (e) { throw new ValidationError(e); }
  }

  var passwordHash = password != null ? computePasswordHash(password) : null;
  return _createNewAccount(domainId, fullName, email, passwordHash, isAdmin, fbid, isDomainGuest, isLinkedAccount);
}

function upgradeSignupToAccount(email, fullName, passwordHash) {
  var domainId = domains.getRequestDomainId();

  var ret = inTransaction(function() {
    var existingAccount = getAccountByEmail(email, domainId);
    if (existingAccount) {
      // an already invited user is activating their account
      mixpanel.track("new-account", {fb:Boolean(existingAccount.fbid), pwd: Boolean(passwordHash), admin:existingAccount.isAdmin, domainGuest:getIsDomainGuest(existingAccount), existing:true});

      existingAccount.passwordHash = passwordHash;
      existingAccount.fullName = fullName;
      sqlobj.updateSingle('pro_accounts', {id: existingAccount.id}, existingAccount);
      return existingAccount.id;
    } else {
      var isDomainGuest = false;
      return _createNewAccount(domainId, fullName, email, passwordHash,
          false/*isAdmin*/, null/*fbid*/, isDomainGuest);
    }
  });

  return ret;
}

function createLinkedAccount(accountId, destDomainId, destIsAdmin, destIsGuest) {
  var acct = getAccountById(accountId);
  if (!acct || acct.isDeleted) {
    throw Error("can't create linked account: account does not exist");
  }
  if (getAccountByEmail(acct.email, destDomainId)) {
    throw Error("can't create linked account: account already exists");
  }
  return createNewAccount(destDomainId, acct.fullName, acct.email, null, destIsAdmin, true, acct.fbid, destIsGuest, true);
}


function maybeSignInBasedOnAccount(otherSession, autoJoin) {
  var acct = otherSession.proAccount;
  if (!acct) {
    return false;
  }

  var matchingAcct = getAccountByEmail(acct.email);
  if (!matchingAcct) {
    if (autoJoin) {
      matchingAcct = maybeAutocreateUser(acct.email);
    }
    if (matchingAcct) {
      log.custom("accounts", "Auto signin: autocreated")
      mixpanel.track('signInAs', {type: 'autocreated'});
    }
  } else {
    log.custom("accounts", "Auto signin: existing")
    mixpanel.track('signInAs', {type: 'existing'});
  }

  if (matchingAcct) {
    getSession().facebookInfo = otherSession.facebookInfo;
    if (otherSession.facebookInfo) {
      pro_account_auto_signin.setFacebookAutoSigninCookie(true);
    }
    getSession().isGoogleConnected = otherSession.isGoogleConnected;
    if (otherSession.isGoogleConnected) {
      pro_account_auto_signin.setGoogleAutoSigninCookie(true);
    }
    getSession().dropboxTokenInfo = otherSession.dropboxTokenInfo;
    signInSession(matchingAcct);

    if (otherSession.rememberMe) {
      getSession().rememberMe = true;
      pro_account_auto_signin.setAutoSigninCookie(true);
    }

    saveSession();
    updateCookieSignedInAcctsOnSignIn();
    return true;
  }

  return false;
}

const HAS_PHOTO_BY_EMAIL_FLAG = 0x01;
const DOES_NOT_WANT_WHATS_NEW = 0x02;
const GOT_EDIT_CONFIRMATION_EMAIL = 0x04;
const DOES_NOT_WANT_FOLLOW_EMAIL = 0x08;
const IS_DOMAIN_GUEST = 0x10;
const DROPBOX_SYNC_ENABLED = 0x20;
const IS_LINKED_ACCOUNT = 0x40;
// we are using signed tiny int - so no more flags for now!


function setAccountFlag(accountId, flag, value) {
  //  sqlobj  flags
  var sql;
  if (value) {
    sql = "update pro_accounts set flags = flags | ? where id = ?;";
  } else {
    sql = "update pro_accounts set flags = flags & ~? where id = ?;";
  }
  sqlobj.executeRaw(sql, [flag, accountId], true);
  markDirtySessionAccount(accountId);
}

function isAccountFlagSet(account, flag) {
  return account.flags & flag;
}

function doesUserWantGravatar(account) {
  if (account.id == 31965/*Adam Brault*/) {
    return true;
  }
  return false;
}


function isLinkedAccount(account) {
  return isAccountFlagSet(account, IS_LINKED_ACCOUNT);
}

function setIsLinkedAccount(accountId) {
  return setAccountFlag(accountId, IS_LINKED_ACCOUNT, true)
}

function setDropboxSyncEnabled(accountId) {
  return setAccountFlag(accountId, DROPBOX_SYNC_ENABLED, true)
}

function setDropboxSyncDisabled(accountId) {
  return setAccountFlag(accountId, DROPBOX_SYNC_ENABLED, false)
}

function isDropboxSyncEnabled(account) {
  return isAccountFlagSet(account, DROPBOX_SYNC_ENABLED);
}

function setAccountHasPhotoByEmail(accountId) {
  return setAccountFlag(accountId, HAS_PHOTO_BY_EMAIL_FLAG, true)
  // Make sure they get an updated photo
  clearPicById(accountId);
}

function getAccountHasPhotoByEmail(account) {
  return isAccountFlagSet(account, HAS_PHOTO_BY_EMAIL_FLAG);
}

function setAccountDoesNotWantWhatsNew(accountId) {
  return setAccountFlag(accountId, DOES_NOT_WANT_WHATS_NEW, true);
}
function setAccountWantsWhatsNew(accountId) {
  return setAccountFlag(accountId, DOES_NOT_WANT_WHATS_NEW, false);
}

function getAccountDoesNotWantWhatsNew(account) {
  return isAccountFlagSet(account, DOES_NOT_WANT_WHATS_NEW);
}

function setAccountDoesNotWantFollowEmail(accountId) {
  return setAccountFlag(accountId, DOES_NOT_WANT_FOLLOW_EMAIL, true);
}

function setAccountWantsFollowEmail(accountId) {
  return setAccountFlag(accountId, DOES_NOT_WANT_FOLLOW_EMAIL, false);
}

function getAccountDoesNotWantFollowEmail(account) {
  return isAccountFlagSet(account, DOES_NOT_WANT_FOLLOW_EMAIL);
}

function setAccountGotEditConfirmationEmail(accountId) {
  return setAccountFlag(accountId, GOT_EDIT_CONFIRMATION_EMAIL, true);
}

function getAccountGotEditConfirmationEmail(account) {
  return isAccountFlagSet(account, GOT_EDIT_CONFIRMATION_EMAIL);
}

function _checkAccess(account) {
  if (sessions.isAnEtherpadAdmin()) {
    return;
  }
  if (account.domainId != domains.getRequestDomainId()) {
    throw Error("access denied");
  }
}

function setPassword(account, newPass) {
  _checkAccess(account);
  var passHash = computePasswordHash(newPass);
  sqlobj.update('pro_accounts', {id: account.id}, {passwordHash: passHash});
  markDirtySessionAccount(account.id);
}

function setTempPassword(account, tempPass, optForceCrossDomain) {
  !optForceCrossDomain && _checkAccess(account);
  var tempPassHash = computePasswordHash(tempPass);
  sqlobj.update('pro_accounts', {id: account.id}, {tempPassHash: tempPassHash});
  markDirtySessionAccount(account.id);
}

function setEmail(account, newEmail) {
  _checkAccess(account);
  sqlobj.update('pro_accounts', {id: account.id}, {email: newEmail});
  markDirtySessionAccount(account.id);
}

function setFullName(account, newName) {
  _checkAccess(account);
  sqlobj.update('pro_accounts', {id: account.id}, {fullName: newName});
  markDirtySessionAccount(account.id);
}

function setIsAdmin(account, newVal) {
  _checkAccess(account);
  sqlobj.update('pro_accounts', {id: account.id}, {isAdmin: newVal});
  markDirtySessionAccount(account.id);
}

function setIsDomainGuest(account, newVal) {
  _checkAccess(account);

  setAccountFlag(account.id, IS_DOMAIN_GUEST, newVal);

  updateCachedActiveCount(account.domainId);
}

function getIsDomainGuest(account) {
  return isAccountFlagSet(account, IS_DOMAIN_GUEST);
}

function setDeleted(account) {
  _checkAccess(account);
  if (!isNumeric(account.id)) {
    throw new Error("Invalid account id: "+account.id);
  }
  sqlobj.update('pro_accounts', {id: account.id}, {isDeleted: true, deletedDate: new Date()});
  markDirtySessionAccount(account.id);
  updateCachedActiveCount(account.domainId);

  log.custom('pro-accounts',
             {type: "account-deleted",
              accountId: account.id,
              domainId: account.domainId,
              name: account.fullName,
              email: account.email,
              admin: account.isAdmin/*,
              createdDate: account.createdDate.getTime()*/});
}

function updateLastLoginDate(account, opt_lastLoginDate) {
  // don't try updating etherpad admin last login date
  if (account.id == 0) {
    return;
  }

  opt_lastLoginDate = opt_lastLoginDate || new Date();
  sqlobj.updateSingle('pro_accounts', {id: account.id}, {lastLoginDate: opt_lastLoginDate});
  account.lastLoginDate = opt_lastLoginDate;
}

//----------------------------------------------------------------

function doesAdminExist() {
  var domainId = domains.getRequestDomainId();
  return _withCache('does-domain-admin-exist', function(cache) {
    if (cache[domainId] === undefined) {
      _dmesg("cache miss for doesAdminExist (domainId="+domainId+")");
      var admins = sqlobj.selectMulti('pro_accounts', {domainId: domainId, isAdmin: true}, {});
      cache[domainId] = (admins.length > 0);
    }
    return cache[domainId]
  });
}

function attemptSingleSignOn() {
  if(!appjet.config['etherpad.SSOScript']) return null;

  // pass request.cookies to a small user script
  var file = appjet.config['etherpad.SSOScript'];

  var cmd = exec(file);

  // note that this will block until script execution returns
  var result = cmd.write(fastJSON.stringify(request.cookies)).result();
  var val = false;

  // we try to parse the result as a JSON string, if not, return null.
  try {
    if(!!(val=fastJSON.parse(result))) {
      return val;
    }
  } catch(e) {}
  return null;
}

function setApiProAccount(apiAccount) {
  if (getSessionProAccount() && getSessionProAccount().id != apiAccount.id) {
    // Maybe this should be an error?
    signOut();
  }
  appjet.requestCache.apiProAccount = apiAccount;
}

function getApiProAccount() {
  return appjet.requestCache.apiProAccount;
}

function getSessionProAccount() {
  if (sessions.isAnEtherpadAdmin()) {
    return getEtherpadAdminAccount();
  }
  if (getApiProAccount()) {
    return getApiProAccount();
  }
  if (!getSession()) {
    return null;
  }
  var account = getSession().proAccount;
  if (!account) {
    return null;
  }

  if (account.isDeleted) {
    delete getSession().proAccount;
    //
    sessions.saveSession();
    return null;
  }
  return account;
}

function isAccountSignedIn() {
  if (getSessionProAccount()) {
    return true;
  } else {
    // if the user is not signed in, check to see if he should be signed in
    // by calling an external script.
    if(appjet.config['etherpad.SSOScript']) {
      var ssoResult = attemptSingleSignOn();
      if(ssoResult && ('email' in ssoResult)) {
        var user = getAccountByEmail(ssoResult['email']);
        if (!user) {
          var email = ssoResult['email'];
          var pass = ssoResult['password'] || "";
          var name = ssoResult['fullname'] || "unnamed";
          createNewAccount(null, name, email, pass,
            false, // isAdmin
            true,  // skipValidation
            null,  // fbid
            false, // isDomainGuest
            false  // isLinkedAccount
          );
          user = getAccountByEmail(email, null);
        }

        signInSession(user);
        return true;
      }
    }

    return false;
  }
}

function isAdminSignedIn() {
  return isAccountSignedIn() && getSessionProAccount().isAdmin;
}

// for now, just ensure our account is uptodate if there is one
function reloadAccountIfNeeded() {
  if (getSessionProAccount()) {
    return requireAccount();
  }
}

function requireAccount(message) {
  if ((request.path == "/ep/account/sign-in") ||
      (request.path == "/ep/account/signin") ||
      (request.path == "/ep/account/temp-signin") ||
      (request.path == "/ep/account/test/test") ||
      (request.path == "/ep/account/test/google-signin") ||
      (request.path == "/ep/account/login-or-signup") ||
      (request.path == "/ep/account/signup") ||
      (request.path == "/ep/account/as") ||
      (request.path == "/ep/account/sign-out") ||
      (request.path == "/ep/account/api-key") ||
      (request.path == "/ep/account/session-sign-in") ||
      (request.path == "/ep/account/connect-fb-session") ||
      (request.path == "/ep/account/create-via-facebook") ||
      (request.path == "/ep/account/resend-email-verification") ||
      (request.path == "/ep/account/google-sign-in") ||
      (request.path == "/ep/account/guest/guest-knock") ||
      (request.path == "/ep/account/validate-email") ||
      (request.path == "/ep/account/validate-email-change") ||
      (request.path == "/ep/account/openid") ||
      (request.path == "/ep/account/forgot-password") ||
      (request.path == "/ep/account/settings/unsub_whats_new") ||
      (request.path == "/ep/account/settings/sub_whats_new") ||
      (request.path == "/ep/account/settings/unsub-new-pads") ||
      (request.path == "/ep/account/settings/sub-new-pads") ||
      (request.path == "/ep/account/oauth-token")) {

    return;
  }

  function checkSessionAccount() {
    if (!getSessionProAccount()) {
      if (message) {
        account_control.setSigninNotice(message);
      }

      if (request.params.invitingId) {
        response.redirect('/ep/account/sign-in?invitingId='+request.params.invitingId+'&cont='+encodeURIComponent(request.url));
      } else {
        response.redirect('/ep/account/sign-in?cont='+encodeURIComponent(request.url));
      }
    }
  }

  checkSessionAccount();

  if (getSessionProAccount().domainId != domains.getRequestDomainId()) {
    // This should theoretically never happen unless the account is spoofing cookies / trying to
    // hack the site.
    pro_utils.renderFramedMessage("Permission denied.");
    response.stop();
  }

  // update dirty session account if necessary
  _withCache('dirty-session-accounts', function(cache) {
    var uid = getSessionProAccount().id;
    if (cache[uid]) {
      reloadSessionAccountData(uid);
      cache[uid] = false;
    }
  });

  // need to check again in case dirty update caused account to be marked
  // deleted.
  checkSessionAccount();
}

function updateCookieSignedInAcctsOnSignIn() {
  // get the list from the signed cookie
  var encryptedAcctIds = request.signedCookie('acctIds');
  encryptedAcctIds = encryptedAcctIds ? encryptedAcctIds.split(',') : [];

  // check if we're on the list
  var encryptedUserId = getEncryptedUserId(getSessionProAccount().id);
  if (encryptedAcctIds.indexOf(encryptedUserId) == -1) {
  // update the list if we changed it
    encryptedAcctIds.push(encryptedUserId);
    setCookieSignedInAccts(encryptedAcctIds);
  }

}

function updateCookieSignedInAcctsOnSignOut(optAcctId) {
  var encryptedUserId = getEncryptedUserId(optAcctId || getSessionProAccount().id);

  // get the list from the signed cookie
  var encryptedAcctIds = request.signedCookie('acctIds');
  encryptedAcctIds = encryptedAcctIds ? encryptedAcctIds.split(',') : [];

  // remove us from the list
  encryptedAcctIds = encryptedAcctIds.filter(function(eid) {
    return eid != encryptedUserId;
  });

  // save the cookie
  setCookieSignedInAccts(encryptedAcctIds);
}

function setCookieSignedInAccts(encryptedAcctIds) {
  response.setSignedCookie({
        name: "acctIds",
        value: encryptedAcctIds.join(","),
        path: "/",
        domain: sessions.getScopedDomain(),
        secure: appjet.config.useHttpsUrls,
        expires: new Date(32503708800000), // year 3000
        httpOnly: true /* disallow client js access */
  });
}

/*
  Returns a valid, active, mainsite account if at all possible.
  May be based it on a site account and autocreated on the spot.
*/
function ensureMainSiteAccount(email) {
  var mainSiteAccount = getAccountByEmail(email, domains.getPrimaryDomainId());

  if (!mainSiteAccount || !mainSiteAccount.lastLoginDate) {
    var accountOnAnotherSite = lastUsedAccountForEmail(email);

    if (accountOnAnotherSite) {
      if(mainSiteAccount) {
        log.custom('accounts', 'Upgrading invite to account for: ' + email);
        // upgrade mainsite account from an invite to a real account
        upgradeInviteToAccountBasedOnAccount(mainSiteAccount, accountOnAnotherSite);
        // reload the new account
        mainSiteAccount = getAccountById(mainSiteAccount.id);
      } else {
        log.custom('accounts', 'Creating mainsite account for: ' + email);
        // create a mainsite account that's a copy of the other account
        var newAcctId = copyAccountToPrimaryDomain(accountOnAnotherSite);
        if (newAcctId) {
          mainSiteAccount = getAccountById(newAcctId);
        }
      }
      if (mainSiteAccount) {
        setIsLinkedAccount(accountOnAnotherSite.id);
      }
    } else {
      // there's no active account for this email anywhere on hackpad
      mainSiteAccount = null;
    }
  }
  return mainSiteAccount;
}

function maybeAutocreateUser(email) {
  return inTransaction(function() {
    // needs to be null - otherwise we return the string "undefined"
    // some bad conversion in scala?
    var autoCreatedUser = null;

    // does the user have a mainsite account?
    var mainSiteAccount = ensureMainSiteAccount(email);

    // if so, maybe we have a user after all!
    if (mainSiteAccount) {
      if (domains.isPrimaryDomainRequest()) {
        autoCreatedUser = mainSiteAccount;
      } else if (allowRegistration(email)) {
        log.custom('accounts', 'Creating domain account for: ' + email);

        // there's an account on the mainsite, but not here - let's link to it
        // allowRegistration() ensures this is legal
        var domainId = domains.getRequestDomainId();
        var isDomainGuest = false;
        var autoAccountId = createNewAccount(domainId, mainSiteAccount.fullName, mainSiteAccount.email, null /*password*/, false /*isAdmin*/, true/*skipValidation*/, mainSiteAccount.fbid, isDomainGuest, true/*isLinkedAccount*/);
        if (autoAccountId) {
          autoCreatedUser = getAccountById(autoAccountId);
        }
      }
    }
    return autoCreatedUser;
  });
}

function allowRegistration(email, inviteToken) {
  if (pro_config.domainAllowsEmail(email)) {
    return true;
  }

  if (pro_config.getConfig().inviteToken && (inviteToken == pro_config.getConfig().inviteToken)) {
    return true;
  }

  return false;
}


function getCookieSignedInAccounts() {
  // get the list from the signed cookie
  var encryptedAcctIds = request.signedCookie('acctIds');
  encryptedAcctIds = encryptedAcctIds ? encryptedAcctIds.split(',') : [];
  return getAccountsByEncryptedIds(encryptedAcctIds, true /*opt_skipDeleted*/);
}

function requireSuperAdminAccount() {
  requireAdminAccount();
  if (getSessionProAccount().domainId != domains.getPrimaryDomainId()) {
    pro_utils.renderFramedMessage("Permission denied.");
    response.stop();
  }
}

function requireAdminAccount() {
  requireAccount();
  if (!getSessionProAccount().isAdmin) {
    pro_utils.renderFramedMessage("Permission denied.");
    response.stop();
  }
}

/* returns undefined on success, error string otherise. */
function authenticateSignIn(email, password) {
  // blank passwords are not allowed to sign in.
  if (password == "") return "Please provide a password.";

  // If the email ends with our ldap suffix...
  var isLdapSuffix = getLDAP() && getLDAP().isLDAPSuffix(email);

  if(isLdapSuffix && !getLDAP()) {
    return "LDAP not yet configured. Please contact your system admininstrator.";
  }

  // if there is an error in the LDAP configuration, return the error message
  if(getLDAP() && getLDAP().error) {
    return getLDAP().error + " Please contact your system administrator.";
  }

  if(isLdapSuffix && getLDAP()) {
    var ldapuser = email.substr(0, email.indexOf(getLDAP().getLDAPSuffix()));
    var ldapResult = getLDAP().login(ldapuser, password);

    if (ldapResult.error == true) {
      return ldapResult.message + "";
    }

    var accountRecord = getAccountByEmail(email, null);

    // if this is the first time this user has logged in, create a user
    // for him/her
    if (!accountRecord) {
      // password to store in database -- a blank password means the user
      // cannot authenticate normally (e.g. must go through SSO or LDAP)
      var ldapPass = "";

      // create a new user (skipping validation of email/users/passes)
      createNewAccount(null, ldapResult.getFullName(), email, ldapPass, false, true);
      accountRecord = getAccountByEmail(email, null);
    }

    signInSession(accountRecord);
    return undefined; // success
  }

  var accountRecord = getAccountByEmail(email, null);
  if (!accountRecord) {
    return "Account not found: "+email;
  }

  var passwordHash = getPasswordHash(accountRecord);

  if (BCrypt.checkpw(password, passwordHash) != true) {
    return "Email or password incorrect.  Please try again.";
  }

  signInSession(accountRecord);

  return undefined; // success
}

function getPasswordHash(accountRecord) {
  var passwordHash;
  if (isLinkedAccount(accountRecord)) {
    linkedRecord = getAccountByEmail(accountRecord.email, 1);
    if (linkedRecord) {
      passwordHash = linkedRecord.passwordHash;
    } else {
      return "Account has been deleted."
    }
  }
  // always fallback to our own password if any
  if (accountRecord.passwordHash) {
    passwordHash = accountRecord.passwordHash;
  }

  return passwordHash;
}


function signOut() {
  if (getSessionProAccount()) {
    updateCookieSignedInAcctsOnSignOut();
  }

  // we duplicate the reset here so that any internal callers get it
  // lest we end up in a redirect loop
  pro_account_auto_signin.resetAutoSignInState();
  delete getSession().proAccount;
  delete getSession().facebookInfo;
  delete getSession().isGoogleConnected;
  delete getSession().dropboxTokenInfo;
  sessions.saveSession();

  utils.resetXSRFToken();
}


function getLoggedInUserFacebookId() {
  if (getSessionProAccount() && getSession().facebookInfo) {
    return getSessionProAccount().fbid;
  }
  return null;
}

function getLoggedInUserFacebookToken() {
  if(getSessionProAccount() && getSession().facebookInfo && getSessionProAccount().fbid
      && getSession().facebookInfo.user && getSessionProAccount().fbid == getSession().facebookInfo.user.id) {
    return getSession().facebookInfo.accessToken;
  }
  return null;
}

function getLoggedInUserFriendIds() {
  var userIds = pro_friends.getFriendUserIds(getSessionProAccount().id);

  if (getLoggedInUserFacebookToken()) {
    var facebookIds = pro_facebook.getFacebookFriendsWhoUseApp(
      getLoggedInUserFacebookId(), getLoggedInUserFacebookToken());
    if (facebookIds && facebookIds.length) {
      var users = pro_facebook.getAccountsByFacebookIds(facebookIds);
      for (var i in users) {
        if (userIds.indexOf(users[i].id) == -1) {
          userIds.push(users[i].id);
        }
      }
    }
  }

  if (getSession().isGoogleConnected) {
    var googleContacts = google_account.contactsForAccount(getSessionProAccount());

    if (googleContacts) {
      var domainId = domains.getRequestDomainId();
      var emails = googleContacts.map(function(c) { return c[0]/*email*/; });

      var users = sqlobj.selectMulti('pro_accounts', {domainId: domainId, email: ["IN", emails], isDeleted: false});
      for (var i in users) {
        if (userIds.indexOf(users[i].id) == -1) {
          userIds.push(users[i].id);
        }
      }
      _dmesg("email contact users: " + users.map(function(u) { return u.email; }).join(","));
    } else {
      _dmesg("no email contacts! loading...");
      if (getSessionProAccount()) {
        google_account.reloadGoogleContactsAsync(getSessionProAccount());
      }
    }
  }

  return userIds;
}

function authenticateTempSignIn(uid, tempPass) {
  var emsg = "That password reset link that is no longer valid.";

  var account = getAccountById(uid);
  if (!account) {
    return emsg+" (Account not found.)";
  }

  if (account.domainId != domains.getRequestDomainId()) {
    return emsg+" (Wrong domain.)";
  }
  if (!account.tempPassHash) {
    return emsg+" (Expired.)";
  }
  if (BCrypt.checkpw(tempPass, account.tempPassHash) != true) {
    return emsg+" (Bad temp pass.)";
  }

  account_control.resetLoginAttempts(account.email);

  if (isLinkedAccount(account) && !account.lastLoginDate) {
    signInSession(account);
    return; // forward on to cont destination
  } else {
    getSession().accountMessage = "Please choose a new password";
    getSession().passwordReset = true;
    signInSession(account);

    response.redirect("/ep/account/settings?cp=1");
  }
}

function onFirstSignIn() {
  pro_onramp.onFirstSignIn();
}

function signInSession(account, skipLastLoginUpdate) {
  var isFirstSignIn = false;
  if (!account.lastLoginDate) {
    isFirstSignIn = true;
  }

  var accountUpdate = {};
  if (!skipLastLoginUpdate) {
    accountUpdate.lastLoginDate = new Date();
  }
  if (account.tempPassHash != null) {
      accountUpdate.tempPassHash = null;
  }
  if (_.keys(accountUpdate).length) {
    sqlobj.updateSingle('pro_accounts', {id: account.id}, accountUpdate);
  }

  reloadSessionAccountData(account.id);

  if(isFirstSignIn) {
    onFirstSignIn();
  }

  // initiate google contact loading
  if (getSession().isGoogleConnected) {
    google_account.reloadGoogleContactsAsync(getSessionProAccount());
  }

  _maybeLoadFacebookToken(account);

  updateCookieSignedInAcctsOnSignIn();

  if (!skipLastLoginUpdate) {
    log.custom("accounts", {type:'signInSession', isFirstSignIn:isFirstSignIn, id: account.id, email: account.email})
    mixpanel.track('signInSession', {isFirstSignIn:isFirstSignIn});
  }

  utils.resetXSRFToken();
}


function _maybeLoadFacebookToken(account) {
  if (account.fbid && !getSession().facebookInfo) {
    var fbInfo = pro_tokens.getFacebookTokenForProUserId(account.id);

    if (fbInfo) {
      mixpanel.track("fb-token-autoload")
      getSession().facebookInfo = {user: {id: account.fbid}, accessToken: fbInfo.token};
      saveSession();
    }
  }
}

function listAllDomainAccounts(domainId) {
  if (domainId === undefined) {
    domainId = domains.getRequestDomainId();
  }
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false}, {});
  return records;
}

function listNewestDomainAccounts(limit, domainId) {
  if (domainId === undefined) {
    domainId = domains.getRequestDomainId();
  }
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false}, {orderBy: '-createdDate', limit:limit });
  return records;
}

function countOfDomainAccounts(domainId){
  if (domainId === undefined) {
    domainId = domains.getRequestDomainId();
  }
  var count = sqlobj.executeRaw("select count(*) as count from pro_accounts where isDeleted=0 and domainId="+domainId, []);
  return count[0]['count'];
}

function listAllDomainAdmins(domainId) {
  if (domainId === undefined) {
    domainId = domains.getRequestDomainId();
  }
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false, isAdmin: true},
    {orderBy: '-createdDate'});
  return records;
}

function getActiveCount(domainId) {
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false}, {});
  return records.filter(function(r) { return (r.flags & IS_DOMAIN_GUEST) == 0; }).length;
}

/* getAccountById works for deleted and non-deleted accounts.
 * The assumption is that cases whewre you look up an account by ID, you
 * want the account info even if the account has been deleted.  For
 * example, when asking who created a pad.
 */
function getAccountById(accountId, opt_skipDeleted) {
  if (accountId == 0) {
    return getEtherpadAdminAccount();
  }

  var selector = {id: accountId};
  if (opt_skipDeleted) {
    selector.isDeleted = false;
  }

  var r = sqlobj.selectSingle('pro_accounts', selector);
  if (r) {
    return r;
  } else {
    return undefined;
  }
}

/* getting an account by email only returns the account if it is
 * not deleted.  The assumption is that when you look up an account by
 * email address, you only want active accounts.  Furthermore, some
 * deleted accounts may match a given email, but only one non-deleted
 * account should ever match a single (email,domainId) pair.
 */
function getAccountByEmail(email, domainId) {
  if (!domainId) {
    domainId = domains.getRequestDomainId();
  }
  if (email.toLowerCase() != email) {
    log.logException("Lookup by non-normalized email!");
  }
  var r = sqlobj.selectSingle('pro_accounts', {domainId: domainId, email: email, isDeleted: false});
  if (r) {
    return r;
  } else {
    return undefined;
  }
}

function lastUsedAccountForEmail(email) {
  if (email.toLowerCase() != email) {
    log.logException("Lookup by non-normalized email!");
  }
  var r = sqlobj.selectMulti('pro_accounts', {email: email, isDeleted: false, lastLoginDate: ["IS NOT", null]}, {orderBy: '-lastLoginDate'});
  if (r) {
    return r[0];
  } else {
    return undefined;
  }
}


function getFullNameById(id) {
  if (!id) {
    return null;
  }

  return _withCache('names-by-id', function(cache) {
    if (cache[id] === undefined) {
      _dmesg("cache miss for getFullNameById (accountId="+id+")");
      var r = getAccountById(id);
      if (r) {
        cache[id] = r.fullName;
      } else {
        cache[id] = false;
      }
    }
    if (cache[id]) {
      return cache[id];
    } else {
      return null;
    }
  });
}

function _getAccountIdEncryptionKey() {
  var key = appjet.config.accountIdEncryptionKey; // 8 bytes
  return new javax.crypto.spec.SecretKeySpec(DatatypeConverter.parseHexBinary(key), "DES");
}


function getUserLinkById(id) {
  return '/ep/profile/' + getEncryptedUserId(id);
}

function getEncryptedUserId(userId) {
  return ""+crypto.encryptedId(userId, _getAccountIdEncryptionKey());
}

function getUserIdByEncryptedId(enc) {
  try {
    return parseInt(crypto.decryptedId(enc, _getAccountIdEncryptionKey()));
  } catch (e if e.javaException instanceof IllegalBlockSizeException ||
           e.javaException instanceof BadPaddingException) {
    log.warn("Could not decrypt invalid user id: " + enc);
    return -1;
  }
}

function clearPadsCreatedByAcct(acct) {
  _withCache('pads-by-email', function(cache) {
    delete cache[acct.email];
  });
}
function padsCreatedByAcct(acct) {
  return _withCache('pads-by-email', function(cache) {
    if (cache[acct.email] === undefined) {
      var acctIds = getAllAccountsWithEmail(acct.email).map(function(acct){return acct.id});
      if (acctIds.length) {
        cache[acct.email] = pro_pad_db.countPadsCreatedBy(acctIds);
      } else {
        cache[acct.email] = 0;
      }
    }

    return cache[acct.email];
  });
}


function clearPicById(id) {
  _withCache('pics-by-id-new', function(cache) {
    delete cache[id];
    delete cache[id + '-large'];
  });
}

function getPicById(id, large) {
  if (!id) {
    return '/static/img/hackpad-logo.png';
  }

  var key = id + (large ? "-large" : "");

  return _withCache('pics-by-id-new', function(cache) {

    if (cache[key] === undefined) {
      _dmesg("cache miss for getPicById (accountId="+id+")");
      var r = getAccountById(id, true);

      var photoUrl = null;
      if (r && getAccountHasPhotoByEmail(r) && !doesUserWantGravatar(r)) {
        var cacheBustingToken =
        photoUrl = (appjet.config.imageCDNUrl) +
            encodeURIComponent(s3.getURL("hackpad-profile-photos", r.email, true/*http*/)+"?"+Date.now());
      } else if (r && r.fullName == "The Hackpad Team") {
        photoUrl = "/static/img/hackpad-logo.png";
      } else if (r && r.fbid && !doesUserWantGravatar(r)) {
        photoUrl = "https://graph.facebook.com/" + r.fbid + "/picture?type=" + (large ? "large" : "square");
      } else if (r && r.email) {
        var photoUrl = "https://www.gravatar.com/avatar.php?default=" +
            encodeURIComponent("https://hackpad.com/static/img/nophoto.png") +
            "&gravatar_id=" + md5(trim(r.email).toLowerCase()) + "&size=100";
      }
      cache[key] = photoUrl;
    }
    var value = cache[key];
    return value;
  });
}

function getTempSigninUrl(account, tempPass, optHost, optCont) {
  if(appjet.config.listenSecurePort != 0 || appjet.config.useHttpsUrls)
    return [
      'https://', httpsHost(optHost || pro_utils.getFullProHost()), '/ep/account/sign-in?',
      'euid=', getEncryptedUserId(account.id), '&tp=', tempPass, optCont ? '&cont='+optCont : ''
    ].join('');
  else
    return [
      'http://', httpHost(optHost || pro_utils.getFullProHost()), '/ep/account/sign-in?',
      'euid=', getEncryptedUserId(account.id), '&tp=', tempPass, optCont ? '&cont='+optCont : ''
    ].join('');
}

// TODO: this session account object storage / dirty cache is a
// ridiculous hack.  What we should really do is have a caching/access
// layer for accounts similar to accessPad() and accessProPadMeta(), and
// have that abstraction take care of caching and marking accounts as
// dirty.  This can be incorporated into getSessionProAccount(), and we
// should actually refactor that into accessSessionProAccount().

/* will force session data for this account to be updated next time that
 * account requests a page. */
function markDirtySessionAccount(uid) {

  _withCache('dirty-session-accounts', function(cache) {
    cache[uid] = true;
  });
  _withCache('names-by-id', function(cache) {
    delete cache[uid];
  });

  if (request.isDefined) {
    var domainId = domains.getRequestDomainId();
    _withCache('does-domain-admin-exist', function(cache) {
      delete cache[domainId];
    });
  }

  sessions.saveSession();
}

function reloadSessionAccountData(uid) {
  if (!uid) {
    uid = getSessionProAccount().id;
  }
  getSession().proAccount = getAccountById(uid);

  // if we're dropbox connected, load that
  getSession().dropboxTokenInfo = pro_tokens.getDropboxKeyAndSecretForProUserId(uid);

  sessions.saveSession();
}

function getAllAccountsWithEmail(email) {
  if (email.toLowerCase() != email) {
    log.logException("Lookup by non-normalized email!");
  }
  var accountRecords = sqlobj.selectMulti('pro_accounts', {email: email, isDeleted: false}, {});
  return accountRecords;
}

function getAccountsByEncryptedIds(encryptedIds, opt_skipDeleted) {
  var acctIds = encryptedIds.map(function(eid){
    return getUserIdByEncryptedId(eid);
  });

  return getAccountsByIds(acctIds, opt_skipDeleted);
}

function getAccountsByIds(uids, opt_skipDeleted) {
  var selector = {id: ['in', uids]};
  if (opt_skipDeleted) {
    selector.isDeleted = false;
  }

  if (uids.length) {
    return sqlobj.selectMulti('pro_accounts', selector);
  }
  return [];
}

function getEtherpadAdminAccount() {
  return {
    id: 0,
    isAdmin: true,
    fullName: "The Hackpad Team",
    email: "support@etherpad.com",
    domainId: domains.getRequestDomainId(),
    isDeleted: false,
    deletedDate: null
  };
}

function getCachedActiveCount(domainId) {
  return _withCache('user-counts.'+domainId, function(c) {
    if (!c.count) {
      c.count = getActiveCount(domainId);
    }
    return c.count;
  });
}

function updateCachedActiveCount(domainId) {
  _withCache('user-counts.'+domainId, function(c) {
    c.count = getActiveCount(domainId);
  });
}

function getSessionSpaces() {
  var domainIds = [];
  var domainInfos = [];
  var fixedDomainsLength = 0;

  function _addDomain(domainId, lastLoginDate) {
    if (domainIds.indexOf(domainId) == -1) {
      domainIds.push(domainId);
      var m = domains.getDomainRecord(domainId);
      if (m) {
        var domainInfo = jsutils.extend({}, m);
        var timestamp = lastLoginDate ? +lastLoginDate : 0;
        if (jsutils.isFiniteNumber(timestamp)) {
          domainInfo.lastLoginDate = timestamp;
        } else {
          domainInfo.lastLoginDate = 0;
        }
        domainInfos.push(domainInfo);
      }
    }
  }

  _addDomain(domains.getPrimaryDomainId());
  fixedDomainsLength += 1;

  if (pro_utils.isProDomainRequest()) {
    // Throws exception if not pro domain request
    var acct = getSessionProAccount();
    _addDomain(domains.getRequestDomainId(), acct ? acct.lastLoginDate : undefined);
    fixedDomainsLength += 1;
  }

  var fixedDomains = domainInfos.splice(0, fixedDomainsLength);

  var emailsSeen = {};
  getCookieSignedInAccounts().forEach(function(acct) {

    _addDomain(acct.domainId, acct.lastLoginDate);

    if (!emailsSeen[acct.email]) {
      getAllAccountsWithEmail(acct.email).forEach(function(a) {
        _addDomain(a.domainId, a.lastLoginDate);
      });
      emailsSeen[acct.email] = true;

      var emailDomain = acct.email.split('@')[1];
      pro_config.getDomainIdsWithAllowDomain(emailDomain).forEach(function(domainId) {
        _addDomain(domainId);
      });
    }

  });

  var recentDomains = domainInfos;
  jsutils.reverseSortBy(recentDomains, 'lastLoginDate');

  domainInfos = fixedDomains.concat(recentDomains);
  domainInfos.forEach(function(s) {
    s.url = request.scheme + "://" + (s.subDomain && s.id != 1 ? s.subDomain + "." : "") + appjet.config['etherpad.canonicalDomain'] + '/',
    s.orgName = s.id != 1 ? s.orgName : "hackpad";
  });

  return domainInfos;
}


function isMultiAccount() {
  return jsutils.uniqueBy(getCookieSignedInAccounts(), 'email').length > 1;
}

function accountsForSignInAsPicker() {
  var accts = getCookieSignedInAccounts();

  // don't show them the current site's entry except on the top level domain
  accts = accts.filter(function(acct) {
    return (acct.domainId == domains.getPrimaryDomainId() || acct.domainId != domains.getRequestDomainId()) && domains.getDomainRecord(acct.domainId);
  })
  // pick one acct per email
  accts = jsutils.uniqueBy(accts, "email");
  accts.forEach(function(acct) {
    acct.userPic = getPicById(acct.id);
    acct.id = getEncryptedUserId(acct.id);
  });
  return accts;
}




