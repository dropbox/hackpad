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

import("jsutils.*");
import("cache_utils.syncedWithCache");
import("funhtml.*");
import("stringutils");
import("sqlbase.sqlobj");
import("email.sendEmail");
import("fastJSON");

import("stringutils.*");
import("sqlbase.sqlcommon");

import("etherpad.log");
import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.utils.*");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");

import("etherpad.control.pro_beta_control");
import("etherpad.control.pro.admin.account_manager_control");

import("etherpad.statistics.mixpanel");

import("etherpad.helpers");
import("etherpad.control.pro.admin.account_manager_control.sendWelcomeEmail");

function onRequest() {
  if (!getSession().ods) {
    getSession().ods = {};
    saveSession();
  }
  if (request.method == "POST") {
    // add params to cart
    eachProperty(request.params, function(k,v) {
      getSession().ods[k] = stringutils.toHTML(v);
    });
    saveSession();
  }
}

function _errorDiv() {
  var m = getSession().errorMessage;
  if (m) {
    delete getSession().errorMessage;
    saveSession();
    return DIV({className: 'err'}, m);
  }
  return "";
}

function _input(id, type) {
  return INPUT({type: type ? type : 'text', name: id, id: id,
                value: getSession().ods[id] || ""});
}

function _inf(id, label, type) {
  return DIV(
    DIV({style: "width: 100px; text-align: right; float: left; padding-top: 3px;"}, label, "  "),
    DIV({style: "text-align: left; float: left;"},
        _input(id, type)),
    DIV({style: "height: 6px; clear: both;"}, " "));
}

function render_main_get() {

  // observe activation code
  if (request.params.sc) {
    getSession().betaActivationCode = request.params.sc;
    saveSession();
    response.redirect(request.path);
  }

  // validate activation code
  var activationCode = getSession().betaActivationCode;
  var err = pro_beta_control.isValidCode(activationCode);
  if (err) {
    renderNoticeString(DIV({style: "border: 1px solid red; background: #fdd; font-weight: bold; padding: 1em;"},
      err));
    response.stop();
  }

  mixpanel.track('private-site-unknown-domain-ad');

  // serve activation page
  renderHtml('main/pro_signup_body.ejs', {
    subdomain: request.domain != pro_utils.getRequestSuperdomain() ? pro_utils.getProRequestSubdomain() : '',
    errorDiv: _errorDiv,
    input: _input,
    inf: _inf
  });

  return true;
}

function _err(m) {
  if (m) {
    getSession().errorMessage = m;
    saveSession();
    response.redirect(request.path);
  }
}

function render_request_both() {
  var email = requireEmailParam();

  if (!isValidEmail(email)) {
    renderFramedError("Invalid email address.");
    response.stop();
  }

  if (sqlobj.selectSingle('pro_beta_signups', {email: email})) {
    renderFramedError("Email already signed up.");
    response.stop();
  }

  var subject = 'Pro Invite request from ' + request.clientAddr +' / ' + email;

  // log feedback
  log.custom("proinvite", {
    globalPadId: null,
    userId: null,
    email: email,
    username: null});

  sendEmail(
    helpers.supportEmailAddress(),
    pro_utils.getEmailFromAddr(),
    subject,
    {},
    email
  );

  sqlobj.insert('pro_beta_signups', {
    email: email,
    isActivated: false,
    signupDate: new Date()
  });

  var html = renderTemplateAsString("pro/account/signed_out_modal.ejs", {});
  var html = '<div id="confirmation-dialog" class="modaldialog">' +
    '<div class="modaldialog-inner" style="min-height:100px">' +
    DIV(
      H1("Great! We'll be in touch."),
      P("In the meantime, you can check out the main site."), BR(),
      BUTTON({'class': 'hp-ui-button hp-ui-button-primary', onclick: "return modals.hideModal();"}, "Okay")) +
      '</div></div>';

  renderJSON({success:false, html:html});
  return true;
}

