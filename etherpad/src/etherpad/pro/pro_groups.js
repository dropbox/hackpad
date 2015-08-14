
import("crypto");
import("sync");
import("funhtml.*");
import("jsutils");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");
import("etherpad.collab.collab_server");
import("email.sendEmailLoggingExceptions");

import("etherpad.helpers");
import("etherpad.pad.exporthtml");
import("etherpad.pad.pad_access");
import("etherpad.pad.pad_security");
import("etherpad.pad.padutils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_groups_key_values");
import("etherpad.pro.pro_utils");
import("etherpad.log");
import("etherpad.globals.isProduction");
import("etherpad.utils.{randomUniquePadId,renderTemplateAsString,requireParam}");

jimport("javax.crypto.IllegalBlockSizeException");
jimport("javax.crypto.BadPaddingException");
jimport("javax.xml.bind.DatatypeConverter");

function createGroup(creatorId, name, isPublic, domainId) {
  var groupId = sqlobj.insert('pro_groups', { creatorId: creatorId, name: name, createdDate: new Date(), isPublic: isPublic, domainId: domainId });
  sqlobj.insert('pro_group_members', { groupId: groupId, userId: creatorId, addedDate: new Date() });

  return groupId;
}

function userIsMember(groupId, userId) {
  var r = sqlobj.selectSingle("pro_group_members", { userId: userId, groupId: groupId });
  return r && r.isMember;
}

function isPadInGroup(groupId, globalPadId) {
  var rows = pad_access.getAccessRowsRaw({globalPadId: globalPadId, type: pad_access.AccessTypeEnum.group, groupId: groupId});
  return rows && rows.length;
}

function getUserGroupIds(userId /* id or list */) {
  if (!userId || userId == "") { return []; }
  userId = [].concat(userId);

  var questions = "(" + userId.map(function(){return "?"}).join(",") + ")";
  var sql = "select distinct(pro_groups.groupId) from pro_groups join pro_group_members on pro_groups.groupId = pro_group_members.groupId where userId in " + questions + " and isDeleted = false and isMember = true;"
  return sqlobj.executeRaw(sql, userId).map(function (r) { return r.groupId; });
}

function decorateWithEncryptedIds(groupInfos) {
  groupInfos.forEach(function(groupInfo){
    groupInfo.encryptedId = getEncryptedGroupId(groupInfo.groupId);
  })
}

function getUserAccessibleCollectionIds(account) {
  var collectionIds = [];
  if (account && !pro_accounts.getIsDomainGuest(account)) {
    if (!domains.isPrimaryDomainRequest()) {
      collectionIds = getDomainPublicGroupIds(account.domainId);
    }
    collectionIds = collectionIds.concat(getUserGroupIds(account.id));
  }
  return collectionIds;
}

function getUserPrivateGroupIds(userId /* id or list */) {
  if (!userId || userId == "") { return []; }
  var groupIds = getUserGroupIds(userId);
  if (groupIds && groupIds.length > 0) {
    return sqlobj.selectMulti("pro_groups", { groupId: ["IN", groupIds], isPublic: false, isDeleted: false }).map(function (r) { return r.groupId; });
  }
  return [];
}

function getUserPublicGroupIds(userId /* id or list */) {
  if (!userId || userId == "") { return []; }
  var groupIds = getUserGroupIds(userId);
  if (groupIds && groupIds.length > 0) {
    return sqlobj.selectMulti("pro_groups", { groupId: ["IN", groupIds], isPublic: true, isDeleted: false }).map(function (r) { return r.groupId; });
  }
  return [];
}

function getDomainPublicGroupIds(domainId) {
  return sqlobj.selectMulti('pro_groups', { domainId: domainId, isPublic: true, isDeleted: false }).
    map(function (r) { return r.groupId; });
}

function getGroupName(groupId) {
  var r = sqlobj.selectSingle('pro_groups', { groupId: groupId });
  return r && r.name;
}

function getGroupInfos(groupIds) {
  return sqlobj.selectMulti('pro_groups', { groupId: ["IN", groupIds] });
}

function getGroupInfo(groupId) {
  return sqlobj.selectSingle('pro_groups', { groupId: groupId });
}

