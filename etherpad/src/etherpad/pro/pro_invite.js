import("execution");
import("sqlbase.sqlobj");
import("sqlbase.persistent_vars");
import("email.sendEmail");

import("etherpad.changes.follow.FOLLOW");
import("etherpad.changes.follow.getUserFollowPrefsForPad");
import("etherpad.globals");
import("etherpad.log");
import("stringutils");
import("stringutils.*");
import("etherpad.control.pad.pad_view_control.{getRevisionInfo,getPadSummaryHTML}");
import("etherpad.collab.collab_server");
import("etherpad.pad.exporthtml");
import("etherpad.pad.padutils");
import("etherpad.pad.model");
import("etherpad.pad.pad_access");
import("etherpad.pad.pad_security");
import("etherpad.pro.domains");
import("etherpad.pro.pro_apns");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.statistics.email_tracking");
import("etherpad.utils");
import("etherpad.utils.httpHost");
import("etherpad.utils.renderTemplateAsString");
import("etherpad.sessions.getSession");
import("cache_utils.syncedWithCache");


var REMINDER_DELAY = 1000*60*60*24; // one day

function notifyAdminsOfDomainGuestAccess(urlPrefix, padTitle, padId, invitingAccount, guestAccount) {
  var subj = 'Admin notification: Guest invited to edit \'' + padTitle + '\'';
  var padLink = urlPrefix +'/'+padId;
  var accountManagerLink = urlPrefix+'/ep/admin/account-manager/';

  var data = {
    invitingAccount: invitingAccount,
    guestAccount: guestAccount,
    padTitle: padTitle,
    padLink: padLink,
    accountManagerLink: accountManagerLink
  };

  _sendEmailToDomainAdmins('domain_guest_access.ejs', subj, data);
}

function notifyAdminsOfDomainMemberInvite(invitingAccount, newAccount) {
  var subj = 'Admin notification: New member invited to site';
  var accountManagerLink = utils.absoluteURL('/ep/admin/account-manager/',{});

  var data = {
    invitingAccount: invitingAccount,
    memberAccount: newAccount,
    accountManagerLink: accountManagerLink
  };

  _sendEmailToDomainAdmins('domain_member_access.ejs', subj, data);
}

function notifyAdminsOfDomainJoinRequest(existingAccountId) {
  var requestingAcct = pro_accounts.getAccountById(existingAccountId);
  var email = requestingAcct.email;

  var orgName = domains.getRequestDomainRecord().orgName;
  var subj = 'Admin notification: ' + email + ' requested to join ' + orgName + ' as a full member';

  var token = createJoinRequest({accountId: existingAccountId});
  var allowLink = utils.absoluteURL('/ep/admin/account-manager/accept-join-request', {token: token});

  var data = {
    allowLink: allowLink,
    email: email,
    orgName: orgName};
  _sendEmailToDomainAdmins('invite_request.ejs', subj, data);
}

function joinRequestForToken(token) {
  return sqlobj.selectSingle('site_join_requests', {token: token})
}

function createJoinRequest(oneOf) {
  var token = stringutils.randomString(20);

  sqlobj.insert('site_join_requests', {accountId: oneOf.accountId,
      domainId: domains.getRequestDomainId(),
      token: token,
  });
  return token;
}


function _sendEmailToDomainAdmins(templateFilename, subj, data) {
  var fromAddr = pro_utils.getEmailFromAddr();

  var admins = pro_accounts.listAllDomainAdmins(domains.getRequestDomainId());
  for (var i = 0; i < admins.length; i++) {
    var adminAcct = admins[i];

    data.account = adminAcct;
    var body = renderTemplateAsString('email/'+ templateFilename, data);

    try {
      sendEmail(adminAcct.email, fromAddr, subj, {}, body);
    } catch (ex) {
      log.logException(ex);
    }
  }
}

function invitedUserShouldBeGuest(globalPadId, toAddress) {
  var domainId = padutils.getDomainId(globalPadId);

  var isDomainGuest = true; // Domain guest by default
  if (pro_config.domainAllowsEmail(toAddress, domainId)) {
    isDomainGuest = false;
  }

  return isDomainGuest;
}

