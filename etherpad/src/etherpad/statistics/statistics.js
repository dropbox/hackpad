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

import("dateutils.noon");
import("execution");
import("exceptionutils");
import("fastJSON");
import("fileutils.fileLineIterator");
import("jsutils.*");
import("sqlbase.sqlobj");

import("etherpad.log");

jimport("net.appjet.oui.GenericLoggerUtils");
jimport("net.appjet.oui.LoggableFromJson");
jimport("net.appjet.oui.FilterWrangler");
jimport("java.lang.System.out.println");
jimport("net.appjet.common.util.ExpiringMapping");

var millisInDay = 86400*1000;

function _stats() {
  if (! appjet.cache.statistics) {
    appjet.cache.statistics = {};
  }
  return appjet.cache.statistics;
}

function onStartup() {
  execution.initTaskThreadPool("statistics", 1);
  _scheduleNextDailyUpdate();

  onReset();
}

function _logInfo(m) {
  log.info({type: 'statistics', message: m});
}

function _logWarn(m) {
  log.info({type: 'statistics', message: m});
}

function _statData() {
  return _stats().stats;
}

function getAllStatNames() {
  return keys(_statData());
}

function getStatData(statName) {
  return _statData()[statName];
}

function _setStatData(statName, data) {
  _statData()[statName] = data;
}

// calls the snapshot function on the stat specified;
// this returns an object which can provide total(),
// history(bucketsPerSample, numSamples), latest(bucketsPerSample)
// efficiently
function liveSnapshot(stat) {
  var statObject;
  if (typeof(stat) == 'string') {
    // "stat" is the stat name.
    statObject = getStatData(stat);
  } else if (typeof(stat) == 'object') {
    statObject = stat;
  } else {
    return;
  }
  return _callFunction(statObject.snapshot_f,
    statObject.name, statObject.options, statObject.data);
}

// ------------------------------------------------------------------
// stats processing
// ------------------------------------------------------------------

// some useful constants
var LIVE = 'live';
var HIST = 'historical';
var HITS = 'hits';
var UNIQ = 'uniques';
var VALS = 'values';
var HGRM = 'histogram';
var GRPUNIQ = 'groupeduniques';

// helpers

function _date(d) {
  return new Date(d);
}

function _saveStat(day, name, value) {
  var timestamp = Math.floor(day.valueOf() / 1000);
  _logInfo(fastJSON.stringify({statistic: name,
         timestamp: timestamp,
         value: value}));
  try {
    sqlobj.insert('statistics', {
      name: name,
      timestamp: timestamp,
      value: fastJSON.stringify(value)
    });
  } catch (e) {
    var msg;
    try {
      msg = e.getMessage();
    } catch (e2) {
      try {
        msg = e.toSource();
      } catch (e3) {
        msg = "(none)";
      }
    }
    _logWarn("failed to save stat "+name+": "+msg);
  }
}

function _convertScalaMapToJs(scalaMap) {
  var jsMap = {};
  scalaMap.foreach(scalaF1(function(pair) {jsMap[pair._1()] = pair._2(); }));
  return jsMap;
}

function _convertScalaTopValuesToJs(topValues) {
  var totalValue = topValues._1();
  var countsMap = topValues._2();
  var countsObj = {};
  countsMap.foreach(scalaF1(function(pair) { countsObj[pair._1()] = pair._2(); }));
  return {total: totalValue, counts: countsObj};
}

function _fakeMap() {
  var map = {}
  return {
    get: function(k) { return map[k]; },
    put: function(k, v) { map[k] = v; },
    remove: function(k) { delete map[k]; }
  }
}

function _withinSecondsOf(numSeconds, t1, t2) {
  return (t1 > t2-numSeconds*1000) && (t1 < t2+numSeconds*1000);
}

function _callFunction(functionName, arg1, arg2, etc) {
  var f = this[functionName];
  var args = Array.prototype.slice.call(arguments, 1);
  return f.apply(this, args);
}

// trackers and other init functions

function _hitTracker(trackerType, timescaleType) {
  var className;
  switch (trackerType) {
    case HITS: className = "BucketedLastHits"; break;
    case UNIQ: className = "BucketedUniques"; break;
    case VALS: className = "BucketedValueCounts"; break;
    case HGRM: className = "BucketedLastHitsHistogram"; break;
    case GRPUNIQ: className = "BucketedGroupedUniques"; break;
  }
  var tracker;
  switch (timescaleType) {
    case LIVE:
      tracker = new net.appjet.oui[className](24*60*60*1000);
      break;
    case HIST:
      // timescale just needs to be longer than a day.
      tracker = new net.appjet.oui[className](365*24*60*60*1000, true);
      break;
  }

  var conversionData = {
    total_f: "count",
    history_f: "history",
    latest_f: "latest",
  };
  switch (trackerType) {
    case HITS: case UNIQ:
      conversionData.conversionFunction =
        function(x) { return x; } // no conversion necessary.
      break;
    case VALS:
      conversionData.conversionFunction = _convertScalaTopValuesToJs;
      break;
    case GRPUNIQ:
      conversionData.conversionFunction = _convertScalaMapToJs;
      break;
    case HGRM:
      conversionData.conversionFunction =
        function(hFunc) { return function(pct) { return hFunc.apply(pct); } }
      break;
  }


  return {
    tracker: tracker,
    conversionData: conversionData,
    hit: function(d, n1, n2) {
      d = _date(d);
      if (n2 === undefined) {
        return this.tracker.hit(d, n1);
      } else {
        return this.tracker.hit(d, n1, n2);
      }
    },
    get total() {
      return this.conversionData.conversionFunction(this.tracker[this.conversionData.total_f]());
    },
    history: function(bucketsPerSample, numSamples) {
      var scalaArray = this.tracker[this.conversionData.history_f](bucketsPerSample, numSamples);
      var jsArray = [];
      for (var i = 0; i < scalaArray.length(); ++i) {
        jsArray.push(this.conversionData.conversionFunction(scalaArray.apply(i)));
      }
      return jsArray;
    },
    latest: function(bucketsPerSample) {
      return this.conversionData.conversionFunction(this.tracker[this.conversionData.latest_f](bucketsPerSample));
    }
  }
}


