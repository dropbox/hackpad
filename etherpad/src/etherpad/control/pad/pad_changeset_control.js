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

import("etherpad.helpers");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.utils.*");
import("fastJSON");
import("etherpad.collab.server_utils.*");
import("etherpad.collab.ace.easysync2.{AttribPool,Changeset}");
import("cache_utils.syncedWithCache");
import("etherpad.log");
jimport("net.appjet.common.util.LimitedSizeMapping");

import("stringutils");
import("stringutils.sprintf");

var _JSON_CACHE_SIZE = 10000;

// to clear: appjet.cache.pad_changeset_control.jsoncache.map.clear()
function _getJSONCache() {
  return syncedWithCache('pad_changeset_control.jsoncache', function(cache) {
    if (! cache.map) {
      cache.map = new LimitedSizeMapping(_JSON_CACHE_SIZE);
    }
    return cache.map;
  });
}

var _profiler = {
  t: 0,
  laps: [],
  active: false,
  start: function() {
    _profiler.t = +new Date;
    _profiler.laps = [];
    //_profiler.active = true;
  },
  lap: function(name) {
    if (! _profiler.active) return;
    var t2 = +new Date;
    _profiler.laps.push([name, t2 - _profiler.t]);
  },
  dump: function(info) {
    if (! _profiler.active) return;
    function padright(s, len) {
      s = String(s);
      return s + new Array(Math.max(0,len-s.length+1)).join(' ');
    }
    var str = padright(info,20)+": ";
    _profiler.laps.forEach(function(e) {
      str += padright(e.join(':'), 8);
    });
    java.lang.System.out.println(str);
  },
  stop: function() {
    _profiler.active = false;
  }
};

function onRequest() {
  _profiler.start();

  var parts = request.path.split('/');
  // TODO: create a mapping between padId and read-only id
  var urlId = parts[4];
  var padId = parseUrlId(urlId).localPadId;
  // var revisionId = parts[5];

  padutils.accessPadLocal(padId, function(pad) {
    if (! pad.exists() && pad.getSupportsTimeSlider()) {
      response.forbid();
    }
  }, 'r');

  // use the query string to specify start and end revision numbers
  var startRev = parseInt(request.params["s"]);
  var endRev = startRev + 100 * parseInt(request.params["g"]);
  var granularity = parseInt(request.params["g"]);

  _profiler.lap('A');
  var changesetsJson =
    getCacheableChangesetInfoJSON(padId, startRev, endRev, granularity);
  _profiler.lap('X');

  //TODO: set content-type to javascript
  response.write(changesetsJson);
  _profiler.lap('J');
  if (request.acceptsGzip) {
    response.setGzip(true);
  }

  _profiler.lap('Z');
  _profiler.dump(startRev+'/'+granularity+'/'+endRev);
  _profiler.stop();

  return true;
}

function getCacheableChangesetInfoJSON(padId, startNum, endNum, granularity) {
  padutils.accessPadLocal(padId, function(pad) {
    var lastRev = pad.getHeadRevisionNumber();
    if (endNum > lastRev+1) {
      endNum = lastRev+1;
    }
    endNum = Math.floor(endNum / granularity)*granularity;
  }, 'r');

  var cacheKey = "C/"+startNum+"/"+endNum+"/"+granularity+"/"+
    padutils.getGlobalPadId(padId);

  var cache = _getJSONCache();

  var cachedJson = cache.get(cacheKey);
  if (cachedJson) {
    cache.touch(cacheKey);
    //java.lang.System.out.println("HIT! "+cacheKey);
    return cachedJson;
  }
  else {
    var result = getChangesetInfo(padId, startNum, endNum, granularity);
    var json = fastJSON.stringify(result);
    cache.put(cacheKey, json);
    //java.lang.System.out.println("MISS! "+cacheKey);
    return json;
  }
}

