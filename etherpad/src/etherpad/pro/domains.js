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

// Library for managing subDomains

import("jsutils.*");
import("sqlbase.sqlobj");

import("etherpad.pad.padutils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.sessions");

jimport("java.lang.System.out.println");

// reserved domains
var reservedSubdomains = {
  'alpha': 1,
  'beta': 1,
  'blog': 1,
  'comet': 1,
  'diagnostic': 1,
  'forums': 1,
  'forumsdev': 1,
  'staging': 1,
  'web': 1,
  'www': 1,
  'foo': 1,
  'bar': 1,
  'baz': 1,
  'server': 1
};

function _getCache() {
  if (!appjet.cache.pro_domains) {
    appjet.cache.pro_domains = {
      records: {id: {}, subDomain: {}}
    };
  }
  return appjet.cache.pro_domains;
}

function doesSubdomainExist(subDomain) {
  if (reservedSubdomains[subDomain]) {
    return true;
  }
  if (getDomainRecordFromSubdomain(subDomain) != null) {
    return true;
  }
  return false;
}

function _updateCache(locator) {
  var record = sqlobj.selectSingle('pro_domains', locator);
  var recordCache = _getCache().records;

  if (record) {
    // update both maps: recordCache.id, recordCache.subDomain
    recordCache['id'][record['id']] = record;
    var subDomainRecords = recordCache['subDomain'][record['subDomain']] || {};
    // convert old record to new format
    if ('id' in subDomainRecords) {
      var oldRecord = subDomainRecords;
      subDomainRecords = {};
      subDomainRecords[oldRecord.id] = oldRecord;
    }
    subDomainRecords[record.id] = record;
    recordCache['subDomain'][record['subDomain']] = subDomainRecords;
  }
}

function getDomainRecord(domainId) {
  if (!(domainId in _getCache().records.id)) {
    _updateCache({id: domainId});
  }
  var record = _getCache().records.id[domainId];
  return (record && !record.isDeleted ? record : null);
}

function getDomainRecordsForIds(domainIds) {
  var records = [];
  domainIds.forEach(function(domainId) {
    var record = getDomainRecord(domainId);
    if (record) {
      records.push(record);
    }
  });
  return records;
}

function filterDeletedRecords(records) {
  records = values(records).filter(function(r) {
    return r && !r.isDeleted;
  });
  return records.length ? records[0] : null;
}

function getDomainRecordFromSubdomain(subDomain) {
  subDomain = subDomain.toLowerCase();
  var recordsCheck = _getCache().records.subDomain[subDomain];

  // There could be multiple cached domains, some of which can be deleted.
  // We want to only work with the ones that are not deleted.
  if (!recordsCheck || !filterDeletedRecords(recordsCheck)) {
    _updateCache({subDomain: subDomain, isDeleted: false});
  }

  var records = _getCache().records.subDomain[subDomain];
  var record;
  if (records) {
    record = filterDeletedRecords(records);
  }

  return (record && !record.isDeleted ? record : null);
}

/** returns id of newly created subDomain */
function createNewSubdomain(subDomain, orgName) {
  var sql = "insert into pro_domains (subDomain, orgName, createdDate) select ?, ?, ? from dual where not exists (select 1 from pro_domains where subDomain = ? and isDeleted = false);";
  var id = sqlobj.executeRawInsert(sql, [subDomain, orgName, new Date(), subDomain]);
  if (!id) {
    throw Error("Can't create '"+subDomain+"', it already exists!");
  }
  _updateCache({id: id});
  return id;
}

function listPublicDomains() {
  var publicDomainIds = sqlobj.selectMulti('pro_config', {name: 'publicDomain', jsonVal: '{"x":true}'})
    .map(function(r) { return r.domainId; });
  return sqlobj.selectMulti('pro_domains', {id: ['IN', publicDomainIds], isDeleted: false}).map(function(r) { return r.id; });
}

function getPublicDomainsHash() {
  var publicDomains = {};
  sqlobj.selectMulti('pro_config', {name: 'publicDomain', jsonVal: '{"x":true}'})
    .forEach(function(r) { publicDomains[r.domainId] = 1; });
  sqlobj.selectMulti('pro_domains', {isDeleted: true}).forEach(function(r) { delete publicDomains[r.id]; });
  return publicDomains;
}

function getAllDomains() {
  return sqlobj.selectMulti('pro_domains', {isDeleted:false});
}


function getPrivateNetworkDomainId() {
  var r = getDomainRecordFromSubdomain('<<private-network>>');
  if (!r) {
    throw Error("<<private-network>> does not exist in the domains table!");
  }
  return r.id;
}

function getPrimaryDomainId() {
  return 1;
}

function isPrimaryDomainRequest() {
  var r = getRequestDomainRecord();
  return r && r.id === getPrimaryDomainId();
}

function supportsNonDefaultGoogleSignin() {
  return supportsFacebookSignin();
}

function supportsFacebookSignin() {
  return isPrimaryDomainRequest() || pro_config.getConfig().allowFacebookSignin || !pro_config.getConfig().allowDomain;
}

function isPublicDomain(optDomainId) {
  return (pro_config.getConfig(optDomainId) || {}).publicDomain;
}

function isPrivateDomainRequest() {
  return !(isPublicDomain() || isPrimaryDomainRequest());
}

/** returns null if not found. */
function getRequestDomainRecord() {
  if (pro_utils.getRequestIsSuperdomain()) {
    return getDomainRecord(getPrivateNetworkDomainId());
  } else {
    var subDomain = pro_utils.getProRequestSubdomain();
    return getDomainRecordFromSubdomain(subDomain);
  }
}

function domainIsOnThisServer(domainId) {
  if (appjet.config.proOnly) {
    return domainId > 1;
  }
  return domainId == 1;
}

/* throws exception if not pro domain request. */
function getRequestDomainId() {
  var r = getRequestDomainRecord();
  if (!r) {
    throw Error("Error getting request domain id.");
  }
  return r.id;
}

function fqdnForGlobalPadId(globalPadId) {
  var domainRecord = getDomainRecord(padutils.getDomainId(globalPadId));
  if (domainRecord.orgName != null && domainRecord['subDomain']) {
    return domainRecord.subDomain + "." + appjet.config['etherpad.canonicalDomain'];
  }
  return appjet.config['etherpad.canonicalDomain'];
}

function fqdnForDomainId(domainId) {
  var domainRecord = getDomainRecord(domainId);
  if (domainRecord.orgName != null && domainRecord['subDomain']) {
    return domainRecord.subDomain + "." + appjet.config['etherpad.canonicalDomain'];
  }
  return appjet.config['etherpad.canonicalDomain'];
}


function deleteDomain(domainId, account) {
  if (!account.isAdmin || domains.isPrimaryDomainRequest()) {
    throw Error("access denied");
  }

  sqlobj.update('pro_domains', {id: domainId}, {isDeleted: true, deletedDate: new Date()});
  _updateCache({id: domainId});
}

function renameDomain(oldName, newName) {
  if (!sessions.isAnEtherpadAdmin()) {
    throw Error("access denied");
  }

  var domainId = getDomainRecordFromSubdomain(oldName.toLowerCase()).id;
  newName = newName.toLowerCase();

  var r = getDomainRecord(domainId);
  if (!r || r.isDeleted) {
    throw Error("Unknown or deleted domainId: " + domainId);
  }

  sqlobj.update('pro_domains', {id: domainId}, {subDomain: newName, orgName: newName});
  pro_config.setConfigVal("siteName", newName, domainId);
  _updateCache({id: domainId});

  delete _getCache().records.subDomain[r.subDomain];
}

