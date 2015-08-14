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

function noon(date) {
  return new Date(date.toString().split(' ').slice(0, 4).join(' ') + " 12:00");
}

function nextMonth(date) {
  var newDate = new Date(date.getTime());
  var newMonth = date.getMonth() + 1;
  var newYear = date.getFullYear();
  while (newMonth >= 12) {
    newYear += 1;
    newMonth -= 12;
  }
  newDate.setMonth(newMonth);
  newDate.setFullYear(newYear);
  return newDate;
}

var months = 
  ["January", "February", "March", "April", "May", "June", 
   "July", "August", "September", "October", "November", "December"];

var shortMonths = months.map(function(mon) { return mon.substr(0, 3); });

var days = 
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
var shortDays = days.map(function(day) { return day.substr(0, 3); });

function dateFormat(date, format) {
  var formatter = new Packages.java.text.SimpleDateFormat(format);
  return String(formatter.format(date).toString());
}

function dateParse(dateString, format) {
  var formatter = new Packages.java.text.SimpleDateFormat(format);
  return new Date(formatter.parse(dateString).getTime());
}

function addSecondsToDate(date, numSeconds) {
  return new Date(date.valueOf() + (numSeconds * 1000));
}