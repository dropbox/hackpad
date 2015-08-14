/*!
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

// author: David Greenspan
// a basic profiler
// e.g. var p = PROFILER("somename", true);
//      p.mark("abc"); abc();
//      p.mark("xyz"); var x = xyz();
//      p.literal(x, "someNumber");
//      p.end();

// Note that IE/Win only has 16 ms time resolution for each run.

var _profilersByName = {};
function PROFILER(name, enabled) {
  if (!_profilersByName['$'+name]) {
    _profilersByName['$'+name] = _makeProfiler(name, enabled);
  }
  var p = _profilersByName['$'+name];
  p.start();
  return p;
}

function resetProfiler(name) {
  delete _profilersByName['$'+name];
}

function _makeProfiler(name, enabled) {
  enabled = (enabled !== false);

  var _profileTime;
  var _profileResults;
  var _profileTotal;
  var _profileHistory = [];
  var running = false;

  function profileStart(name) {
    _profileResults = [];
    _profileTotal = 0;
    if (name) _profileResults.push(name);
    running = true;
    _profileTime = (new Date()).getTime();
  }

  function profileMark(name) {
    var stopTime = (new Date()).getTime();
    var dt = stopTime - _profileTime;
    _profileResults.push(dt);
    _profileTotal += dt;
    if (name) _profileResults.push(name);
    _profileTime = (new Date()).getTime();
  }

  function profileLiteral(value, name) {
    _profileResults.push(value);
    if (name) _profileResults.push("%="+name);
  }

  function profileEnd(name) {
    if (running == false) return;
    var stopTime = (new Date()).getTime();
    var dt = stopTime - _profileTime;
    _profileResults.push(dt);
    _profileTotal += dt;
    if (name) _profileResults.push(name);
    _profileResults.unshift(_profileTotal,"=");
    _profileHistory.push(_profileResults);
    if (dumpProfileDataTimeout)
      top.clearTimeout(dumpProfileDataTimeout);
    dumpProfileDataTimeout = top.setTimeout(dumpProfileData, 800);
    running = false;
  }

  var dumpProfileDataTimeout = null;

  function dumpProfileData() {
    var data = _profileHistory[0].slice();
    forEach(_profileHistory.slice(1), function (h) {
      forEach(h, function (x, i) {
	if ((typeof x) == "number") data[i] += x;
      });
    });
    data = map(data, function (x) {
      if ((typeof x) == "number") return String(x/_profileHistory.length).substring(0,4);
      return x;
    });
    data.push("("+_profileHistory.length+")");
    top.pad.dmesg(data.join(" ").replace(/ %/g,''));
    dumpProfileDataTimeout = null;
  }

  function noop() {}
  function cancel() {
    running = false;
  }

  if (enabled) {
    return {start:profileStart, mark:profileMark, literal:profileLiteral, end:profileEnd,
	    cancel:cancel};
  }
  else {
    return {start:noop, mark:noop, literal:noop, end:noop, cancel:noop};
  }
}
