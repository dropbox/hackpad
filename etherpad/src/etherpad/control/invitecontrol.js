import("crypto");
import("sqlbase.sqlobj");
import("stringutils");
import("underscore._");
import("jsutils.{uniqueBy,keys,sortBy,reverseSortBy}");

import("etherpad.control.pad.pad_control");
import("etherpad.helpers");
import("etherpad.log");
import("etherpad.sessions.getSession");
import("etherpad.pad.padutils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_invite");
import("etherpad.pro.pro_friends");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_padmeta");
import("etherpad.control.pro.admin.account_manager_control.sendWelcomeEmail");
import("etherpad.control.pro.account_control");
import("etherpad.statistics.mixpanel");
import("cache_utils.syncedWithCache");
import("etherpad.utils.*");
import("jsutils");
import("etherpad.utils");

var INVITE_BLACKLIST_DOMAINS = ['reply.github.com', 'sale.craigslist.org'];

function ContactList () {
  this.list = [];
  this.emailToContact = {};
  this.fbidToContact = {};
  this.addContact = function (name, email, hackpadUserId, fbid, lastLoginDate) {
    var uniqueId = name + "::" + email + "::" + hackpadUserId;
    var ts = lastLoginDate ? lastLoginDate.getTime() : null;
    var contact = {name: name, email: email, hackpadUserId: hackpadUserId, fbid: fbid, uniqueId: uniqueId, lastLoginDate: ts};
    this.list.push(contact);

    if (contact.email) {
      this.emailToContact[contact.email] = contact;
    }
    if (contact.fbid) {
      this.fbidToContact[contact.fbid] = contact;
    }
  }

  this.indexOfContact = function (contact){
    var contactIndex = -1;
    for (var i = 0; contactIndex < 0 && i<this.list.length; i++) {
      var c = this.list[i];
      if (c.email == contact.email &&
        c.name == contact.name &&
        c.hackpadUserId == contact.hackpadUserId) {
        contactIndex = i;
      }
    }
    return contactIndex;
  }
}

/* given a request like ?q=al&limit=10 returns up to 10
facebook friends of the current user which have "al" in their name*/
function autocompleteContacts(query, padId, opts) {
  // escape for regexp matching. see http://simonwillison.net/2006/Jan/20/escape/
  var lowercaseQuery = _quoteRegularExpression(query.toLowerCase());
  var contacts = new ContactList();
  var options = _.extend({}, opts);
  var padIsPrivate;

  // We are fetching the users related to a specific pad
  if (padId) {
    var creatorId;
    var editorIds;

    pro_padmeta.accessProPadLocal(padId, function(propad) {
      if (propad.exists()) {
        creatorId = propad.getCreatorId();
        editorIds = propad.getEditors();
      }
    });

    padutils.accessPadLocal(padId, function(pad) {
      updateWithUsersWithPadAccess(contacts, lowercaseQuery, pad, creatorId, editorIds);
      padIsPrivate = pad.getGuestPolicy() == "deny";
    });
  }

  // If we're autocompleting in an atless context on an invite only pad, don't
  // autocomplete contacts that don't already have access
  if (!(padIsPrivate && options.isAtless)) {
    if (options.isMention && options.siteMembersOnly && options.domainId) {
      // Autocomplete only on members of a site.
      updateWithSiteMembers(contacts, lowercaseQuery, options.domainId);
    } else {
      // add hp contacts
      if (!options.emailOnly) {
        updateWithHackpadContacts(contacts, lowercaseQuery);
      }

      /*
       * If the session came from an API call rather than Google or Facebook sign in,
       * these will be empty.
       *
       * FIXME: Verify the tokens are still valid?
       */
      // add google contacts
      if (!options.isAtless && getSession().isGoogleConnected) {
        updateWithGoogleContacts(contacts, lowercaseQuery);
      }

    }
  }

  // Display order is: hp users (alphabetized), gmail & fb (alphabetized)
  contacts.list = uniqueBy(contacts.list, 'uniqueId');

  contacts.list.sort(function (a, b) {
    if (a.hackpadUserId || b.hackpadUserId) {
      if (!b.hackpadUserId) {
        return -1;
      }
      if (!a.hackpadUserId) {
        return 1;
      }
    }

    if (a.lastLoginDate || b.lastLoginDate){
      if (!b.lastLoginDate){
        return -1;
      }
      if (!a.lastLoginDate){
        return 1;
      }
      if (a.lastLoginDate > b.lastLoginDate){
        return -1;
      }
      if (a.lastLoginDate < b.lastLoginDate){
        return 1;
      }
    }

    var aDisplayName = a.name || a.email;
    var bDisplayName = b.name || b.email;
    return aDisplayName.localeCompare(bDisplayName);
  });

  // add self or move self to front if already there
  var me = getSessionProAccount();
  if (!options.emailOnly && _hackpadUserMatchesQuery(me, lowercaseQuery)) {
    var meContact = {
      name: me.fullName,
      email: me.email,
      hackpadUserId: me.id,
      lastLoginDate: me.lastLoginDate
    };
    var index = contacts.indexOfContact(meContact);
    if (index > -1) {
      meContact = contacts.list.splice(index, 1)[0];
    }
    contacts.list.unshift(meContact);
  }
  return contacts;
}

