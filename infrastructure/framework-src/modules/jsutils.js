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
 * @fileOverview A collection of core JavaScript utilities.
 */

import("static.js.dateutils");

// has to be dynamically resolved or will fail
var toISOString = function(d) {return dateutils.toISOString(d)};

/**
 * Iterator convenience for JavaScript Objects.
 *
 * Note that if func returns false, the iteration will be immediately terminated.
 * (Returning undefined, or not specifying a return type, does not terminate the iteration).
 *
 * @example
var pastels = {
  red: "#fcc",
  green: "#cfc",
  blue: "#ccf"
};
eachProperty(pastels, function(key, value) {
  print(DIV({style: 'background: '+value+';'}, key));
});
 *
 * @param {object} obj The object over which to iterate.
 * @param {function} func The function to run on each [key,value] pair.
 */
function eachProperty(obj, func) {
  var r;
  for (var k in obj) {
    if (!obj.hasOwnProperty || obj.hasOwnProperty(k)) {
      r = func(k,obj[k]);
      if (r === false) {
        break;
      }
    }
  }
}

/**
 * Add items in source to destination
 */
function extend (destination, source) {
    for (var property in source) {
        if (!source.hasOwnProperty || source.hasOwnProperty(property)) {
            destination[property] = source[property];
        }
    }
    return destination;
};

/**
 * Douglas Crockford's "object" function for prototypal inheritance, taken from
 * http://javascript.crockford.com/prototypal.html
 *
 * @param {object} parent The parent object.
 * @return {object} A new object whose prototype is parent.
 */
function object(parent) {
  function f() {};
  f.prototype = parent;
  return new f();
}

/**
 * Creates an array of the properties of <code>obj</code>,
 * <em>not</em> including built-in or inherited properties.  If no
 * argument is given, applies to the global object.
 *
 * @example
// Prints "abc"
keys({a: 1, b: 2, c: 3}).forEach(function(k) {
  print(k);
}
 *
 * @example
// Prints all the functions and object members of the global "appjet" object,
// one per line.
print(keys(appjet).join('\n'));
 *
 * @param {object} obj
 */
function keys(obj) {
  var array = [];
  var o = obj;
  if (o == undefined) {
    o = this;
  }
  for(var k in o) {
    if (!obj.hasOwnProperty || o.hasOwnProperty(k)) {
      array.push(k);
    }
  }
  return array;
}

/**
 * Creates an array of the values of properties of <code>obj</code>,
 * <em>not</em> including built-in or inherited properties.  If no
 * argument is given, applies to the global object.
 *
 * @example
// Prints "123"
values({a: 1, b: 2, c: 3}).forEach(function(k) {
  print(k);
}
 *
 * @param {object} obj
 */
function values(obj) {
  var array = [];
  var o = obj;
  if (o == undefined) {
    o = this;
  }
  for(var k in o) {
    if (!obj.hasOwnProperty || o.hasOwnProperty(k)) {
      array.push(o[k]);
    }
  }
  return array;
}


/**
 * Comparator that returns -1, +1, or 0 depending on whether a &lt; b, or a &gt; b, or
 * neither, respectively.
 * @param {object} a
 * @param {object} b
 * @return {number} -1, 0, or +1
 */
function cmp(a,b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function arrayToSet(arr) {
  var set = {};
  arr.forEach(function(x) {
    set[x] = true;
  });
  return set;
}

function mergeArrays(mergeFunction, a1, a2, etc) {
  var len = a1.length;
  var arrays = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < arrays.length; ++i) {
    if (arrays[i].length != len) {
      return;
    }
  }
  var out = [];
  for (var i = 0; i < a1.length; ++i) {
    out.push(mergeFunction.apply(this, arrays.map(function(array) { return array[i]; })));
  }
  return out;
}

function uniqueNumbers(array) {
  var uniqHash = {};
  for (var element in array) {
    uniqHash[array[element]] = 1;
  }
  var response = [];
  for (var element in uniqHash) {
    response.push(Number(element));
  }
  return response;
}

function uniqueStrings(array) {
  var uniqHash = {};
  for (var element in array) {
    uniqHash[array[element]] = 1;
  }
  var response = [];
  for (var element in uniqHash) {
    response.push(element);
  }
  return response;
}


