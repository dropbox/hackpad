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

import("execution");
import("profiler");

import("etherpad.pad.padutils");
import("etherpad.pad.model");
import("etherpad.pad.model.accessPadGlobal");
import("etherpad.pro.domains");
import("etherpad.log");
import("etherpad.utils");

jimport("net.appjet.oui.exceptionlog");
jimport("java.util.concurrent.ConcurrentHashMap");
jimport("java.lang.System.out.println");

var MIN_WRITE_INTERVAL_MS = 2000; // 2 seconds
var MIN_WRITE_DELAY_NOTIFY_MS = 2000; // 2 seconds
var AGE_FOR_PAD_FLUSH_MS = 6*60*60*1000; // 6 hours
var DBUNWRITABLE_WRITE_DELAY_MS = 30*1000; // 30 seconds

// state is { constant: true }, { constant: false }, { trueAfter: timeInMs }
function setWritableState(state) {
  _dbwriter().dbWritable = state;
}

function getWritableState() {
  return _dbwriter().dbWritable;
}

function isDBWritable() {
  return _isDBWritable();
}

function _isDBWritable() {
  var state = _dbwriter().dbWritable;
  if (typeof state != "object") {
    return true;
  }
  else if (state.constant !== undefined) {
    return !! state.constant;
  }
  else if (state.trueAfter !== undefined) {
    return (+new Date()) > state.trueAfter;
  }
  else return true;
}

function getWritableStateDescription(state) {
  var v = _isDBWritable();
  var restOfMessage = "";
  if (state.trueAfter !== undefined) {
    var now = +new Date();
    var then = state.trueAfter;
    var diffSeconds = java.lang.String.format("%.1f", Math.abs(now - then)/1000);
    if (now < then) {
      restOfMessage = " until "+diffSeconds+" seconds from now";
    }
    else {
      restOfMessage = " since "+diffSeconds+" seconds ago";
    }
  }
  return v+restOfMessage;
}

function _dbwriter() {
  return appjet.cache.dbwriter;
}

function onStartup() {
  appjet.cache.dbwriter = {};
  var dbwriter = _dbwriter();
  dbwriter.pendingWrites = new ConcurrentHashMap();
  dbwriter.scheduledFor = new ConcurrentHashMap(); // padId --> long
  dbwriter.dbWritable = { constant: true };

  execution.initTaskThreadPool("dbwriter", 4);
  // we don't wait for scheduled tasks in the infreq pool to run and complete
  execution.initTaskThreadPool("dbwriter_infreq", 1);

  _scheduleCheckForStalePads();
}

function _scheduleCheckForStalePads() {
  execution.scheduleTask("dbwriter_infreq", "checkForStalePads", AGE_FOR_PAD_FLUSH_MS, []);
}

function onShutdown() {
  log.info("Doing final DB writes before shutdown...");
  var success = execution.shutdownAndWaitOnTaskThreadPool("dbwriter", 10000);
  if (! success) {
    log.warn("ERROR! DB WRITER COULD NOT SHUTDOWN THREAD POOL!");
  }
}

function _logException(e) {
  var exc = utils.toJavaException(e);
  log.warn("writeAllToDB: Error writing to SQL!  Written to exceptions.log: "+exc);
  log.logException(exc);
  exceptionlog.apply(exc);
}

function taskFlushPad(padId, reason) {
  var dbwriter = _dbwriter();
  if (! _isDBWritable()) {
    // DB is unwritable, delay
    execution.scheduleTask("dbwriter_infreq", "flushPad", DBUNWRITABLE_WRITE_DELAY_MS, [padId, reason]);
    return;
  }

  model.accessPadGlobal(padId, function(pad) {
    writePadNow(pad, true);
  }, "r", true);

  log.info("taskFlushPad: flushed "+padId+(reason?(" (reason: "+reason+")"):''));
}

function taskWritePad(padId) {
  var dbwriter = _dbwriter();
  if (! _isDBWritable()) {
    // DB is unwritable, delay
    dbwriter.scheduledFor.put(padId, (+(new Date)+DBUNWRITABLE_WRITE_DELAY_MS));
    execution.scheduleTask("dbwriter", "writePad", DBUNWRITABLE_WRITE_DELAY_MS, [padId]);
    return;
  }

  profiler.reset();
  var t1 = profiler.rcb("lock wait");
  model.accessPadGlobal(padId, function(pad) {
    t1();
    _dbwriter().pendingWrites.remove(padId); // do this first

    var success = false;
    try {
      var t2 = profiler.rcb("write");
      writePadNow(pad);
      t2();

      success = true;
    }
    finally {
      if (! success) {
        log.warn("DB WRITER FAILED TO WRITE PAD: "+padId);
      }
      profiler.print();
    }
  }, "r", true);
}

function taskCheckForStalePads() {
  // do this first
  _scheduleCheckForStalePads();

  if (! _isDBWritable()) return;

  // get "active" pads into an array
  var padIter = appjet.cache.pads.meta.keySet().iterator();
  var padList = [];
  while (padIter.hasNext()) { padList.push(padIter.next()); }

  var numStale = 0;
  var numWritten = 0;

  for (var i = 0; i < padList.length; i++) {
    if (! _isDBWritable()) break;
    var p = padList[i];
    if (model.isPadLockHeld(p)) {
      // skip it, don't want to lock up stale pad flusher
    }
    else {
      accessPadGlobal(p, function(pad) {
        if (pad.exists()) {
          var padAge = (+new Date()) - pad._meta.status.lastAccess;
          if (!pad._meta.status.lastAccess || padAge > AGE_FOR_PAD_FLUSH_MS) {
            var result = writePadNow(pad, true);
            if (result.didWrite) {
              numWritten++;
            }
            if (result.didRemove) {
              numStale++;
            }
          }
        }
      }, "r", true);
    }
  }

  log.info("taskCheckForStalePads: flushed "+numStale+" stale pads (" + numWritten + " written)");
}