function _initCount(statName, options, timescaleType) {
  return _hitTracker(HITS, timescaleType);
}
function _initUniques(statName, options, timescaleType) {
  return _hitTracker(UNIQ, timescaleType);
}
function _initGroupedUniques(statName, options, timescaleType) {
  return _hitTracker(GRPUNIQ, timescaleType);
}
function _initTopValues(statName, options, timescaleType) {
  return _hitTracker(VALS, timescaleType);
}
function _initHistogram(statName, options, timescaleType) {
  return _hitTracker(HGRM, timescaleType);
}

function _initLatencies(statName, options, type) {
  var hits = _initTopValues(statName, options, type);
  var latencies = _initTopValues(statName, options, type);

  return {
    hit: function(d, value, latency) {
      hits.hit(d, value);
      latencies.hit(d, value, latency);
    },
    hits: hits,
    latencies: latencies
  }
}

function _initDisconnectTracker(statName, options, timescaleType) {
  return {
    map: (timescaleType == LIVE ? new ExpiringMapping(60*1000) : _fakeMap()),
    counter: _initCount(statName, options, timescaleType),
    uniques: _initUniques(statName, options, timescaleType),
    isLive: timescaleType == LIVE
  }
}

// update functions

function _updateCount(statName, options, logName, data, logObject) {
  // println("update count: "+statName+" on log "+logName+", with data: "+data.toSource()+" with log entry: "+logObject.toSource());
  if (options.filter == null || options.filter(logObject)) {
    data.hit(logObject.date, 1);
  }
}

function _updateSum(statName, options, logName, data, logObject) {
  // println("update sum: "+statName+" on log "+logName+", with data: "+data.toSource()+" with log entry: "+logObject.toSource());
  if (options.filter == null || options.filter(logObject)) {
    data.hit(logObject.date, Math.round(Number(logObject[options.fieldName])));
  }
}

function _updateUniquenessCount(statName, options, logName, data, logObject) {
  // println("update uniqueness: "+statName+" on log "+logName+", with data: "+data.toSource()+" with log entry: "+logObject.toSource());
  if (options.filter == null || options.filter(logObject)) {
    var value = logObject[options.fieldName];
    if (value === undefined) { return; }
    data.hit(logObject.date, value);
  }
}

function _updateTopValues(statName, options, logName, data, logObject) {
  // println("update topvalues: "+statName+" on log "+logName+", with data: "+data.toSource()+" with log entry: "+logObject.toSource());

  if (options.filter == null || options.filter(logObject)) {
    var value = logObject[options.fieldName];
    if (value === undefined) { return; }
    if (options.canonicalizer) {
      value = options.canonicalizer(value);
    }
    data.hit(logObject.date, value);
  }
}

function _updateLatencies(statName, options, logName, data, logObject) {
  // println("update latencies: "+statName+" on log "+logName+", with data: "+data.toSource()+" with log entry: "+logObject.toSource());

  if (options.filter == null || options.filter(logObject)) {
    var value = logObject[options.fieldName];
    var latency = logObject[options.latencyFieldName];
    if (value === undefined) { return; }
    data.hit(logObject.date, value, latency);
  }
}

function _updateDisconnectTracker(statName, options, logName, data, logObject) {
  if (logName == "frontend/padevents" && logObject.type != "userleave") {
    // we only care about userleaves from the padevents log.
    return;
  }

  var [evtPrefix, otherPrefix] =
    (logName == "frontend/padevents" ? ["l-", "d-"] : ["d-", "l-"]);
  var dateLong = logObject.date;
  var userId = logObject.session;

  var lastOtherEvent = data.map.get(otherPrefix+userId);
  if (lastOtherEvent != null && _withinSecondsOf(60, dateLong, lastOtherEvent.date)) {
    data.counter.hit(logObject.date, 1);
    data.uniques.hit(logObject.date, userId);
    data.map.remove(otherPrefix+userId);
    if (data.isLive) {
      log.custom("avoidable_disconnects",
                 {userId: userId,
                  errorMessage: lastOtherEvent.errorMessage || logObject.errorMessage});
    }
  } else {
    data.map.put(evtPrefix+userId, {date: dateLong, message: logObject.errorMessage});
  }
}

// snapshot functions

function _lazySnapshot(snapshot) {
  var total;
  var history = {};
  var latest = {};
  return {
    get total() {
      if (total === undefined) {
        total = snapshot.total;
      }
      return total;
    },
    history: function(bucketsPerSample, numSamples) {
      if (history[""+bucketsPerSample+":"+numSamples] === undefined) {
        history[""+bucketsPerSample+":"+numSamples] = snapshot.history(bucketsPerSample, numSamples);
      }
      return history[""+bucketsPerSample+":"+numSamples];
    },
    latest: function(bucketsPerSample) {
      if (latest[""+bucketsPerSample] === undefined) {
        latest[""+bucketsPerSample] = snapshot.latest(bucketsPerSample);
      }
      return latest[""+bucketsPerSample];
    }
  }
}

function _snapshotTotal(statName, options, data) {
  return _lazySnapshot(data);
}

function _convertTopValue(topValue) {
  var counts = topValue.counts;
  var sortedValues = keys(counts).sort(function(x, y) {
    return counts[y] - counts[x];
  }).map(function(key) {
    return { value: key, count: counts[key] };
  });
  return {count: topValue.total, topValues: sortedValues.slice(0, 50) };
}

function _snapshotTopValues(statName, options, data) {
  var convertedData = {};

  return _lazySnapshot({
    get total() {
      return _convertTopValue(data.total);
    },
    history: function(bucketsPerSample, numSamples) {
      return data.history(bucketsPerSample, numSamples).map(_convertTopValue);
    },
    latest: function(bucketsPerSample) {
      return _convertTopValue(data.latest(bucketsPerSample));
    }
  });
}

