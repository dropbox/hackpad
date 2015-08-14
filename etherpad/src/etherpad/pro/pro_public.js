import("sqlbase.sqlobj");
import("jsutils");
import("execution");

import("etherpad.log");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.domains");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.control.searchcontrol");

function hidePublicPad(globalPadId) {
  _setPadVisibility(globalPadId, 'hidden');
}

function unhidePublicPad(globalPadId) {
  _setPadVisibility(globalPadId, 'visible');
}

function _setPadVisibility(globalPadId, visibility) {
  pro_padmeta.accessProPad(globalPadId, function(propad) {
    propad.setVisibility(visibility);
  })
  model.updateSolrIndexForPad(globalPadId);
}

function listHiddenPads(limit, excludePadIds) {
  return listGlobalPublicPads(limit, excludePadIds, "hidden");
}

function listPublicPads(limit, excludePadIds, optVisibility) {
  excludePadIds = excludePadIds || [];
  optVisibility = optVisibility || "visible";
  var excludePadIdsMap = {};
  excludePadIds.forEach(function(localPadId) {
    excludePadIdsMap[padutils.getGlobalPadId(localPadId)] = true;
  });

  var domainId = domains.getRequestDomainId();
  request.profile.tick("Before solr public pad fetch");
  var publicPads = searchcontrol.getPublicPads(0, excludePadIds.length + limit, {visibility: optVisibility, domains: [domainId]});

  publicPads = publicPads.filter(function(pad) {
    return !excludePadIdsMap[pad.localPadId];
  });
  request.profile.tick("Before db listOfPads for public pads");
  return publicPads;
}

function listGlobalPublicPads(limit, excludeGlobalPadIds, optVisibility) {
  excludeGlobalPadIds = excludeGlobalPadIds || [];
  optVisibility = optVisibility || "visible";
  var excludeGlobalPadIdsMap = {};
  excludeGlobalPadIds.forEach(function(globalPadId) {
    excludeGlobalPadIdsMap[globalPadId] = true;
  });

  request.profile.tick("Before getting public domains");
  var publicDomains = domains.getPublicDomainsHash();
  request.profile.tick("Before solr public pad fetch");
  var publicPads = searchcontrol.getPublicPads(0, excludeGlobalPadIds.length + limit, {visibility: optVisibility});

  publicPads = publicPads.filter(function(pad) {
    return !excludeGlobalPadIdsMap[pad.globalPadId] && (pad.domainId in publicDomains || pad.domainId == domains.getPrimaryDomainId());
  });
  request.profile.tick("Before db listOfGlobalPads for public pads");
  return publicPads;
}

function _rebuildRecentDomainsList() {
  // Schedule next rebuild in an hour
  scheduleRebuildRecentPublicDomains(1000*60*60);
  log.info("Rebuilding recent public domains list...");

  var publicDomains = domains.getPublicDomainsHash();

  function buildDomainsListString(domainsHash) {
    var publicDomainsList = jsutils.keys(publicDomains);
    if (!publicDomainsList.length) {
      return null;
    }
    return "("+publicDomainsList.join(",")+")";
  }

  var MIN_PADS_PER_DOMAIN = 5;
  var MIN_MEMBERS_PER_DOMAIN = 5;

  var publicDomainsString = buildDomainsListString(publicDomains);
  if (!publicDomainsString) {
    return [];
  }

  // Count all domain accounts (isDeleted and flags aren't indexed and would be too costly for the purpose of approximation)
  sqlobj.executeRaw(
    "SELECT COUNT(*) as numMembers, domainId FROM pro_accounts WHERE domainId IN "+publicDomainsString+" GROUP BY domainId HAVING numMembers <"+MIN_MEMBERS_PER_DOMAIN
    , []).forEach(function(r) { delete publicDomains[r.domainId]; });

  publicDomainsString = buildDomainsListString(publicDomains);
  if (!publicDomainsString) {
    return [];
  }

  // Fetch pads edited in the last two weeks in populated public domains
  var recentlyEditedPads = sqlobj.executeRaw("SELECT domainId, localPadId, lastEditedDate FROM pro_padmeta WHERE domainId IN "+publicDomainsString+" AND lastEditedDate > DATE_SUB(now(), INTERVAL 14 DAY) ORDER BY lastEditedDate DESC;"
    ,[]);

  if (!recentlyEditedPads.length) {
    return [];
  }

  // Gather all the global pad ids to check for pad guest policies
  var globalPadIdsToCheck = [];
  recentlyEditedPads.forEach(function(r) {
    var globalPadId = padutils.makeGlobalId(r.domainId, r.localPadId);
    globalPadIdsToCheck.push("\""+globalPadId+"\"");
  });

  // Get a list of pads to exclude from the recently edited pad list
  var nonPublicPads = sqlobj.executeRaw("SELECT id FROM PAD_SQLMETA WHERE guestPolicy != 'allow' AND id IN ("+globalPadIdsToCheck.join(",")+")"
    ,[]);

  // Make a quick look up hash of non-public pads
  var nonPublicPadsMap = {};
  nonPublicPads.forEach(function(r) {
    nonPublicPadsMap[r.id] = true;
  });

  var domainIdToPadCountMap = {};
  var domainIdToTimestampMap = {};
  recentlyEditedPads.forEach(function(r) {
    var globalPadId = padutils.makeGlobalId(r.domainId, r.localPadId);
    if (nonPublicPadsMap[globalPadId]) {
      return;
    }
    // Traversing in most recent first order, keep the first value
    if (!domainIdToTimestampMap[r.domainId]) {
      domainIdToTimestampMap[r.domainId] = r.lastEditedDate;
    }
    var cnt = domainIdToPadCountMap[r.domainId] || 0;
    domainIdToPadCountMap[r.domainId] = cnt + 1;
  });

  var recentDomains = [];
  jsutils.eachProperty(publicDomains, function(id, v) {
    if (!domainIdToPadCountMap[id] || domainIdToPadCountMap[id] < MIN_PADS_PER_DOMAIN) {
      return;
    }
    recentDomains.push({
      domainId: id,
      padCount: domainIdToPadCountMap[id],
      lastEditedDate: domainIdToTimestampMap[id],
    });
  });

  jsutils.sortBy(recentDomains, 'lastEditedDate');
  appjet.cache.recentPublicDomainsList = recentDomains;
  return recentDomains;
}

function listRecentPublicDomains() {
  if (!appjet.cache.recentPublicDomainsList) {
    _rebuildRecentDomainsList();
  }
  return appjet.cache.recentPublicDomainsList || [];
}

function onStartup() {
  execution.initTaskThreadPool("public-processing", 1);
  scheduleRebuildRecentPublicDomains(1000 /*delay*/);
}

function scheduleRebuildRecentPublicDomains(delay) {
  execution.scheduleTask('public-processing', 'rebuildRecentDomainsList', delay, []);
}

serverhandlers.tasks.rebuildRecentDomainsList = function() {
  _rebuildRecentDomainsList();
}
