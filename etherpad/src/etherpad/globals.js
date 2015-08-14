/**
 * Copyright 2009 Google Inc.
 * Copyright 2010 Pita, Peter Martischka <petermartischka@googlemail.com>
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

//----------------------------------------------------------------
// global variables
//----------------------------------------------------------------

var COMETPATH = "/comet";

//var OLD_COLOR_PALETTE = ['#ffc7c7','#fff1c7','#e3ffc7','#c7ffd5','#c7ffff','#c7d5ff','#e3c7ff','#ffc7f1','#ff8f8f','#ffe38f','#c7ff8f','#8fffab','#8fffff','#8fabff','#c78fff','#ff8fe3','#d97979','#d9c179','#a9d979','#79d991','#79d9d9','#7991d9','#a979d9','#d979c1','#d9a9a9','#d9cda9','#c1d9a9','#a9d9b5','#a9d9d9','#a9b5d9','#c1a9d9','#d9a9cd'];
var COLOR_PALETTE = ['#2996c3', '#c66c78', '#53af98', '#daa458', '#8a6fb1', '#d98175', '#87b747', '#c98e6a', '#5888b7', '#c6759f', '#b5b251', '#50bad3'];

function getPalette() {
  return COLOR_PALETTE;
}

var trueRegex = /\s*true\s*/i;

function isProduction() {
  return (trueRegex.test(appjet.config['etherpad.isProduction']));
}

function isProAccountEnabled() {
  return (appjet.config['etherpad.proAccounts'] == "true");
}

function isDogfood(optTeamOnly) {
  if (!request.isDefined) {
    return false;
  }

  var allowHosts = {'testing.example.com':1};
  return !isProduction() || request.host in allowHosts;
}

function domainEnabled(domain) {
  var enabled = appjet.config.topdomains.split(',');
  for (var i = 0; i < enabled.length; i++)
    if (domain == enabled[i])
      return true;
  return false;
}

import("fastJSON");

function alert(msg) {
  if (!isProduction()) {
    if (typeof msg == "object") {
      msg = fastJSON.stringify(msg);
    }

    var script = ["/usr/bin/osascript", "-e", 'tell app \"Google Chrome\" to display dialog \"' + String(msg).replace(/\"/g, '\\"') +'\"'];
    java.lang.Runtime.getRuntime().exec(script).waitFor();
  }
}

var PNE_RELEASE_VERSION = "1.1.3";
var PNE_RELEASE_DATE = "June 15, 2009";

var PRO_FREE_ACCOUNTS = 5;


