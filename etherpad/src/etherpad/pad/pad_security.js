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

import("stringutils");
import("jsutils.{uniqueNumbers,keys,extend,arrayToSet}");
import("cache_utils.syncedWithCache");

import("etherpad.log");
import("etherpad.utils");

import("etherpad.sessions.getSession");
import("etherpad.sessions");

import("etherpad.collab.collab_server");

import("etherpad.changes.follow");
import("etherpad.pad.model");
import("etherpad.pad.pad_access");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_friends");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_facebook.{isFriendOfId,getFacebookGroups}");
import("etherpad.pro.pro_utils.isProDomainRequest");

import("etherpad.control.pro.access_request_control");

import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

//--------------------------------------------------------------------------------
// grant a user access to pad
// todo: should the actual db-access live in pro/ ?
//--------------------------------------------------------------------------------

function grantUserIdAccessToPad(globalPadId, hostUserId, targetUser) {
  pad_access.grantUserIdAccess(globalPadId, targetUser.id, hostUserId);
}

function grantTokenAccessToPad(globalPadId, hostUserId, inviteToken, userId) {
  pad_access.grantTokenAccess(globalPadId, hostUserId, inviteToken, userId);
}

function maybeGrantUserAccessToPad(globalPadId, hostUserId, targetUser, inviteToken) {
  // Sometimes, we should grant a user access to a pad if they have the valid inviteToken.
  if (_isValidInviteToken(globalPadId, inviteToken)) {
    // give this userID access
    pad_access.grantUserIdAccess(globalPadId, targetUser.id, hostUserId);
    // revoke the token so that it can't be reused
    pad_access.revokeTokenAccess(globalPadId, hostUserId, inviteToken, targetUser.id);
  } else {
    log.warn('Invalid invite token: '+inviteToken+' for globalPadId '+globalPadId);
  }
}

function copyAccessFromPadToPad(sourcePadId, targetPadId, hostUserId) {
  pad_access.copyAccessFromPadToPad(sourcePadId, targetPadId, hostUserId);
}


function _isValidInviteToken(globalPadId, inviteToken) {
  return inviteToken && pad_access.canTokenAccess(globalPadId, inviteToken);
}

function isInviteTokenValidForUserId(inviteToken, userId) {
  // We currently only use this to grant an unregistered user an account without
  // email verification if they have a valid invite token to a pad.
  return inviteToken && pad_access.getTokensForUserId(userId).indexOf(inviteToken) > -1;
}

function grantGroupAccessToPad(globalPadId, hostUserId, targetGroupId) {
  pad_access.grantGroupIdAccess(globalPadId, targetGroupId, hostUserId);
}

function doesUserHaveAccessToPad(globalPadId, userId) {
  var canAccess = pad_access.canUserIdAccess(globalPadId, userId);
  if (canAccess != undefined) { return canAccess; }

  return false;
}

function getAllUserIdsWithAccessToPad(globalPadId) {
  var user_ids = pad_access.getUserIdsWithAccess(globalPadId);

  return user_ids;
}

function getInvitedUsers(globalPadId) {
  var invitees = pad_access.getUserIdsWithAccess(globalPadId);
  invitees.concat(getInvitedGroupUsers(globalPadId));
  return uniqueNumbers(invitees);
}

function getInvitedUsersWhoAccessedPad(globalPadId) {
  var invitees = pad_access.getUserIdsWhoAccessed(globalPadId);
  invitees.concat(getInvitedGroupUsers(globalPadId));
  return uniqueNumbers(invitees);
}

function getInvitedGroupUsers(globalPadId) {
  // we don't now if they've viewed but it's the best we can do
  var invitees = [];
  var invitedGroups = pro_groups.getPadGroupIds(globalPadId);
  for (var i=0; i<invitedGroups.length; i++) {
    invitees = invitees.concat(pro_groups.getGroupMemberIds(invitedGroups[i]));
  }
  return invitees;
}



