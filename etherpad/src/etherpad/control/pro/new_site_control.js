/*
    Server-side control for creating a new site.
    Date: 08/15/13
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
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.statistics.mixpanel");

import("etherpad.control.pro_beta_control");
import("etherpad.control.pro.admin.account_manager_control");

import("etherpad.helpers");

function render_main_get() {
  pro_accounts.requireAccount("Sign in to create a new Hackpad Space.");

  var newSiteData = getSession().newSiteData || {};
  // TODO: Replace this data with real data from the backend
  newSiteData.userData = {};
  getSession().newSiteData = newSiteData;
  saveSession();
  mixpanel.track("newsite.init", {});
  renderHtml('main/new_site_form.ejs', { newSiteData: newSiteData });
  return true;
}

// Step 1 form post via AJAX
function render_step1Post_post() {
  var siteName = request.params.name;
  var shortName = request.params.shortname;
  var permission = request.params.permission;
  var newSiteData = getSession().newSiteData || {};
  newSiteData.name = siteName;
  newSiteData.shortName = shortName;
  newSiteData.permission = permission;
  // set default email message for mailing lists
  if (!newSiteData.defaultWelcomeEmailSubject) {
    newSiteData.defaultWelcomeEmailSubject = getSessionProAccount().fullName;
    newSiteData.defaultWelcomeEmailSubject += " invited you to " + newSiteData.shortName + ".hackpad.com";
  }
  if (!newSiteData.defaultWelcomeEmailBody) {
    newSiteData.defaultWelcomeEmailBody = "Come and hack with me: https://" + newSiteData.shortName + ".hackpad.com/\n\n";
    newSiteData.defaultWelcomeEmailBody += "Hackpad is a collaborative editing tool that allows us all to work on the same document together in real time.\n\n";
    newSiteData.defaultWelcomeEmailBody += "You can create new documents, and they will be automatically shared with members of the site."
  }
  emailDomain = getSessionProAccount().email.split("@")[1];
  if (!(emailDomain in pro_config.BLACKLIST_ALLOW_DOMAINS)) {
    newSiteData.domain = emailDomain;
  } else {
    delete newSiteData.domain;
  }

  getSession().newSiteData = newSiteData;
  saveSession();
  mixpanel.track("newsite.step2", {});
  renderJSON({ success: true, newSiteData: newSiteData });
  return true;
}

// Step 2 form post via AJAX
function render_step2Post_post() {
  var allowAllFromDomain = request.params.allowAllFromDomain;
  var emailInvites = request.params["emailInvites[]"];
  var notificationAddress = request.params.notificationAddress;
  var newSiteData = getSession().newSiteData;
  newSiteData.allowAllFromDomain = allowAllFromDomain;
  newSiteData.notificationAddress = notificationAddress;
  newSiteData.emailInvites = emailInvites;
  //log.custom("jules", JSON.stringify(request.params));
  getSession().newSiteData = newSiteData;
  saveSession();
  renderJSON({ success: true });
  return true;
}

// Cancel the flow
function render_cancel_get() {
  getSession().newSiteData = null;
  saveSession();
  response.redirect('/');
}

// WELCOME EMAIL RENDERING
// render the welcome email partial
function render_welcome_email_partial_get() {
  var newSiteData = getSession().newSiteData;
  return renderPartial('main/_welcome_email_modal.ejs', 'welcomeEmail',
      { newSiteData: newSiteData});
}
// Save the welcome email that the user posted via AJAX
function render_welcome_email_post() {
  var newSiteData = getSession().newSiteData;
  newSiteData.welcomeEmailSubject = request.params.subject;
  newSiteData.welcomeEmailBody = request.params.body;
  // log.custom("jules", JSON.stringify(newSiteData));
  saveSession();
}


// This is to be called through an AJAX query once the initial new
// site form passes validation
function render_invite_get() {
  var newSiteData = getSession().newSiteData;
  if (!newSiteData) {
    response.redirect('/ep/new-site');
    return true;
  }
  renderHtml('main/new_site_invite_form.ejs', { newSiteData: newSiteData });
  return true;
}

function _err(m) {
  if (m) {
    getSession().errorMessage = m;
    saveSession();
    response.redirect(request.path);
  }
}
