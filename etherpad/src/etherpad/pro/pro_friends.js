
import("sqlbase.sqlobj");
import("etherpad.pad.pad_access");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_facebook");

function getFriendsInvitedByMeUserIds(userId) {
  var bbdb = [];
  bbdb = bbdb.concat(pad_access.getUserIdsInvitedByHostUserId(userId),
    pad_access.getHostUserIdsInvitingUserId(userId));

  var friendIds = [];
  for (var i in bbdb) {
    if (!bbdb[i] || bbdb[i] == userId || bbdb.indexOf(bbdb[i]) != i) { continue; } // skip duplicates
    friendIds.push(bbdb[i]);
  }

  // FIXME: cache

  return friendIds;
}

function getFriendUserIds(userId) {
  // FIXME: take 'symmetric' argument. sometimes we want friend symmetry (seeing friend pads),
  //        sometimes we don't care (inviting people i've invited before).

  var bbdb = []; // all hail gnu emacs big brother db

  // find the people i've invited or invited me by looking at padaccess
  bbdb = bbdb.concat(pad_access.getUserIdsInvitedByHostUserId(userId),
    pad_access.getHostUserIdsInvitingUserId(userId));

  // members of my private groups are my friends. debatable.
  var groupIds = pro_groups.getUserPrivateGroupIds(userId);
  bbdb = bbdb.concat(pro_groups.getGroupsMemberIds(groupIds));

  // add full members of the domain
  if (!domains.isPrimaryDomainRequest()) {
    var accts = pro_accounts.listAllDomainAccounts(domains.getRequestDomainId());
    bbdb = bbdb.concat(accts
      .filter(function(a) { return !pro_accounts.getIsDomainGuest(a); }) // no guests
      .map(function(a) { return a.id; }));
  }

  var friendIds = [];
  for (var i in bbdb) {
    if (!bbdb[i] || bbdb[i] == userId || bbdb.indexOf(bbdb[i]) != i) { continue; } // skip duplicates
    friendIds.push(bbdb[i]);
  }

  // FIXME: cache

  return friendIds;
}

function getRecentlyInvitedUserInfos(userId) {
  var invites = pad_access.getUserIdsInvitedByHostUserId(userId);
  return pro_accounts.getAccountsByIds(invites);
}
