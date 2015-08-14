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

package net.appjet.oui;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import scala.collection.mutable.{HashSet, SynchronizedSet};
import java.util.concurrent.ConcurrentHashMap;

import net.appjet.bodylock.{BodyLock, JSCompileException};

object ScopeReuseManager {
  // reset handling.
  // val filesToWatch = new ConcurrentHashMap[CachedFile, Unit];
  // def watch(libs: DiskLibrary*) {
  //   for(lib <- libs) {
  //     filesToWatch.put(lib,());
  //   }
  // }
  val t = new java.util.TimerTask {
    def run() {
      Thread.currentThread().setName("File Update Watcher");
      try {
        // val t1 = System.currentTimeMillis;
        // var doReset = false;
        // val libIter = filesToWatch.keySet.iterator;
        // while (libIter.hasNext) {
        //   if (libIter.next.hasBeenModified) {
        //     doReset = true;
        //   }
        // }
        // val t2 = System.currentTimeMillis;
        // val elapsedMs = (t2 -t1).toInt;
        // if (elapsedMs >= 500) {
        //   eventlog(Map(
        //     "type" -> "event",
        //     "event" -> "scopereusefilewatcher-slowtask",
        //     "elapsedMs" -> elapsedMs
        //   ));
        // }
        if (FileCache.testFiles()) {
          reset();
        }
      } catch {
        case e => e.printStackTrace();
      }
    }
  }
  val timerPeriod = if (! config.devMode) 5000 else 500;
  val timer = new java.util.Timer(true);
  timer.schedule(t, timerPeriod, timerPeriod);

  // scope handling
  val mainLib = new VariableDiskLibrary("main.js");
  val preambleLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "preamble.js"));
  val postambleLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "postamble.js"));
  def mainExecutable = mainLib.executable;
  def preambleExecutable = preambleLib.executable;
  def postambleExecutable = postambleLib.executable;

  val mainGlobalScope = BodyLock.newScope;

  val nextId = new AtomicLong(0);
  val freeRunners = new ConcurrentLinkedQueue[Runner]();
  var lastReset = new AtomicLong(0);
  val resetLock = new ReentrantReadWriteLock(true);
  def readLocked[E](block: => E): E = {
    resetLock.readLock().lock();
    try {
      block;
    } finally {
      resetLock.readLock().unlock();
    }
  }
  def writeLocked[E](block: => E): E = {
    resetLock.writeLock().lock();
    try {
      block;
    } finally {
      resetLock.writeLock().unlock();
    }
  }

  case class Runner(val globalScope: org.mozilla.javascript.Scriptable) {
    var count = 0;
    val created = timekeeper.time;
    val id = nextId.incrementAndGet();
    val mainScope = BodyLock.subScope(globalScope);
    var reuseOk = true;
    var trace: Option[Array[StackTraceElement]] = None;
    override def finalize() {
      trace.foreach(t => eventlog(Map(
        "type" -> "error",
        "error" -> "unreleased runner",
        "runnerId" -> id,
        "trace" -> t.mkString("\n"))));
      super.finalize();
    }
    val attributes = new scala.collection.mutable.HashMap[String, Object];
  }

  def newRunner = {
    // watch(mainLib, preambleLib, postambleLib);
    val startTime = System.currentTimeMillis();
    val scope = BodyLock.subScope(mainGlobalScope);
    val r = Runner(scope);
    ExecutionContextUtils.withContext(ExecutionContext(null, null, r)) {
//    scope.put("_appjetcontext_", scope, );
      preambleExecutable.execute(scope);
      mainExecutable.execute(r.mainScope);
      postambleExecutable.execute(scope);
      val endTime = System.currentTimeMillis();
      eventlog(Map(
        "type" -> "event",
        "event" -> "runner-created",
        "latency" -> (endTime - startTime).toString(),
        "runnerId" -> r.id));
    }
    r;
  }

  val rnd = new scala.util.Random();
  def getRunner = readLocked {
    if (rnd.nextInt(1000) < 10) {
      eventlog(Map(
        "type" -> "event",
        "event" -> "get-runner",
        "runners" -> freeRunners.size()));
    }

    val runner = freeRunners.poll();
    if (runner == null) {
      newRunner;
    } else {
      if (config.devMode) {
        runner.trace = Some(Thread.currentThread().getStackTrace());
      }
      runner;
    }
  }

  def getEmpty(block: Runner => Unit): Runner = readLocked {
    // watch(preambleLib, postambleLib);
    val scope = BodyLock.newScope;
    val r = Runner(scope);
//    scope.put("_appjetcontext_", scope, ExecutionContext(null, null, r));
    ExecutionContextUtils.withContext(ExecutionContext(null, null, r)) {
      preambleExecutable.execute(scope);
      block(r);
      postambleExecutable.execute(scope);
    }
    r;
  }
  
  def getEmpty: Runner = getEmpty(r => {});

  def freeRunner(r: Runner) {
    r.trace = None;
    if (r.reuseOk && r.created > lastReset.get()) {
      freeRunners.offer(r);
    } else {
      if (r.reuseOk) {
        eventlog(Map(
          "type" -> "event",
          "event" -> "runner-discarded",
          "runnerId" -> r.id));
      } else {
        eventlog(Map(
          "type" -> "event",
          "event" -> "runner-retired",
          "runnerId" -> r.id));
      }
    }
  }

  lazy val resetExecutable = (new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onreset.js"))).executable;
  def runOnReset() {
    execution.runOutOfBand(resetExecutable, "Reset", None, { error => 
      error match {
        case e: JSCompileException => { }
        case e: Throwable => { exceptionlog(e); }
        case (sc: Int, msg: String) => { exceptionlog("Reset failed: "+msg); }
        case x => exceptionlog("Reset failed: "+String.valueOf(x));
      }
    });
  }

  def reset() = writeLocked {
    eventlog(Map(
      "type" -> "event",
      "event" -> "files-reset"));
    // filesToWatch.clear();
    lastReset.set(timekeeper.time);
    freeRunners.clear();
    runOnReset();
  }

  eventlog(Map(
    "type" -> "event",
    "event" -> "server-restart"));
}