function render_main_post() {

  var subdomain = trim(String(request.params.subdomain).toLowerCase());
  var fullName = request.params.fullName;
  var allowDomain = request.params.allowDomain;
  var useDomain = request.params.useDomain;
  var email = requireEmailParam();
  var orgName = request.params.orgName;

  // validate activation code
  var activationCode = getSession().betaActivationCode;
  var err = pro_beta_control.isValidCode(activationCode);
  if (err) {
    resonse.write(err);
  }

  //---- basic validation ----
  if (subdomain.length < 2) {
    _err("Sitename must be at least 2 characters.");
  }
  if (!/^\w[\w\d\-]*$/.test(subdomain)) {
    _err("Invalid sitename: "+subdomain);
  }
  if (subdomain.length > 60) {
    _err("Sitename must be less than 60 characters.");
  }

  _err(pro_accounts.validateFullName(fullName));
  _err(pro_accounts.validateEmail(email));

  _err(function(allowDomain) {
    if (!useDomain) { return null; }
    if (allowDomain.length < 2) { return "Company email domain must be at least 2 characters."; }
    if (allowDomain.indexOf('.') < 0 ||
        allowDomain.indexOf('@') > -1 ||
        allowDomain.indexOf('/') > -1) { return "Invalid company email domain."; }
    return null;
  }(allowDomain));

  _err(orgName ? null : "Company name is required.");


  //---- database validation ----

  if (domains.doesSubdomainExist(subdomain)) {
    _err("The sitename "+subdomain+" is already in use.");
  }

  //---- looks good.  create records! ----

  // TODO: log a bunch of stuff, and request IP address, etc.

  var ok = false;
  var signinLink;
  sqlcommon.inTransaction(function() {

    // TODO: move validation code into domains.createNewSubdomain...
    var domainId = _tryCreateNewSubdomain(subdomain, orgName, _err);
    pro_config.setConfigVal("publicDomain", false, domainId);

    // TODO: validate email and full name
    var accountId = pro_accounts.createNewAccount(domainId, fullName, email, null/*password*/, true/*skipValidation*/, true/**/, null);

    var acct = pro_accounts.getAccountById(accountId);
    var tempPass = stringutils.randomString(10);
    pro_accounts.setTempPassword(acct, tempPass, true/*optForceCrossDomain*/);

    signinLink = pro_accounts.getTempSigninUrl(acct, tempPass, subdomain+"."+appjet.config['etherpad.canonicalDomain']);

    // send welcome email
    syncedWithCache('pro-activations', function(c) {
      c[domainId] = true;
    });
    ok = true;
    if (activationCode) {
      pro_beta_control.notifyActivated(activationCode);
    }
    if (allowDomain) {
      pro_config.setConfigVal("allowDomain", allowDomain, domainId);
    }

  });

  if (ok) {
    mixpanel.track('site-created');
    response.redirect('http://'+subdomain+"."+appjet.config['etherpad.canonicalDomain']+'/ep/finish-activation');
  } else {
    response.write("There was an error processing your request.");
  }
}

function _tryCreateNewSubdomain(subdomain, orgName, errFn) {
  var domainId = null;
  try {
    // Throws an exception if the subdomain already exists and is active
    domainId = domains.createNewSubdomain(subdomain, orgName);
    // Going forward, we support facebook sign in on private domains by default
    pro_config.setConfigVal("allowFacebookSignin", true, domainId);
  } catch(e) {
    log.logException(e);
    if (errFn) {
      errFn("The sitename "+subdomain+" is already in use.");
    }
    throw e;
  }

  return domainId;
}