function _hackpadUserMatchesQuery(u, lowercaseQuery) {
  return lowercaseQuery == '' || u.fullName.toLowerCase().search("\\b" + lowercaseQuery) >= 0 ||
        u.email.toLowerCase().search(lowercaseQuery) >= 0;
}

// The following users are added here:
// 1. Invitees
// 2. Followers
// 3. Creator
// 4. Editors
function updateWithUsersWithPadAccess(contacts, lowercaseQuery, pad, creatorId, editorIds) {
  var userIdsWithStatus = pad_control.getUserIdsWithStatusForPad(pad, creatorId, 1000/*optLimit*/);

  editorIds && editorIds.forEach(function(editorId) {
    if (!userIdsWithStatus[editorId]) {
      userIdsWithStatus[editorId] = "editor";
    }
  });

  var userIds = keys(userIdsWithStatus);

  updateWithUserIds(contacts, lowercaseQuery, userIds);
}

function updateWithHackpadContacts(contacts, lowercaseQuery) {
  var userIds = pro_accounts.getLoggedInUserFriendIds();
  updateWithUserIds(contacts, lowercaseQuery, userIds);
}

function updateWithSiteMembers(contacts, lowercaseQuery, domainId) {
  var siteMembers = pro_accounts.listAllDomainAccounts(domainId);
  siteMembers = siteMembers.filter(
      function(a) { return !pro_accounts.getIsDomainGuest(a); } // no guests
    );

  updateWithUserAccounts(contacts, lowercaseQuery, siteMembers);
}

function updateWithUserIds(contacts, lowercaseQuery, userIds) {
  var userAccounts = pro_accounts.getAccountsByIds(userIds, true/*skipDeleted*/);
  updateWithUserAccounts(contacts, lowercaseQuery, userAccounts);
}

function updateWithUserAccounts(contacts, lowercaseQuery, userAccounts){
  if (!userAccounts) {
    return;
  }
  var userIdsWithKnownEmails = pro_friends.getFriendsInvitedByMeUserIds(getSessionProAccount().id);

  for (var i=0; i<userAccounts.length; i++) {
    var u = userAccounts[i];
    if (u.email.indexOf("virtual.facebook") != -1) {
      // don't let us invite by email people who we don't have email addys for
      // these are folks we or someone else invited via facebook but who haven't signed in
      continue;
    }

    if (_hackpadUserMatchesQuery(u, lowercaseQuery)) {
      contacts.addContact(u.fullName, u.email, u.id, u.fbid, u.lastLoginDate);
      if (userIdsWithKnownEmails.indexOf(u.id) > -1) {
        contacts.emailToContact[u.email].visibleEmail = u.email;
      }
    }
  }
}


function updateWithFacebookContacts(contacts, lowercaseQuery) {

  var fbUserId = getSession().facebookInfo.user.id;
  var fbToken = getSession().facebookInfo.accessToken;
  var friends = pro_facebook.getFacebookFriends(fbUserId, fbToken);

  for (var i in friends) {
    if (!friends[i]['name']) {
      // fix live exception (i guess it's a privacy setting?)
      continue;
    }

    if (friends[i]['name'].toLowerCase().search("\\b"+lowercaseQuery) >= 0) {
      if (contacts.fbidToContact[friends[i].id]  > -1) {
        continue; // we've already included this contact
      } else {
        contacts.addContact(friends[i]['name'], null, null/*hackpadUserId*/,  friends[i].id /*fbid*/);
      }
    }
  }

}