function getGroupTimestampForUser(groupId, userId) {
  var memberRow = sqlobj.selectMulti("pro_group_members", { 'groupId': groupId, 'addedByUserId': userId }, { 'orderBy': '-addedDate', limit: 1 });
  var lastInvitedUser = memberRow && memberRow[0];

  var accessRows = pad_access.getAccessRowsRaw({ 'groupId': groupId, 'hostUserId': userId });
  var lastInvitedPad = accessRows && accessRows[0];

  var timestamp = lastInvitedUser && lastInvitedUser.addedDate;
  if (lastInvitedPad && lastInvitedPad.createdDate > timestamp) {
    timestamp = lastInvitedPad.createdDate;
  }

  // Return -1 if timestamp is undefined. This will prevent the JSON encoder from puking.
  return timestamp || -1;
}

// The last timestamp of a group is the timestamp of the latest pad activity
// When the last padded was added or the most recent edit of a member pad
// Whichever is most recent.
function getLastTimestampForGroup(groupId) {
  // These pads are ordered by -lastEditedDate already
  var pads = getGroupPadInfo(groupId);
  var lastEditTimestamp;
  if (pads.length > 0) {
    lastEditTimestamp = pads[0].lastEditedDate;
  }

  var accessRows = pad_access.getAccessRowsRaw({ 'groupId': groupId });
  var lastInvitedPad = accessRows && accessRows[0];

  if (lastInvitedPad && lastInvitedPad.createdDate > lastEditTimestamp) {
    lastEditTimestamp = lastInvitedPad.createdDate;
  }
  return lastEditTimestamp || -1 ;
}

function getGroupCreatorId(groupId) {
  var r = sqlobj.selectSingle('pro_groups', { groupId: groupId });
  return r && r.creatorId;
}

function getGroupIsPublic(groupId) {
  var r = sqlobj.selectSingle('pro_groups', { groupId: groupId });
  return r && r.isPublic;
}
function setGroupIsPublic(groupId, userId, isPublic) {
  return sqlobj.update('pro_groups', { groupId: groupId, creatorId: userId }, { isPublic: isPublic });
}

function getGroupMemberIds(groupId) {
  return sqlobj.selectMulti("pro_group_members", { groupId: groupId }).map(function (r) { if (r.isMember) { return r.userId; }}).filter(function(a) { return a; });
}

function getGroupsMemberIds(groupIds) {
  return sqlobj.selectMulti("pro_group_members", { groupId: ["IN", groupIds] }).map(function (r) { if (r.isMember) { return r.userId; }}).filter(function(a) { return a; });
}

function getGroupPadIds(groupId) {
  // returns global pads ids
  return getGroupPadInfo(groupId).map(function(r) {
    return padutils.getGlobalPadId(r.localPadId, r.domainId); });
}

function currentUserHasAccess(groupId) {
  var userId = getSessionProAccount() ? getSessionProAccount().id : undefined;
  return userHasAccess(userId, groupId);
}

function userHasAccess(userId, groupId) {
  // this is slow if you do it in a loop!
  return userHasAccessToGroupWithInfo(userId, getGroupInfo(groupId));
}

function userHasAccessToGroupWithInfo(userId, info, optAccount) {
  if (info.isPublic) {
    if (info.domainId == domains.getPrimaryDomainId() || domains.isPublicDomain(info.domainId)) {
      return true;
    }
    if (userId != undefined &&
        !pro_accounts.getIsDomainGuest(optAccount ? optAccount : pro_accounts.getAccountById(userId))) {
      return true;
    }
  }

  if (userId != undefined) {
    if (info.creatorId == userId) {
      return true;
    }

    // this is slow! should be grouped and should have an index in the table
    if (userIsMember(info.groupId, userId)) {
      return true;
    }
  }

  return false;
}


function getGroupPadInfo(groupId) {
  var globalPadIds = pad_access.getPadIdsWithGroupIdAccess(groupId);
  var localPadIds = padutils.globalToLocalIds(globalPadIds);
  return pro_pad_db.listOfPads(null,localPadIds,{ orderBy: '-lastEditedDate' });
}

function getPadGroupIds(globalPadId) {
  return getGroupInfos(pad_access.getGroupIdsWithAccess(globalPadId))
    .filter(function (r) { return !r.isDeleted; })
    .map(function(r) { return r.groupId; });
}

function getPadsGroupIds(globalPadIds) {
  return pad_access.getGroupIdsWithAccessToPads(globalPadIds);
}

function addMember(groupId, userId, addedByUserId, optFacebookPostId, optToken) {
  sqlcommon.inTransaction(function() {
    var cnt = sqlobj.update('pro_group_members', { groupId: groupId, userId: userId}, { isMember: true });
    if (cnt == 0) {
      sqlobj.insert('pro_group_members', {
        groupId: groupId,
        userId: userId,
        addedByUserId: addedByUserId,
        addedDate: new Date(),
        facebookPostId: optFacebookPostId || null,
        token: optToken || null
      });

      // todo: notify all relevant collabrooms with new member data
    }
  });
}

