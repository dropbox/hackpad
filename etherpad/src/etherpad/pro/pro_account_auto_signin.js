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

import("jsutils");
import("sqlbase.sqlobj");
import("stringutils");
import("netutils");
import("fastJSON");

import("etherpad.globals.isProduction");
import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.log");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_utils");
import("etherpad.pad.pad_security");

jimport("java.lang.System.out.println");

var _COOKIE_NAME = "PUAS";

function _cookieName(name) {
  if (isProduction()){
    return domains.getRequestDomainId() + name;
  }  else {
    return "d" + domains.getRequestDomainId()+ name;
  }
}

function dmesg(m) {
  if (false) {
    println("[pro-account-auto-sign-in]: "+m);
  }
}

function getSubdomainSession(domainId) {
  // load the domain
  var domainRecord = domains.getDomainRecord(domainId);
  if (!domainRecord) {
    return null;
  }

  var host = pro_utils.getFullSuperdomainHost();
  if (domains.getPrimaryDomainId() != domainRecord.id) {
    host = domainRecord.subDomain+"."+host;
  }

  var resp = netutils.urlGet(
    (appjet.config.useHttpsUrls ? "https://" : "http://") + host +
    "/ep/api/lookup-session", {},
    { Cookie: request.headers['Cookie']}, 100/*timeout ms*/, true /*acceptErrorCodes*/);
  if (resp.status != 200) {
    return null;
  }
  return fastJSON.parse(resp.content);
}


function checkUnifiedAccountsAutoSignIn() {
  // are we signed in elsewhere with an email address that we could use here?
  var otherAccts = pro_accounts.getCookieSignedInAccounts();

  for (var i=0; i<otherAccts.length; i++) {
    var acct = otherAccts[i];

    var otherSession = getSubdomainSession(acct.domainId);
    if (otherSession &&
        otherSession.proAccount &&
        otherSession.proAccount.id == acct.id) {

      if (pro_accounts.maybeSignInBasedOnAccount(otherSession)) {
        break;
      }
    }
  }
}

function _deletePUASCookie() {
  response.setCookie({
    name: _COOKIE_NAME,
    value: "",
    path: "/",
    expires: 0, //
    secure: appjet.config.useHttpsUrls,
    httpOnly: true /* disallow client js access */
  });
  response.setCookie({
    name: _COOKIE_NAME,
    value: "",
    path: "/",
    expires: 0, //
    domain: "." + request.domain,
    secure: appjet.config.useHttpsUrls,
    httpOnly: true /* disallow client js access */
  });
}


function checkAutoSignin(cont, optSkipUnifiedAccounts) {
  cont = pad_security.sanitizeContUrl(cont);
  dmesg("checking auto sign-in...");
  if (pro_accounts.isAccountSignedIn()) {
    dmesg("account already signed in...");
    // don't mess with already signed-in account
    return;
  }

  var cookie = request.cookies[_COOKIE_NAME];
  if (!cookie) {
    dmesg("no auto-sign-in cookie found...");

    if (!optSkipUnifiedAccounts) {
      if (checkUnifiedAccountsAutoSignIn()) {
        return;
      }
    }

    return;
  }


  log.custom('accounts', 'Attempting sign in');

  var record = sqlobj.selectSingle('pro_accounts_auto_signin', {cookie: cookie}, {});
  if (!record) {
    log.custom('accounts', 'No record for ' + cookie);
    _deletePUASCookie();
    return;
  }

  var now = +(new Date);
  if (+record.expires < now) {
    log.custom('accounts', 'Expired record');
    sqlobj.deleteRows('pro_accounts_auto_signin', {id: record.id});
    _deletePUASCookie();
    dmesg("deleted expired record...");
    return;
  }

  var account = pro_accounts.getAccountById(record.accountId);

  if (account.domainId != domains.getRequestDomainId() || account.isDeleted) {
    log.custom('accounts', 'Deleted acct');
    return;
  }

  if (shouldAttemptGoogleAutoSignin()) {
    var account = pro_accounts.getAccountById(record.accountId);
    setGoogleAutoSigninCookie(false); // prevent infinite loop if something's off
    response.redirect(google_account.googleOAuth2URLForLogin(account.email));
  }

  // login into facebook if needed
  else if (shouldAttemptFacebookAutoSignin()) {
    log.custom('accounts', 'Should try fb');

    var fbInfo = pro_tokens.getFacebookTokenForProUserId(record.accountId);

    var me;
    // attempt to load /me from facebook
    if (fbInfo) {
      // if the token's bad, the following line will stop the request.
      me = pro_facebook.getUserInfo(null, fbInfo.token);
      log.info("Facebook User Info: " + JSON.stringify(me));
    }

    if (me) {
      getSession().facebookInfo = {user: me, accessToken: fbInfo.token};
      saveSession();
    } else {
      pro_tokens.removeFacebookTokenForProUserId(getSessionProAccount().id);
      dmesg("failed to auth with facebook...");
      return;
    }
  }

  // do auto-signin (bypasses normal security)
  dmesg("Doing auto sign in...");
  log.custom('accounts', 'Signing in');

  pro_accounts.signInSession(account);
  getSession().rememberMe = true;

  response.redirect('/ep/account/sign-in?cont='+encodeURIComponent(request.url));
}