function _snapshotLatencies(statName, options, data) {
  // convert the hits + total latencies into a topValues-style data object.
  var hits = data.hits;
  var totalLatencies = data.latencies;

  function convertCountsObjects(latencyCounts, hitCounts) {
    var mergedCounts = {}
    keys(latencyCounts.counts).forEach(function(value) {
      mergedCounts[value] =
        Math.round(latencyCounts.counts[value] / (hitCounts.counts[value] || 1));
    });
    return {counts: mergedCounts, total: latencyCounts.total / (hitCounts.total || 1)};
  }

  // ...and then convert that object into a snapshot.
  return _snapshotTopValues(statName, options, {
    get total() {
      return convertCountsObjects(totalLatencies.total, hits.total);
    },
    history: function(bucketsPerSample, numSamples) {
      return mergeArrays(
        convertCountsObjects,
        totalLatencies.history(bucketsPerSample, numSamples),
        hits.history(bucketsPerSample, numSamples));
    },
    latest: function(bucketsPerSample) {
      return convertCountsObjects(totalLatencies.latest(bucketsPerSample), hits.latest(bucketsPerSample));
    }
  });
}

function _snapshotDisconnectTracker(statName, options, data) {
  var topValues = {};
  var counts = data.counter;
  var uniques = data.uniques;
  function topValue(counts, uniques) {
    return {
      count: counts,
      topValues: [{value: "total_disconnects", count: counts},
                  {value: "disconnected_userids", count: uniques}]
    }
  }
  return _lazySnapshot({
    get total() {
      return topValue(counts.total, uniques.total);
    },
    history: function(bucketsPerSample, numSamples) {
      return mergeArrays(
        topValue,
        counts.history(bucketsPerSample, numSamples),
        uniques.history(bucketsPerSample, numSamples));
    },
    latest: function(bucketsPerSample) {
      return topValue(counts.latest(bucketsPerSample), uniques.latest(bucketsPerSample));
    }
  });
}

function _generateLogInterestMap(statNames) {
  var interests = {};
  statNames.forEach(function(statName) {
    var logs = getStatData(statName).logNames;
    logs.forEach(function(logName) {
      if (! interests[logName]) {
        interests[logName] = {};
      }
      interests[logName][statName] = true;
    });
  });
  return interests;
}


// ------------------------------------------------------------------
// stat generators
// ------------------------------------------------------------------

// statSpec has these properties
//   name
//   dataType - line, topvalues, histogram, etc.
//   logNames
//   init_f
//   update_f
//   snapshot_f
//   options - object containing any additional data, passed in to to the various functions.

// init_f gets (statName, options, "live"|"historical")
// update_f gets (statName, options, logName, data, logObject)
// snapshot_f gets (statName, options, data)
function addStat(statSpec) {
  var statName = statSpec.name;
  if (! getStatData(statName)) {
    var initialData =
      _callFunction(statSpec.init_f, statName, statSpec.options, LIVE);
    _setStatData(statName, {
      data: initialData,
    });
  }

  var s = getStatData(statName);

  s.options = statSpec.options;
  s.name = statName;
  s.logNames = statSpec.logNames;
  s.dataType = statSpec.dataType;
  s.historicalDays = ("historicalDays" in statSpec ? statSpec.historicalDays : 1);

  s.init_f = statSpec.init_f;
  s.update_f = statSpec.update_f;
  s.snapshot_f = statSpec.snapshot_f;

  function registerInterest(logName) {
    if (! _stats().logNamesToInterestedStatNames[logName]) {
      _stats().logNamesToInterestedStatNames[logName] = {};
    }
    _stats().logNamesToInterestedStatNames[logName][statName] = true;
  }
  statSpec.logNames.forEach(registerInterest);
}

function addSimpleCount(statName, historicalDays, logName, filter) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initCount",
    update_f: "_updateCount",
    snapshot_f: "_snapshotTotal",
    options: { filter: filter },
    historicalDays: historicalDays || 1
  });
}

function addSimpleSum(statName, historicalDays, logName, filter, fieldName) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initCount",
    update_f: "_updateSum",
    snapshot_f: "_snapshotTotal",
    options: { filter: filter, fieldName: fieldName },
    historicalDays: historicalDays || 1
  });
}

function addUniquenessCount(statName, historicalDays, logName, filter, fieldName) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initUniques",
    update_f: "_updateUniquenessCount",
    snapshot_f: "_snapshotTotal",
    options: { filter: filter, fieldName: fieldName },
    historicalDays: historicalDays || 1
  })
}

function addTopValuesStat(statName, historicalDays, logName, filter, fieldName, canonicalizer) {
  addStat({
    name: statName,
    dataType: "topValues",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initTopValues",
    update_f: "_updateTopValues",
    snapshot_f: "_snapshotTopValues",
    options: { filter: filter, fieldName: fieldName, canonicalizer: canonicalizer },
    historicalDays: historicalDays || 1
  });
}

function addLatenciesStat(statName, historicalDays, logName, filter, fieldName, latencyFieldName) {
  addStat({
    name: statName,
    dataType: "topValues",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initLatencies",
    update_f: "_updateLatencies",
    snapshot_f: "_snapshotLatencies",
    options: { filter: filter, fieldName: fieldName, latencyFieldName: latencyFieldName },
    historicalDays: historicalDays || 1
  });
}

// COHORT USERS
function _initializeCohortInfo() {
  var _binarySearch = function(arr, find, comparator) {
    var low = 0, high = arr.length - 1,
        i, comparison;
    while (low <= high) {
      i = Math.floor((low + high) / 2);
      comparison = comparator(arr[i], find);
      if (comparison < 0) { low = i + 1; continue; };
      if (comparison > 0) { high = i - 1; continue; };
      return i;
    }
    return -1;
  };


  var rows = sqlobj.executeRaw("select YEARWEEK(createdDate)as cohortId, min(id) as minUserId, max(id) as maxUserId from pro_accounts group by YEARWEEK(createdDate)", [], false);

  return {
    cohortIdByUserId : function (userId) {
      var index = _binarySearch(rows, userId, function(row, userId) {
        if (userId > row.maxUserId) { return -1; };
        if (userId < row.minUserId) { return 1; };
        return 0;
      });
      if (index > -1) {
        return rows[index].cohortId;
      } else {
        return "unknown";
      }
    },
    cohortSizeByCohortId: function(cohortId) {
      var index = _binarySearch(rows, cohortId, function(row, cohortId) {
        if (cohortId > row.cohortId) { return -1; };
        if (cohortId < row.cohortId) { return 1; };
        return 0;
      });
      if (index > -1) {
        return (rows[index].maxUserId - rows[index].minUserId) + 1;
      } else {
        return 1; // prevent division by zero
      }
    }
  };
}

