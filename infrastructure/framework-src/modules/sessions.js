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

import("dateutils");
import("execution");
import("fastJSON");
import("fileutils");
import("jsutils.{eachProperty,keys}");
import("stringutils.{randomHash,startsWith,endsWith}");
import("sync");

jimport("net.appjet.common.util.ExpiringMapping");
jimport("net.spy.memcached.MemcachedClient");
jimport("java.net.InetSocketAddress");

import("etherpad.log");

//----------------------------------------------------------------

var _DEFAULT_COOKIE_NAME = "SessionID";
var _DEFAULT_SERVER_EXPIRATION = 3*24*60*60*1000; // 72 hours
var _WRITE_SESSIONS_TO_DISK_INTERVAL = 10*60*1000; // 10 minutes
var _BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB

function getSessionId(cookieName, createIfNotPresent, domain) {
  if (request.isComet || request.isCron || !request.isDefined) {
    return null;
  }

  if (request.cookies[cookieName]) {
    return request.cookies[cookieName];
  }

  if (!createIfNotPresent) {
    return null;
  }

  // Keep sessionId in requestCache so this function can be called multiple
  // times per request without multiple calls to setCookie().
  if (!appjet.requestCache.sessionId) {
    var sessionId = randomHash(16);

    response.setCookie({
      name: cookieName,
      value: sessionId,
      path: "/",
      domain: (domain || undefined),
      secure: appjet.config.useHttpsUrls,
      httpOnly: true /* disallow client js access */
    });

    appjet.requestCache.sessionId = sessionId;
  }

  return appjet.requestCache.sessionId;
}

function getSessionIdSubdomains(sessionId) {
  var map = _getCachedDb().map;
  if (map) {
    return map.get(sessionId) || {};
  }
  return {};
}

function _getExpiringSessionMap(db) {
  sync.callsyncIfTrue(db,
    function() { return (!db.map); },
    function() { db.map = new ExpiringMapping(_DEFAULT_SERVER_EXPIRATION); });
  return db.map;
}

function _getCachedDb() {
  return appjet.cacheRoot("net.appjet.ajstdlib.session");
}

function _getMemcachedClient() {
  var mc = appjet.cache['memcache-client'];
  if (!mc) {
    mc = new MemcachedClient(new InetSocketAddress(appjet.config.memcached, 11211));
    appjet.cache['memcache-client'] = mc;

    // store existing sessions
    var map = _getCachedDb().map;
    if (map) {
      var keyIterator = map.listAllKeys().iterator();
      while (keyIterator.hasNext()) {
        var key = keyIterator.next();
        var session = map.get(key);
        if (keys(session).length == 0) { continue; }
        var json = fastJSON.stringify(session);
        mc.set("sessions." + key, _DEFAULT_SERVER_EXPIRATION / 1000, json);
      }
    }
  }
  return mc;
}

function _getSessionDataKey(opts) {
  // Session options.
  if (!opts) { opts = {}; }
  var cookieName = opts.cookieName || _DEFAULT_COOKIE_NAME;

  // get cookie ID (sets response cookie if necessary)
  var sessionId = getSessionId(cookieName, true, opts.domain);
  if (!sessionId) { return null; }

  // get session data object
  var domainKey = "." + request.domain;
  return [sessionId, domainKey];
}

//----------------------------------------------------------------

function getSession(opts) {
  var dataKey = _getSessionDataKey(opts);
  if (!dataKey) { return null; }

  if (appjet.requestCache.sessionDomains) {
    return appjet.requestCache.sessionDomains[dataKey[1]];
  }

  if (appjet.config.memcached) {
    var json = _getMemcachedClient().get("sessions." + dataKey[0]);
    var sessionData = json ? fastJSON.parse(json) : {};
    //log.info("MEMCACHE GOT SESSION:" + dataKey+ " VAL:" + json);

    appjet.requestCache.sessionDomains = sessionData;
    return sessionData[dataKey[1]];
  } else {
    // get expiring session map
    var db = _getCachedDb();
    var map = _getExpiringSessionMap(db);

    var sessionData = map.get(dataKey[0]) || {};
    if (!sessionData[dataKey[1]]) {
      sessionData[dataKey[1]] = {};
      map.put(dataKey[0], sessionData);
    } else {
      map.touch(dataKey[0]);
    }

    appjet.requestCache.sessionDomains = sessionData;
    return sessionData[dataKey[1]];
  }
}