function uniqueBy(array, key) {
  var uniqHash = {};
  for (var element in array) {
    uniqHash[array[element][key]] = array[element];
  }
  var response = [];
  for (var value in uniqHash) {
    response.push(uniqHash[value]);
  }
  return response;
}

function _dateNum(d) {
  if (!d) {
    return 0;
  }
  return -1 * (+d);
}

function sortBy(array, key, ignoreCase, cmpFn) {
  var cmpFn = cmpFn || cmp;
  return array.sort(function(a,b) {
    if (a[key] instanceof Date || b[key] instanceof Date) {
      return cmpFn(_dateNum(a[key]), _dateNum(b[key]));
    }
    if (ignoreCase) {
      // assumes we're comparing strings
      return cmpFn(a[key].toLowerCase(), b[key].toLowerCase());
    } else {
      return cmpFn(a[key], b[key]);
    }
  });
}

function reverseSortBy(array, key, ignoreCase) {
  var flipCompare = function(a, b) { return cmp(b, a);};
  sortBy(array, key, ignoreCase, flipCompare);
}

function dictByProperty(array, propertyName) {
  var dict = {}
  array.forEach(function(item) {
    dict[item[propertyName]] = item;
  });
  return dict;
}


function debug(obj) {
  if (typeof(obj) == 'object') {
    var ret = [];
    if (obj) {
      eachProperty(obj, function(k, v) {
        ret.push(k+" -> "+debug(v));
      });
      return '['+ret.join(", ")+']';
    } else {
      return String(obj);
    }
  } else {
    return String(obj);
  }
}

/**
 * Create a scala function out of the given JS function.
 */
function scalaFn(nargs, f) {
  if (typeof(f) == 'function') {
    return new Packages.scala['Function'+nargs]({
      apply: f
    });
  } else {
    return new Packages.scala['Function'+nargs]({
      apply: function() { return f; }
    })
  }
}

function scalaF0(f) {
  return scalaFn(0, f);
}

function scalaF1(f) {
  return scalaFn(1, f);
}

/**
 * Some bonus functions for functional programming.
 */
function f_curry(thisPtr, f, arg1, arg2, etc) {
  var curriedArgs = Array.prototype.slice.call(arguments, 2);
  return function() {
    var args = Array.prototype.slice.call(arguments, 0);
    return f.apply(thisPtr, curriedArgs.concat(args));
  }
}

function f_limitArgs(thisPtr, f, n) {
  return function() {
    var args = Array.prototype.slice.call(arguments, 0, n);
    return f.apply(thisPtr, args);
  }
}




function parseDate (date) {
  var timestamp, struct, minutesOffset = 0;
  var numericKeys = [ 1, 4, 5, 6, 7, 10, 11 ];
  // ES5 §15.9.4.2 states that the string should attempt to be parsed as a Date Time String Format string
  // before falling back to any implementation-specific date parsing, so that’s what we do, even if native
  // implementations could be faster
  //              1 YYYY                2 MM       3 DD           4 HH    5 mm       6 ss        7 msec        8 Z 9 ±    10 tzHH    11 tzmm
  if ((struct = /^(\d{4}|[+\-]\d{6})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(?:(Z)|([+\-])(\d{2})(?::(\d{2}))?)?)?$/.exec(date))) {
      // avoid NaN timestamps caused by “undefined” values being passed to Date.UTC
      for (var i = 0, k; (k = numericKeys[i]); ++i) {
          struct[k] = +struct[k] || 0;
      }

      // allow undefined days and months
      struct[2] = (+struct[2] || 1) - 1;
      struct[3] = +struct[3] || 1;

      if (struct[8] !== 'Z' && struct[9] !== undefined) {
          minutesOffset = struct[10] * 60 + struct[11];

          if (struct[9] === '+') {
              minutesOffset = 0 - minutesOffset;
          }
      }

      timestamp = Date.UTC(struct[1], struct[2], struct[3], struct[4], struct[5] + minutesOffset, struct[6], struct[7]);
  }
  else {
      timestamp = Date.parse ? Date.parse(date) : NaN;
  }

  return timestamp;
}

function isFiniteNumber(n) {
  if (typeof n == "number") {
    if (isNaN(n)
    || (n == Number.POSITIVE_INFINITY)
    || (n == Number.NEGATIVE_INFINITY)) {
      return false;
    }
    return true;
  }
  return false;
}

function range(from,to) {
  return Array.apply(null, new Array(to - from)).map(function(x,y){return y+from});
}