function _cohortForUser (userId, cache) {
  if (!cache.cohortInfo) {
    cache.cohortInfo = _initializeCohortInfo();
  }

  if (userId.substr(0,2) == "p.") {
    userId = parseInt(userId.substring(2));
  } else {
    return "unknown";
  }

  return cache.cohortInfo.cohortIdByUserId(userId);
}

function _initCohortCount(statName, options, timescaleType) {
  return {
    cache: {},
    counter: _initTopValues(statName, options, timescaleType),
  }
}

function _initCohortUniques(statName, options, timescaleType) {
  return {
    cache: {},
    uniqueVals: _initGroupedUniques(statName, options, timescaleType),
  }
}

function _updateCohortCount(statName, options, logName, data, logObject) {
  if (options.filter && ! options.filter(logObject)) {
    return;
  }

  // for now, only do cohorts by pro userId
  var userId = _returningUsersUserId(logObject);
  if (! userId) { return; }
  var date = logObject.date;

  var cohortId = _cohortForUser(userId, data.cache);

  data.counter.hit(date, cohortId, 1);

  //log.info(statName + " cohort info is now:" + fastJSON.stringify(data.counter.total));
}

function _updateCohortUniques(statName, options, logName, data, logObject) {
  if (options.filter && ! options.filter(logObject)) {
    return;
  }

  // for now, only do cohorts by pro userId
  var userId = _returningUsersUserId(logObject);
  if (! userId) { return; }
  var date = logObject.date;

  var cohortId = _cohortForUser(userId, data.cache);

  if (cohortId != "unknown") {
    // must be a pro user
    var accountId = parseInt(userId.substring(2));
    data.uniqueVals.hit(date, accountId, parseInt(cohortId));
  }

  //log.info(statName + " cohort info is now (FAKE):" + fastJSON.stringify(data.uniqueVals.total));
}

function _snapshotCohortCount(statName, options, data) {
  function _convertCohortValue(topValue) {
    var counts = topValue.counts;
    var values = keys(counts).map(function(key) {
      return { value: key, count: counts[key] / data.cache.cohortInfo.cohortSizeByCohortId(key) };
    });
    return {count: topValue.total, topValues: values };
  }

  // ...and then convert that object into a snapshot.
   var snapshot = _lazySnapshot({
    get total() {
      return _convertCohortValue(data.counter.total);
    },
    history: function(bucketsPerSample, numSamples) {
      return data.counter.history(bucketsPerSample, numSamples).map(_convertCohortValue);
    },
    latest: function(bucketsPerSample) {
      return _convertCohortValue(data.counter.latest(bucketsPerSample));
    }
  });

//  log.info(statName + " cohort info is now:" + fastJSON.stringify(snapshot.total));
  return snapshot;
}

function _snapshotCohortUniques(statName, options, data) {
  function _convertCohortValue(counts) {
    var total = 0;
    var values = keys(counts).map(function(key) {
      total += counts[key];
      return { value: key, count: counts[key] / data.cache.cohortInfo.cohortSizeByCohortId(key) };
    });
    return {count: total, topValues: values};
  }

  // ...and then convert that object into a snapshot.
   var snapshot = _lazySnapshot({
    get total() {
      return _convertCohortValue(data.uniqueVals.total);
    },
    history: function(bucketsPerSample, numSamples) {
      return data.uniqueVals.history(bucketsPerSample, numSamples).map(_convertCohortValue);
    },
    latest: function(bucketsPerSample) {
      return _convertCohortValue(data.uniqueVals.latest(bucketsPerSample));
    }
  });

//  log.info(statName + " cohort info is now:" + fastJSON.stringify(snapshot.total));
  return snapshot;
}

// RETURNING USERS
function _initReturningUsers(statName, options, timescaleType) {
  return { cache: {}, uniques: _initUniques(statName, options, timescaleType) };
}

function _returningUsersUserId(logObject) {
  if ('userId' in logObject) {
    return logObject.userId;
  }
}

function _returningUsersUserCreationDate(userId) {
  var record = sqlobj.selectSingle('pad_cookie_userids', {id: userId});
  if (record) {
    return record.createdDate.getTime();
  }
}

function _returningUsersAccountId(logObject) {
  return logObject.proAccountId;
}

function _returningUsersAccountCreationDate(accountId) {
  var record = sqlobj.selectSingle('pro_accounts', {id: accountId});
  if (record) {
    return record.createdDate.getTime();
  }
}


function _updateReturningUsers(statName, options, logName, data, logObject) {
  var userId = (options.useProAccountId ? _returningUsersAccountId(logObject) : _returningUsersUserId(logObject));
  if (! userId) { return; }
  var date = logObject.date;
  if (! data.cache[""+userId]) {
    var creationTime = (options.useProAccountId ? _returningUsersAccountCreationDate(userId) : _returningUsersUserCreationDate(userId));
    if (! creationTime) { return; } // hm. weird case.
    data.cache[""+userId] = creationTime;
  }
  if (data.cache[""+userId] < date - options.registeredNDaysAgo*24*60*60*1000) {
    data.uniques.hit(logObject.date, ""+userId);
  }
}
function _snapshotReturningUsers(statName, options, data) {
  return _lazySnapshot(data.uniques);
}

function addReturningUserStat(statName, pastNDays, registeredNDaysAgo) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: ["frontend/padevents"],
    init_f: "_initReturningUsers",
    update_f: "_updateReturningUsers",
    snapshot_f: "_snapshotReturningUsers",
    options: { registeredNDaysAgo: registeredNDaysAgo },
    historicalDays: pastNDays
  });
}

function addCohortCountStat(statName, pastNDays, logName, filter) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initCohortCount",
    update_f: "_updateCohortCount",
    snapshot_f: "_snapshotCohortCount",
    options: { filter: filter},
    historicalDays: pastNDays
  });
}
function addCohortUniquesStat(statName, pastNDays, logName, filter, fieldName) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initCohortUniques",
    update_f: "_updateCohortUniques",
    snapshot_f: "_snapshotCohortUniques",
    options: { filter: filter, fieldName: fieldName},
    historicalDays: pastNDays
  });
}