function updateWithGoogleContacts(contacts, lowercaseQuery) {
  var googleContacts = google_account.contactsForAccount(getSessionProAccount());

  if (!googleContacts) {
    google_account.reloadGoogleContactsAsync(getSessionProAccount());
    return;
  }

  for (var i=0; i<googleContacts.length; i++) {
    var email = googleContacts[i][0];
    var name = googleContacts[i][1];

    // remember that we know the email of this contact
    if (email in contacts.emailToContact) {
      contacts.emailToContact[email].visibleEmail = email;
      continue;
    }

    // skip certain auto-generated addresses in the address book
    var emailDomain = email.toLowerCase().split("@")[1];
    if (INVITE_BLACKLIST_DOMAINS.indexOf(emailDomain) > -1) { continue;}

    // XXX: only match on word start, not middle of email addresses
    if (email.toLowerCase().search(lowercaseQuery) >= 0 ||
        (name && name.toLowerCase().search("\\b"+lowercaseQuery) >= 0)) {
      contacts.addContact(name, email, null /*hackpadUserId*/);
      // Not all google contacts have email addresses
      if (email){
        var contact = contacts.emailToContact[email];
        if (contact) {
          contact.visibleEmail = email;
        }
      }
    }
  }
}

function render_autocomplete_get() {
  if (!request.params.q || !request.params.q.length) {
    return;
  }

  // pop up a dialog if the user is logged out
  if (!getSessionProAccount()) {
    var html = renderTemplateAsString("pro/account/signed_out_modal.ejs", {});
    renderJSON({success:false, html:html});
    response.stop();
  }

  var options = {
    emailOnly: request.params.emailonly,
    excludeFacebook: request.params.excludefacebook,
    isAtless: request.params.isatless == 'true',
    isMention: request.params.ismention
  };

  if (!domains.isPrimaryDomainRequest()){
    var domainId = domains.getRequestDomainId();
    options.siteMembersOnly = true;
    options.domainId = domainId;
  }

  var contacts = autocompleteContacts(request.params.q, request.params.padid, options);

  var userlink = request.params.userlink;
  var limit = request.params.limit;

  var list = [];
  for (var i=0; i<contacts.list.length; i++) {
    var c = contacts.list[i];
    if (c.hackpadUserId) {
      var displayName = helpers.escapeHtml(c.name);
      if (c.visibleEmail) {
        displayName = helpers.escapeHtml(c.name) + " <span class='email'>" + helpers.escapeHtml(c.visibleEmail) + "</span>"
      }
      list.push([displayName, (userlink ? pro_accounts.getUserLinkById(c.hackpadUserId) : c.hackpadUserId), 'hp', c.lastLoginDate].join("|"));
    } else if (c.visibleEmail) {
      var displayName = helpers.escapeHtml(c.name) + " <span class='email'>" + helpers.escapeHtml(c.visibleEmail) + "</span>"
      list.push([displayName, c.email, 'email', c.lastLoginDate].join("|"));
    } else if (c.fbid) {
      list.push([helpers.escapeHtml(c.name), c.fbid, 'fb', c.lastLoginDate].join("|"));
    } else {
      log.warn("Contact " + (c.name||"") + " (" + (c.email||"") +") has no visible email or fbid");
    }
    if (list.length == limit) {
      break;
    }
  }

  return renderJSON({success:true, data:list.join("\n")});
}


function render_invite_post() {
  var email = requireEmailParam();
  var fullName = request.params.fullName || email; // optional

  var isAdmin = getSessionProAccount() && getSessionProAccount().isAdmin;
  var isGuest = getSessionProAccount() && pro_accounts.getIsDomainGuest(getSessionProAccount());
  var isPrivateDomain = (!domains.isPrimaryDomainRequest()) && (!domains.isPublicDomain());
  if (isPrivateDomain && isGuest) {
    return render401("Unauthorized");
  }

  tempPass = stringutils.randomString(20);

  var existingAccount = pro_accounts.getAccountByEmail(email, null);
  if (existingAccount) {
    return renderJSON({success: false, message: "There is already an account with that email address."});
  }
  try {
    pro_accounts.createNewAccount(null, fullName, email, tempPass, false/*isAdmin*/, false, null/*fbid*/, false/*isDomainGuest*/);
  } catch (ex) {
    if (ex instanceof ValidationError) {
      return renderJSON({success: false, message: ex.message});
    } else {
      throw ex;
    }
  }
  mixpanel.track("invite-member", { invitingIsAdmin: isAdmin });

  var account = pro_accounts.getAccountByEmail(email, null);
  pro_accounts.setTempPassword(account, tempPass);

  // If the inviting account is a regular member, inform the site admins of the invitation
  if (!isAdmin) {
    var invitingAccount = getSessionProAccount();
    pro_invite.notifyAdminsOfDomainMemberInvite(invitingAccount, account);
  }

  sendWelcomeEmail(account, tempPass);

  renderJSON({success: true, message: fullName + " has been invited to this hackpad site."});
}