function removeMember(groupId, userId) {
  if (userIsMember(groupId, userId)) {
    sqlobj.update('pro_group_members', { groupId: groupId, userId: userId}, { isMember: false });

    // todo: notify all relevant collabrooms with new member data
  }
}

function destroyGroup(groupId) {
  return sqlobj.update('pro_groups', { groupId: groupId }, { isDeleted: true, deletedDate: new Date() });
}

function setGroupName(groupId, name) {
  if (!name || name == '') return 0;
  return sqlobj.update('pro_groups', { groupId: groupId }, { name: name });
}

function _getGroupIdEncryptionKey() {
  var key = appjet.config.collectionIdEncryptionKey; // 8 bytes
  return new javax.crypto.spec.SecretKeySpec(DatatypeConverter.parseHexBinary(key), "DES");
}

function getEncryptedGroupId(groupId) {
  return crypto.encryptedId(groupId, _getGroupIdEncryptionKey());
}

function getGroupIdByEncryptedId(enc) {
  try {
    return parseInt(crypto.decryptedId(enc, _getGroupIdEncryptionKey()));
  } catch (e if e.javaException instanceof IllegalBlockSizeException ||
           e.javaException instanceof BadPaddingException) {
    log.warn("Could not decrypt invalid group id: " + enc);
    return 0;
  }
}
var decryptedGroupId = getGroupIdByEncryptedId;

var BLOG_GROUP_ID = -1;
var WELCOME_PADS_GROUP_ID = -1;

function isModerated(groupId) {
  return [BLOG_GROUP_ID, WELCOME_PADS_GROUP_ID].indexOf(parseInt(groupId)) > -1;
}

function isOwner(groupId, accountId) {
  var groupInfo = getGroupInfo(groupId);
  return groupInfo.creatorId == accountId;
}

function userMayEditGroup(acct, groupId) {
  var userId = acct.id;

  if (!userHasAccess(userId, groupId)) {
    return false;
  }
  if (isModerated(groupId) &&
      !isOwner(groupId, userId) &&
      !acct.isAdmin) {
    return false;
  }

  return true;
}

function sendAddPadRequest(groupId, localPadId, requestorAccount) {
  var groupInfo = getGroupInfo(groupId);
  var creatorAccount = pro_accounts.getAccountById(groupInfo.creatorId);
  var title = pro_padmeta.accessProPadLocal(localPadId, function(ppad){
    return ppad.getDisplayTitle();
  });
  var padUrl = padutils.urlForLocalPadId(localPadId, title);
  var fromAddr = pro_utils.getEmailFromAddr();
  var subj =  requestorAccount.fullName + ' requested that you add \'' + title + '\' to collection \'' + groupInfo.name + '\'';
  var body = "Head over to " + padUrl + " to add it";

  sendEmailLoggingExceptions(creatorAccount.email, fromAddr, subj, null, body);
}

function removePadFromCollection(collectionId, localPadId, hostId) {
  pad_access.revokeGroupIdAccess(padutils.getGlobalPadId(localPadId), collectionId, hostId);
  collab_server.announceGroupPadRemoval(padutils.getGlobalPadId(localPadId), collectionId);
}

function addPadToCollection(collectionId, localPadId, hostId, quietly) {

  // grant the "group" access to this pad
  pad_security.grantGroupAccessToPad(padutils.getGlobalPadId(localPadId), hostId, collectionId);

  // notify clients of new group
  var name = getGroupInfo(collectionId).name;
  var ids = getGroupMemberIds(collectionId);

  collab_server.announceGroupInvite(padutils.getGlobalPadId(localPadId), collectionId, name, ids.length);

  if (!quietly) {
    _notifyCollectionFollowersOfNewPad(collectionId, localPadId, ids, name);
  }
}

function _filterOutStalePinnedPads(collectionId, pinnedPads){
  var filteredPads = pinnedPads.filter(function(padId) {
    var globalPadId = padutils.getGlobalPadId(padId);
    if (isPadInGroup(collectionId, globalPadId)) {
      return pro_padmeta.accessProPad(globalPadId, function (p) {
        return p && !p.isDeleted();
      });
    }
    return false;
  });
  return filteredPads;
}

function unpinPadInCollection(collectionId, localPadId) {
  pinPadInCollection(collectionId, localPadId, null /* afterPadId */, null /* beforePadId */, true /* remove */);
}