function addReturningProAccountStat(statName, pastNDays, registeredNDaysAgo) {
  addStat({
    name: statName,
    dataType: "line",
    logNames: ["frontend/request"],
    init_f: "_initReturningUsers",
    update_f: "_updateReturningUsers",
    snapshot_f: "_snapshotReturningUsers",
    options: { registeredNDaysAgo: registeredNDaysAgo, useProAccountId: true },
    historicalDays: pastNDays
  });
}


function addDisconnectStat() {
  addStat({
    name: "streaming_disconnects",
    dataType: "topValues",
    logNames: ["frontend/padevents", "frontend/reconnect", "frontend/disconnected_autopost"],
    init_f: "_initDisconnectTracker",
    update_f: "_updateDisconnectTracker",
    snapshot_f: "_snapshotDisconnectTracker",
    options: {}
  });
}

// PAD STARTUP LATENCY
function _initPadStartupLatency(statName, options, timescaleType) {
  return {
    recentGets: (timescaleType == LIVE ? new ExpiringMapping(60*1000) : _fakeMap()),
    latencies: _initHistogram(statName, options, timescaleType),
  }
}

function _updatePadStartupLatency(statName, options, logName, data, logObject) {
  var session = logObject.session;
  if (logName == "frontend/request") {
    if (! ('padId' in logObject)) { return; }
    var padId = logObject.padId;
    if (! data.recentGets.get(session)) {
      data.recentGets.put(session, {});
    }
    data.recentGets.get(session)[padId] = logObject.date;
  }
  if (logName == "frontend/padevents") {
    if (logObject.type != 'userjoin') { return; }
    if (! data.recentGets.get(session)) { return; }
    var padId = logObject.padId;
    var getTime = data.recentGets.get(session)[padId];
    if (! getTime) { return; }
    delete data.recentGets.get(session)[padId];
    var latency = logObject.date - getTime;
    if (latency < 60*1000) {
      // latencies longer than 60 seconds don't represent data we care about for this stat.
      data.latencies.hit(logObject.date, latency);
    }
  }
}

function _snapshotPadStartupLatency(statName, options, data) {
  var latencies = data.latencies;
  function convertHistogram(histogram_f) {
    var deciles = {};
    [0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 100].forEach(function(pct) {
      deciles[""+pct] = histogram_f(pct);
    });
    return deciles;
  }
  return _lazySnapshot({
    latencies: latencies,
    get total() {
      return convertHistogram(this.latencies.total);
    },
    history: function(bucketsPerSample, numSamples) {
      return this.latencies.history(bucketsPerSample, numSamples).map(convertHistogram);
    },
    latest: function(bucketsPerSample) {
      return convertHistogram(this.latencies.latest(bucketsPerSample));
    }
  });
}

function addPadStartupLatencyStat() {
  addStat({
    name: "pad_startup_times",
    dataType: "histogram",
    logNames: ["frontend/padevents", "frontend/request"],
    init_f: "_initPadStartupLatency",
    update_f: "_updatePadStartupLatency",
    snapshot_f: "_snapshotPadStartupLatency",
    options: {}
  });
}


function _initSampleTracker(statName, options, timescaleType) {
  return {
    samples: Array(1440), // 1 hour at 1 sample/minute
    nextSample: 0,
    numSamples: 0
  }
}

function _updateSampleTracker(statName, options, logName, data, logObject) {
  if (options.filter && ! options.filter(logObject)) {
    return;
  }
  if (options.fieldName && ! (options.fieldName in logObject)) {
    return;
  }
  data.samples[data.nextSample] = (options.fieldName ? logObject[options.fieldName] : logObject);
  data.nextSample++;
  data.nextSample %= data.samples.length;
  data.numSamples = Math.min(data.samples.length, data.numSamples+1);
}

function _snapshotSampleTracker(statName, options, data) {
  function indexTransform(i) {
    return (data.nextSample-data.numSamples+i + data.samples.length) % data.samples.length;
  }
  var merge_f = options.mergeFunction || function(a, b) { return a+b; }
  var process_f = options.processFunction || function(a) { return a; }
  function mergeValues(values) {
    if (values.length <= 1) { return values[0]; }
    var t = values[0];
    for (var i = 1; i < values.length; ++i) {
      t = merge_f(values[i], t);
    }
    return t;
  }
  return _lazySnapshot({
    get total() {
      var t = [];
      for (var i = 0; i < data.numSamples; ++i) {
        t.push(data.samples[indexTransform(i)]);
      }
      return process_f(mergeValues(t), t.length);
    },
    history: function(bucketsPerSample, numSamples) {
      var allSamples = [];
      for (var i = data.numSamples-1; i >= Math.max(0, data.numSamples - bucketsPerSample*numSamples); --i) {
        allSamples.push(data.samples[indexTransform(i)]);
      }
      var out = [];
      for (var i = 0; i < numSamples && i*bucketsPerSample < allSamples.length; ++i) {
        var subArray = [];
        for (var j = 0; j < bucketsPerSample && i*bucketsPerSample+j < allSamples.length; ++j) {
          subArray.push(allSamples[i*bucketsPerSample+j]);
        }
        out.push(process_f(mergeValues(subArray), subArray.length));
      }
      return out.reverse();
    },
    latest: function(bucketsPerSample) {
      var t = [];
      for (var i = data.numSamples-1; i >= Math.max(0, data.numSamples-bucketsPerSample); --i) {
        t.push(data.samples[indexTransform(i)]);
      }
      return process_f(mergeValues(t), t.length);
    }
  });
}

function addSampleTracker(statName, logName, filter, fieldName, mergeFunction, processFunction) {
  addStat({
    name: statName,
    dataType: "histogram",
    logNames: (logName instanceof Array ? logName : [logName]),
    init_f: "_initSampleTracker",
    update_f: "_updateSampleTracker",
    snapshot_f: "_snapshotSampleTracker",
    options: { filter: filter, fieldName: fieldName,
               mergeFunction: mergeFunction, processFunction: processFunction }
  });
}

