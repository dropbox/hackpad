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
import("etherpad.utils.isPrivateNetworkEdition");
import("fastJSON");

import("etherpad.statistics.statistics");

function run() {
  if (isPrivateNetworkEdition()) {
    return;
  }
  
  statistics.getAllStatNames().forEach(function(statName) {
    if (statistics.getStatData(statName).dataType == 'topValues') {
      var entries = sqlobj.selectMulti('statistics', {name: statName});
      entries.forEach(function(statEntry) {
        var value = fastJSON.parse(statEntry.value);
        value.topValues = value.topValues.slice(0, 50);
        statEntry.value = fastJSON.stringify(value);
        sqlobj.update('statistics', {id: statEntry.id}, statEntry);
      });
    }
  });
}