// TODO: remove on next restart
function _quoteRegularExpression(str) {
    return (str+'').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
}

function _getGroupsCurrentUserCanAccess() {
  var groupIds = pro_groups.getUserGroupIds(getSessionProAccount().id);
  if (!domains.isPrimaryDomainRequest()) {
    groupIds = groupIds.concat(
      pro_groups.getDomainPublicGroupIds(domains.getRequestDomainId())
        .filter(function(gid) { return groupIds.indexOf(gid) == -1; })
        .filter(pro_groups.currentUserHasAccess));
  }
  return groupIds;
}

function _excludeGroupIds(groupIds, encryptedExcludeIds) {
  var excludeGroups = {};
  encryptedExcludeIds.forEach(function(encryptedId) {
    var groupId = pro_groups.getGroupIdByEncryptedId(encryptedId);
    excludeGroups[groupId] = true;
  });
  return groupIds.filter(function(gid) {
    return !excludeGroups[gid];
  })
}

function render_recent_groups_get() {
  if (!getSessionProAccount()) {
    return renderJSONError(401, "Access Denied");
  }
  var encryptedExcludeIds = (request.params.excludeIds || "").split(",");
  var groupIds = _getGroupsCurrentUserCanAccess() || [];

  groupIds = _excludeGroupIds(groupIds, encryptedExcludeIds);
  groups = groupIds.map(function(groupId) {
    var group = {
      groupId: pro_groups.getEncryptedGroupId(groupId),
      name: pro_groups.getGroupName(groupId),
      // Date object converted to MS timestamp for JSON serialiazability
      timestamp: +pro_groups.getLastTimestampForGroup(groupId)
    }

    return group;
  });

  reverseSortBy(groups, "timestamp");

  if (groups.length > 3) {
    var mostRecentGroups = groups.splice(0,3);

    sortBy(groups, "name", true /* ignoreCase */);

    groups = mostRecentGroups.concat(groups);

    // Show at most 10 groups
    groups = groups.splice(0, 10);
  }

  var html = renderPartialAsString('pad/_recentCollections.ejs', 'recentCollections', {
    collections: groups
  });

  return renderJSON({success:true, html:html});
}

function render_request_to_join_get() {
  var uid = requireParam('uid');
  var domainId = requireParam('domainId');

  if (!crypto.isValidSignedRequest(request.params, request.params.sig, 1000*60*10/*10 minute expiration*/)) {
    response.redirect('/ep/account/sign-in');
  }
  if (domains.getRequestDomainId() != domainId) {
    response.redirect('/ep/account/sign-in');
  }

  pro_invite.notifyAdminsOfDomainJoinRequest(uid);

  account_control.setSigninNotice("We've sent your request along.  We'll let you know as soon as you have been added.");

  renderNoticeString("<div style='margin-top:30px; text-align:center;'>Request sent!</div> <div style='font-size:20px; margin-top:40px; margin-bottom:80px; text-align:center;'>  <a href='/'> Head back to the homepage</a>.</div>");
  response.stop();
}

