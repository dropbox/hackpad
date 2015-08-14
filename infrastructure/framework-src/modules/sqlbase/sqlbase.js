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

import("jsutils.*");
import("sqlbase.sqlcommon");
import("fastJSON");
import("timer");

jimport("java.lang.System.out.println");

function _sqlbase() {
  return sqlcommon.getSqlBase();
}

/**
 * Creates a SQL table suitable for storing a mapping from String to JSON value.
 * Maximum key length is 128 characters. Has no effect if the table already exists.
 */
function createJSONTable(tableName) {
  _sqlbase().createJSONTable(String(tableName));
}

/**
 * Retrieves a JavaScript object or value from a table.  Returns undefined
 * if there is no mapping for the given string key.  Requires that the table
 * exist.
 */
function getJSON(tableName, stringKey) {
  var result = _sqlbase().getJSON(String(tableName), String(stringKey));
  if (result) {

    return fastJSON.parse(String(result))['x'];
    
    /* performance-testing JSON
    var obj1 = timer.time("JSON.parse (json2)", function() {
      return JSON.parse(String(result))['x'];
    });
    var obj2 = timer.time("JSON.parse (fastJSON)", function() {
      return fastJSON.parse(String(result))['x'];
    });
    return obj2;
    */
  }
  return undefined;
}

function getAllJSON(tableName, start, count) {
  var result = _sqlbase().getAllJSON(String(tableName), Number(start), Number(count));
  return Array.prototype.map.call(result, function(x) {
    return {id: x.id(), value: fastJSON.parse(String(x.value()))['x']};
  })
}

function getAllJSONKeys(tableName) {
  var result = _sqlbase().getAllJSONKeys(String(tableName));
  return Array.prototype.map.call(result, function(x) { return String(x); });
}

/**
 * Assigns a JavaScript object or primitive value to a string key in a table.
 * Maximum key length is 128 characters. Requires that the table exist.
 */
function putJSON(tableName, stringKey, objectOrValue) {
  var obj = ({x:objectOrValue});
  
  var json = fastJSON.stringify(obj);

  /* performance-testing JSON

  var json1 = timer.time("JSON.stringify (json2)", function() { 
    return JSON.stringify(obj);
  });
  var json2 = timer.time("JSON.stringify (fastJSON)", function() {
    return fastJSON.stringify(obj);
  });

  if (json1 != json2) {
    println("json strings do not match!");
    println("\n\n");
    println(json1);
    println("\n");
    println(json2);
    println("\n\n");
  }*/

  _sqlbase().putJSON(String(tableName), String(stringKey), json);
}

/**
 * Removes the mapping for a string key from a table.  Requires that the table
 * exist.
 */
function deleteJSON(tableName, stringKey) {
  _sqlbase().deleteJSON(String(tableName), String(stringKey));
}

/**
 * Creates a SQL table suitable for storing a mapping from (key,n) to string.
 * The mapping may be sparse, but storage is most efficient when n are consecutive.
 * The "length" of the array is not stored and must be externally maintained.
 * Maximum key length is 128 characters.  This call has no effect if the table
 * already exists.
 */
function createStringArrayTable(tableName) {
  _sqlbase().createStringArrayTable(String(tableName));
}

/**
 * Assigns a string value to a (key,n) pair in a StringArray table.  Maximum key length
 * is 128 characters.  Requires that the table exist.
 */
function putStringArrayElement(tableName, stringKey, n, value) {
  _sqlbase().putStringArrayElement(String(tableName), String(stringKey),
				Number(n), String(value));
}

/**
 * Equivalent to a series of consecutive puts of the elements of valueArray, with the first
 * one going to n=startN, the second to n=startN+1, and so on, but much more efficient.
 */
function putConsecutiveStringArrayElements(tableName, stringKey, startN, valueArray) {
  var putter = _sqlbase().putMultipleStringArrayElements(String(tableName), String(stringKey));
  for(var i=0;i<valueArray.length;i++) {
    putter.put(Number(startN)+i, String(valueArray[i]));
  }
  putter.finish();
}

/**
 * Equivalent to a series of puts of the (key,value) entries of the JavaScript object
 * nToValue, using as few database operations as possible.
 */
function putDictStringArrayElements(tableName, stringKey, nToValue) {
  var nArray = [];
  for(var n in nToValue) {
    nArray.push(n);
  }
  nArray.sort(function(a,b) { return Number(a) - Number(b); });
  
  var putter = _sqlbase().putMultipleStringArrayElements(String(tableName), String(stringKey));
  nArray.forEach(function(n) {
    putter.put(Number(n), String(nToValue[n]));
  });
  putter.finish();
}

/**
 * Retrieves a string value from a StringArray table.  Returns undefined
 * if there is no mapping for the given (key,n) pair.  Requires that the table
 * exist.
 */
function getStringArrayElement(tableName, stringKey, n) {
  var result = _sqlbase().getStringArrayElement(String(tableName),
    String(stringKey), Number(n));
  if (result) {
    return String(result);
  }
  return undefined;
}

/**
 * Retrieves all values from the database page that contains the mapping for n.
 * Properties are added to destMap for n, if present in the database, and any other
 * numeric entries in the same page.  No return value.
 */
function getPageStringArrayElements(tableName, stringKey, n, destMap) {
  var array = _sqlbase().getPageStringArrayElements(String(tableName), String(stringKey), n);
  for(var i=0;i<array.length;i++) {
    var entry = array[i];
    destMap[entry.index()] = String(entry.value());
  }
}

/**
 * Removes the mapping for a (key,n) pair from a StringArray table.  Requires that the table
 * exist.
 */
function deleteStringArrayElement(tableName, stringKey, n) {
  _sqlbase().putStringArrayElement(String(tableName), String(stringKey), Number(n), null);
}

/**
 * Removes all mappings and metadata associated with a given key in a table.
 */
function clearStringArray(tableName, stringKey) {
  _sqlbase().clearStringArray(String(tableName), stringKey);
}

function getStringArrayAllKeys(tableName) {
  var result = _sqlbase().getStringArrayAllKeys(String(tableName));
  return Array.prototype.map.call(result, function(x) { return String(x); });
}
