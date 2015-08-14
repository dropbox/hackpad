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

jimport("java.util.concurrent.atomic.AtomicInteger");

import("sync");
import("meter");

function varz() {
  sync.callsyncIfTrue(appjet.cache,
    function() { return ! appjet.cache.varz; },
    function() { appjet.cache.varz = {}; });
  return appjet.cache.varz;
}

function _getInteger(name) {
  sync.callsyncIfTrue(varz(),
    function() { return ! varz()[name] },
    function() { varz()[name] = new AtomicInteger(0) });
  return varz()[name];
}

function _getMetric(name) {
  sync.callsyncIfTrue(varz(),
    function() { return ! varz()[name] },
    function() { varz()[name] = new meter.Meter({rateUnit: meter.units.MINUTES});
                  varz()[name].start();
    });
  return varz()[name];
}

function incrementInt(name) {
  _getInteger(name).getAndIncrement();
}

function addToInt(name, count) {
  _getInteger(name).getAndAdd(count);
}

function incrementMetric(name, count) {
//  sync.callsync(_getMetric(name), function() {
//    _getMetric(name).mark(count);
//  });
}

function getSnapshot() {
  var ret = {};
  for (var k in varz()) {
    if (k[0] == '_') {
      continue;
    }

    if (varz()[k].toJSON) {
//      sync.callsync(_getMetric(k), function() {
//        ret[k] = _getMetric(k).toJSON();
//      });
    } else {
      ret[k] = varz()[k].toString();
    }
  }
  return ret;
}
