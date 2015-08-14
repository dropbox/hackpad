
import("jsutils");

import("etherpad.changes.follow");
import("etherpad.collab.collab_server");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pad.pad_security");

import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_groups");

import("etherpad.control.pad.pad_control.assignColorId");
import("etherpad.utils.{randomUniquePadId,renderTemplateAsString}");


function _getPadAccessibleByAccountIds(globalPadId) {
  var inviteeIds = pad_security.getAllUserIdsWithAccessToPad(globalPadId);
  var followerIds = model.accessPadGlobal(globalPadId, function(pad) {
    return pad.getGuestPolicy() == "deny";
  }, 'r') ? [] : follow.allUserIdsFollowingPad(globalPadId);
  return jsutils.uniqueNumbers([].concat(inviteeIds, followerIds));
}

function getPadUserNamesToMigrate(globalPadId) {
  return pro_accounts.getAccountsByIds(_getPadAccessibleByAccountIds(globalPadId), true).map(function(acct) {
    return acct.fullName;
  });
}

function getGroupUserNamesToMigrate(groupId) {
  var names = pro_accounts.getAccountsByIds(pro_groups.getGroupMemberIds(groupId), true).map(function(acct) {
    return acct.fullName;
  });
  pro_groups.getGroupPadIds(groupId).forEach(function(globalPadId) {
    getPadUserNamesToMigrate(globalPadId).forEach(function(name) {
      if (names.indexOf(name) == -1) { names.push(name); }
    });
  });
  return names;
}

function _addAccountsToMigrate(accountIds, usersToMigrate, emailMap) {
  pro_accounts.getAccountsByIds(accountIds, true).forEach(function(acct) {
    if (usersToMigrate.indexOf(acct.id) == -1) {
      usersToMigrate.push(acct.id);
    }
    if (!emailMap[acct.id]) {
      emailMap[acct.id] = acct.email;
    }
  });
}

function migratePadsAndUsers(globalPadIds, usersToMigrate, emailMap, destinationDomainId, newCreatorId, optGroupId, optMigrateInvitees, optOldCreatorId) {
  usersToMigrate = usersToMigrate || [];
  emailMap = emailMap || {};
  var inviteMap = {};

  if (optMigrateInvitees) {
    for (var i=0; i<globalPadIds.length; i++) {
      var padUserIds = _getPadAccessibleByAccountIds(globalPadIds[i]);
      _addAccountsToMigrate(padUserIds, usersToMigrate, emailMap);
      inviteMap[globalPadIds[i]] = padUserIds;
    }
  }

  var userIdMap = {};

  if (optOldCreatorId) {
    userIdMap[optOldCreatorId] = newCreatorId;
    delete emailMap[optOldCreatorId];
  }

  // ensure the user has an account on the destination domain
  for (var i=0; i<usersToMigrate.length; i++) {
    var oldAccount = pro_accounts.getAccountById(usersToMigrate[i], true);
    var newEmail = emailMap[usersToMigrate[i]];
    if (oldAccount && newEmail) {
      var newAccount = pro_accounts.getAccountByEmail(newEmail, destinationDomainId);
      if (!newAccount) {
        // create the account
        var isLinkedAccount = (newEmail == oldAccount.email);
        var isGuest = !pro_config.domainAllowsEmail(newEmail, destinationDomainId);
        var newAccountId = pro_accounts.createNewAccount(destinationDomainId, oldAccount.fullName, newEmail, null, false, true, null, isGuest, isLinkedAccount);
        userIdMap[oldAccount.id] = newAccountId;
      } else {
        userIdMap[oldAccount.id] = newAccount.id;
      }
    }
  }

  for (var globalPadId in inviteMap) {
    var oldUserIds = inviteMap[globalPadId];
    inviteMap[globalPadId] = (oldUserIds || [])
      .map(function(oldUid) { return userIdMap[oldUid]; })
      .filter(function(newUid) { return newUid; });
  }

  return migratePads(globalPadIds, destinationDomainId, newCreatorId, userIdMap, optGroupId, inviteMap);
}