function ensureUserHasAccessToPad(globalPadId, acct, hostUserId) {
  if (!(doesUserHaveAccessToPad(globalPadId, acct.id))) {
    grantUserIdAccessToPad(globalPadId, hostUserId, acct);
    collab_server.announceInvite(globalPadId, acct.id, acct.fullName, acct.fbid);
  }
}

//--------------------------------------------------------------------------------
// granting session permanent access to pads (for the session)
//--------------------------------------------------------------------------------

function _grantSessionAccessTo(globalPadId) {
  var userId = padusers.getUserId();
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    c[userId] = true;
  });
}

function _doesSessionHaveAccessTo(globalPadId) {
  var userId = padusers.getUserId();
  return syncedWithCache("pad-auth."+globalPadId, function(c) {
    return c[userId];
  });
}

function clearPadUserAccessCache(globalPadId) {
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    for (var k in c) {
      log.warn('removing from cache: '+c[k]);
      delete c[k];
    }
  });
}

function revokePadUserAccess(globalPadId, userId, hostUserId) {
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    delete c[userId];
    if (hostUserId) {
      pad_access.revokeTokensForUserId(globalPadId, padusers.getAccountIdForProAuthor(userId),
        padusers.getAccountIdForProAuthor(hostUserId));
      pad_access.revokeUserIdAccess(globalPadId, padusers.getAccountIdForProAuthor(userId),
        padusers.getAccountIdForProAuthor(hostUserId));
      follow.killUserFollowPrefForPad(globalPadId, padusers.getAccountIdForProAuthor(userId));
    }
  });
}

function revokeAllPadAccess(globalPadId, hostUserId) {
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    for (var k in c) {
      delete c[k];
      if (hostUserId) {
        pad_access.revokeTokensForUserId(globalPadId, padusers.getAccountIdForProAuthor(userId),
          padusers.getAccountIdForProAuthor(hostUserId));
        pad_access.revokeUserIdAccess(globalPadId, padusers.getAccountIdForProAuthor(k),
          padusers.getAccountIdForProAuthor(hostUserId));
        follow.killUserFollowPrefForPad(globalPadId, padusers.getAccountIdForProAuthor(k));
      }
    }
  });
}

//--------------------------------------------------------------------------------
// knock/answer
//--------------------------------------------------------------------------------

function clearKnockStatus(userId, globalPadId) {
  /*
  syncedWithCache("pad-guest-knocks."+globalPadId, function(c) {
    delete c[userId];
  });
  */
}

// called by collab_server when accountholders approve or deny
function answerKnock(userId, globalPadId, status, authId) {
  // status is either "approved" or "denied"
  syncedWithCache("pad-guest-knocks."+globalPadId, function(c) {
    // If two account-holders respond to the knock, keep the first one.
//    if (!c[userId]) {
//      c[userId] = status;
      var existingUser = pro_accounts.getAccountById(padusers.getAccountIdForProAuthor(userId));
      if (status == "approved") {
        grantUserIdAccessToPad(globalPadId, padusers.getAccountIdForProAuthor(authId), existingUser);
      } else if (status == "denied") {
        revokePadUserAccess(globalPadId, userId, authId);
      }
//    }
  });
}

// returns "approved", "denied", or undefined
function getKnockAnswer(userId, globalPadId) {
  return syncedWithCache("pad-guest-knocks."+globalPadId, function(c) {
//    return c[userId];
    if (doesUserHaveAccessToPad(globalPadId, padusers.getAccountIdForProAuthor(userId))) {
      return "approved";
    } else {
      return;
    }
  });
}

//--------------------------------------------------------------------------------
//  main entrypoint called for every accessPad()
//--------------------------------------------------------------------------------

var _insideCheckAccessControl = false;

var _PRO_ACCESS_WHITELIST = {
  "/ep/account/guest/guest-knock": 1,
  "/ep/padlist/all-pads.zip": 1,
};

