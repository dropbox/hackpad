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


/**
 * @fileDescription
 * Sosme profiling functions.
 */
var time = function() {
  return Packages.net.appjet.oui.profiler.time();
}

var record = function(op, time) {
  Packages.net.appjet.oui.profiler.record(op, time);
}

var recordCumulative = function(op, time) {
  Packages.net.appjet.oui.profiler.recordCumulative(op, time);
}

var reset = function() {
  Packages.net.appjet.oui.profiler.reset();
}

var print = function() {
  Packages.net.appjet.oui.profiler.print();
}

var rcb = function(op, cumulative) {
  var start = time();
  return function() {
    var end = time();
    (cumulative ? recordCumulative : record)(op, end-start);
  }
}