/* search the list of the user's groups for autocomplete */
function render_group_autocomplete_get() {
  // pop up a dialog if the user is logged out
  if (!pro_accounts.getSessionProAccount()) {
    var html = renderTemplateAsString("pro/account/signed_out_modal.ejs", {});
    renderJSON({success:false, html:html});
    response.stop();
  }

  if (!request.params.q || !request.params.q.length) {
    return;
  }

  var encryptedExcludeIds = (request.params.excludeIds || "").split(",");
  var lowercaseQuery = _quoteRegularExpression(request.params.q.toLowerCase());
  var hplist = [];

  // search the collections
  var groupIds = _getGroupsCurrentUserCanAccess();
  groupIds = _excludeGroupIds(groupIds, encryptedExcludeIds);
  var groupInfoForId = jsutils.dictByProperty(pro_groups.getGroupInfos(groupIds), 'groupId');

  for (var i in groupIds) {
    var gname = groupInfoForId[groupIds[i]].name;
    if (gname && gname.toLowerCase().search("\\b"+lowercaseQuery) >= 0) {
      gname = helpers.escapeHtml(gname);
      var gcnt = pro_groups.getGroupPadIds(groupIds[i]).length;
      hplist.push(gname + ' <span style="color: grey;">(' + gcnt + ')</span>|' + pro_groups.getEncryptedGroupId(groupIds[i]) + '|hpgroup');
    }
  }

  // Sort by display name
  hplist.sort();

  renderJSON({success:true, data:hplist.join("\n")});
  return true;
}

function stringToPrefix(fullname, length){
  var length;
  if (length == undefined){
    var length = 4;
  }
  if (!fullname || fullname.length < length) {
    return null;
  }

  var prefix = fullname.substr(0, 1).toUpperCase() + fullname.substr(1).toLowerCase();
  if (fullname.length > length){
    prefix = prefix.substr(0,length);
  }

  // if the fullname has spaces we don't want to include those in the prefix
  // We will never see ace trigger a link including a space because it uses whitespace
  // bound string to initiate an atlink.
  prefix = prefix.split(' ')[0];
  return prefix;
}

function buildPrefixDict(contacts){
  var prefixes = {};
  if (contacts && contacts.length) {
    var nonHackpadPrefixCount = 0;
    for (var i = 0; i<contacts.length && nonHackpadPrefixCount < 1000; i++) {
      var c = contacts[i];
      var fullname = c['name'];
      var prefix = stringToPrefix(fullname);
      if (prefix && prefix.length) {
        if (!prefixes[prefix] && !c['hackpadUserId']){
          nonHackpadPrefixCount++;
        }
        prefixes[prefix] = true;
      }
    }
  }
  return prefixes;
}

function render_prefixes_get() {
  if (!getSessionProAccount()) {
    return renderJSONError(401, "Access Denied");
  }

  var options = {
    excludeFacebook: request.params.excludefacebook,
    emailOnly: request.params.emailonly
  };

  var contacts = autocompleteContacts("" /* query */, request.params.padid, options);
  var prefixDict = buildPrefixDict(contacts.list);

  renderJSON({success:true, data: prefixDict})
  return true;
}

function render_download_get() {
  var userlink = request.params.userlink;
  var hplist = [];
  var list = [];
  var hpemails = {};

  if (!pro_accounts.getSessionProAccount()) {
    return renderJSONError(401, "Access Denied");
  }

  // just download HP users for now
  var friendIds = pro_accounts.getLoggedInUserFriendIds();
  var friendAccounts = pro_accounts.getAccountsByIds(friendIds, true/*skipDeleted*/);

  // add myself to the list of my own friends so I can assign to myself
  if (getSessionProAccount()) {
    friendAccounts.push(getSessionProAccount());
  }

  friendAccounts.forEach(function(u) {
    if (u /*&& u.lastLoginDate*/) {
      hpemails[u.email.toLowerCase()] = 1;
      hplist.push(u.fullName + '|' + (userlink ? pro_accounts.getUserLinkById(u.id) : u.id) + '|hp');
    }
  });

  // gmail addresses
  // maybe if there's less than N contacts, we'll just ship em all..
  if (getSession().isGoogleConnected && getSessionProAccount()) {
    var googleContacts = google_account.contactsForAccount(getSessionProAccount());

    if (!googleContacts) {
      google_account.reloadGoogleContactsAsync(getSessionProAccount());
    } else {
      for (var i=0; i<googleContacts.length; i++) {
        var email = googleContacts[i][0];
        var name = googleContacts[i][1];

        if (hpemails[email]) { continue; }

        var emailDomain = email.toLowerCase().split("@")[1];
        if (INVITE_BLACKLIST_DOMAINS.indexOf(emailDomain) > -1) { continue;}

        var displayName = email;
        if (name) {
          displayName = name + " <span class='email'>" + email + "</span>";
        }
        list.push(displayName + '|' + email + '|email');
      }
    }
  }

  // Sort by display name
  hplist.sort();
  list.sort();

  renderJSON({success:true, data:[].concat(hplist, list).join("\n")});
  return true;
}
