
import("etherpad.control.pro.account_control");
import("sqlbase.sqlobj");
import("stringutils");
import("netutils");
import("etherpad.log");
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("etherpad.control.pro.account_control");
import("etherpad.testing.mock_browser.MockBrowser");
import ("etherpad.testing.testutils.*");

import ("etherpad.pro.pro_config");
import ("etherpad.pro.pro_accounts");

// Known bugs
// bug: if trying to sign up and and have an account on another domain we don't prevent you
// bug: tony's bug, accounts on two subsites - one is linked, cannot log in as no mainsite account
// bug: after signin as, it's impossible to invite via autocomplete

function run() {
  // Configuration
  var testPublicDomain = "unittestpublic" + stringutils.randomString(10).toLowerCase();
  var testPrivateDomain = "unittestprivate" + stringutils.randomString(10).toLowerCase();
  var testEmailAddy = "noreply+" + stringutils.randomString(10).toLowerCase() + "@hackpad.com";
  var testBogusEmailAddy = "noreply+" + stringutils.randomString(10).toLowerCase() + "@hackpad.com";

  var testPublicDomainId = domains.createNewSubdomain(testPublicDomain, testPublicDomain);
  var testPrivateDomainId = domains.createNewSubdomain(testPrivateDomain, testPrivateDomain);

  var email = testEmailAddy;

  pro_config.setConfigVal('publicDomain', true, testPublicDomainId);
  pro_config.setConfigVal('publicDomain', false, testPrivateDomainId);
  sqlobj.update('pro_accounts', {email:email}, {'isDeleted': 1});
  sqlobj.deleteRows('email_signup', {email:email});

  // sign up for mainsite account
  var browser = new MockBrowser();
  assert(attemptSignUp(null, email, "barbarbar", browser));

  // validate email address
  assert(attemptValidateEmail(null, email, browser));

  // login to a public site with same username / password
  assert(attemptSignIn(testPublicDomain, email, "barbarbar"));

  // try to login to a private site with same username / password
  // "Account Not Found"
  assert(!attemptSignIn(testPrivateDomain, email, "barbarbar"));

  // create an invite on the private site and try again
  pro_accounts.createNewAccount(testPrivateDomainId, email, email, null, false, true, null /* fbid */, true/*guest*/);
  assert(attemptSignIn(testPrivateDomain, email, "barbarbar"));

  // RESET ACCOUNTS
  sqlobj.update('pro_accounts', {email:email}, {'isDeleted': 1});
  sqlobj.deleteRows('email_signup', {email:email});

  // sign up for a public site account
  assert(attemptSignUp(testPublicDomain, email, "barbarbar", browser));

  // try to login to there or mainsite
  assert(!attemptSignIn(testPublicDomain, email, "barbarbar"));
  assert(!attemptSignIn(null, email, "barbarbar"));

  // fail to login to private and login to public using google
  assert(!simulateGoogleSignIn(testPrivateDomain, email));
  assert(simulateGoogleSignIn(testPublicDomain, email));

  // this fails (and should fail!) because the email address/password association
  // has never been confirmed.  we should give a helpful message to
  // let them set a password.
  assert(!attemptSignIn(null, email, "barbarbar")); // this autocreates an account

  // validate email address
  var browser = new MockBrowser();
  assert(!attemptSignUp(null, email, "barbarbar", browser));
  // it'll tell us that an account already exists (autocreated above from our sign-in+google acct)

  // RESET ACCOUNTS
  sqlobj.update('pro_accounts', {email:email}, {'isDeleted': 1});
  sqlobj.deleteRows('email_signup', {email:email});

  // test for bug fix revalidating existing account in re-validate
  browser = new MockBrowser();
  assert(attemptSignUp(null, email, "barbarbar", browser));
  assert(attemptValidateEmail(null, email, browser));
  assert(attemptValidateEmail(null, email, browser));

  // RESET ACCOUNTS
  sqlobj.update('pro_accounts', {email:email}, {'isDeleted': 1});
  sqlobj.deleteRows('email_signup', {email:email});

  // test for bug fix revalidating existing account in re-validate
  browser = new MockBrowser();
  assert(attemptSignUp(testPublicDomain, email, "barbarbar", browser));
  // forgot password returns the same message if account with email exists or not
  assert(attemptForgotPassword(true, null, email));
  assert(attemptValidateEmail(testPublicDomain, email, browser));
  assert(attemptForgotPassword(true, null, testBogusEmailAddy));
  assert(attemptForgotPassword(false, null, email));

  return true;
}

function _url(subdomain, path) {
  var urlPrefix = appjet.config.useHttpsUrls ? "https://" : "http://";
  return urlPrefix + (subdomain ? subdomain + ".": "") + appjet.config['etherpad.canonicalDomain'] + path;
}

function attemptSignIn(subdomain, email, password, opt_browser) {
  var browser = opt_browser || new MockBrowser();
  var result = browser.get(_url(subdomain, "/ep/account/sign-in"));
  var xsrf = getXsrfFromDOM(result);
  result = browser.post(_url(subdomain, "/ep/account/signin"),
      {email:email, password:password, xsrf: xsrf});
  return JSON.parse(result.content).success;
}

function attemptSignUp(subdomain, email, password, opt_browser) {
  var browser = opt_browser || new MockBrowser();
  var result = browser.get(_url(subdomain, "/ep/account/sign-in"));
  var xsrf = getXsrfFromDOM(result);
  var result = browser.post(_url(subdomain, "/ep/account/signup"),
      {email:email, password:password, name:"full name", xsrf: xsrf});
  var parsedResult = JSON.parse(result.content);
  return parsedResult.html ? parsedResult.html.indexOf("Welcome to hackpad") > -1 : parsedResult.success;
}

function attemptForgotPassword(bogus, subdomain, email, password, opt_browser) {
  var browser = opt_browser || new MockBrowser();
  var result = browser.get(_url(subdomain, "/ep/account/forgot-password"));
  var xsrf = getXsrfFromDOM(result);
  var result = browser.post(_url(subdomain, "/ep/account/forgot-password"),
    {email:email, xsrf: xsrf});
  var msg;
  if (bogus) {
    msg = "Oops! We don't have an account for "+(email);
  } else {
    msg = "An email has been sent to "+(email)+" with instructions to reset the password."; 
  }
  return result.content.indexOf(msg) > -1;
}

function attemptValidateEmail(subdomain, email, opt_browser) {
  var browser = opt_browser || new MockBrowser();
  var signup = sqlobj.selectSingle('email_signup', {email:email});
  var result = browser.get(_url(subdomain, "/ep/account/validate-email"),{
    token:(signup && signup.token) || "notoken",
    email:email});

  return result.status == 200;
}

function simulateGoogleSignIn(subdomain, email, opt_browser) {
  var browser = opt_browser || new MockBrowser();
  var result = browser.get(_url(subdomain, "/ep/account/test/google-signin"), {email:email})
  return result.status == 200;
}



