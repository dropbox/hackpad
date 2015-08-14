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

import java.text.SimpleDateFormat;
import java.io.{File, FileWriter, StringWriter, PrintWriter};
import java.util.Date;
import java.util.concurrent.{ConcurrentLinkedQueue, ConcurrentHashMap, CopyOnWriteArraySet};
import java.util.concurrent.atomic.AtomicInteger;

import scala.util.Sorting;
import scala.ref.WeakReference;
import scala.collection.mutable.{Map, HashMap};

import net.sf.json.{JSONObject, JSONArray};
import org.mozilla.javascript.{Scriptable, Context};

import scala.collection.JavaConversions;
import scala.collection.JavaConversions._;

trait LoggablePropertyBag {
  def date: Date;
  def `type`: String = value("type").asInstanceOf[String];
  def json: String;
  def tabDelimited: String;
  def keys: Array[String];
  def value(k: String): Any;
}

class LoggableFromScriptable(
  scr: Scriptable, 
  extra: Option[scala.collection.Map[String, String]])
    extends LoggablePropertyBag {
  def this(scr: Scriptable) = this(scr, None);
  if (extra.isDefined) {
    for ((k, v) <- extra.get if (! scr.has(k, scr))) { 
      scr.put(k, scr, v);
    }
  }

  val keys = 
    scr.getIds()
      .map(_.asInstanceOf[String])
      .filter(scr.get(_, scr) != Context.getUndefinedValue());
  Sorting.quickSort(keys);
  if (! scr.has("date", scr)) {
    scr.put("date", scr, System.currentTimeMillis());
  }
  val date = new Date(scr.get("date", scr).asInstanceOf[Number].longValue);
  val json = FastJSON.stringify(scr);
  val tabDelimited = GenericLoggerUtils.dateString(date) + "\t" +
                     keys.filter("date" != _).map(value(_)).mkString("\t");

  def value(k: String) = {
    scr.get(k, scr);
  }
}

class LoggableFromMap[T](
  map: scala.collection.Map[String, T], 
  extra: Option[scala.collection.Map[String, String]])
    extends LoggablePropertyBag {
  def this(map: scala.collection.Map[String, T]) = this(map, None);
  val keys = map.keys.toArray ++
    extra.map(_.keys.toArray).getOrElse(Array[String]());
  Sorting.quickSort(keys);

  def fillJson(json: JSONObject, 
               map: scala.collection.Map[String, T]): JSONObject = {
    for ((k, v) <- map) {
      v match {
        case b: Boolean => json.put(k, b);
        case d: Double => json.put(k, d);
        case i: Int => json.put(k, i);
        case l: Long => json.put(k, l);
        case m: java.util.Map[_,_] => json.put(k, m);
        case m: scala.collection.Map[String,T] => 
          json.put(k, fillJson(new JSONObject(), m));
        case c: java.util.Collection[_] => json.put(k, c);
        case o: Object => json.put(k, o);
        case _ => {};
      }
    }
    json;
  }
  val json0 = fillJson(new JSONObject(), map);
  if (extra.isDefined) {
    for ((k, v) <- extra.get if (! json0.has(k))) {
      json0.put(k, v);
    }
  }
  if (! json0.has("date")) {
    json0.put("date", System.currentTimeMillis());
  }
  val date = new Date(json0.getLong("date"));
  val json = json0.toString;
  val tabDelimited = 
    GenericLoggerUtils.dateString(date) + "\t" +
    keys.filter("date" != _).map(value(_)).mkString("\t");

  def value(k: String) = {
    map.orElse(extra.getOrElse(Map[String, Any]()))(k);
  }
}

class LoggableFromJson(val json: String) extends LoggablePropertyBag {
  val obj = JSONObject.fromObject(json);
  val date = new Date(obj.getLong("date"));
  val keys = obj.keys().map(String.valueOf(_)).toArray;
  // FIXME: is now not sorted in any particular order.
  def value(k: String) = obj.get(k);
  val tabDelimited =
    GenericLoggerUtils.dateString(date) + "\t"+
    keys.filter("date" != _).map(value(_)).mkString("\t");
}