function addCometLatencySampleTracker(statName) {
  addSampleTracker(statName, "backend/server-events", typeMatcher("streaming-message-latencies"), null,
    function(a, b) {
      var ret = {};
      ["count", "p50", "p90", "p95", "p99", "max"].forEach(function(key) {
        ret[key] = (Number(a[key]) || 0) + (Number(b[key]) || 0);
      });
      return ret;
    },
    function(v, count) {
      if (count == 0) {
        return {
          "50": 0, "90": 0, "95": 0, "99": 0, "100": 0
        }
      }
      var ret = {count: v.count};
      ["p50", "p90", "p95", "p99", "max"].forEach(function(key) {
        ret[key] = (Number(v[key]) || 0)/(Number(count) || 1);
      });
      return {"50": Math.round(ret.p50/1000),
              "90": Math.round(ret.p90/1000),
              "95": Math.round(ret.p95/1000),
              "99": Math.round(ret.p99/1000),
              "100": Math.round(ret.max/1000)};
    });
}

function addConnectionTypeSampleTracker(statName) {
  var caredAboutFields = ["streaming", "longpolling", "shortpolling", "(unconnected)"];

  addSampleTracker(statName, "backend/server-events", typeMatcher("streaming-connection-count"), null,
    function(a, b) {
      var ret = {};
      caredAboutFields.forEach(function(k) {
        ret[k] = (Number(a[k]) || 0) + (Number(b[k]) || 0);
      });
      return ret;
    },
    function(v, count) {
      if (count == 0) {
        return _convertTopValue({total: 0, counts: {}});
      }
      var values = {};
      var total = 0;
      caredAboutFields.forEach(function(k) {
        values[k] = Math.round((Number(v[k]) || 0)/count);
        total += values[k];
      });
      values["Total"] = total;
      return _convertTopValue({
        total: Math.round(total),
        counts: values
      });
    });
}

// helpers for filter functions

function expectedHostnames() {
  var hostPart = appjet.config.listenHost || "localhost";
  if (appjet.config.listenSecureHost != hostPart) {
    hostPart = "("+hostPart+"|"+(appjet.config.listenSecureHost || "localhost")+")";
  }
  var ports = [];
  if (appjet.config.listenPort != 80) {
    ports.push(""+appjet.config.listenPort);
  }
  if (appjet.config.listenSecurePort != 443) {
    ports.push(""+appjet.config.listenSecurePort);
  }
  var portPart = (ports.length > 0 ? ":("+ports.join("|")+")" : "");
  return hostPart + portPart;
}

function fieldMatcher(fieldName, fieldValue) {
  if (fieldValue instanceof RegExp) {
    return function(logObject) {
      return fieldValue.test(logObject[fieldName]);
    }
  } else {
    return function(logObject) {
      return logObject[fieldName] == fieldValue;
    }
  }
}

function typeMatcher(type) {
  return fieldMatcher("type", type);
}

function invertMatcher(f) {
  return function(logObject) {
    return ! f(logObject);
  }
}

// only matches if all the matchers specified match
// lets you easily say something like "proUser && padJoin"
function allMatcher(matchers) {
  return function (logObject) {
    for (var i=0; i<matchers.length; i++) {
      if (!matchers[i](logObject)) {
        return false;
      }
    }
    // all matched
    return true;
  }

}

function setupStatsCollector() {
  var c;

  function unwatchLog(logName) {
    GenericLoggerUtils.clearWrangler(logName.split('/')[1], c.wranglers[logName]);
  }
  function watchLog(logName) {
    c.wranglers[logName] = new Packages.net.appjet.oui.LogWrangler({
      tell: function(lpb) {
        c.queue.add({logName: logName, json: lpb.json()});
      }
    });
    c.wranglers[logName].watch(logName.split('/')[1]);
  }

  c = _stats().liveCollector;
  if (c) {
    c.watchedLogs.forEach(unwatchLog);
    delete c.wrangler;
  } else {
    c = _stats().liveCollector = {};
  }
  c.watchedLogs = keys(_stats().logNamesToInterestedStatNames);
  c.queue = new java.util.concurrent.ConcurrentLinkedQueue();
  c.wranglers = {};
  c.watchedLogs.forEach(watchLog);

  if (! c.updateTask || c.updateTask.isDone()) {
    c.updateTask = execution.scheduleTask('statistics', "statisticsLiveUpdate", 2000, []);
  }
}

serverhandlers.tasks.statisticsLiveUpdate = function() {
  var c = _stats().liveCollector;
  try {
    while (true) {
      var obj = c.queue.poll();
      if (obj != null) {
        var statNames =
          keys(_stats().logNamesToInterestedStatNames[obj.logName]);
        var logObject = fastJSON.parse(obj.json);
        statNames.forEach(function(statName) {
          var statObject = getStatData(statName);
          _callFunction(statObject.update_f,
            statName, statObject.options, obj.logName, statObject.data, logObject);
        });
      } else {
        break;
      }
    }
  } catch (e) {
    println("EXCEPTION IN LIVE UPDATE: "+e+" / "+e.fileName+":"+e.lineNumber)
    println(exceptionutils.getStackTracePlain(new net.appjet.bodylock.JSRuntimeException(String(e), e.javaException || e.rhinoException)));
  } finally {
    c.updateTask = execution.scheduleTask('statistics', "statisticsLiveUpdate", 2000, []);
  }
}

function addDayWeekMonthUniques (statName, logName, filter, fieldName) {
  addUniquenessCount(statName, 1, logName, filter, fieldName);
  addUniquenessCount(statName + "_7days", 7, logName, filter, fieldName);
  addUniquenessCount(statName + "_30days", 30, logName, filter, fieldName);
}