function pinPadInCollection(collectionId, localPadId, afterPadId, beforePadId, remove) {
  doWithGroupLock(collectionId, function() {
    var pinnedPads = pro_groups_key_values.getValueForGroup(collectionId, 'pinnedPads') || [];

    // Normalize the pinned pads list on update.
    // Since pad delete doesn't update the pinned pads list
    // Check here to make sure pinned pads are still valid.
    pinnedPads = _filterOutStalePinnedPads(collectionId, pinnedPads);

    // If the pad to pin is already pinned, splice it out before proceeding
    var currentPosition = pinnedPads.indexOf(localPadId);
    if (currentPosition > -1) {
      pinnedPads.splice(currentPosition, 1);
    }

    // Insert the pad into the correct position
    if (!remove) {
      // Figure out where to insert the pad.
      // We cannot know the absolute position due to
      // access variability for the viewing user
      var insertPosition;
      if (afterPadId) {
        var afterPadIdx = pinnedPads.indexOf(afterPadId);
        if (afterPadIdx > -1) {
          insertPosition = afterPadIdx + 1;
        }
      }
      if (!insertPosition && beforePadId) {
        var beforePadIdx = pinnedPads.indexOf(beforePadId);
        if (beforePadIdx > -1) {
          insertPosition = beforePadIdx;
        }
      }

      // Defaut to pinning to the top of the pinned list
      if (typeof insertPosition === "undefined") {
        insertPosition = 0;
      }

      // insert the pad to be pinned
      pinnedPads.splice(insertPosition, 0, localPadId);
    }

    pro_groups_key_values.updateValueForGroup(collectionId, 'pinnedPads', pinnedPads);
  });
}

function doWithGroupLock(groupId, func) {
  var lockName = "collection/"+groupId;
  return sync.doWithStringLock(lockName, func);
}

function listPinnedPadsInCollection(collectionId) {
  var pinnedPadIds = pro_groups_key_values.getValueForGroup(collectionId, 'pinnedPads') || [];
  pinnedPadIds = _filterOutStalePinnedPads(collectionId, pinnedPadIds);
  var pinnedPads = pro_pad_db.listOfPads(null, pinnedPadIds);
  var pinnedPadsInOrder = [];

  var padsById = jsutils.dictByProperty(pinnedPads, "localPadId");

  pinnedPadIds.forEach(function(id, idx) {
    if(padsById[id]) {
      pinnedPadsInOrder.push(padsById[id]);
    }
  });

  return pinnedPadsInOrder;
}

function decorateWithPinnedPads(groups) {
  pro_groups_key_values.decorateWithValues(groups, 'pinnedPads');
}

function groupURL(groupId) {
  var encryptedGroupId = getEncryptedGroupId(groupId);
  return request.scheme+'://'+request.host+'/ep/group/'+encryptedGroupId;
}

function _notifyCollectionFollowersOfNewPad(collectionId, localPadId, ids, name) {
  if (ids.length >= 50) {
    return;
  }

  var title = pro_padmeta.accessProPadLocal(localPadId, function(ppad){
    return ppad.getDisplayTitle();
  });
  var padContent = padutils.accessPadLocal(localPadId, function(pad) {
    return exporthtml.getPadPlainText(pad, pad.getHeadRevisionNumber(), true/*skipTitle*/);
  }, 'r');
  var padLink = A({href:padutils.urlForLocalPadId(localPadId, title)}, title);
  var collectionLink = A({href:groupURL(collectionId)}, name);
  var fromAddr = pro_utils.getEmailFromAddr();
  var subj = getSessionProAccount().fullName + ' added ' + (title != "Untitled" ? '\'' + title + '\'' : "a new hackpad") + ' to collection \'' + name + '\'';

  var body = "Pad " + padLink + " was added to collection " + collectionLink + "<br/></br>";
  body += padContent.replace(/\n/g, "<br/>");
  body += "<br/>--<br/>If this message was sent in error, please mail " + helpers.supportEmailAddress() + ".";

  for (var i=0; i < ids.length; i++) {
    // don't send email to people who have no access to the pad
    if (pad_security.padIdsUserCanSee(ids[i], [padutils.getGlobalPadId(localPadId)]).length == 0) {
      continue;
    }

    // don't send yourself email
    if (ids[i] == getSessionProAccount().id) { continue; }

    var account = pro_accounts.getAccountById(ids[i], true/*skipDeleted*/);
    if (!account) { continue; }

    log.custom("padinvitehackpadgroupemail", {toEmails: account.email, padId: localPadId });

    sendEmailLoggingExceptions(account.email, fromAddr, subj, null, body, "text/html; charset=utf-8");
  }
}
