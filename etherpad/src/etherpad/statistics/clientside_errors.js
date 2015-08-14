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


import("fastJSON");
import("etherpad.log");
import("cache_utils.syncedWithCache");
import("funhtml.*");
import("jsutils.{eachProperty,keys}");
import("etherpad.utils.*");

function _dayKey(date) {
  return [date.getFullYear(), date.getMonth()+1, date.getDate()].join(',');
}

function _dateAddDays(date, numDays) {
  return new Date((+date) + numDays*1000*60*60*24);
}

function _loadDay(date) {
  var fileName = log.frontendLogFileName('clientside-errors', date);
  if (! fileName) {
    return [];
  }
  var reader = new java.io.BufferedReader(new java.io.FileReader(fileName));
  var line = null;
  var array = [];
  var hashed = {};
  while ((line = reader.readLine()) !== null) {
    var lineObj = fastJSON.parse(line)
    var hash = _exceptionHash(lineObj);
    if (hashed[hash]) {
      hashed[hash].count += 1;
    } else {
      hashed[hash] = lineObj;
      lineObj.count = 1
      array.push(lineObj);
    }
  }
  return array;
}

function _accessLatestLogs(func) {
  syncedWithCache("etherpad.statistics.clientside_errors", function(exc) {
    if (! exc.byDay) {
      exc.byDay = {};
    }
    // always reload today from disk
    var now = new Date();
    var today = now;
    var todayKey = _dayKey(today);
    exc.byDay[todayKey] = _loadDay(today);

    var activeKeys = {};
    activeKeys[todayKey] = true;
    // load any of 7 previous days that aren't loaded or
    // were not loaded as a historical day
    for(var i=1;i<=7;i++) {
      var pastDay = _dateAddDays(today, -i);
      var pastDayKey = _dayKey(pastDay);
      activeKeys[pastDayKey] = true;
      if ((! exc.byDay[pastDayKey]) || (! exc.byDay[pastDayKey].sealed)) {
        exc.byDay[pastDayKey] = _loadDay(pastDay);
        exc.byDay[pastDayKey].sealed = true; // in the past, won't change
      }
    }
    // clear old days
    for(var k in exc.byDay) {
      if (! (k in activeKeys)) {
        delete exc.byDay[k];
      }
    }

    var logs = {
      getDay: function(daysAgo) {
        return exc.byDay[_dayKey(_dateAddDays(today, -daysAgo))];
      },
      eachLineInLastNDays: function(n, func) {
        var oldest = _dateAddDays(now, -n);
        var oldestNum = +oldest;
        for(var i=n;i>=0;i--) {
          var lines = logs.getDay(i);
          lines.forEach(function(line) {
            if (line.date > oldestNum) {
              func(line);
            }
          });
        }
      }
    };

    func(logs);
  });
}

function _exceptionHash(line) {
  return new java.lang.String(line.message.message || '-none-').hashCode();
}


function render() {

  _accessLatestLogs(function(logs) {
    var weekCounts = {};
    var totalWeekCount = 0;

    // count exceptions of each kind in last week
    logs.eachLineInLastNDays(7, function(line) {
      var hash = _exceptionHash(line);
      weekCounts[hash] = (weekCounts[hash] || 0) + line.count;
      totalWeekCount += line.count;
    });

    var dayData = {};
    var totalDayCount = 0;

    // accumulate data about each exception in last 24 hours
    logs.eachLineInLastNDays(1, function(line) {
      var hash = _exceptionHash(line);
      var oldData = dayData[hash];
      var data = (oldData || {});
      if (! oldData) {
        data.hash = hash;
        data.trace = line.errorObj;
        data.trackers = {};
      }
      data.message = line.message;
      data.count = (data.count || 0) + line.count;
      data.trackers[line.tracker] = true;
      totalDayCount += line.count;
      dayData[hash] = data;
    });

    // put day datas in an array and sort
    var dayDatas = [];
    eachProperty(dayData, function(k,v) {
      dayDatas.push(v);
    });
    dayDatas.sort(function(a, b) {
      return b.count - a.count;
    });

    // process
    dayDatas.forEach(function(data) {
      data.weekCount = (weekCounts[data.hash] || 0);
      data.numTrackers = keys(data.trackers).length;
    });

    // gen HTML
    function num(n) { return SPAN({className:'num'}, n); }

    var b = DIV();

    b.push(STYLE(html(".trace { height: 300px; overflow: auto; background: #eee; margin-left: 1em; font-family: monospace; border: 1px solid #833; padding: 4px; }\n"+
                              ".exc { margin: 1em 0; }\n"+
                              ".num { font-size: 150%; }")));

    b.push(P("Total exceptions in past day: ", num(totalDayCount),
                     ", past week: ", totalWeekCount));

    b.push(P(SMALL(EM("Data on this page is live."))));

    b.push(H2("Exceptions grouped by stack trace:"));

    dayDatas.forEach(function(data) {
      b.push(DIV({className:'exc'},
                         'Past day: ',num(data.count),', Past week: ',
                         data.weekCount,', Different tracker cookies today: ',
                         data.numTrackers,
                         '\n', data.message.message || '-none-', '\n',
                         DIV({className:'trace'}, data.message)));
    });

    renderHtml("admin/dynamic.ejs",
     {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Exceptions',
      content: b
     });
  });
}