object GenericLoggerUtils {
  lazy val df = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSSZ");
  def dateString(date: Date) = df.format(date);
  var extraPropertiesFunction: Option[() => Map[String, String]] = None;
  def setExtraPropertiesFunction(f: () => Map[String, String]) {
    extraPropertiesFunction = Some(() => {
      try {
        f();
      } catch {
        case e => withoutExtraProperties {
          exceptionlog(e);
          Map[String, String]();
        }
      }
    });
  }
  def getExtraProperties: Option[Map[String, String]] = {
    if (shouldGetExtraProperties) {
      withoutExtraProperties(extraPropertiesFunction.map(_()));
    } else {
      None;
    }
  }
  
  val registeredWranglers = 
    new ConcurrentHashMap[String, scala.collection.mutable.Set[WeakReference[LogWrangler]]];
  def registerWrangler(name: String, wrangler: LogWrangler) {
    wranglers(name) += wrangler.ref;
  }
  def clearWrangler(name: String, wrangler: LogWrangler) {
    wranglers(name) -= wrangler.ref;
  }
  def wranglers(name: String) = {
    if (! registeredWranglers.containsKey(name)) {
      val set1 = JavaConversions.asScalaSet(
        new CopyOnWriteArraySet[WeakReference[LogWrangler]]);
      val set2 = registeredWranglers.putIfAbsent(
        name, set1);
      if (set2 == null) {
        set1
      } else {
        set2
      }
    } else {
      registeredWranglers.get(name);
    }
  }
  def tellWranglers(name: String, lpb: LoggablePropertyBag) {
    for (w <- wranglers(name)) {
      w.get.foreach(_.tell(lpb));
      if (w.get.isEmpty) {
        wranglers(name) -= w;
      }
    }
  }

  val shouldGetExtraProperties_var = 
    new NoninheritedDynamicVariable[Boolean](true);  
  def withoutExtraProperties[E](block: => E): E = {
    shouldGetExtraProperties_var.withValue(false)(block);
  }
  def shouldGetExtraProperties = shouldGetExtraProperties_var.value;
}

class GenericLogger(path: String, logName: String, rotateDaily: Boolean) {
  val queue = new ConcurrentLinkedQueue[LoggablePropertyBag];

  var loggerThread: Thread = null;
  var currentLogDay:Date = null;
  var logWriter: FileWriter = null;
  var logBase = config.logDir;
  def setLogBase(p: String) { logBase = p }

  var echoToStdOut = false;
  def setEchoToStdOut(e: Boolean) {
    echoToStdOut = e;
  }
  def stdOutPrefix = logName+": "

  def initLogWriter(logDay: Date) {
    currentLogDay = logDay;
    
    // if rotating, log filename is logBase/[path/]logName/logName-<date>.jslog
    // otherwise, log filename is logBase/[path/]logName.jslog
    var fileName =
      if (rotateDaily) {
        val df = new SimpleDateFormat("yyyy-MM-dd");
        logName + "/" + logName + "-" + df.format(logDay) + ".jslog";
      } else {
        logName + ".jslog";
      }
    if (path != null && path.length > 0) {
      fileName = path + "/" + fileName;
    }
    val f = new File(logBase+"/"+fileName);
    if (! f.getParentFile.exists) {
      f.getParentFile().mkdirs();
    }
    logWriter = new FileWriter(f, true);
  }

  def rotateIfNecessary(messageDate: Date) {
    if (rotateDaily) {
      if (!((messageDate.getYear == currentLogDay.getYear) &&
            (messageDate.getMonth == currentLogDay.getMonth) &&
            (messageDate.getDate == currentLogDay.getDate))) {
        logWriter.flush();
        logWriter.close();
        initLogWriter(messageDate);
      }
    }
  }

  def flush() {
    flush(java.lang.Integer.MAX_VALUE);
  }
  def close() {
    logWriter.close();
  }
    
  def flush(n: Int) = synchronized {
    var count = 0;
    while (count < n && ! queue.isEmpty()) {
      val lpb = queue.poll();
      rotateIfNecessary(lpb.date);
      logWriter.write(lpb.json+"\n");
      if (echoToStdOut)
        print(lpb.tabDelimited.split("\n").mkString(stdOutPrefix, "\n"+stdOutPrefix, "\n"));
      count += 1;
    }
    if (count > 0) {
      logWriter.flush();
    }
    count;
  }

