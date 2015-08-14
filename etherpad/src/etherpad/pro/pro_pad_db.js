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

import("jsutils");
import("fastJSON");
import("sqlbase.sqlobj");
import("cache_utils.syncedWithCache");
import("stringutils");
import("underscore._");

import("etherpad.changes.follow");
import("etherpad.log");

import("etherpad.pad.model");
import("etherpad.pad.pad_access");
import("etherpad.pad.pad_security");
import("etherpad.pad.padutils");
import("etherpad.collab.collab_server");
import("etherpad.sessions.getSession");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_groups_key_values");
import("etherpad.pro.pro_pad_editors");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_facebook");


// TODO: actually implement the cache part

// NOTE: must return a deep-CLONE of the actual record, because caller
//       may proceed to mutate the returned record.

function _makeRecord(r) {
  if (!r) {
    return null;
  }
  r.proAttrs = {};
  if (r.proAttrsJson) {
    r.proAttrs = fastJSON.parse(r.proAttrsJson);
  }
  if (!r.proAttrs.editors) {
    r.proAttrs.editors = [];
  }
  r.proAttrs.editors.sort();
  return r;
}

function getSingleRecord(domainId, localPadId) {
  // TODO: make clone
  // TODO: use cache
  var record = sqlobj.selectSingle('pro_padmeta', {domainId: domainId, localPadId: localPadId});
  return _makeRecord(record);
}

function update(padRecord) {
  // TODO: use cache

  padRecord.proAttrsJson = fastJSON.stringify(padRecord.proAttrs);
  delete padRecord.proAttrs;

  sqlobj.update('pro_padmeta', {id: padRecord.id}, padRecord);
}


//--------------------------------------------------------------------------------
// create/edit/destory events
//--------------------------------------------------------------------------------

function onCreatePad(pad, optTitle) {
  if (!padutils.isProPad(pad)) { return; }
  var data;
  if (optTitle === undefined) {
    optTitle = null;
  }
  data = {
    domainId: padutils.getDomainId(pad.getId()),
    localPadId: padutils.getLocalPadId(pad),
    title: optTitle,
    createdDate: new Date(),
  };

  if (request.isDefined && getSessionProAccount()) {
    data.creatorId = getSessionProAccount().id;
  }

  sqlobj.insert('pro_padmeta', data);
}

// Not a normal part of the UI.  This is only called from admin interface,
// and thus should actually destroy all record of the pad.
function onDestroyPad(pad) {
  if (!padutils.isProPad(pad)) { return; }

  sqlobj.deleteRows('pro_padmeta', {
    domainId: padutils.getDomainId(pad.getId()),
    localPadId: padutils.getLocalPadId(pad)
  });
}

// Called within the context of a comet post.
function onEditPad(pad, padAuthorId, optNewTitle) {
  if (!padutils.isProPad(pad)) { return; }

  var editorId = padAuthorId;
  if (request.isDefined && getSessionProAccount()) {
    editorId = getSessionProAccount().id;
  }

  if (!(editorId && (editorId > 0))) {
    return; // etherpad admins
  }

  pro_pad_editors.notifyEdit(
    padutils.getDomainId(pad.getId()),
    padutils.getLocalPadId(pad),
    editorId,
    new Date(),
    optNewTitle
  );
}

//--------------------------------------------------------------------------------
// accessing the pad list.
//--------------------------------------------------------------------------------

function _makeRecordList(lis) {
  return lis.map(_makeRecord);
}

function listMyPads(domain, uid, excludePadIds) {
  var domainId = domain || domains.getRequestDomainId();
  var accountId = uid || getSessionProAccount().id;

  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, creatorId: accountId, isDeleted: false, isArchived: false, localPadId: ["NOT IN", (excludePadIds || ["3298wdwe988hcew89j"])]});
  return _makeRecordList(padlist);
}

function listOfPads (domainId, padIds, opt_options) {
  if (!padIds.length) {
    return [];
  }
  domainId = domainId || domains.getRequestDomainId();

  opt_options = opt_options || {};

  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId:domainId, localPadId: ["IN", padIds], isDeleted: false, isArchived: false}, opt_options);

  var pads = _makeRecordList(padlist);

  return pads;
}