function flushPadsThatDontBelongOnThisServer() {

  if (! _isDBWritable()) return;

  // get "active" pads into an array
  var padIter = appjet.cache.pads.meta.keySet().iterator();
  var padList = [];
  while (padIter.hasNext()) { padList.push(padIter.next()); }

  var numFlushed = 0;

  for (var i = 0; i < padList.length; i++) {
    if (! _isDBWritable()) break;
    var p = padList[i];
    var domainId = padutils.getDomainId(p);
    if (!domains.domainIsOnThisServer(domainId)) {
      accessPadGlobal(p, function(pad) {
        if (pad.exists()) {
          writePadNow(pad, true);
          numFlushed++;
        }
      }, "r", true);
    }
  }

  log.info("flushPadsThatDontBelongOnThisServer: flushed "+numFlushed+" banished pads");
  return ("flushPadsThatDontBelongOnThisServer: flushed "+numFlushed+" banished pads");
}



function notifyPadDirty(padId) {
  var dbwriter = _dbwriter();
  if (! dbwriter.pendingWrites.containsKey(padId)) {
    dbwriter.pendingWrites.put(padId, "pending");
    dbwriter.scheduledFor.put(padId, (+(new Date)+MIN_WRITE_INTERVAL_MS));
    execution.scheduleTask("dbwriter", "writePad", MIN_WRITE_INTERVAL_MS, [padId]);
  }
}

function scheduleFlushPad(padId, reason) {
  execution.scheduleTask("dbwriter_infreq", "flushPad", 0, [padId, reason]);
}

/*function _dbwriterLoopBody(executor) {
  try {
    var info = writeAllToDB(executor);
    if (!info.boring) {
      log.info("DB writer: "+info.toSource());
    }
    java.lang.Thread.sleep(Math.max(0, MIN_WRITE_INTERVAL_MS - info.elapsed));
  }
  catch (e) {
    _logException(e);
    java.lang.Thread.sleep(MIN_WRITE_INTERVAL_MS);
  }
}

function _startInThread(name, func) {
  (new Thread(new Runnable({
      run: function() {
        func();
      }
  }), name)).start();
}

function killDBWriterThreadAndWait() {
  appjet.cache.abortDBWriter = true;
  while (appjet.cache.runningDBWriter) {
    java.lang.Thread.sleep(100);
  }
}*/

/*function writeAllToDB(executor, andFlush) {
  if (!executor) {
    executor = new ScheduledThreadPoolExecutor(NUM_WRITER_THREADS);
  }

  profiler.reset();
  var startWriteTime = profiler.time();
  var padCount = new AtomicInteger(0);
  var writeCount = new AtomicInteger(0);
  var removeCount = new AtomicInteger(0);

  // get pads into an array
  var padIter = appjet.cache.pads.meta.keySet().iterator();
  var padList = [];
  while (padIter.hasNext()) { padList.push(padIter.next()); }

  var latch = new CountDownLatch(padList.length);

  for (var i = 0; i < padList.length; i++) {
    _spawnCall(executor, function(p) {
      try {
        var padWriteResult = {};
        accessPadGlobal(p, function(pad) {
          if (pad.exists()) {
               padCount.getAndIncrement();
            padWriteResult = writePad(pad, andFlush);
            if (padWriteResult.didWrite) writeCount.getAndIncrement();
            if (padWriteResult.didRemove) removeCount.getAndIncrement();
          }
        }, "r");
      } catch (e) {
        _logException(e);
      } finally {
          latch.countDown();
      }
    }, padList[i]);
  }

  // wait for them all to finish
  latch.await();

  var endWriteTime = profiler.time();
  var elapsed = Math.round((endWriteTime - startWriteTime)/1000)/1000;
  var interesting = (writeCount.get() > 0 || removeCount.get() > 0);

  var obj = {padCount:padCount.get(), writeCount:writeCount.get(), elapsed:elapsed, removeCount:removeCount.get()};
  if (! interesting) obj.boring = true;
  if (interesting) {
    profiler.record("writeAll", profiler.time()-startWriteTime);
    profiler.print();
  }

  return obj;
}*/

function writePadNow(pad, andFlush) {
  var didWrite = false;
  var didRemove = false;

  if (pad.exists()) {
    var dbUpToDate = false;
    if (pad._meta.status.dirty) {
      /*log.info("Writing pad "+pad.getId());*/
      pad._meta.status.dirty = false;
      //var t1 = +new Date();
      pad.writeToDB();
      //var t2 = +new Date();
      didWrite = true;

      //log.info("Wrote pad "+pad.getId()+" in "+(t2-t1)+" ms.");

      var now = +(new Date);
      var sched = _dbwriter().scheduledFor.get(pad.getId());
      if (sched) {
        var delay = now - sched;
        if (delay > MIN_WRITE_DELAY_NOTIFY_MS) {
          log.warn("dbwriter["+pad.getId()+"] behind schedule by "+delay+"ms");
        }
        _dbwriter().scheduledFor.remove(pad.getId());
      }
    }
    if (andFlush) {
      // remove from cache
      model.removeFromMemory(pad);
      didRemove = true;
    }
  }
  return {didWrite:didWrite, didRemove:didRemove};
}

/*function _spawnCall(executor, func, varargs) {
  var args = Array.prototype.slice.call(arguments, 2);
  var that = this;
  executor.schedule(new Runnable({
    run: function() {
      func.apply(that, args);
    }
  }), 0, TimeUnit.MICROSECONDS);
}*/