function onReset() {
  // this gets refilled every reset.
  _stats().logNamesToInterestedStatNames = {};

  // we'll want to keep around the live data, though, so this is conditionally set.
  if (! _stats().stats) {
    _stats().stats = {};
  }

  addSimpleCount("site_pageviews", 1, "frontend/request",
    invertMatcher(fieldMatcher("userAgent", new RegExp("HackPad"))));

  addUniquenessCount("site_unique_ips", 1, "frontend/request", null, "clientAddr");

  // total users who opened a pad
  var joinMatcher = typeMatcher("userjoin");
  addDayWeekMonthUniques("active_user_ids", "frontend/padevents", joinMatcher, "userId");

  // registered users who opened a pad
  var proJoinMatcher = allMatcher([joinMatcher, fieldMatcher("userId", new RegExp("^p."))]);
  addDayWeekMonthUniques("active_signedin_user_ids", "frontend/padevents", proJoinMatcher, "userId");

  // subdomain users who opened a pad
  var notAMainSitePad = invertMatcher(fieldMatcher("padId", new RegExp("^1[$].*")));
  var isADomainPad = fieldMatcher("padId", new RegExp("^\\d+[$].*"));
  var subdomainJoinMatcher = allMatcher([joinMatcher, isADomainPad, notAMainSitePad]);
  addDayWeekMonthUniques("subdomain_signedin_user_ids", "frontend/padevents", subdomainJoinMatcher, "userId");

  // registered users who did anything on the site - should more or less equal active_signedin_user_ids
  addDayWeekMonthUniques("active_pro_accounts", "frontend/request", invertMatcher(fieldMatcher("proAccountId", undefined)),
                     "proAccountId");


  var proUserEventMatcher = allMatcher([typeMatcher("userjoin"), fieldMatcher("userId", new RegExp("^p."))]);
  addUniquenessCount("active_pads", 1, "frontend/padevents", typeMatcher("userjoin"), "padId");
  addUniquenessCount("active_pads_signedin", 1, "frontend/padevents", proUserEventMatcher, "padId");


  addUniquenessCount("pads_edited", 1, "frontend/padevents", typeMatcher("syndication"), "padId");

  addSimpleCount("change_mails", 1, "frontend/changesemail", null);

  addSimpleCount("new_pads", 1, "frontend/padevents", typeMatcher("newpad"));
  addSimpleCount("new_autopads", 1, "frontend/padevents", typeMatcher("newautopad"));
  addSimpleCount("new_pads_7days", 7, "frontend/padevents", typeMatcher("newpad"));

  addSimpleCount("new_accounts", 1, "frontend/pro-accounts", typeMatcher("account-created"));
  addSimpleCount("mainsite_new_accounts", 1, "frontend/pro-accounts", allMatcher([typeMatcher("account-created"), fieldMatcher("domainId", new RegExp("^1$"))]));

//  addSimpleCount("chat_messages", 1, "frontend/chat", null);
//  addUniquenessCount("active_chatters", 1, "frontend/chat", null, "userId");

  addSimpleCount("exceptions", 1, "frontend/exception", null);

//  addSimpleCount("eepnet_trial_downloads", 1, "frontend/eepnet_download_info", null);

  var hostRegExp = new RegExp("^https?:\\/\\/([-a-zA-Z0-9]+.)?"+expectedHostnames()+"\\/");
  addTopValuesStat("top_referers", 1, "frontend/request",
    invertMatcher(fieldMatcher(
      "referer", hostRegExp)),
    "referer");

  addTopValuesStat("paths_404", 1, "frontend/request", fieldMatcher("statusCode", 404), "path");
  addTopValuesStat("paths_500", 1, "frontend/request", fieldMatcher("statusCode", 500), "path");
  addTopValuesStat("paths_exception", 1, "frontend/exception", null, "path");

  addTopValuesStat("top_exceptions", 1, ["frontend/exception", "backend/exceptions"],
                   invertMatcher(fieldMatcher("trace", undefined)),
                   "trace", function(trace) {
                     var jstrace = trace.split("\n").filter(function(line) {
                       return /^\tat JS\$.*?\.js:\d+\)$/.test(line);
                     });
                     if (jstrace.length > 3) {
                       return "JS Exception:\n"+jstrace.slice(0, 10).join("\n").replace(/\t[^\(]*/g, "");
                     }
                     return trace.split("\n").slice(1, 10).join("\n").replace(/\t/g, "");
                   });

  /*
    Per cohort stats we may want
      x number of 7 day actives
      - number of 7 day pads edited
      - number of 7 day pad edits
      - number of 7 day pad editors
      x number of 7 day pads created
      - number of 7 day pad creators
      - number of invites(new users) sent
      - number of invites(existing users) sent
  */
  // active pro-users per cohort
  // disabled until we can restart server
  addCohortUniquesStat("cohort_accounts_active", 7, "frontend/padevents", proJoinMatcher, "userId");

  // pads created per cohort user
  addCohortCountStat("cohort_pads_created", 7, "frontend/padevents", typeMatcher("newpad"));

  // no longer writing to pad_cookie_userids
  /*
  addReturningUserStat("users_1day_returning_7days", 1, 7);
  addReturningUserStat("users_7day_returning_7days", 7, 7);
  addReturningUserStat("users_30day_returning_7days", 30, 7);

  addReturningUserStat("users_1day_returning_30days", 1, 30);
  addReturningUserStat("users_7day_returning_30days", 7, 30);
  addReturningUserStat("users_30day_returning_30days", 30, 30);
  */

  addReturningProAccountStat("pro_accounts_1day_returning_7days", 1, 7);
  addReturningProAccountStat("pro_accounts_7day_returning_7days", 7, 7);
  addReturningProAccountStat("pro_accounts_30day_returning_7days", 30, 7);

  addReturningProAccountStat("pro_accounts_1day_returning_30days", 1, 30);
  addReturningProAccountStat("pro_accounts_7day_returning_30days", 7, 30);
  addReturningProAccountStat("pro_accounts_30day_returning_30days", 30, 30);

  addDisconnectStat();
  addTopValuesStat("disconnect_causes", 1, "frontend/avoidable_disconnects", null, "errorMessage");

  var staticFileRegExp = /^\/static\/|^\/favicon.ico/;
  addLatenciesStat("execution_latencies", 1, "backend/latency",
    invertMatcher(fieldMatcher('path', staticFileRegExp)),
    "path", "time");
  addLatenciesStat("static_file_latencies", 1, "backend/latency",
    fieldMatcher('path', staticFileRegExp),
    "path", "time");

  addUniquenessCount("disconnects_with_clientside_errors", 1,
                     ["frontend/reconnect", "frontend/disconnected_autopost"],
                     fieldMatcher("hasClientErrors", true), "uniqueId");

  addTopValuesStat("imports_exports_counts", 1, "frontend/import-export",
                   typeMatcher("request"), "direction");

  addPadStartupLatencyStat();

  addCometLatencySampleTracker("streaming_latencies");
  addConnectionTypeSampleTracker("streaming_connections");
  // TODO: add more stats here.

  setupStatsCollector();
}