// Produce a cross-domain list of pads
function listOfGlobalPads(globalPadIds, opt_options) {
  if (!globalPadIds.length) {
    return [];
  }
  opt_options = opt_options || {};

  var domainIds = {};
  var localPadIds = [];
  var localPadIdToDomainsMap = {};

  globalPadIds.forEach(function(globalPadId) {
    var parts = globalPadId.split("$");
    var localPadId;
    var domainId;
    if (parts.length < 2) {
      return;
    }
    domainId = parts[0];
    localPadId = parts[1];

    // Build up the set of domains in this globalPadIds list
    domainIds[domainId] = true;

    localPadIds.push(localPadId);

    // Keep a mapping from the localPadId to its corresponding domain(s)
    // Since we have no cross-domain uniqueness guarantees of localPadId ids
    // we have to keep a mapping of the actual domains in the global pad ids
    var domains = localPadIdToDomainsMap[localPadId] || {};
    domains[domainId] = true;
    localPadIdToDomainsMap[localPadId] = domains;
  });

  // filtering by domains speeds things up but we lose ordering
  var padlist = sqlobj.selectMulti('pro_padmeta', { domainId: ["IN", jsutils.keys(domainIds)], localPadId: ["IN", localPadIds], isDeleted: false, isArchived: false}, opt_options);

  var globalPadIdToRecordMap = {};

  // build up a record map for quick lookup
  padlist.forEach(function(p) {
    // Check that the pad's domainId matches the domain from the global id
    // This is false in the very unlikely case that there are multiple pads on different domains with a
    // common randomly generated localPadId
    if (localPadIdToDomainsMap[p.localPadId][p.domainId]) {
      globalPadIdToRecordMap[padutils.makeGlobalId(p.domainId, p.localPadId)] = p;
    }
  });

  // iterate over original list of global ids to build a list of records preserving order
  var orderedPadList = globalPadIds.map(function(globalPadId) {
    return globalPadIdToRecordMap[globalPadId];
  }).filter(function(r) { return r; });

  var pads = _makeRecordList(orderedPadList);
  return pads;
}

function _addPinnedPad(allPads) {
  if (!domains.isPrimaryDomainRequest() &&
      (domains.isPublicDomain() || !pro_accounts.getIsDomainGuest(getSessionProAccount())) &&
      pro_config.getConfig().homePadURL) {

    var homePadId = padutils.localPadIdFromURL(pro_config.getConfig().homePadURL);
    var homePad = listOfPads(domains.getRequestDomainId(), [homePadId])[0];
    if (homePad) {
      _insertByLocalId([homePad], allPads);

      allPads[homePadId].isPinned = true;
    }
  }
}

function listPinnedPads(){
  var pinnedPads = {};
  _addPinnedPad(pinnedPads);
  return jsutils.values(pinnedPads);
}

function listFollowedPads(myPads, limit, _domainId, _accountId, lastCheckTimestamp, excludePadIds) {
/* Definition for mainsite:
    Pads that I have access to (public,friends) and I have followed (automatic on edit) +
    Pads that I have been created and still follow +
    Pads that I have been invited to and haven't un-followed +
      //(should we auto-follow on invite?)
    Pads that are group and I haven't unfollowed
*/
  var limit = (limit || 0);
  var allPads = {};
  var accountId = _accountId || getSessionProAccount().id;
  excludePadIds = excludePadIds || [];

  var ignoredPadIds = jsutils.arrayToSet(
    follow.allPadIdsUserIgnores(accountId).map(function(globalPadId) {
      return padutils.globalToLocalId(globalPadId); }));
  var followedPadIds = follow.allPadIdsUserFollows(accountId);

  function _notInUnfollowedIds (padId) {
    return !(ignoredPadIds[padId]);
  }

  var domainId = _domainId || domains.getRequestDomainId();

  var allPadIds = {};
  function _addToPadIds(padIds) { padIds.forEach( function(padId) { allPadIds[padId] = true}) };

  var constraints = {
    domainId: domainId,
    creatorId: accountId,
    isDeleted: false,
    isArchived: false
  };
  if (lastCheckTimestamp) {
    lastCheckTimestamp = parseInt(lastCheckTimestamp);
    constraints['lastEditedDate'] = [">", new Date(lastCheckTimestamp || 0)];
  }
  var rows = sqlobj.selectMulti("pro_padmeta", constraints, { orderBy: "-lastEditedDate", limit: limit });
  var myPadsLocalIds = rows.map(function(row){return row.localPadId});

  _addToPadIds(myPadsLocalIds.filter(_notInUnfollowedIds));
  _addToPadIds(_padsInvitedToIds(domainId, accountId).filter(_notInUnfollowedIds));

  var groupPadIds = _groupPadIds(accountId).filter(_notInUnfollowedIds);

  // filter out pads the user cannot access
  var creatorForPadId = {};
  myPads.forEach(function(p){
      creatorForPadId[padutils.getGlobalPadId(p.localPadId, domainId)] = accountId;
  });

  var groupGlobalPadIds = groupPadIds.map(function(lid) {return padutils.getGlobalPadId(lid, domainId)});
  var globalPadIdsToCheck = groupGlobalPadIds.concat(followedPadIds);

  var globalPadIdsUserCanSee = pad_security.padIdsUserCanSee(accountId, globalPadIdsToCheck, creatorForPadId);
  _addToPadIds(globalPadIdsUserCanSee.map(padutils.globalToLocalId));

  excludePadIds.forEach(function(e) { delete allPadIds[e]; });

  allPads = listOfPads(domainId, jsutils.keys(allPadIds), {orderBy: '-lastEditedDate', limit:limit });

  return allPads;
}


