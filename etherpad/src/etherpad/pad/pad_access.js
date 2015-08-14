import("etherpad.log");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

import("etherpad.pad.model");
import("etherpad.changes.follow");


// "token" indicates that the row contains an access token for the pad
// that is valid for any user/group. For single-use tokens, only the first
// user that presents the token is granted access to the pad.

var AccessTypeEnum = {"user":0, "facebookGroup":1, "group":2, "token":3};
var FLAG_ROW_AUTO_INSERTED = 0x01;

function getAccessRowsRaw(constraints, includeRevoked) {
  var rows = sqlobj.selectMulti('pad_access', constraints, {orderBy: "-createdDate"});
  var revokedIds = [];
  var validIds = [];
  var validRows = [];
  for (var i=0; i<rows.length; i++) {
    var r = rows[i];
    var rowId = r.globalPadId + "|" + (r.groupId || r.userId || r.facebookId); // only one per row
    if (!includeRevoked && r.isRevoked) {
      revokedIds.push(rowId);
    } else if (revokedIds.indexOf(rowId) == -1 && validIds.indexOf(rowId) == -1) {
      validIds.push(rowId);
      validRows.push(r);
    }
  }
  return validRows;
}

function _getPadAccessRows(globalPadId, type, includeRevoked) {
  return getAccessRowsRaw({globalPadId: globalPadId, type: type}, includeRevoked);
}

function _getPadsAccessRows(globalPadIds, type, includeRevoked) {
  return getAccessRowsRaw({globalPadId: ["IN", globalPadIds], type: type}, includeRevoked);
}

function getUserIdsWhoAccessed(globalPadId) {
  return _getPadAccessRows(globalPadId, AccessTypeEnum.user)
    .filter(function (r) { return Boolean(r.lastAccessedDate); })
    .map(function (r) { return r.userId });
}

function getUserIdsWithAccess(globalPadId) {
  return _getPadAccessRows(globalPadId, AccessTypeEnum.user)
    .map(function (r) { return r.userId });
}

function getGroupIdsWithAccess(globalPadId) {
  return _getPadAccessRows(globalPadId, AccessTypeEnum.group)
    .map(function (r) { return r.groupId });
}

function getGroupIdsWithAccessToPads(globalPadIds) {
  var globalPadIdToGroupIds = {};
  _getPadsAccessRows(globalPadIds, AccessTypeEnum.group).forEach(function (r) {
      globalPadIdToGroupIds[r.globalPadId] = globalPadIdToGroupIds[r.globalPadId] || [];
      globalPadIdToGroupIds[r.globalPadId].push(r.groupId);
  });
  return globalPadIdToGroupIds;
}

function canTokenAccess(globalPadId, token) {
  // this checks whether token is valid for the pad
  var tokenRow = sqlobj.selectMulti('pad_access', {globalPadId: globalPadId, token: token, type: AccessTypeEnum.token},
    {orderBy: "-createdDate", limit: 1});
  if (tokenRow[0] && (tokenRow[0].isRevoked===false)) {
    return true;
  } else {
    return false;
  }
}

function canUserIdAccess(globalPadId, userId) {
  // this checks whether the user has been granted access to the pad
  var userRow = sqlobj.selectMulti('pad_access', {globalPadId: globalPadId, userId: userId, type: AccessTypeEnum.user},
    {orderBy: "-createdDate", limit: 1});
  if (userRow[0] && (userRow[0].isRevoked===false)) {
    return true;
  } else {
    return false;
  }
}

function updateUserIdLastAccessedDate(globalPadId, userId) {
  sqlobj.update("pad_access", { globalPadId: globalPadId, userId:userId, type: AccessTypeEnum.user },
    { lastAccessedDate: new Date() });
}

function getPadIdsWithGroupIdAccess(groupId) {
  return getAccessRowsRaw({ groupId: groupId, type: AccessTypeEnum.group})
    .map(function (r) { return r.globalPadId; });
}

function getPadIdsInCollections(collectionIds) {
  var collectionPads = {};
  getAccessRowsRaw({groupId: ["IN", collectionIds]}).forEach(function(r){
    collectionPads[r.groupId] = collectionPads[r.groupId] || [];
    collectionPads[r.groupId].push(r.globalPadId);
  });
  return collectionPads;
}

function getPadIdsWithUserIdAccess(userId) {
  return getAccessRowsRaw({ userId: userId, type: AccessTypeEnum.user})
    .map(function (r) { return r.globalPadId; });
}

function getUserIdsInvitedByHostUserId(hostUserId) {
  return getAccessRowsRaw({ 'hostUserId': hostUserId, 'type': AccessTypeEnum.user })
    .map(function (r) { return r.userId; });
}

