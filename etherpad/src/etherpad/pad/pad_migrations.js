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

import("sqlbase.sqlobj");
import("etherpad.pad.model");
import("etherpad.pad.easysync2migration");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("etherpad.changes.follow");
import("etherpad.log");
jimport("java.util.concurrent.ConcurrentHashMap");
jimport("java.lang.System");
jimport("java.util.ArrayList");
jimport("java.util.Collections");

function onStartup() {
  if (! appjet.cache.pad_migrations) {
    appjet.cache.pad_migrations = {};
  }

  // this part can be removed when all pads are migrated on etherpad.com
  System.out.println("Building cache for live migrations...");
  initLiveMigration();
}

function initLiveMigration() {
  return; // disable live migrations
  if (! appjet.cache.pad_migrations) {
    appjet.cache.pad_migrations = {};
  }
  appjet.cache.pad_migrations.doingAnyLiveMigrations = true;
  appjet.cache.pad_migrations.doingBackgroundLiveMigrations = true;
  appjet.cache.pad_migrations.padMap = new ConcurrentHashMap();

  // presence of a pad in padMap indicates migration is needed
  var padMap = _padMap();
  var migrationsNeeded = sqlobj.selectMulti("PAD_SQLMETA", {version: 2});
  migrationsNeeded.forEach(function(obj) {
    padMap.put(String(obj.id), {from: obj.version});
  });
}

function _padMap() {
  return appjet.cache.pad_migrations.padMap;
}

function _doingItLive() {
  return !! appjet.cache.pad_migrations.doingAnyLiveMigrations;
}

function checkPadStatus(padId) {
  if (! _doingItLive()) {
    return "ready";
  }
  var info = _padMap().get(padId);
  if (! info) {
    return "ready";
  }
  else if (info.migrating) {
    return "migrating";
  }
  else {
    return "oldversion";
  }
}

function ensureMigrated(padId, async) {
  if (! _doingItLive()) {
    return false;
  }

  var info = _padMap().get(padId);
  if (! info) {
    // pad is up-to-date
    return false;
  }
  else if (async && info.migrating) {
    // pad is already being migrated, don't wait on the lock
    return false;
  }

  return model.doWithPadLock(padId, function() {
    // inside pad lock...
    var info = _padMap().get(padId);
    if (!info) {
      return false;
    }
    // migrate from version 1 to version 2 in a transaction
    var migrateSucceeded = false;
    try {
      info.migrating = true;
      log.info("Migrating pad "+padId+" from version 2 to version 3...");

      var success = false;
      var whichTry = 1;
      while ((! success) && whichTry <= 3) {
        success = sqlcommon.inTransaction(function() {
          try {
            //easysync2migration.migratePad(padId);

            follow.migratePad(padId);
            sqlobj.update("PAD_SQLMETA", {id: padId}, {version: 3});
            return true;
          }
          catch (e if (e.toString().indexOf("try restarting transaction") >= 0)) {
            whichTry++;
            return false;
          }
        });
        if (! success) {
          java.lang.Thread.sleep(Math.floor(Math.random()*200));
        }
      }
      if (! success) {
        throw new Error("too many retries");
      }

      migrateSucceeded = true;
      log.info("Migrated pad "+padId+".");
      _padMap().remove(padId);
    }
    finally {
      info.migrating = false;
      if (! migrateSucceeded) {
        log.info("Migration failed for pad "+padId+".");
        throw new Error("Migration failed for pad "+padId+".");
      }
    }
    return true;
  });
}

function numUnmigratedPads() {
  if (! _doingItLive()) {
    return 0;
  }

  return _padMap().size();
}

////////// BACKGROUND MIGRATIONS

function _logPadMigration(runnerId, padNumber, padTotal, timeMs, fourCharResult, padId) {
  log.custom("pad_migrations", {
    runnerId: runnerId,
    padNumber: Math.round(padNumber+1),
    padTotal: Math.round(padTotal),
    timeMs: Math.round(timeMs),
    fourCharResult: fourCharResult,
    padId: padId});
}

function _getNeededMigrationsArrayList(filter) {
  var L = new ArrayList(_padMap().keySet());
  for(var i=L.size()-1; i>=0; i--) {
    if (! filter(String(L.get(i)))) {
      L.remove(i);
    }
  }
  return L;
}

function runBackgroundMigration(residue, modulus, runnerId) {
  var L = _getNeededMigrationsArrayList(function(padId) {
    return (padId.charCodeAt(0) % modulus) == residue;
  });
  Collections.shuffle(L);

  var totalPads = L.size();
  for(var i=0;i<totalPads;i++) {
    if (! appjet.cache.pad_migrations.doingBackgroundLiveMigrations) {
      break;
    }
    var padId = L.get(i);
    var result = "FAIL";
    var t1 = System.currentTimeMillis();
    try {
      if (ensureMigrated(padId, true)) {
        result = " OK "; // migrated successfully
      }
      else {
        result = " -- "; // no migration needed after all
      }
    }
    catch (e) {
      // e just says "migration failed", but presumably
      // inTransaction() printed a stack trace.
      // result == "FAIL", do nothing.
    }
    var t2 = System.currentTimeMillis();
    _logPadMigration(runnerId, i, totalPads, t2 - t1, result, padId);
  }
}