function _publiclySharedPads(optLimit) {
  var domainId = domains.getRequestDomainId();
  var accountId = getSessionProAccount().id;
  var limitClause = ""
  if (optLimit && false) {
    limitClause = "limit ?";
  }

  if (domains.isPrimaryDomainRequest()) {
    // load friends
    var userIds = pro_accounts.getLoggedInUserFriendIds();

    // do the select of accessible pads with "everyone" or "friend" access
    if (userIds.length) {
      var questions = "(" + userIds.map(function(){return "?"}).join(",") + ")";
      var sql = "select PAD_SQLMETA.id from PAD_SQLMETA join PAD_FOLLOW where PAD_SQLMETA.id = PAD_FOLLOW.id and PAD_SQLMETA.guestPolicy in ('friends', 'allow') AND PAD_FOLLOW.followPref > 1 AND PAD_FOLLOW.userId IN " + questions + " AND PAD_SQLMETA.headRev > 1 order by PAD_SQLMETA.lastWriteTime desc " + limitClause + ";";
      var rows = sqlobj.executeRaw(sql, limitClause ? userIds.concat([optLimit]) : userIds);
      return listOfPads(domainId, rows.map(function(r) { return padutils.globalToLocalId(r.id); }))
        .filter(function (r) { return r && r.domainId == domainId && r.creatorId != accountId; });
    }
  } else if (!pro_accounts.getIsDomainGuest(getSessionProAccount())) {
    // domains list all public pads
    var sql = "select pro_padmeta.* from PAD_SQLMETA JOIN pro_padmeta where (PAD_SQLMETA.guestPolicy in ('friends', 'allow', 'domain') AND PAD_SQLMETA.id = CONCAT(pro_padmeta.domainId, '$', pro_padmeta.localPadId) AND pro_padmeta.isDeleted = false AND pro_padmeta.isArchived = false AND pro_padmeta.domainId = ? AND PAD_SQLMETA.headRev > 1) order by pro_padmeta.lastEditedDate desc " +limitClause+ ";"
    var rows = sqlobj.executeRaw(sql, limitClause ? [domainId, optLimit] : [domainId]);
    return _makeRecordList(rows);
  }
  return [];
}


function _padsInvitedToIds(domainId, accountId) {
  // add pads the user has been explicitly allowed to access
  var invitesPadIds = pad_access.getPadIdsWithUserIdAccess(accountId);
  var invitesPadsLocalIds = invitesPadIds.map(function(globalPadId) { return padutils.globalToLocalId(globalPadId); });
  return invitesPadsLocalIds;
}
function _padsInvitedTo(domainId, accountId) {
  return listOfPads(domainId, _padsInvitedToIds(domainId, accountId));
}

function _groupPadIds(accountId) {
  // group pads where user didn't invite the group
  var groupIds = pro_groups.getUserGroupIds(accountId);
  if (groupIds && groupIds.length) {
    var groupPadIds = pad_access.getAccessRowsRaw({groupId: ["IN", groupIds], hostUserId: ["!=", accountId]});
    var groupPadsLocalIds = groupPadIds.map(function(r) { return padutils.globalToLocalId(r.globalPadId); });
    return groupPadsLocalIds;
  }
  return [];
}

function _allGroupPadGlobalIds (accountId) {
  var groupIds = pro_groups.getUserGroupIds(accountId);
  if (groupIds && groupIds.length) {
    var groupPadIds = pad_access.getAccessRowsRaw({groupId: ["IN", groupIds]});
    return groupPadIds;
  }
  return [];
}
function _groupPads (accountId) {
  return listOfPads (domains.getRequestDomainId(),  _allGroupPadGlobalIds(accountId).map(padutils.globalToLocalId));
}

