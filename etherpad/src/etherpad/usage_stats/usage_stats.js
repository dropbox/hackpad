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
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");
import("jsutils.*");
import("fastJSON");

import("etherpad.log");
import("etherpad.log.frontendLogFileName");
import("etherpad.statistics.statistics");
import("fileutils.eachFileLine");

jimport("java.lang.System.out.println");
jimport("java.io.BufferedReader");
jimport("java.io.FileReader");
jimport("java.io.File");
jimport("java.awt.Color");

jimport("org.jfree.chart.ChartFactory");
jimport("org.jfree.chart.ChartUtilities");
jimport("org.jfree.chart.JFreeChart");
jimport("org.jfree.chart.axis.DateAxis");
jimport("org.jfree.chart.axis.NumberAxis");
jimport("org.jfree.chart.plot.XYPlot");
jimport("org.jfree.chart.renderer.xy.XYLineAndShapeRenderer");
jimport("org.jfree.data.time.Day");
jimport("org.jfree.data.time.TimeSeries");
jimport("org.jfree.data.time.TimeSeriesCollection");

//----------------------------------------------------------------
// Database reading/writing
//----------------------------------------------------------------


function _listStats(statName) {
  return sqlobj.selectMulti('statistics', {name: statName}, {orderBy: '-timestamp'});
}

// public accessor
function getStatData(statName) {
  return _listStats(statName);
}

//----------------------------------------------------------------
// HTML & Graph generating
//----------------------------------------------------------------

function respondWithGraph(statName) {
  var width = 500;
  var height = 300;
  if (request.params.size) {
    var parts = request.params.size.split('x');
    width = +parts[0];
    height = +parts[1];
  }

  var dataset = new TimeSeriesCollection();
  var hideLegend = true;

  switch (statistics.getStatData(statName).plotType) {
    case 'line':
      var ts = new TimeSeries(statName);

      _listStats(statName).forEach(function(stat) {
        var day = new Day(new java.util.Date(stat.timestamp * 1000));
        ts.addOrUpdate(day, fastJSON.parse(stat.value).value);
      });
      dataset.addSeries(ts);
      break;
    case 'topValues':
      hideLegend = false;
      var stats = _listStats(statName);
      if (stats.length == 0) break;
      var latestStat = fastJSON.parse(stats[0].value);
      var valuesToWatch = [];
      var series = {};
      var nLines = 5;
      function forEachFirstN(n, stat, f) {
        for (var i = 0; i < Math.min(n, stat.topValues.length); i++) {
          f(stat.topValues[i].value, stat.topValues[i].count);
        }
      }
      forEachFirstN(nLines, latestStat, function(value, count) {
        valuesToWatch.push(value);
        series[value] = new TimeSeries(value);
      });
      stats.forEach(function(stat) {
        var day = new Day(new java.util.Date(stat.timestamp*1000));
        var statData = fastJSON.parse(stat.value);
        valuesToWatch.forEach(function(value) { series[value].addOrUpdate(day, 0); })
        forEachFirstN(nLines, statData, function(value, count) {
          if (series[value]) {
            series[value].addOrUpdate(day, count);
          }
        });
      });
      valuesToWatch.forEach(function(value) {
        dataset.addSeries(series[value]);
      });
      break;
    case 'histogram':
      hideLegend = false;
      var stats = _listStats(statName);
      percentagesToGraph = ["50", "90", "100"];
      series = {};
      percentagesToGraph.forEach(function(pct) {
        series[pct] = new TimeSeries(pct+"%");
        dataset.addSeries(series[pct]);
      });
      if (stats.length == 0) break;
      stats.forEach(function(stat) {
        var day = new Day(new java.util.Date(stat.timestamp*1000));
        var statData = fastJSON.parse(stat.value);
        eachProperty(series, function(pct, timeseries) {
          timeseries.addOrUpdate(day, statData[pct] || 0);
        });
      });
      break;
  }

  var domainAxis = new DateAxis("");
  var rangeAxis = new NumberAxis();
  var renderer = new XYLineAndShapeRenderer();

  var numSeries = dataset.getSeriesCount();
  var colors = [Color.blue, Color.red, Color.green, Color.orange, Color.pink, Color.magenta];
  for (var i = 0; i < numSeries; ++i) {
    renderer.setSeriesPaint(i, colors[i]);
    renderer.setSeriesShapesVisible(i, false);
  }
  
  var plot = new XYPlot(dataset, domainAxis, rangeAxis, renderer);

  var chart = new JFreeChart(plot);
  chart.setTitle(statName);
  if (hideLegend) {
    chart.removeLegend();    
  }
  
  var jos = new java.io.ByteArrayOutputStream();
  ChartUtilities.writeChartAsJPEG(
    jos, 1.0, chart, width, height);
  
  response.setContentType('image/jpeg');
  response.writeBytes(jos.toByteArray());
}