function render_ajax_post() {
  var orgName = trim(request.params.name.toLowerCase());
  var subdomain = trim(request.params.shortname.toLowerCase());
  var permission = requireParam("permission");
  var allowAllFromDomain = (request.params.allowAllFromDomain == "true");
  var emailInvites = request.params["emailInvites[]"] || [];
  if (typeof(emailInvites) == "string") {
    emailInvites = [emailInvites];
  }

  pro_accounts.requireAccount("Sign in to create a new Hackpad Space.");

  // validate activation code
  var activationCode = getSession().betaActivationCode;
  var err = pro_beta_control.isValidCode(activationCode);
  if (err) {
    resonse.write(err);
  }

  function _err(m) {
    if (m) {
      renderJSON({success: false, error: m});
      response.stop();
    }
  }

  //---- basic validation ----
  if (orgName.length < 2) {
    _err("Site Name must be at least 2 characters.");
  }
  if (subdomain.length < 2) {
    _err("Sitename must be at least 2 characters.");
  }
  if (!/^\w[\w\d\-]*$/.test(subdomain)) {
    _err("Invalid sitename: "+subdomain);
  }
  if (subdomain.length > 60) {
    _err("Sitename must be less than 60 characters.");
  }
  emailInvites.forEach(function(email) {
    _err(pro_accounts.validateEmail(email));
  });

  //---- database validation ----

  if (domains.doesSubdomainExist(subdomain)) {
    _err("Sitename "+subdomain+" is already in use.");
  }

  //---- looks good.  create records! ----

  // TODO: log a bunch of stuff, and request IP address, etc.

  var ok = false;
  var signinLink;
  var domainId;
  sqlcommon.inTransaction(function() {
    mixpanel.track("newsite.finished", {});
    domainId = _tryCreateNewSubdomain(subdomain, orgName, _err);

    //pro_config.setConfigVal("allowFacebookSignin", permission == "public", domainId);
    pro_config.setConfigVal("publicDomain", permission == "public", domainId);

    var accountId = pro_accounts.createLinkedAccount(pro_accounts.getSessionProAccount().id, domainId, true /*isAdmin*/, false /*isGuest*/);

    var tempPass = stringutils.randomString(10);
    var acct = pro_accounts.getAccountById(accountId);
    pro_accounts.setTempPassword(acct, tempPass, true/*optForceCrossDomain*/);

    signinLink = pro_accounts.getTempSigninUrl(acct, tempPass, subdomain+"."+appjet.config['etherpad.canonicalDomain']);

    // send welcome email
    syncedWithCache('pro-activations', function(c) {
      c[domainId] = true;
    });
    ok = true;
    if (activationCode) {
      pro_beta_control.notifyActivated(activationCode);
    }
  });

  // Invite new members!
  var errors = [];
  for (var i=0; i<emailInvites.length; i++) {
    var email = emailInvites[i];
    if (!email) {
      continue;
    }
    try {
      tempPass = stringutils.randomString(8);
      pro_accounts.createNewAccount(domainId, email, email, tempPass, false/*isAdmin*/, false, null/*fbid*/, false/*isDomainGuest*/);
    } catch (ex) {
      if (ex instanceof ValidationError) {
        errors.push(ex.message);
      } else {
        errors.push(ex.message);
        log.logException(ex);
      }
    }

    var account = pro_accounts.getAccountByEmail(email, domainId);
    pro_accounts.setTempPassword(account, tempPass, true /*optForceCrossDomain*/);
    sendWelcomeEmail(account, tempPass);
  }

  if (allowAllFromDomain) {
    pro_config.setConfigVal("allowDomain", pro_accounts.getSessionProAccount().email.split("@")[1], domainId);
  }

  if (ok) {
    getSession().newSiteData = {};

    return renderJSON({success: true,
      newSite: signinLink,
      html: stringutils.toHTML(
      DIV({style: "font-size: 16pt; border: 1px solid green; background: #eeffee; padding: 1em; text-align: center;",
           className: "modaldialog", id: 'sitecreate-success'},
        P("Success!  Your new site is almost ready to go."),
        A({href: signinLink,
           className: "hp-ui-button hp-ui-button-primary" },
          "Go to " + subdomain+"."+appjet.config['etherpad.canonicalDomain']))) });
  } else {
    _err("There was an error processing your request.");
  }
}