function _insertByLocalId(pads, dict) {
  pads.forEach(function(r) {
    if (r) { // FIXME: i don't know why this is necessary (for the padaccess query)
      dict[r.localPadId] = r;
    }
  });
}

function listAccessiblePads(excludePadIds, optLimit, optAcctId, optUserIsGuest) {
  var allPads = {};
  var domainId = domains.getRequestDomainId();
  var accountId = optAcctId || getSessionProAccount().id;

  if (!optUserIsGuest) {
    _insertByLocalId(_publiclySharedPads(optLimit), allPads);
  }
  _insertByLocalId(_padsInvitedTo(domainId, accountId), allPads);
  _insertByLocalId(_groupPads(), allPads);

  (excludePadIds || []).forEach(function(e) { delete allPads[e]; });
  var padList = [];
  for (i in allPads) { padList.push(allPads[i]); }
  return padList;
}

function listAccessiblePads2(excludePadIds, optLimit) {
  var domainId = domains.getRequestDomainId();
  var accountId = getSessionProAccount().id;

  var publiclySharedPadIds = _publiclySharedPads(optLimit).map(function(r){return r.localPadId});
  var padsInvitedToIds = _padsInvitedToIds(domainId, accountId);
  var groupPadIds = _allGroupPadGlobalIds(accountId); // this may include invite only pads
  groupPadIds = pad_security.padIdsUserCanSee(accountId, groupPadIds).map(padutils.globalToLocalId);

  var allPadIds = publiclySharedPadIds.concat(padsInvitedToIds).concat(groupPadIds);
  var allPadIdsSet = jsutils.arrayToSet(allPadIds);
  (excludePadIds || []).forEach(function(e) { delete allPadIdsSet[e]; });
  allPadIds = jsutils.keys(allPadIdsSet);

  var options = {orderBy: "-lastEditedDate"};
  if (optLimit) {
    options['limit'] = optLimit;
  }

  return listOfPads(domainId, allPadIds, options)
}


function listAllDomainPads() {
  var domainId = domains.getRequestDomainId();
  return sqlobj.selectMulti('pro_padmeta', {domainId: domainId, isDeleted: false, isArchived: false});
}

function countOfDomainPads() {
  var domainId = domains.getRequestDomainId();
  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, isDeleted: false, isArchived: false});
  return padlist.length;
}

function listArchivedPads() {
  var domainId = domains.getRequestDomainId();
  var accountId = getSessionProAccount().id;

  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, creatorId: accountId, isDeleted: false, isArchived: true});

  // FIXME: list groups' archived pads?

  return _makeRecordList(padlist);
}

function listPublicPads(limit, excludePadIds, optDomainId) {
  excludePadIds = excludePadIds || [];
  excludePadIds = excludePadIds.map(function(localPadId) {
    return padutils.getGlobalPadId(localPadId);
  });

  optDomainId = optDomainId || domains.getRequestDomainId();

  var metalist = sqlobj.selectMulti('PAD_SQLMETA',
    {id: ["LIKE", optDomainId + "$%"], guestPolicy: "allow", headRev: [">", 1]},
    {orderBy: "-lastWriteTime", limit: limit || 10});

  metalist = metalist.filter(function(meta) {
    if (excludePadIds.indexOf(meta.id) == -1) {
      return true;
    } else {
      return false;
    }
  });
  return listOfPads(optDomainId, metalist.map(function(row) { return padutils.globalToLocalId(row.id); }));
}

function listPadsEditedBy(editorId) {
  editorId = Number(editorId);

  var padList = listPublicPads(10000);
  if (getSessionProAccount()) {
    padList = padList.concat(listFollowedPads(listMyPads()), listAccessiblePads());
  }

  padList = padList.filter(function(p) {
    // NOTE: could replace with binary search to speed things up,
    // since we know that editors array is sorted.
    return p && (p.proAttrs.editors.indexOf(editorId) >= 0);
  });

  var uniq = {};
  for (i in padList) { uniq[padList[i].localPadId] = padList[i]; }
  return jsutils.keys(uniq).map(function(k) { return uniq[k]; });
}

function countPadsCreatedBy(creatorIds) {
  var qs = creatorIds.map(function(c){return "?"});
  var count = sqlobj.executeRaw("select count(*) as count from pro_padmeta where creatorId in (" + qs.join(",") +")", creatorIds);
  return count[0]['count'];
}