function saveSession(opts) {
  if (!appjet.config.memcached) { return; }
  if (!appjet.requestCache.sessionDomains) { return; }
  var json = fastJSON.stringify(appjet.requestCache.sessionDomains);
  if (json == "{}") { return; }
  var dataKey = _getSessionDataKey(opts);
  _getMemcachedClient().set("sessions." + dataKey[0], _DEFAULT_SERVER_EXPIRATION / 1000, json);

  //log.info("MEMCACHE SAVED SESSION:" + dataKey+ " VAL:" + json);
}

function destroySession(opts) {
  var dataKey = _getSessionDataKey(opts);
  if (!dataKey) { return null; }

  if (appjet.config.memcached) {
    // todo: delete from memcache?
  } else {
    // get expiring session map
    var db = _getCachedDb();
    var map = _getExpiringSessionMap(db);
    map.remove(dataKey[0]);

    appjet.requestCache.sessionDomains = null;
  }
}


function writeSessionsToDisk() {
  try {
    var dateString = dateutils.dateFormat(new Date(), "yyyy-MM-dd");
    var dataFile = new Packages.java.io.File(appjet.config.sessionStoreDir+"/sessions-"+dateString+".jslog");
    var tmpFile = new Packages.java.io.File(dataFile.toString() + ".tmp");
    dataFile.getParentFile().mkdirs();
    var writer = new java.io.BufferedWriter(new java.io.FileWriter(tmpFile), _BUFFER_SIZE);
    var map = _getCachedDb().map;
    if (! map) { return; }
    var keyIterator = map.listAllKeys().iterator();
    while (keyIterator.hasNext()) {
      var key = keyIterator.next();
      var session = map.get(key);
      if (!session) {
        continue;
      }

      // don't write sessions that don't have accounts
      // they're ok to lose on restart
      var hasAccount = false;
      for (domain in session) {
        if ('proAccount' in session[domain]) {
          hasAccount = true;
          break;
        }
      }
      if (!hasAccount) {
        continue;
      }

      if (keys(session).length == 0) { continue; }
      var obj = { key: key, session: session };
      var json = fastJSON.stringify(obj);
      writer.write(json);
      writer.write("\n");
    }
    writer.flush();
    writer.close();
    tmpFile.renameTo(dataFile);
  } finally {
    _scheduleWriteToDisk();
  }

}

function cleanUpSessions(shouldDiscardSession) {
  var map = _getCachedDb().map;
  if (! map) { return; }
  var keyIterator = map.listAllKeys().iterator();
  var keysToDelete = [];
  while (keyIterator.hasNext()) {
    var key = keyIterator.next();
    var session = map.get(key);
    if (!session) {
      continue;
    }
    for (domain in session) {
      if (shouldDiscardSession(session[domain])) {
        keysToDelete.push(key);
        break;
      }
    }
  }
  keysToDelete.forEach(function(key) {
    map.remove(key);
  })
  return keysToDelete.length;
}


function _extractDate(fname) {
  var datePart = fname.substr("sessions-".length, "2009-09-24".length);
  return Number(datePart.split("-").join(""));
}

function readLatestSessionsFromDisk() {
  var dir = new Packages.java.io.File(appjet.config.sessionStoreDir);
  if (! dir.exists()) { return; }
  var files = dir.listFiles(new Packages.java.io.FilenameFilter({
    accept: function(dir, name) {
      return startsWith(name, "sessions") && endsWith(name, ".jslog")
    }
  }));
  if (files.length == 0) { return; }
  var latestFile = files[0];
  for (var i = 1; i < files.length; ++i) {
    if (_extractDate(files[i].getName()) > _extractDate(latestFile.getName())) {
      latestFile = files[i];
    }
  }
  var map = _getExpiringSessionMap(_getCachedDb());
  fileutils.eachFileLine(latestFile, function(json) {
    try {
      var obj = fastJSON.parse(json, true /* parseDate */);
      var key = obj.key;
      var session = obj.session;
      map.put(key, session);
    } catch (err) {
      Packages.java.lang.System.out.println("Error reading sessions file on line '"+json+"': "+String(err));
    }
  });
  latestFile.renameTo(new Packages.java.io.File(latestFile.getParent()+"/used-"+latestFile.getName()));

  execution.initTaskThreadPool('sessions', 1);
  _scheduleWriteToDisk();
}

function _scheduleWriteToDisk() {
  if (appjet.cache.shutdownHandlerIsRunning) { return; }
  execution.scheduleTask('sessions', 'sessionsWriteToDisk', _WRITE_SESSIONS_TO_DISK_INTERVAL, []);
}
