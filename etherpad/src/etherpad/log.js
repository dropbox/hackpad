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
import("sqlbase.sqlcommon");
import("stringutils.startsWith");
import("sync.{callsync,callsyncIfTrue}");
import("jsutils.*");
import("exceptionutils");

import("etherpad.globals.*");
import("etherpad.pad.padutils");
import("etherpad.sessions");
import("etherpad.utils.*");

import("etherpad.pro.pro_accounts.getSessionProAccount");

jimport("java.io.FileWriter");
jimport("java.lang.System.out.println");
jimport("java.io.File");
jimport("net.appjet.ajstdlib.execution");



function getReadableTime() {
  return (new Date()).toString().split(' ').slice(0, 5).join('-');
}

serverhandlers.tasks.trackerAndSessionIds = function() {
  var m = new Packages.scala.collection.mutable.HashMap();
  if (request.isDefined) {
    try {
      if (sessions.getTrackingId()) {
        m.update("tracker", sessions.getTrackingId());
      }
      if (sessions.getSessionId()) {
        m.update("session", sessions.getSessionId());
      }
      if (request.path) {
        m.update("path", request.path);
      }
      if (request.clientAddr) {
        m.update("clientAddr", request.clientAddr);
      }
      if (request.host) {
        m.update("host", request.host);
      }
      if (request.headers["User-Agent"]) {
        m.update("userAgent", request.headers["User-Agent"]);
      }
      /* FIXME: No idea WTF this breaks sessions for the first request but it seems to! */
      /*
      if (getSessionProAccount()) {
        m.update("proAccountId", getSessionProAccount().id);
      }
      */
    } catch (e) {
      // do nothing.
    }
  }
  return m;
}

function onStartup() {
  var f = execution.wrapRunTask("trackerAndSessionIds", null,
    java.lang.Class.forName("scala.collection.mutable.HashMap"));
  net.appjet.oui.GenericLoggerUtils.setExtraPropertiesFunction(f);
}

//----------------------------------------------------------------
// Logfile parsing
//----------------------------------------------------------------

function _n(x) {
  if (x < 10) { return "0"+x; }
  else { return x; }
}

function logFileName(prefix, logName, day) {
  var fmt = [day.getFullYear(), _n(day.getMonth()+1), _n(day.getDate())].join('-');
  var fname = (appjet.config['logDir'] + '/'+prefix+'/' + logName + '/' +
	       logName + '-' + fmt + '.jslog');

  // make sure file exists
  if (!(new File(fname)).exists()) {
    //log.warn("WARNING: file does not exist: "+fname);
    return null;
  }

  return fname;
}

function frontendLogFileName(logName, day) {
  return logFileName('frontend', logName, day);
}

function backendLogFileName(logName, day) {
  return logFileName('backend', logName, day);
}

//----------------------------------------------------------------
function _getRequestLogEntry() {
  if (request.isDefined) {
    var logEntry = {
      clientAddr: request.clientAddr,
      method: request.method.toLowerCase(),
      scheme: request.scheme,
      host: request.host,
      path: request.path,
      query: request.query,
      referer: request.headers['Referer'],
      userAgent: request.headers['User-Agent'],
      statusCode: (response.isDefined && response.getStatusCode()) || 0,
    }
    if (request.cache && 'globalPadId' in request.cache) {
      logEntry.padId = request.cache.globalPadId;
    }
    return logEntry;
  } else {
    return {};
  }
}

function logRequest() {
  if ((! request.isDefined) ||
      startsWith(request.path, COMETPATH) ||
      isStaticRequest()) {
    return;
  }

  _log("request", _getRequestLogEntry());
}

function _log(name, m) {
  var cache = appjet.cache;

  callsyncIfTrue(
    cache,
    function() { return ! ('logWriters' in cache)},
    function() { cache.logWriters = {}; }
  );

  callsyncIfTrue(
    cache.logWriters,
    function() { return !(name in cache.logWriters) },
    function() {
      lw = new net.appjet.oui.GenericLogger('frontend', name, true);
      if (! isProduction()) {
        lw.setEchoToStdOut(true);
      }
      lw.start();
      cache.logWriters[name] = lw;
    });

  var lw = cache.logWriters[name];
  if (typeof(m) == 'object') {
    lw.logObject(m);
  } else {
    lw.log(m);
  }
}

function custom(name, m) {
  _log(name, m);
}

function _stampedMessage(m) {
  var obj = {};
  if (typeof(m) == 'string') {
    obj.message = m;
  } else {
    eachProperty(m, function(k, v) {
      obj[k] = v;
    });
  }
  // stamp message with pad and path
  if (request.isDefined) {
    obj.path = request.path;
  }

  var currentPad = padutils.getCurrentPad();
  if (currentPad) {
    obj.currentPad = currentPad;
  }

  return obj;
}

//----------------------------------------------------------------
// logException
//----------------------------------------------------------------
import("cache_utils.syncedWithCache");
function currentHourId() {
  var now = new Date();
  var onejan = new Date(now.getFullYear(),0,1);
  var dayNum = Math.ceil((now - onejan) / 86400000);
  var hour = now.getHours();
  return dayNum+":"+hour;
}

function logException(ex) {

  syncedWithCache('exception-counts', function (c) {
    var hourId = currentHourId();
    c[hourId] = (c[hourId]  || 0) + 1;
  });

  if (typeof(ex) != 'object' || ! (ex instanceof java.lang.Throwable)) {
    ex = toJavaException(ex);
    //ex = new java.lang.RuntimeException(String(ex));
  }
  // NOTE: ex is always a java.lang.Throwable
  var m = _getRequestLogEntry();
  m.jsTrace = exceptionutils.getStackTracePlain(ex);
  var s = new java.io.StringWriter();
  ex.printStackTrace(new java.io.PrintWriter(s));
  m.trace = s.toString();
  _log("exception", m);
}

function callCatchingExceptions(func) {
  try {
    return func();
  }
  catch (e) {
    logException(toJavaException(e));
  }
  return undefined;
}

//----------------------------------------------------------------
// warning
//----------------------------------------------------------------
function warn(m) {
  _log("warn", _stampedMessage(m));
}

//----------------------------------------------------------------
// info
//----------------------------------------------------------------
function info(m) {
  _log("info", _stampedMessage(m));
}