function getHostUserIdsInvitingUserId(userId) {
  return getAccessRowsRaw({ 'userId': userId, 'type': AccessTypeEnum.user })
    .map(function (r) { return r.hostUserId; });
}

function getTokensForUserId(userId) {
  // This is only used because, for convenience, a valid token bypasses the usual email verification
  // step for a new user. In this case, the userId must match the token that is presented.
  return getAccessRowsRaw({ 'userId': userId, 'type': AccessTypeEnum.token, 'isRevoked': false })
    .map(function (r) { return r.token; });
}

function revokeTokensForUserId(globalPadId, userId, hostUserId) {
  var tokens = getTokensForUserId(userId);
  for (var i=0; i<tokens.length; i++) {
   revokeTokenAccess(globalPadId, hostUserId, tokens[i], userId); 
  }
}

function grantTokenAccess(globalPadId, hostUserId, token, userId) {
  var data = {
    globalPadId: globalPadId,
    hostUserId: hostUserId,
    userId: userId, // keep track of the original invited user so we can use the token for email verification
    type: AccessTypeEnum.token,
    token: token,
    createdDate: new Date(),
    isRevoked: false
  };
  log.info('Granting token '+data.token+' access to: '+data.globalPadId);
  sqlobj.insert('pad_access', data);
}

function revokeTokenAccess(globalPadId, hostUserId, token, userId) {
  var data = {
    globalPadId: globalPadId,
    hostUserId: hostUserId,
    userId: userId,
    type: AccessTypeEnum.token,
    token: token,
    createdDate: new Date(),
    isRevoked: true
  };
  log.info('Revoking token '+data.token+' access to: '+data.globalPadId);
  sqlobj.insert('pad_access', data);
}

function grantUserIdAccess(globalPadId, userId, hostUserId, optAutoInserted) {
  var data = {
    globalPadId: globalPadId,
    hostUserId: hostUserId,
    userId: userId,
    type: AccessTypeEnum.user,
    createdDate: new Date(),
    flags: optAutoInserted ? FLAG_ROW_AUTO_INSERTED : 0,
    isRevoked: false
  };
  log.info('Granting user '+data.userId+' access to: '+data.globalPadId);
  sqlobj.insert('pad_access', data);
}

function revokeUserIdAccess(globalPadId, userId, hostUserId) {
  var data = {
    globalPadId: globalPadId,
    hostUserId: hostUserId,
    userId: userId,
    type: AccessTypeEnum.user,
    createdDate: new Date(),
    isRevoked: true
  };
  log.info('Revoking user '+data.userId+' access to: '+data.globalPadId);
  sqlobj.insert('pad_access', data);
}


function grantGroupIdAccess(globalPadId, groupId, hostUserId, optSkipSolrUpdate) {
  var data = {
    globalPadId: globalPadId,
    hostUserId: hostUserId,
    groupId: groupId,
    type: AccessTypeEnum.group,
    createdDate: new Date()
  };
  sqlobj.insert('pad_access', data);

  if (!optSkipSolrUpdate) {
    model.updateSolrIndexForPad(globalPadId);
  }
}

function revokeGroupIdAccess(globalPadId, groupId, hostUserId) {
  var data = {
    globalPadId: globalPadId,
    hostUserId: hostUserId,
    groupId: groupId,
    type: AccessTypeEnum.group,
    createdDate: new Date(),
    isRevoked: true
  };
  sqlobj.insert('pad_access', data);

  model.updateSolrIndexForPad(globalPadId);
}

function copyAccessFromPadToPad(sourcePadId, targetPadId, hostUserId) {
  var accessUserIds = [];

  getAccessRowsRaw({ globalPadId: sourcePadId })
    .forEach(function (r) {
      if ((r.userId && r.userId == hostUserId) ||
          (r.type && r.type == AccessTypeEnum.token)) {
        return;
      }

      // might be a group invite or user invite
      delete r.token;
      r.globalPadId = targetPadId;
      r.hostUserId = hostUserId;
      r.createdDate = new Date();
      r.lastAccessedDate = null;
      r.flags = r.flags | FLAG_ROW_AUTO_INSERTED;
      sqlobj.insert('pad_access', r);

      if (r.userId) {
        accessUserIds.push(r.userId);
      }
    });

  follow.allUserIdsFollowingPad(sourcePadId).forEach(function(userId) {
    if (userId == hostUserId || accessUserIds.indexOf(userId) > -1) { return; }
    grantUserIdAccess(targetPadId, userId, hostUserId, true);
  });
}