  def start() {
    initLogWriter(new Date());

    loggerThread = new Thread("GenericLogger "+logName) {
      this.setDaemon(true);
      override def run() {
        while (true) {
          if (queue.isEmpty()) {
            Thread.sleep(500);
          } else {
            flush(1000);
          }
        }
      }
    }
    main.loggers += this;
    loggerThread.start();
  }

  def log(lpb: LoggablePropertyBag) {
    if (loggerThread != null) {
      queue.offer(lpb);
      GenericLoggerUtils.tellWranglers(logName, lpb);
    }
  }
  def logObject(scr: Scriptable) {
    log(new LoggableFromScriptable(
      scr, GenericLoggerUtils.getExtraProperties));
  }
  def log[T](m: scala.collection.Map[String, T]) {
    log(new LoggableFromMap(
      m, GenericLoggerUtils.getExtraProperties));
  }
  def log(s: String) {
    log(Map("message" -> s));
  }
  def apply(s: String) {
    log(s);
  }
  def apply(scr: Scriptable) {
    logObject(scr);
  }
  def apply[T](m: scala.collection.Map[String, T]) {
    log(m);
  }
}

object profiler extends GenericLogger("backend", "profile", false) {
  def apply(id: String, op: String, method: String, path: String, countAndNanos: (Long, Long)) {
    if (loggerThread != null)
      log(id+":"+op+":"+method+":"+path+":"+
          math.round(countAndNanos._2/1000)+
          (if (countAndNanos._1 > 1) ":"+countAndNanos._1 else ""));
  }
//   def apply(state: RequestState, op: String, nanos: long) {
//     apply(state.requestId, op, state.req.getMethod(), state.req.getRequestURI(), nanos);
//   }

  def time =
    System.nanoTime();

  // thread-specific stuff.
  val map = new ThreadLocal[HashMap[String, Any]] {
    override def initialValue = new HashMap[String, Any];
  }
  val idGen = new java.util.concurrent.atomic.AtomicLong(0);
  val id = new ThreadLocal[Long] {
    override def initialValue = idGen.getAndIncrement();
  }
  def reset() = {
    map.remove();
    id.remove();
  }

  def record(key: String, time: Long) {
    map.get()(key) = (1L, time);
  }
  def recordCumulative(key: String, time: Long) {
    map.get()(key) = map.get().getOrElse(key, (0L, 0L)) match {
      case (count: Long, time0: Long) => (count+1, time0+time);
      case _ => { } // do nothing, but maybe shoud error.
    }
  }
  def print() {
    for ((k, t) <- map.get()) {
      profiler(""+id.get(), k, "/", "/", t match {
        case (count: Long, time0: Long) => (count, time0);
        case _ => (-1L, -1L);
      });
    }
  }
  
  def printTiming[E](name: String)(block: => E): E = {
    val startTime = time;
    val r = block;
    val endTime = time;
    println(name+": "+((endTime - startTime)/1000)+" us.");
    r;
  }
}

object eventlog extends GenericLogger("backend", "server-events", true) {
  start();
}

object streaminglog extends GenericLogger("backend", "streaming-events", true) {
  start();
}

object exceptionlog extends GenericLogger("backend", "exceptions", true) {
  def apply(e: Throwable) {
    val s = new StringWriter;
    e.printStackTrace(new PrintWriter(s));
    log(Map(
      "description" -> e.toString(),
      "trace" -> s.toString()));
  }

  echoToStdOut = config.devMode
  override def stdOutPrefix = "(exlog): ";

  start();
}

// object dprintln extends GenericLogger("backend", "debug", true) {
//   echoToStdOut = config.devMode;
// }

class STFULogger extends org.mortbay.log.Logger {
  def debug(m: String, a0: Object, a1: Object) { }
  def debug(m: String, t: Throwable) { }
  def getLogger(m: String) = { this }
  def info(m: String, a0: Object, a2: Object) { }
  def isDebugEnabled() = { false }
  def setDebugEnabled(t: Boolean) { }
  def warn(m: String, a0: Object, a1: Object) { }
  def warn(m: String, t: Throwable) { }
}

case class Percentile(count: Int, p50: Int, p90: Int, p95: Int, p99: Int, max: Int);

object cometlatencies {
  var latencies = new java.util.concurrent.ConcurrentLinkedQueue[Int];
  def register(t: Int) = latencies.offer(t);
  