// uses changesets whose numbers are between startRev (inclusive)
// and endRev (exclusive); 0 <= startNum < endNum
function getChangesetInfo(padId, startNum, endNum, granularity) {
  var forwardsChangesets = [];
  var backwardsChangesets = [];
  var timeDeltas = [];
  var apool = new AttribPool();

  var callId = stringutils.randomString(10);

  log.custom("getchangesetinfo", {event: "start", callId:callId,
                                  padId:padId, startNum:startNum,
                                  endNum:endNum, granularity:granularity});

  // This function may take a while and avoids holding a lock on the pad.
  // Though the pad may change during execution of this function,
  // after we retrieve the HEAD revision number, all other accesses
  // are unaffected by new revisions being added to the pad.

  var lastRev;
  padutils.accessPadLocal(padId, function(pad) {
    lastRev = pad.getHeadRevisionNumber();
  }, 'r');

  if (endNum > lastRev+1) {
    endNum = lastRev+1;
  }
  endNum = Math.floor(endNum / granularity)*granularity;

  var lines;
  padutils.accessPadLocal(padId, function(pad) {
    lines = _getPadLines(pad, startNum-1);
  }, 'r');
  _profiler.lap('L');

  var compositeStart = startNum;
  while (compositeStart < endNum) {
    var whileBodyResult = padutils.accessPadLocal(padId, function(pad) {
      _profiler.lap('c0');
      if (compositeStart + granularity > endNum) {
        return "break";
      }
      var compositeEnd = compositeStart + granularity;
      var forwards = _composePadChangesets(pad, compositeStart, compositeEnd);
      _profiler.lap('c1');
      var backwards = Changeset.inverse(forwards, lines.textlines,
                                        lines.alines, pad.pool());

      _profiler.lap('c2');
      Changeset.mutateAttributionLines(forwards, lines.alines, pad.pool());
      _profiler.lap('c3');
      Changeset.mutateTextLines(forwards, lines.textlines);
      _profiler.lap('c4');

      var forwards2 = Changeset.moveOpsToNewPool(forwards, pad.pool(), apool);
      _profiler.lap('c5');
      var backwards2 = Changeset.moveOpsToNewPool(backwards, pad.pool(), apool);
      _profiler.lap('c6');
      function revTime(r) {
        var date = pad.getRevisionDate(r);
        var s = Math.floor((+date)/1000);
        //java.lang.System.out.println("time "+r+": "+s);
        return s;
      }

      var t1, t2;
      if (compositeStart == 0) {
        t1 = revTime(0);
      }
      else {
        t1 = revTime(compositeStart - 1);
      }
      t2 = revTime(compositeEnd - 1);
      timeDeltas.push(t2 - t1);

      _profiler.lap('c7');
      forwardsChangesets.push(forwards2);
      backwardsChangesets.push(backwards2);

      compositeStart += granularity;
    }, 'r');
    if (whileBodyResult == "break") {
      break;
    }
  }

  log.custom("getchangesetinfo", {event: "finish", callId:callId,
                                  padId:padId, startNum:startNum,
                                  endNum:endNum, granularity:granularity});

  return { forwardsChangesets:forwardsChangesets,
           backwardsChangesets:backwardsChangesets,
           apool: apool.toJsonable(),
           actualEndNum: endNum,
           timeDeltas: timeDeltas };
}

// Compose a series of consecutive changesets from a pad.
// precond: startNum < endNum
function _composePadChangesets(pad, startNum, endNum) {
  if (endNum - startNum > 1) {
    var csFromPad = pad.getCoarseChangeset(startNum, endNum - startNum);
    if (csFromPad) {
      //java.lang.System.out.println("HIT! "+startNum+"-"+endNum);
      return csFromPad;
    }
    else {
      //java.lang.System.out.println("MISS! "+startNum+"-"+endNum);
    }
    //java.lang.System.out.println("composePadChangesets: "+startNum+','+endNum);
  }
  var changeset = pad.getRevisionChangeset(startNum);
  for(var r=startNum+1; r<endNum; r++) {
    var cs = pad.getRevisionChangeset(r);
    changeset = Changeset.compose(changeset, cs, pad.pool());
  }
  return changeset;
}

// Get arrays of text lines and attribute lines for a revision
// of a pad.
function _getPadLines(pad, revNum) {
  var atext;
  _profiler.lap('PL0');
  if (revNum >= 0) {
    atext = pad.getInternalRevisionAText(revNum);
  }
  else {
    atext = Changeset.makeAText("\n");
  }
  _profiler.lap('PL1');
  var result = {};
  result.textlines = Changeset.splitTextLines(atext.text);
  _profiler.lap('PL2');
  result.alines = Changeset.splitAttributionLines(atext.attribs,
                                                  atext.text);
  _profiler.lap('PL3');
  return result;
}