// @returns global id of new pad or null if something failed
function migratePad(globalPadId, destinationDomainId, newCreatorId, userIdMap, optGroupId, optInviteUserIds) {
  var atext = null;
  var apool = null;
  var title = null;
  var creatorId = 0;

  var authorDatas = {};

  // Extract the information we need from the source pad
  var exists = model.accessPadGlobal(globalPadId, function(pad) {
    if (!pad || !pad.exists()) {
      return false;
    }

    atext = pad.atext();
    apool = pad.pool();
    pad.eachATextAuthor(atext, function (author, authorNum) {
      authorDatas[author] = pad.getAuthorData(author);
    });
    return true;
  }, 'r');

  if (!exists) {
    // don't migrate this pad
    return;
  }

  // Also grab the metadata from the propad row
  var exists = pro_padmeta.accessProPad(globalPadId, function(propad) {
    if (!propad.exists() || propad.isDeleted()) {
      return false;
    }

    title = propad.getDisplayTitle();
    creatorId = propad.getCreatorId();
    lastEditedDate = propad.getLastEditedDate();
    return true;
  });

  if (!exists) {
    // don't migrate this pad
    return;
  }

  var newGlobalPadId;
  var retryCount = 3;
  var success = false;
  while (retryCount && !success) {
    newGlobalPadId = padutils.getGlobalPadId (randomUniquePadId(), destinationDomainId);
    success = _createMigratedPad(newGlobalPadId, title, lastEditedDate, newCreatorId, atext, apool, authorDatas, userIdMap, optGroupId);
    retryCount--;
  }

  if (!success) {
    return null;
  }

  for (var i in (optInviteUserIds || [])) {
    var userId = optInviteUserIds[i];
    var acct = pro_accounts.getAccountById(userId);
    if (acct) {
      pad_security.grantUserIdAccessToPad(newGlobalPadId, newCreatorId, acct);
    }
  }

  return newGlobalPadId;
}


function _createMigratedPad(newPadId, title, lastEditedDate, creatorId, atext, apool, authorDatas, userIdMap, optGroupId) {
  return model.accessPadGlobal(newPadId, function(pad) {
    if (pad.exists()) {
      return false;
    }

    pad.create(title, title);
    pad.setGuestPolicy("domain");

    pro_padmeta.accessProPad(newPadId, function(ppad) {
      ppad.setCreatorId(creatorId);
      ppad.setLastEditor(creatorId);
      ppad.setLastEditedDate(lastEditedDate);
    });

    collab_server.setPadAText(pad, atext, apool);

    for (author in authorDatas) {
      if (authorDatas[author]) {
        pad.setAuthorData(author, authorDatas[author]);
      } else {
        var authorData = {
          // TODO: accepting a (potentially external) author id could be dangerous
          colorId: assignColorId(pad, author),
          name: "Guest",
        };
        pad.setAuthorData(authorId, authorData);
      }
    }

    if (optGroupId) {
//      pad_security.grantGroupAccessToPad(newGlobalPadId, newCreatorId, optGroupId);
    }

    pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
    return true;
  });
}

function migrateGroup(groupId, destinationDomainId, newCreatorId, optOldCreatorId) {
  var globalPadIds = pro_groups.getGroupPadIds(groupId);

  // linked user map
  var groupMemberIds = pro_groups.getGroupMemberIds(groupId);
  var groupMemberEmails = {};
  pro_accounts.getAccountsByIds(groupMemberIds).forEach(function(acct) {
    groupMemberEmails[acct.id] = acct.email;
  });

  // create dest group
  var existingGroupInfo = pro_groups.getGroupInfo(groupId);
  var newGroupId = pro_groups.createGroup(newCreatorId, existingGroupInfo.name, existingGroupInfo.isPublic, destinationDomainId);

  var failedGlobalPadIds = migratePadsAndUsers(globalPadIds, groupMemberIds, groupMemberEmails,
    destinationDomainId, newCreatorId, newGroupId, true, optOldCreatorId);

  // delete old group
  pro_groups.destroyGroup(groupId);

  return newGroupId;
}