var _MAIN_ACCESS_WHITELIST = {
  "/public":1,
  "/hidden":1,
  "/ep/ajax-list":1,
  "/ep/hide-pad":1,
};

function checkAccessControl(globalPadId, rwMode) {
  if (!request.isDefined) {
    return; // TODO: is this the right thing to do here?
    // Empirical evidence indicates request.isDefined during comet requests,
    // but not during tasks, which is the behavior we want.
  }

  if (_insideCheckAccessControl) {
    // checkAccessControl is always allowed to access pads itself
    return;
  }

  if (isProDomainRequest() && (request.path in _PRO_ACCESS_WHITELIST)) {
    return;
  }

  if (!isProDomainRequest() && (request.path == "/ep/admin/padinspector")) {
    return;
  }

  if (domains.isPrimaryDomainRequest() && (request.path in _MAIN_ACCESS_WHITELIST)) {
    return;
  }

  try {
    _insideCheckAccessControl = true;

    if (!padutils.isProPadId(globalPadId)) {
      // no access control on non-pro pads yet.
      return;
    }

    // Answer from cache first
    if (_doesSessionHaveAccessTo(globalPadId)) {
      return;
    }

    // read the creator Id
    var creatorId = pro_padmeta.accessProPad(globalPadId, function(propad) {
       if (propad.exists()) {
         return propad.getCreatorId();
       } else {
         return null;
       }
    });

    if (sessions.isAnEtherpadAdmin()) {
      return;
    }

    // if there is no creator, or this is the creator - grant access
    if ((creatorId == null) || (pro_accounts.isAccountSignedIn() && creatorId == getSessionProAccount().id)) {
      // remember that we have access
      _grantSessionAccessTo(globalPadId);
      return;
    }

    _checkDomainSecurity(globalPadId);
    _checkGuestSecurity(globalPadId, creatorId);

    // remember that this user has access
    _grantSessionAccessTo(globalPadId);
  }
  finally {
    // this always runs, even on error or stop
    _insideCheckAccessControl = false;
  }
}

function _checkDomainSecurity(globalPadId, creatorId) {
  var padDomainId = padutils.getDomainId(globalPadId);
  if (!padDomainId) {
    return; // global pad
  }
  if (pro_utils.isProDomainRequest()) {
    var requestDomainId = domains.getRequestDomainId();
    if (requestDomainId != padDomainId) {
      throw Error("Request cross-domain pad access not allowed.");
    }
  }
}