function listLiveDomainPads() {
  var thisDomainId = domains.getRequestDomainId();
  var allLivePadIds = collab_server.getAllPadsWithConnections();
  var livePadMap = {};

  allLivePadIds.forEach(function(globalId) {
    if (padutils.isProPadId(globalId)) {
      var domainId = padutils.getDomainId(globalId);
      var localId = padutils.globalToLocalId(globalId);
      if (domainId == thisDomainId) {
        livePadMap[localId] = true;
      }
    }
  });

  var padList = [].concat(listMyPads(), listAccessiblePads());
  padList = padList.filter(function(p) {
    return (!!livePadMap[p.localPadId]);
  });

  return padList;
}

function listPadsEditedSince(timestamp, limit) {
  var domainId = domains.getRequestDomainId();
  timestamp = [">", new Date((parseInt(timestamp)*1000) || 0)];
  return sqlobj.selectMulti("pro_padmeta", {domainId: domainId, isDeleted: false, isArchived: false, lastEditedDate: timestamp}, { orderBy: "lastEditedDate", limit: limit || 0 });
}

function listPadsCreatedSince(domainId, timestamp, limit) {
  timestamp = [">", new Date((parseInt(timestamp)*1000) || 0)];
  return sqlobj.selectMulti("pro_padmeta", {domainId: domainId, isDeleted: false, isArchived: false, createdDate: timestamp}, { orderBy: "createdDate", limit: limit || 0 });
}

function listPadsCreatedByUsers(userIds, limit) {
  return sqlobj.selectMulti('pro_padmeta', {creatorId: ["IN", userIds], isDeleted: false}, { limit: limit });
}

function listPadsCreatedByEmails(userEmails, limit) {
  return listPadsCreatedByUsers(_userIdsForEmails(userEmails));
}

// Super hacky -- does a full table scan on pro_padmeta.
// Does not include pads where this id is the only editor -- use listPadsCreatedByUsers for that.
function listPadsEditedByUser(id) {
  id = Number(id);

  // Witness the magic of querying JSON with SQL...
  return sqlobj.executeRaw('select * from pro_padmeta where ' +
    'isDeleted = false AND(' +
      'proAttrsJson like "%[' + id + ',%" OR ' + // First editor
      'proAttrsJson like "%,' + id + ',%" OR ' + // Middle editor
      'proAttrsJson like "%,' + id + ']%"' + // Last editor
    ');', []);
}

// Still super hacky!
function listPadsEditedByEmail(userEmail) {
  var ids = _userIdsForEmails([userEmail]);

  // We're assuming there could be multiple accounts for an email.
  return _.flatten(ids.map(function(id) {
    return listPadsEditedByUser(id);
  }));
}

function decorateWithPadSqlMeta(proPadRows) {
  var globalIds = proPadRows.map(
    function(row){
      return padutils.getGlobalPadId(row.localPadId, row.domainId);
    }
  );

  // load from db into map by global id
  var sqlMeta = sqlobj.selectMulti("PAD_SQLMETA", {id: ['in', globalIds]});
  var sqlMetaMap = {};
  sqlMeta.forEach(function(sqlMeta){ sqlMetaMap[sqlMeta.id] = sqlMeta});

  // decorate
  proPadRows.forEach(function(row) {
    var globalPadId = padutils.getGlobalPadId(row.localPadId, row.domainId);
    jsutils.extend(row, sqlMetaMap[globalPadId])
  });
}

function _listAccountsWithEmails(emails) {
  return sqlobj.selectMulti('pro_accounts', {email: ["IN", emails] });
}

function _userIdsForEmails(userEmails) {
  return _listAccountsWithEmails(userEmails).map(function(row) {
    return row.id;
  });
}

function decorateWithCreators(proPadRows) {
  var creatorIds = proPadRows.map(
    function(row){
      return row.creatorId;
    }
  ).filter(function(id){ return id != null });

  // load from db into map by global id
  var creators = sqlobj.selectMulti("pro_accounts", {id: ['in', creatorIds]});
  var creatorsMap = jsutils.dictByProperty(creators, 'id');

  // decorate
  proPadRows.forEach(function(row) {
    row.creator = creatorsMap[row.creatorId];
  });
}

//--------------------------------------------------------------------------------
// misc utils
//--------------------------------------------------------------------------------


function _withCache(name, fn) {
  return syncedWithCache('pro-padmeta.'+name, fn);
}

function _withDomainCache(domainId, name, fn) {
  return _withCache(name+"."+domainId, fn);
}