//----------------------------------------------------------------
// Log processing
//----------------------------------------------------------------

function _whichStats(statNames) {
  var whichStats = _statData();
  var logNamesToInterestedStatNames = _stats().logNamesToInterestedStatNames;

  if (statNames) {
    whichStats = {};
    statNames.forEach(function(statName) { whichStats[statName] = getStatData(statName) });
    logNamesToInterestedStatNames = _generateLogInterestMap(statNames);
  }

  return [whichStats, logNamesToInterestedStatNames];
}

function _initStatDataMap(statNames) {
  var [whichStats, logNamesToInterestedStatNames] = _whichStats(statNames);

  var statDataMap = {};

  function initStat(statName, statObject) {
    statDataMap[statName] =
      _callFunction(statObject.init_f, statName, statObject.options, HIST);
  }
  eachProperty(whichStats, initStat);

  return statDataMap;
}

function _saveStats(day, statDataMap, statNames) {
  var [whichStats, logNamesToInterestedStatNames] = _whichStats(statNames);

  function saveStat(statName, statObject) {
    var value = _callFunction(statObject.snapshot_f,
      statName, statObject.options, statDataMap[statName]).total;
    if (typeof(value) != 'object') {
      value = {value: value};
    }
    _saveStat(day, statName, value);
  }

  eachProperty(whichStats, saveStat);
}

function _processSingleDayLogs(day, logNamesToInterestedStatNames, statDataMap) {
  var iterators = {};

  // open each of the logs files we're going to process
  keys(logNamesToInterestedStatNames).forEach(function(logName) {
    var [prefix, logId] = logName.split("/");
    var fileName = log.logFileName(prefix, logId, day);

    if (! fileName) {
      _logInfo("No such file: "+logName+" on day "+day);
      return;
    }
    iterators[logName] = fileLineIterator(fileName);
  });

  var numIterators = keys(iterators).length;
  if (numIterators == 0) {
    _logInfo("No logs to process on day "+day);
    return;
  }

  // use a Priority Queue to process all the log file in parallel sorted by event time
  var sortedLogObjects = new java.util.PriorityQueue(numIterators,
    new java.util.Comparator({
      compare: function(o1, o2) { return o1.logObject.date - o2.logObject.date }
    }));

  function lineToLogObject(logName, json) {
    return {logName: logName, logObject: fastJSON.parse(json)};
  }

  // begin by filling the queue with one object from each log.
  eachProperty(iterators, function(logName, iterator) {
    if (iterator.hasNext) {
      sortedLogObjects.add(lineToLogObject(logName, iterator.next));
    }
  });

  // update with all log objects, in date order (enforced by priority queue).
  while (! sortedLogObjects.isEmpty()) {
    var nextObject = sortedLogObjects.poll();
    var logName = nextObject.logName;

    keys(logNamesToInterestedStatNames[logName]).forEach(function(statName) {
      var statObject = getStatData(statName);
      _callFunction(statObject.update_f,
        statName, statObject.options, logName, statDataMap[statName], nextObject.logObject);
    });

    // get next entry from this log, if there is one.
    if (iterators[logName].hasNext) {
      sortedLogObjects.add(lineToLogObject(logName, iterators[logName].next));
    }
  }
}

function processStatsForDay(day, statNames, statDataMap) {
  var [whichStats, logNamesToInterestedStatNames] = _whichStats(statNames);

  // process the logs, notifying the right statistics updaters.
  _processSingleDayLogs(day, logNamesToInterestedStatNames, statDataMap);
}

//----------------------------------------------------------------
// Daily update
//----------------------------------------------------------------
serverhandlers.tasks.statisticsDailyUpdate = function() {
  dailyUpdate();
};

function _scheduleNextDailyUpdate() {
  // Run at 1:11am every day
  var now = +(new Date);
  var tomorrow = new Date(now + 1000*60*60*24);
  tomorrow.setHours(1);
  tomorrow.setMinutes(11);
  tomorrow.setMilliseconds(111);
  log.info("Scheduling next daily statistics update for: "+tomorrow.toString());
  var delay = +tomorrow - (+(new Date));
  execution.scheduleTask("statistics", "statisticsDailyUpdate", delay, []);
}

function processStatsAsOfDay(date, statNames) {
  var latestDay = noon(new Date(date - 1000*60*60*24));

  _processLogsForNeededDays(latestDay, statNames);
}

function _processLogsForNeededDays(latestDay, statNames) {
  var statDataMap = _initStatDataMap(statNames);

  // for each age, list of all the stats we have for that age
  var agesToStats = [];
  statNames.forEach(function(statName) {
    var statData = getStatData(statName);
    for (var i=0; i<statData.historicalDays; i++) {
      agesToStats[i] = agesToStats[i] || [];
      agesToStats[i].push(statName);
    }
  });

  // process from furthest ago to most recent
  for (var i = agesToStats.length-1; i >= 0; --i) {
    var day = new Date(+latestDay - i*24*60*60*1000);
    processStatsForDay(day, agesToStats[i], statDataMap);
  }

  _saveStats(latestDay, statDataMap, statNames);
}

function doDailyUpdate(date) {
  var now = (date === undefined ? new Date() : date);
  var yesterdayNoon = noon(new Date(+now - 1000*60*60*24));

  _processLogsForNeededDays(yesterdayNoon, getAllStatNames());
}

function dailyUpdate() {
  try {
    doDailyUpdate();
  } catch (ex) {
    log.warn("statistics.dailyUpdate() failed: "+ex.toString());
  } finally {
    _scheduleNextDailyUpdate();
  }
}