function _checkGuestSecurity(globalPadId, creatorId) {
  if (!getSession().guestPadAccess) {
    getSession().guestPadAccess = {};
    sessions.saveSession();
  }

  /* no longer allow all domain accounts in
  var padDomainId = padutils.getDomainId(globalPadId);
  var isAccountHolder = pro_accounts.isAccountSignedIn();
  if (isAccountHolder) {
    if (getSessionProAccount().domainId != padDomainId) {
      throw Error("Account cross-domain pad access not allowed.");
    }
    return; // OK
  }*/

  // Not an account holder ==> Guest

  var GUEST_POLICY = {
    LINK: "link",       // if you have a link you can see it
                        // currently not used inside domains.
    DENY: "deny",       // invite only, explicit list in pad_access
                        // (or via group membership - which we should probably drop)
    ALLOW: "allow",     // everyone and anyone can access this pad
    DOMAIN: "domain",   // any full member of the domain may access this pad
    ANON: "anon",       // legacy mode for wikipedia integration, superseded by embed API
    FRIENDS: "friends", // legacy mode: means ~ fb friends of created can access
    ASK: "ask",         // unclear what this should mean nowadays
  };

  // returns either "allow", "ask", or "deny"
  var guestPolicy = model.accessPadGlobal(globalPadId, function(p) {
    if (!p.exists()) {
      return "deny";
    } else {
      return p.getGuestPolicy();
    }
  }, "r", true);

  if (guestPolicy == "anon") {
    // Let anyone in
    return;
  }

  if (guestPolicy == "allow") {
    return;
  }

  if (guestPolicy == "domain" || guestPolicy == "link") {
    if (!domains.isPrimaryDomainRequest() && !domains.isPublicDomain()) {
      pro_accounts.requireAccount("Please sign in to access this pad.");
      if (pro_accounts.getIsDomainGuest(getSessionProAccount())) {
        // Treat domain guests as if they are accessing a deny pad
        guestPolicy = "deny";
      } else {
        return;
      }
    } else {
      return;
    }
  }

  if (guestPolicy == "friends") {
    pro_accounts.requireAccount("Please Sign In or Sign Up to access this pad.");
    // FIXME: update pad_access.lastAccessedDate so the friendship is symmetric

    if (pro_friends.getFriendUserIds(creatorId).indexOf(getSessionProAccount().id) > -1) {
      return;
    }
    var creatorRecord = pro_accounts.getAccountById(creatorId);
    if (isFriendOfId(pro_accounts.getLoggedInUserFacebookId(), creatorRecord.fbid,
        pro_accounts.getLoggedInUserFacebookToken())) {
      return;
    }
  }

  if (guestPolicy == "deny" || guestPolicy == "friends") {
    pro_accounts.requireAccount("Please Sign In or Sign Up to access this pad.");

    if (getSessionProAccount().isAdmin &&
      getSessionProAccount().domainId == padutils.getDomainId(globalPadId)){
      return;
    }

    // is the user on the explicit allow list?
    if (!doesUserHaveAccessToPad(globalPadId, getSessionProAccount().id)) {

      if (!request.params.token ||
          !_isValidInviteToken(globalPadId, request.params.token)) {
        if (utils.isAPIRequest()) {
          utils.renderJSONError(404, "Not found");
        }
        response.reset();
        access_request_control.render_guest_knock_get(padutils.globalToLocalId(globalPadId));
        response.stop();
      }
    }
  }

  if (guestPolicy == "ask") {
    var userId = padusers.getUserId();

    // one of {"approved", "denied", undefined}
    var knockAnswer = getKnockAnswer(userId, globalPadId);
    if (knockAnswer == "approved") {
      return;
    } else {
      var localPadId = padutils.globalToLocalId(globalPadId);
      response.redirect('/ep/account/guest-sign-in?padId='+encodeURIComponent(localPadId));
    }
  }
}