  var loggerThread: Thread = null;
  var lastCount: Option[Map[String, Int]] = None;
  var lastStats: Option[Percentile] = None;
  def start() {
    loggerThread = new Thread("latencies logger") {
      this.setDaemon(true);
      override def run() {
        while(true) {
          Thread.sleep(60*1000); // every minute
          try {
            val oldLatencies = latencies;
            latencies = new java.util.concurrent.ConcurrentLinkedQueue[Int];
            // NOTE(pc): Could probably use 'iterableAsScalaIterable' instead here.
            val latArray = collectionAsScalaIterable(oldLatencies).toArray;
            Sorting.quickSort(latArray);
            def pct(p: Int) =
              if (latArray.length > 0)
                latArray(math.floor((p/100.0)*latArray.length).toInt);
              else
                0;
            def s(a: Any) = String.valueOf(a);
            lastStats = Some(Percentile(latArray.length, 
              pct(50), pct(90), pct(95), pct(99), 
              if (latArray.length > 0) latArray.last else 0));
            eventlog.log(Map(
              "type" -> "streaming-message-latencies",
              "count" -> s(lastStats.get.count),
              "p50" -> s(lastStats.get.p50),
              "p90" -> s(lastStats.get.p90),
              "p95" -> s(lastStats.get.p95),
              "p99" -> s(lastStats.get.p99),
              "max" -> s(lastStats.get.max)));
            lastCount = Some({ 
              val c = Class.forName("net.appjet.ajstdlib.Comet$");
              c.getDeclaredMethod("connectionStatus")
                .invoke(c.getDeclaredField("MODULE$").get(null))
            }.asInstanceOf[Map[String, Int]]);
            eventlog.log(
              Map("type" -> "streaming-connection-count") ++ 
              lastCount.get.iterator.map(p => (p._1, String.valueOf(p._2))));
          } catch {
            case e: Exception => {
              exceptionlog(e);
            }
          }
        }
      }
    }
    loggerThread.start();
  }

  start();
}

object executionlatencies extends GenericLogger("backend", "latency", true) {
  start();
  
  def time = System.currentTimeMillis();
}

abstract class LogWrangler {
  def tell(lpb: LoggablePropertyBag);
  def tell(json: String) { tell(new LoggableFromJson(json)); }
  lazy val ref = new WeakReference(this);

  def watch(logName: String) {
    GenericLoggerUtils.registerWrangler(logName, this);
  }
}

// you probably want to subclass this, or at least set data.
class FilterWrangler(
    `type`: String,
    filter: LoggablePropertyBag => Boolean,
    field: String) extends LogWrangler {
  def tell(lpb: LoggablePropertyBag) {
    if ((`type` == null || lpb.`type` == `type`) &&
        (filter == null || filter(lpb))) {
      val entry = lpb.value(field);
      data(lpb.date, entry);
    }    
  }
  var data: (Date, Any) => Unit = null;
  def setData(data0: (Date, Any) => Unit) {
    data = data0;
  }
}

class TopNWrangler(n: Int, `type`: String, 
                   filter: LoggablePropertyBag => Boolean,
                   field: String) 
    extends FilterWrangler(`type`, filter, field) {
  val entries = new ConcurrentHashMap[String, AtomicInteger]();
  def sortedEntries = {
    Sorting.stableSort(
      entries.toSeq, 
      (p1: (String, AtomicInteger), p2: (String, AtomicInteger)) => 
        p1._2.get() > p2._2.get());
  }
  def count = {
    (entries :\ 0) { (x, y) => x._2.get() + y }
  }
  
  def topNItems(n: Int): Array[(String, Int)] = 
    sortedEntries.take(n).map(p => (p._1, p._2.get())).toArray;
  def topNItems: Array[(String, Int)] = topNItems(n);
  
  data = (date: Date, value: Any) => {
    val entry = value.asInstanceOf[String];
    val i = 
      if (! entries.containsKey(entry)) {
        val newInt = new AtomicInteger(0);
        val oldInt = entries.putIfAbsent(entry, newInt);
        if (oldInt == null) { newInt } else { oldInt }
      } else {
        entries.get(entry);
      }
    i.incrementAndGet();
  }
}