function migratePads(globalPadIds, destinationDomainId, newCreatorId, userIdMap, optGroupId, optInviteMap) {
  // migrate all the data
  var globalPadIdMap = {};
  var failedGlobalPadIds = [];
  for (var i=0; i<globalPadIds.length; i++) {
    var newGlobalPadId = migratePad(globalPadIds[i], destinationDomainId, newCreatorId, userIdMap, optGroupId, (optInviteMap || {})[globalPadIds[i]]);
    if (newGlobalPadId) {
      globalPadIdMap[globalPadIds[i]] = newGlobalPadId;
    } else {
      failedGlobalPadIds.push(globalPadIds[i]);
    }
  }

  for (var globalPadId in globalPadIdMap) {
    // fix up URLs
    _rewriteLinks(globalPadId, globalPadIdMap, userIdMap);

    // archive old pad that was migrated
    pro_padmeta.accessProPad(globalPadId, function(oldProPad) {
      oldProPad.markArchived();
      oldProPad.setPadIdMovedTo(globalPadIdMap[globalPadId]);
    });

    // insert a follow-every row for every pad and every current subdomain user
    /*var domainAccounts = pro_accounts.listAllDomainAccounts(domainId);
    for (var i=0; i<domainAccounts.length; i++) {
      follow.insertUserFollowPrefForPad(oldLocalToNewGlobalPadIds[oldLocalPadId],
          domainAccounts[i].id, follow.FOLLOW.EVERY);
    }*/
  }
  return failedGlobalPadIds;
}

function _rewriteLinks(globalPadId, globalPadIdMap, userIdMap) {
  var oldFQDN = domains.fqdnForGlobalPadId(globalPadId);

  model.accessPadGlobal(globalPadIdMap[globalPadId], function(pad) {
    // rewrite the links in the apool
    // note: we don't fix absolute urls and could be made into relative ones now,
    pad.pool().modifyAttribs(function(k,v) {
      if (k == "link" && v) {
        var relativeLinkRE = /^\/.*$/;
        var relativePadLinkRE = /^\/([a-zA-Z0-9]+)(#.*)?$/;
        var match = v.match(relativeLinkRE);
        if (match){
          var padMatch = v.match(relativePadLinkRE);
          var relativeDomainId = 1; // TODO: fixme later
          if (padMatch) {
            var destinationGlobalPadId = padutils.getGlobalPadId(padMatch[1], relativeDomainId);
            if (destinationGlobalPadId in globalPadIdMap) {
              // links to other migrated pads
              var newLocalPadId = padutils.globalToLocalId(globalPadIdMap[destinationGlobalPadId]);

              v = v.replace(/^\/([a-zA-Z0-9]+)/, "/" + newLocalPadId);

            } else {
              // all other relative links
              var absoluteUrlPrefix = appjet.config.useHttpsUrls ? "https://" : "http://";
              absoluteUrlPrefix += oldFQDN;
              v = v.replace(/^/, absoluteUrlPrefix);
            }
          }
        }
      } else if (k == "author") {
        // rewrite to the new author
        if (v) {
          //response.write("was " + v);
          var oldAuthor = v;
          var oldAccountId = padusers.getAccountIdForProAuthor(oldAuthor);
          if (oldAccountId in userIdMap) {
            v = padusers.getUserIdForProUser(userIdMap[oldAccountId]);
            // copy the author data
            // pad.setAuthorData(v, pad.getAuthorData(oldAuthor));
          }
          //response.write(" now is " + v);
        }
      }
      return v;
    });

    pad.writeToDB();
  }, 'rw', true);
}