/*
  This function has a "feature" that it excludes invite-only pads you created
  but aren't in the invitee list for.  Passing in the optional optCreatorForPadId fixes this.
*/
function padIdsUserCanSee(userId, globalPadIds, optCreatorForPadId) {
  // sort the pads into buckets based on their guestPolicy
  var allowedGlobalIds = [];
  var mustBeInvitedGlobalIds = [];
  var mustFollowOrBeInvitedGlobalIds = [];

  var listForGuestPolicy = {
      'allow' : allowedGlobalIds,
      'deny': mustBeInvitedGlobalIds,
      'domain': allowedGlobalIds,
      'friends': allowedGlobalIds,
      'link': mustFollowOrBeInvitedGlobalIds,
      'anon': allowedGlobalIds };

  var sqlMetas = sqlobj.selectMulti('PAD_SQLMETA', {id: ["IN", globalPadIds]});
  sqlMetas.forEach(function(meta) {
    listForGuestPolicy[meta.guestPolicy].push(meta.id);
  });

  if (userId) {
    // load the pads we're invited to
    var padsInvitedToSet = {};
    var padIdsToCheck = mustBeInvitedGlobalIds.concat(mustFollowOrBeInvitedGlobalIds);
    if (padIdsToCheck.length) {
      var accessRows = pad_access.getAccessRowsRaw({
          globalPadId: ["IN", padIdsToCheck],
          userId: userId});

      accessRows.forEach(function(row){ padsInvitedToSet[row.globalPadId] = 1;});

      // if we know the creators, they're always "invited"
      if (optCreatorForPadId) {
        padIdsToCheck.forEach(function(globalPadId) {
          if (optCreatorForPadId[globalPadId] == userId) {
            padsInvitedToSet[globalPadId] = 1;
          }
        });
      }
    }

    // add the pads we have access to due to an invite into the allow list
    allowedGlobalIds = allowedGlobalIds.concat(keys(padsInvitedToSet));
    var mustFollowGlobalIds = mustFollowOrBeInvitedGlobalIds.filter(function(padId){
        return !padsInvitedToSet[padId];
    });

    // add the pads we can see to due to a follow into the allow list
    if (mustFollowGlobalIds.length) {
      var followPrefs = follow.getUserFollowPrefForPads(mustFollowOrBeInvitedGlobalIds,  userId);
      var followedPads = mustFollowGlobalIds.filter(function(padId) {
          return followPrefs[padId] != follow.FOLLOW.DEFAULT;
      });
      allowedGlobalIds = allowedGlobalIds.concat(followedPads);

      // for the remaing pads, check collections

      // note that we treat all pads which belong to a collection that the user is in
      // for the purpose of "visibility" as pads that the user is "following";
      // ie. pads they have the link for; true even if the user unfollowed the pad
      // this only matters on hackpad.com or where allowMemberLinkAccess is true
      var mustSeeViaCollection = mustFollowGlobalIds.filter(function(padId) {
        return followedPads.indexOf(padId) == -1;
      });

      // note: this is only good enough for "link" pads, not for "deny" ones
      var userGroupIds = pro_groups.getUserGroupIds(userId);
      accessRows = pad_access.getAccessRowsRaw({
          globalPadId: ["IN", mustSeeViaCollection],
          groupId: ["IN", userGroupIds]});
      accessRows.forEach(function(row){ allowedGlobalIds.push(row.globalPadId); });
    }
  }
  return allowedGlobalIds;
}

function filterOutPadsCurrentUserCannotSee(listOfPads) {
  if (!(listOfPads && listOfPads.length)) {
    return listOfPads;
  }
  var creatorForPadId = {};
  var globalPadIds = listOfPads.map(function(p){
      var globalPadId = padutils.getGlobalPadId(p.localPadId);
      creatorForPadId[globalPadId] = p.creatorId;
      return globalPadId;
  });
  var padIdsUserCanSeeList = padIdsUserCanSee(getSessionProAccount() && getSessionProAccount().id, globalPadIds, creatorForPadId);
  var padIdsUserCanSeeSet = arrayToSet(padIdsUserCanSeeList);

  listOfPads = listOfPads.filter(function(p){
    return padIdsUserCanSeeSet[padutils.getGlobalPadId(p.localPadId)];
  });

  return listOfPads;
}

/*
 Validate continuation URL's so that people can't inject malicious redirects
*/

function sanitizeContUrl(cont) {
  // hackpadSiteRegExp should match ANY *.hackpad.com page
  var hackpadSiteRegExp = new RegExp("^\/[_:/?#+=a-z0-9-]*|^https?:\/\/([_a-z0-9-]+\.)?" + appjet.config['etherpad.canonicalDomain'] + "($|\:|\/)", "i");
  if (cont.match(hackpadSiteRegExp)){
    return cont;
  } else {
    log.warn("sanitizeContUrl filtered: "+cont);
    return "/";
  }
}

function sanitizeContUrlForCookies(cont) {
  return sanitizeContUrl(cont);
}

//--------------------------------------------------------------------------------
// Check if a user can delete / modify permissions on a pad
//--------------------------------------------------------------------------------
//

function checkIsPadAdmin(propad) {
  // check whether a user can delete, moderate, or change guest
  // policy on a pad
  var creatorId = null;
  if (propad.exists()) {
    creatorId = propad.getCreatorId();
  }
  var isAllowed = getSessionProAccount() &&
    (getSessionProAccount().isAdmin ||
     creatorId === getSessionProAccount().id);
  return isAllowed;
}