// This function does important checks like whether this new user should be a guest!
// inviting people in other ways (via facebook, for example) - skips these checkes
function inviteUserToPadByEmail(globalPadId, toAddress, scheme, host, invitingAccount) {
  if (toAddress.toLowerCase() != toAddress) {
    log.logException("Invite for non-normalized email address");
  }
  var padId = padutils.globalToLocalId(globalPadId);
  var domainId = padutils.getDomainId(globalPadId);

  var title = pro_padmeta.accessProPad(globalPadId, function(ppad) {
    return ppad.getDisplayTitle();
  });


  // find or create an account for this user
  var trackingId;
  var existingAccount = pro_accounts.getAccountByEmail(toAddress, domainId);
  if (!existingAccount) {
    var fullName = toAddress;

    // If the user is a google contact, try to get the fullname
    if (getSession().isGoogleConnected && getSessionProAccount()) {
      var googleContacts = google_account.contactsForAccount(getSessionProAccount());

      if (!googleContacts) {
        google_account.reloadGoogleContactsAsync(getSessionProAccount());
      } else {
        var googleContactName;
        for (var i = 0; !googleContactName && i<googleContacts.length; i++){
          var c = googleContacts[i];
          if (c[0]/*email*/ == toAddress){
            googleContactName = c[1]/*name*/;
          }
        }
        fullName = googleContactName || toAddress;
      }
    }

    var uid = pro_accounts.createNewAccount(domainId, fullName, toAddress, null, false, true, null /* fbid */, invitedUserShouldBeGuest(globalPadId, toAddress));
    existingAccount = pro_accounts.getAccountById(uid);

    log.custom("inviteemail", {toEmails: existingAccount.email, padId: padId, hostId:invitingAccount.id, newUser:true });

    if (!existingAccount) {
      response.setStatusCode(400);
      response.write("Failed to invite user");
      response.stop();
    }

    trackingId = email_tracking.trackEmailSent(toAddress, email_tracking.PAD_INVITE_NEW)

  } else {
    trackingId = email_tracking.trackEmailSent(toAddress, email_tracking.PAD_INVITE_EXISTING)
    log.custom("inviteemail", {toEmails: existingAccount.email, padId: padId, hostId:invitingAccount.id, newUser:false });
  }

  // generate edit link
  var inviteToken = stringutils.randomString(20);
  var subDomain = pro_utils.subDomainFromHostname(host);
  var editlink = utils.absolutePadURL(padId, {eid: trackingId, invitingId: invitingAccount.id, token: inviteToken,  email: toAddress}, subDomain, title);

  // get content for email
  var padContent = null;
  var revId = 0;
  model.accessPadGlobal(globalPadId, function(pad) {
    if (pad.exists()) {
      revId = pad.getHeadRevisionNumber()
      padContent = getPadSummaryHTML(pad);
    }
  }, "r");

  sendPadInviteEmail(existingAccount.email, pro_utils.getFullProDomain(), host, scheme, invitingAccount.fullName, padId, title, revId, editlink, padContent);

  var msg = invitingAccount.fullName + " invited you to " + (title == "Untitled" ? "a new Hackpad" : title);
  pro_apns.sendPushNotificationForPad(globalPadId, msg, existingAccount.id, pro_apns.APNS_HP_T_INVITE);

  // this marks the token as valid, so the next user who presents it gets access
  // associated with their account.
  pad_security.grantTokenAccessToPad(globalPadId, invitingAccount.id, inviteToken, existingAccount.id);

  // For convenience, grant the invited email address access to the pad as well.
  pad_security.grantUserIdAccessToPad(globalPadId, invitingAccount.id, existingAccount);

  // notify clients of new invited user
  collab_server.announceInvite(globalPadId,
   existingAccount.id, existingAccount.fullName, existingAccount.fbid);

  // notify admins of new guest access
  if (pro_accounts.getIsDomainGuest(existingAccount)) {
    var urlPrefix = scheme+'://'+host;
    notifyAdminsOfDomainGuestAccess(urlPrefix, title, padId, invitingAccount, existingAccount);
  }

  return existingAccount.id;
}


function sendPadInviteEmail(targetEmail, fullProDomain, host, scheme, invitingFullName, padId, title, revId, opt_editLink, opt_padContent, opt_MimeType) {
  opt_padContent = opt_padContent || "";
  opt_editLink = opt_editLink || (scheme+'://'+host+'/'+padId + "#" + title.replace(/ /g, '-'));
  opt_MimeType = opt_MimeType || "text/html; charset=utf-8";

  var fromAddr = pro_utils.getEmailFromAddr();
  var subj = invitingFullName + ' invited you to ' + (title != "Untitled" ? '\'' + title + '\'' : "a new hackpad!");
  var data = {
    optOuterStyling: "background-color: #e6e6e6;",
    name: "there",
    editLink: opt_editLink,
    title: title,
    padContent: opt_padContent
  };

  var inReplyToId = "<" + padId + "@" + fullProDomain + ">";
  var headers = { "In-Reply-To": inReplyToId };
  if (revId != undefined) {
    var referencesId = "<" + padId + '+' + revId + "@" + fullProDomain + ">";
    headers["References"] = referencesId;
  }

  log.custom("inviteemail", {toEmails: targetEmail, padId: padId, host: host, invitedBy: invitingFullName, editLink: opt_editLink });
  utils.sendHtmlTemplateEmail(targetEmail, subj, 'email/padinvite.ejs', data, fromAddr, headers);
}


