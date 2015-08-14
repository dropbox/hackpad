import("sqlbase.sqlobj");
import("etherpad.pad.pad_access");
import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.pad_security");
import("etherpad.pad.model");
import("etherpad.collab.collab_server");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_padmeta");
import("etherpad.changes.follow")
import("etherpad.log");

// fix: send mail to folks invited, even if not editors
// fix: have a single thread per pad, don't group

var FOLLOW = {
  DEFAULT : 0,
  IGNORE : 1,
  EVERY : 2,
  DAILY_PER_PAD : 3,
  DAILY_OVERALL : 4,
  NO_EMAIL: 5,
};

function getUserFollowPrefsForPad(padId, userIds) {
  var followPrefs = sqlobj.selectMulti('PAD_FOLLOW', {id: padId, userId: ['in', userIds]});

  var followPrefsByUserId = {};
  for (var i=0; i<userIds.length; i++) {
    followPrefsByUserId[userIds[i]] = FOLLOW.DEFAULT;
  }

  for (var i=0; i<followPrefs.length; i++) {
    followPrefsByUserId[followPrefs[i].userId] = followPrefs[i].followPref;
  }
  return followPrefsByUserId;
}

function getUserFollowPrefForPad(padId, userId) {
  var row = sqlobj.selectSingle('PAD_FOLLOW', {id: padId, userId: userId});
  if (row) {
    return row.followPref;
  } else {
    return FOLLOW.DEFAULT;
  }
}

function getUserFollowPrefForPads(padIds, userId) {
  var rows = sqlobj.selectMulti('PAD_FOLLOW', {id: ["IN", padIds], userId: userId});
  var followPrefs = {};
  padIds.forEach(function(padId){followPrefs[padId] = FOLLOW.DEFAULT});
  for (var i=0; i<rows.length; i++) {
    followPrefs[rows[i].id] = rows[i].followPref;
  }
  return followPrefs;
}

function getUserIdsAndFollowPrefsForPad(globalPadId) {
  var rows = sqlobj.selectMulti('PAD_FOLLOW', {id: globalPadId});
  var followPrefs = {};
  for (var i=0; i<rows.length; i++) {
    followPrefs[rows[i].userId] = rows[i].followPref;
  }
  return followPrefs;
}

function getUserIdsWithFollowPrefsForPads(padIds) {
  var rows = sqlobj.selectMulti('PAD_FOLLOW', {id: ["IN", padIds]});
  var followPrefs = {};
  for (var i=0; i<rows.length; i++) {
    followPrefs[rows[i].id] = followPrefs[rows[i].id] || [];
    followPrefs[rows[i].id].push(rows[i].userId);
  }
  return followPrefs;
}

// Start following a pad
function insertUserFollowPrefForPad(padId, userId, followPref) {
  sqlobj.insert('PAD_FOLLOW', {id:padId, userId: userId, followPref: followPref});
}

function updateUserFollowPrefForPad(padId, userId, followPref) {
  sqlobj.update('PAD_FOLLOW', {id:padId, userId: userId}, {id:padId, userId: userId, followPref: followPref});
}

function killUserFollowPrefForPad(padId, userId) {
  sqlobj.deleteRows('PAD_FOLLOW', {id:padId, userId:userId});
}

// Start following a pad if we don't currently have a follow pref
function maybeStartFollowingPad(domainId, localPadId, editorId, optNoemail) {
  var padId = padutils.getGlobalPadId(localPadId, domainId);
  if (getUserFollowPrefForPad(padId, editorId) == FOLLOW.DEFAULT) {
    var acct = pro_accounts.getAccountById(editorId);
    // for spaceapps domain, overrule no-email default setting upon edit
    // we can't just change the default because they invited everyone to everything.
    if (optNoemail || (pro_accounts.getAccountDoesNotWantFollowEmail(acct) && (domainId != 789))) {
      insertUserFollowPrefForPad(padId, editorId, FOLLOW.NO_EMAIL);
    } else {
      insertUserFollowPrefForPad(padId, editorId, FOLLOW.EVERY);
    }
  }
}

function allPadIdsUserFollows(userId) {
  var followRows = sqlobj.selectMulti('PAD_FOLLOW', {userId: userId, followPref: ["!=", FOLLOW.IGNORE]});
  var ids = [];
  for (var i=0; i<followRows.length; i++) {
    ids.push(followRows[i].id);
  }
  return ids;
}

function allPadIdsUserIgnores(userId) {
  var followRows = sqlobj.selectMulti('PAD_FOLLOW', {userId: userId, followPref: ["=", FOLLOW.IGNORE]});
  var ids = [];
  for (var i=0; i<followRows.length; i++) {
    ids.push(followRows[i].id);
  }
  return ids;
}

function allUserIdsFollowingPad(globalPadId) {
  var followers = sqlobj.selectMulti("PAD_FOLLOW", { 'id': globalPadId, 'followPref': ["!=", FOLLOW.IGNORE] });
  return followers.map(function (r) { return r.userId; });
}

function allUserIdsFollowingPadViaCollection(globalPadId) {
  var groupIds = pad_access.getGroupIdsWithAccess(globalPadId);
  var unFollowers = sqlobj.selectMulti("PAD_FOLLOW", { 'id': globalPadId, 'followPref': ["=", FOLLOW.IGNORE] });
  var unFollowerUserIds = unFollowers.map(function(f){ return f.userId});
  var user_ids = [];
  groupIds.forEach(function(groupId) {
    var memberIds = pro_groups.getGroupMemberIds(groupId).filter(function(uid) {
      if (user_ids.indexOf(uid) > -1) {
        return false; // dedup
      }

      return unFollowerUserIds.indexOf(uid) == -1;
    });
    user_ids = user_ids.concat(memberIds);
  });
  return user_ids;
}

// Migration code:  insert follow rows for all editors and creators
function migratePad(globalPadId) {
  model.accessPadGlobal(globalPadId, function(pad) {
    // load historical authors
    var historicalAuthorData = collab_server.buildHistoricalAuthorDataMapFromAText(pad, pad.atext());
    var accountIds = _getAccountIdsForEditors(historicalAuthorData);
    if (padutils.isProPadId(globalPadId)) {
      pro_padmeta.accessProPad(globalPadId, function(propad) {
          var creatorId = propad.getCreatorId();
          accountIds.push(creatorId); // it's ok if it's duplicate
      });
    }

    // insert a row if not already there
    for (var i=0; i<accountIds.length; i++) {
      maybeStartFollowingPad(padutils.getDomainId(pad.getId()), padutils.globalToLocalId(pad.getId()), accountIds[i]);
    }
  },"r", true);
}

function _getAccountIdsForEditors(historicalAuthorData) {
  var accountIds = []
  for (var author in historicalAuthorData) {
    var accountId = padusers.getAccountIdForProAuthor(author);
    if (accountId) {
      accountIds.push(accountId);
    }
  }
  return accountIds;
}


/*
  problem: i don't know what to insert into pad follow, default or every for editors.
    if i insert every, then default can be used to mean "doesn't follow", but for old users it means
    but really neither works.  i can isert either of these and default needs to == every
    on the other had no row is special
  problem: getUserFollowPrefForPad
  question how do future editors get to have a follow perf?
    1. because when writing a pad,

  leaving things as-is now, we just need a facility to select by editors.
  if we have pad_last_edited [user_id, pad_id, time] that we update on every db-write...
    if we can get historical
  editors
*/