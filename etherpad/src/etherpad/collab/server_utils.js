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

import("comet");
import("ejs");
import("etherpad.log");
import("etherpad.pad.activepads");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padevents");
import("etherpad.pro.pro_padmeta");
import("fastJSON");
import("fileutils.readFile");
import("jsutils.eachProperty");

jimport("java.util.Random");
jimport("java.lang.System");

import("etherpad.collab.collab_server");
// importClass(java.util.Random);
// importClass(java.lang.System);

var _serverDebug = function() {};
var _dmesg = function() { System.out.println(arguments[0]+""); };

/// Begin readonly/padId conversion code
/// TODO: refactor into new file?
var _baseRandomNumber = 0x123123; // keep this number seekrit

function _map(array, func) {
  for(var i=0; i<array.length; i++) {
    array[i] = func(array[i]);
  }
  return array;
}

function parseUrlId(readOnlyIdOrLocalPadId) {
  var localPadId;
  var viewId;
  var isReadOnly;
  var roPadId;
  var globalPadId;
  if(isReadOnlyId(readOnlyIdOrLocalPadId)) {
    isReadOnly = true;
    globalPadId = readonlyToPadId(readOnlyIdOrLocalPadId);
    localPadId = padutils.globalToLocalId(globalPadId);
    var globalPadIdCheck = padutils.getGlobalPadId(localPadId);
    if (globalPadId != globalPadIdCheck) {
      // domain doesn't match
      response.forbid();
    }
    roPadId = readOnlyIdOrLocalPadId;
    viewId = roPadId;
  }
  else {
    isReadOnly = false;
    localPadId = readOnlyIdOrLocalPadId;
    globalPadId = padutils.getGlobalPadId(localPadId);
    viewId = globalPadId;
    roPadId = padIdToReadonly(globalPadId);
  }

  return {localPadId:localPadId, viewId:viewId, isReadOnly:isReadOnly,
          roPadId:roPadId, globalPadId:globalPadId};
}

function isReadOnlyId(str) {
  return str.indexOf("ro.") == 0;
}

/*
  for now, we just make it 'hard to guess'
  TODO: make it impossible to find read/write page through hash
*/
function readonlyToPadId (readOnlyHash) {

  // readOnly hashes must start with 'ro-'
  if(!isReadOnlyId(readOnlyHash)) return null;
  else {
    readOnlyHash = readOnlyHash.substring(3, readOnlyHash.length);
  }

  // convert string to series of numbers between 1 and 64
  var result = _strToArray(readOnlyHash);

  var sum = result.pop();
  // using a secret seed to util.random, transform each number using + and %
  var seed = _baseRandomNumber + sum;
  var rand = new Random(seed);

  _map(result, function(elem) {
    return ((64 + elem - rand.nextInt(64)) % 64);
  });

  // convert array of numbers back to a string
  return _arrayToStr(result);
}

/*
 Temporary code. see comment at readonlyToPadId.
*/
function padIdToReadonly (padid) {
  var result = _strToArray(padid);
  var sum = 0;

  if(padid.length > 1) {
    for(var i=0; i<result.length; i++) {
      sum = (sum + result[i] + 1) % 64;
    }
  } else {
    sum = 64;
  }

  var seed = _baseRandomNumber + sum;
  var rand = new Random(seed);

  _map(result, function(elem) {
    var randnum = rand.nextInt(64);
    return ((elem + randnum) % 64);
  });

  result.push(sum);
  return "ro." + _arrayToStr(result);
}

// little reversable string encoding function
// 0-9 are the numbers 0-9
// 10-35 are the uppercase letters A-Z
// 36-61 are the lowercase letters a-z
// 62 are all other characters
function _strToArray(str) {
  var result = new Array(str.length);
  for(var i=0; i<str.length; i++) {
    result[i] = str.charCodeAt(i);

    if (_between(result[i], '0'.charCodeAt(0), '9'.charCodeAt(0))) {
      result[i] -= '0'.charCodeAt(0);
    }
    else if(_between(result[i], 'A'.charCodeAt(0), 'Z'.charCodeAt(0))) {
      result[i] -= 'A'.charCodeAt(0); // A becomes 0
      result[i] += 10;                // A becomes 10
    }
    else if(_between(result[i], 'a'.charCodeAt(0), 'z'.charCodeAt(0))) {
      result[i] -= 'a'.charCodeAt(0); // a becomes 0
      result[i] += 36;                // a becomes 36
    } else if(result[i] == '$'.charCodeAt(0)) {
      result[i] = 62;
    } else {
      result[i] = 63; // if not alphanumeric or $, we default to 63
    }
  }
  return result;
}

function _arrayToStr(array) {
  var result = "";
  for(var i=0; i<array.length; i++) {
    if(_between(array[i], 0, 9)) {
      result += String.fromCharCode(array[i] + '0'.charCodeAt(0));
    }
    else if(_between(array[i], 10, 35)) {
      result += String.fromCharCode(array[i] - 10 + 'A'.charCodeAt(0));
    }
    else if(_between(array[i], 36, 61)) {
      result += String.fromCharCode(array[i] - 36 + 'a'.charCodeAt(0));
    }
    else if(array[i] == 62) {
      result += "$";
    } else {
      result += "-";
    }
  }
  return result;
}

function _between(charcode, start, end) {
  return charcode >= start && charcode <= end;
}

/* a short little testing function, converts back and forth */
// function _testEncrypt(str) {
//   var encrypted = padIdToReadonly(str);
//   var decrypted = readonlyToPadId(encrypted);
//   _dmesg(str + " " + encrypted + " " + decrypted);
//   if(decrypted != str) {
//     _dmesg("ERROR: " + str + " and " + decrypted + " do not match");
//   }
// }

// _testEncrypt("testing$");
