import("execution");
import("sqlbase.sqlobj");
import("etherpad.log");
import("etherpad.globals.isProduction");
import("etherpad.pro.domains");
import("etherpad.pro.pro_pad_db");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.dbwriter");


var DAILY_DECAY = 0.87;

// Must be called in the context of a request
function addPadView(localPadId, userId) {
  var domainId = domains.getRequestDomainId();
  execution.scheduleTask('async-pad-tracking', 'performAsyncPadTracking', 0, [domainId, localPadId, userId]);
}

function onStartup() {
  execution.initTaskThreadPool("async-pad-tracking", 1);
  _scheduleNextDailyCountIndexer();
}

serverhandlers.tasks.performAsyncPadTracking = function(domainId, localPadId, userId) {
  try {
    var sql = "UPDATE pro_padmeta SET viewCount = viewCount + 1, recentViewCount = recentViewCount + 1 WHERE domainId = ? AND localPadId = ?;";
    sqlobj.executeRaw(sql, [ domainId, localPadId], true /* isUpdate */);
  } catch (ex) {
    log.logException(ex);
  }
}

function _updateRecentViewCount() {
  var sql = "UPDATE pro_padmeta SET recentViewCount = FLOOR(recentViewCount * "+DAILY_DECAY+") WHERE recentViewCount > 0;";
  sqlobj.executeRaw(sql, [], true /* isUpdate */);
}

function _scheduleNextDailyCountIndexer() {
  var now = +(new Date);

  // Schedule the next batch at 3:30 AM
  var nextBatchTime = new Date(now + 1000*60*60*24);

  nextBatchTime.setHours(3);
  nextBatchTime.setMinutes(30);
  nextBatchTime.setMilliseconds(00);

  log.info("Scheduling next daily pad view indexer batch for: " + nextBatchTime.toString());
  var delay = +nextBatchTime - now;
  execution.scheduleTask('indexer', 'dailyPadViewCountIndexer', delay, []);
}

serverhandlers.tasks.dailyPadViewCountIndexer = function() {
  try {
    appjet.cache.padsReindexed = 0;
    appjet.cache.padsReindexedStart = new Date();
    var rows = sqlobj.selectMulti('pro_padmeta', {recentViewCount: ['>', 0], isDeleted: false, isArchived: false});
    _updateRecentViewCount();
    if (!rows.length) {
      return;
    }
    log.info("Updating pad view counts for "+rows.length+" recently seen pads");
    for (var i=0; i<rows.length; i++) {
      if (isProduction() && !domains.domainIsOnThisServer(rows[i].domainId)) {
        continue;
      }
      var globalPadId = padutils.makeGlobalId(rows[i].domainId, rows[i].localPadId);
      try {
        model.accessPadGlobal(globalPadId, function(pad) {
          model.updateSolrIndexForPad(globalPadId);
          // flush the pad if it's freshly loaded
          if (!pad._meta.status.lastAccess) {
            dbwriter.writePadNow(pad, true/*and flush*/);
            model.flushModelCacheForPad(globalPadId, pad.getHeadRevisionNumber());
          }
        });
        appjet.cache.padsReindexed += 1;
      } catch(e) {
        log.logException(e);
      }
    }
  } finally {
    _scheduleNextDailyCountIndexer();
  }
}