function resetAutoSignInState() {
  setAutoSigninCookie(false);
  setFacebookAutoSigninCookie(false);
  setGoogleAutoSigninCookie(false);
}

function shouldAttemptGoogleAutoSignin() {
  return (request.cookies[_cookieName("GASIE")] == "T");
}

function shouldAttemptFacebookAutoSignin() {
  return (request.cookies[_cookieName("FASIE")] == "T");
}

function setFacebookAutoSigninCookie(rememberMe) {
  // set this insecure cookie just to indicate that account is google-auto-sign-in-able
  response.setCookie({
    name: _cookieName("FASIE"),
    value: (rememberMe ? "T" : "F"),
    path: "/",
    domain: request.domain,
    expires: new Date(32503708800000), // year 3000
  });
}

function setGoogleAutoSigninCookie(rememberMe) {
  // set this insecure cookie just to indicate that account is google-auto-sign-in-able
  response.setCookie({
    name: _cookieName("GASIE"),
    value: (rememberMe ? "T" : "F"),
    path: "/",
    domain: request.domain,
    expires: new Date(32503708800000), // year 3000
  });
}

function clearOtherAutoSigninCookies() {
  if (!pro_accounts.isAccountSignedIn()) {
    return;
  }

  var cookie = request.cookies[_COOKIE_NAME];
  var accountId = pro_accounts.getSessionProAccount().id;
  var constraints = {accountId: accountId};
  // Keep this login's cookie around.
  if (cookie) {
    constraints.cookie = ['<>', cookie];
  }
  sqlobj.deleteRows('pro_accounts_auto_signin', constraints);
}

function setAutoSigninCookie(rememberMe) {
  if (!pro_accounts.isAccountSignedIn() && rememberMe) {
    return; // only call this function after account is already signed in.
  }

  // set this insecure cookie just to indicate that account is auto-sign-in-able
  response.setCookie({
    name: _cookieName("ASIE"),
    value: (rememberMe ? "T" : "F"),
    path: "/",
    domain: request.domain,
    expires: new Date(32503708800000), // year 3000
  });

  if (!rememberMe) {
    // clean up the actual secure cookie
    var cookie = request.cookies[_COOKIE_NAME];
    if (cookie) {
      sqlobj.deleteRows('pro_accounts_auto_signin', {cookie: cookie});
      _deletePUASCookie();
    }

    delete getSession().rememberMe;
    saveSession();

    return;
  }

  var accountId = getSessionProAccount().id;
  var cookie = stringutils.randomHash(16);
  var now = +(new Date);
  var expires = new Date(now + 1000*60*60*24*30); // 30 days

  sqlobj.insert('pro_accounts_auto_signin', {cookie: cookie, accountId: accountId, expires: expires});
  response.setCookie({
    name: _COOKIE_NAME,
    value: cookie,
    path: "/",
    expires: new Date(32503708800000), // year 3000
    secure: appjet.config.useHttpsUrls,
    httpOnly: true /* disallow client js access */
  });

  getSession().rememberMe = true;
  saveSession();
}

