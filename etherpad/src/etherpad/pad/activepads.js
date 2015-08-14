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

import("jsutils.cmp");

jimport("net.appjet.common.util.LimitedSizeMapping");

var HISTORY_SIZE = 100;

function _getMap() {
  if (!appjet.cache['activepads']) {
    appjet.cache['activepads'] = {
      map: new LimitedSizeMapping(HISTORY_SIZE)
    };
  }
  return appjet.cache['activepads'].map;
}

function touch(padId) {
  _getMap().put(padId, +(new Date));
}

function getActivePads() {
  var m = _getMap();
  var a = m.listAllKeys().toArray();
  var activePads = [];
  for (var i = 0; i < a.length; i++) {
    activePads.push({
      padId: a[i],
      timestamp: m.get(a[i])
    });
  }

  activePads.sort(function(a,b) { return cmp(b.timestamp,a.timestamp); });
  return activePads;
}



