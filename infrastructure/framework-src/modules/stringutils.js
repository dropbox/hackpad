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
 * @fileOverview A collection of various string utilities.
 */

// TODO: uncomment with import works with *

import("funhtml.{TABLE,TR,TH,TD,OL,LI}");
import("jsutils.{object,eachProperty}");

//import("funhtml.*");
jimport("net.sf.json.JSONNull");
jimport("java.util.Random");
jimport("java.security.SecureRandom");
jimport("java.lang.System.currentTimeMillis");
jimport("java.lang.Thread");

/**
 * Removes leading and trailing whitespace from a string.
 * @param {string} str
 * @return {string} The trimmed string.
 */
function trim(str) {
  return str.replace(/^\s+|\s+$/g, "");
}

// Quotes special characters in regular expressions
function quoteRegularExpression(str) {
    return (str+'').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
}

//----------------------------------------------------------------
// String prototype enhancements.
// TODO: should we move this to a new library "enhancedstring"?
//----------------------------------------------------------------
startsWith = function(s, prefix) {
  return (s.indexOf(prefix) == 0);
};
endsWith = function(s, suffix) {
  return (s.substr(s.length - suffix.length) == suffix);
};
contains = function(s, x) {
  return (s.indexOf(x) != -1);
};
makeTitle = function(s) {
  if (! s) return;
  return s.split(" ").map(function(x) {
      return x[0].toUpperCase() + x.substr(1)
    }).join(" ");
}
repeat = function(s, n) {
  var out = [];
  while (n-- > 0) {
    out.push(s);
  }
  return out.join('');
}

/*
 * Helper function that converts a raw string to an HTML string, with
 * character entities replaced by appropriate HTML codes, and newlines
 * rentered as BRs.
 *
 * <p>A more general version of this function is toHTML(), which can operate
 * on not just strings, but any object.
 *
 * @param {string} str the raw string
 * @return {string} HTML-formatted string
 */
function _stringToHTML(str) {
  return String(net.appjet.oui.Util.stringToHTML(str));
}

// used to convert an object to HTML when the object does not have a
// toHTML method.
//
function _coerceObjectToHTML(obj) {
  var t = TABLE({border: 1, cellpadding: 2, cellspacing: 0});
  eachProperty(obj, function(name, value) {
    t.push(TR(TH(String(name)), TD(String(value))));
  });
  return toHTML(t);
}

// Converts an array to an HTML list by listing its properties and
// recursively converting the values to HTML by calling toHTML() on
// each of them.
function _objectToOL(obj) {
  var l = OL();
  eachProperty(obj, function(name, value) {
      l.push(LI({value: name}, value));
    });
  return l;
}

function _sameProperties(obj1, obj2) {
  if (typeof(obj1) != 'object' || typeof(obj2) != 'object')
    return typeof(obj1) == typeof(obj2);

  var mismatch = 0;
  eachProperty(obj1, function(name) {
    if (! obj2.hasOwnProperty(name)) {
      mismatch++;
    }});
  eachProperty(obj2, function(name) {
    if (! obj1.hasOwnProperty(name)) {
      mismatch++;
    }});
  return mismatch < 2;
}

//
// for pretty-printing arrays.  needs a lot of work.
//
function _arrayToHTML(a) {
  if (a.length === 0) {
    return "";
  }
  if (typeof(a[0]) != 'object') {
    return toHTML(_objectToOL(a));
  } else if (! _sameProperties(a[0], a[1])) {
    return toHTML(_objectToOL(a));
  } else {
    return _likeObjectsToHTML(function (f) {
	a.forEach(function(value, i) {
	    f({index: i}, value, {});
	  });}, null);
  }
}

/** @ignore */

// a foreaching function that takes three arguments: properties to put first,
// properties to put in the middle, and properties to put at the end.
// and a table header (with large colspan)
function _likeObjectsToHTML(forEachFunction, tophead) {
  objs = [];
  prepnames = [];
  objpnames = [];
  postpnames = [];
  rows = [];

  var t = TABLE({border: 1, cellpadding: 2, cellspacing: 0});
  var head = TR();
  if (tophead)
    t.push(tophead);
  t.push(head);

  var butWaitTheresMore = false;
  var howManyMore = 0;

  forEachFunction(function(pre, o, post) {
    if (objs.length >= 10) {
      butWaitTheresMore = true;
      howManyMore++;
      return;
    }
    objs.push({pre: pre, o: o, post: post});
    var tr = TR();
    rows.push(tr);
    t.push(tr);

    eachProperty(pre, function(name) { prepnames.push(name); });
    eachProperty(o, function(name) { objpnames.push(name); });
    eachProperty(post, function(name) { postpnames.push(name); });
  });
  var numpnames = 0;
  var appendTDsForPropName = function (where) {
    return function(name) {
      numpnames++;
      head.push(TH(name));
      for (var j = 0; j < objs.length; ++j) {
	if (! (objs[j][where] === undefined) && ! (objs[j][where][name] === undefined))
	  rows[j].push(TD(String(objs[j][where][name])));
	else
	  rows[j].push(TD());
      }
    };
  };
  prepnames.forEach(appendTDsForPropName("pre"));
  objpnames.forEach(appendTDsForPropName("o"));
  postpnames.forEach(appendTDsForPropName("post"));
  if (butWaitTheresMore) {
    t.push(TR(TD({colspan: numpnames}, "..."+howManyMore+
		 " additional element"+(howManyMore == 1 ? "" : "s")+" omitted...")));
  }
  return toHTML(t);
}

/**
 * Returns a string with any number of variables substituted in, as
 * popularized by C's function of the same name.  Some common substitutions:
 *
 * <ul><li>%d - an integer</li><li>%f - a floating-point number</li><li>%b - a boolean</li>
 * <li>%s - a string</li></ul>
 *
 * <p>Each time one of these "slot" appears in your format string, the next argument is displayed
 * according to the type of slot you specified.
 *
 * <p>AppJet supports <a href="http://java.sun.com/j2se/1.5.0/docs/api/java/util/Formatter.html">
 * Java's specification of printf</a>, which has a ton of features, including selecting
 * arguments out of order, formatting dates and times, and specifying how many characters
 * wide each slot should be.
 *
 * @example
var x = 5;
response.write(sprintf("an integer: %d", x));
response.write(sprintf("Two strings: [%s] and [%s].", "string one", "string two"));
 *
 * @param {string} formatString
 * @param {*} arg1
 * @param {*} arg2
 * @param {*} arg3 ...
 */
function sprintf(formatString, arg1, arg2, etc) {
  if (typeof(formatString) != 'string') {
    throw new Error('printf takes a string as the first argument.');
  }
  var argList = java.lang.reflect.Array.newInstance(java.lang.Object, arguments.length-1);
  for (var i = 1; i < arguments.length; i++) {
    if (arguments[i] instanceof Date)
      argList[i-1] = arguments[i].getTime();
    else
      argList[i-1] = arguments[i];
  }
  return String(net.appjet.ajstdlib.printf.printf(formatString, argList));
};

/**
 * Replaces keys of data found in string with their corresponding values.
 *
 * <p>(Inspired by http://javascript.crockford.com/remedial.html)
 *
 * @example
var data = {name: "Aaron", age: 25, today: new Date()};
print(supplant(data, """

{name}'s age is {age} years, as of {today}.

"""));

 * @param {object} data dictionary of values
 * @param {string} str
 * @return {string} str with keys of data replaced by their values
 */
function supplant(data, str) {
  var s = str;
  var o = data;
  function rep(a, b) {
    var r = o[b];
    if (typeof(r) != 'undefined') {
      return r;
    } else {
      return a;
    }
  }
  return s.replace(/{([^{}]*)}/g, rep);
};

//----------------------------------------------------------------
// raw printing
//----------------------------------------------------------------
var _raw_prototype;

/**
 * Used for printing un-escaped HTML, such as your own HTML tags.
 *
 * <p>Normally, printing a string will cause it to be translated
 * so that it appears the same on the screen as it did in your code.
 * If you're writing your own HTML, you don't want it to be processed
 * this way. Wrapping a string in html(...) by-passes normal printing behavior,
 * so that print(html(" -- html goes here ---")) will write the HTML
 * directly to the page.
 *
 * <p>If you want to mix your own HTML code with HTML code generated from a
 * tag object, you can get the HTML for the tag by calling its toHTML(...) method.
 *
 * <p>Multiple arguments to html(...) will be concatenated into one string.
 *
 * @example
print(html("""
&lt;br /&gt;
&lt;br /&gt;
&lt;div&gt;&lt;p&gt;Here is some text inside a P inside a DIV.&lt;/p&gt;
&lt;/div&gt;
&lt;br /&gt;
"""));
 *
 * @param {string} text the raw text
 * @return {object} an object which, when printed, prints the raw html text
 */
function html(text) {
  if (!_raw_prototype) {
    _raw_prototype = object(Object.prototype);
    _raw_prototype.toString = function() { return this._text; };
    _raw_prototype.toHTML = function() { return this._text; };
  }
  var rawObj = object(_raw_prototype);
  rawObj._text = Array.prototype.map.call(arguments, String).join('');
  return rawObj;
}

/**
 * This function is used by print(...) to convert a string or object
 * into nice-looking printable HTML.  It may be useful in conjunction
 * with html(...) if you wish to work directly with HTML.
 *
 * <p>You can control how toHTML(...) (and therefore print(...)) behave on an object
 * by giving that object a .toHTML() function.
 *
 * @param {*} x any javascript variable
 * @return {string} html-formatted string
 */
function toHTML(x) {
  if (net.sf.json.JSONNull.getInstance().equals(x)) {
    return 'null';
  }
  if (typeof(x) == 'undefined') {
    return 'undefined';
  }
  if (x === null) {
    return 'null';
  }
  if (typeof x == "string" || (x instanceof java.lang.String)) {
    return _stringToHTML(x);
  }
  if (typeof(x.toHTML) == "function") {
    return x.toHTML();
  }
  if (typeof(x) == "xml") {
    return _stringToHTML(x.toSource());
  }
  if (x instanceof Array) {
    return _arrayToHTML(x);
  }
  if (x instanceof Date) {
    var pieces = x.toString().split(" ");
    return pieces.slice(0, 5).join(' ') + ' ' + pieces[6];
  }
  if (typeof(x) == "object") {
    return _coerceObjectToHTML(x);
  }
  // TODO: add more types to auto-printing, such as functions,
  // numbers, what else?
  return _stringToHTML(""+x);
}


/**
 * Generates a random string of specified length using upper-case letters, lower-case letters, and numbers.
 */

var _jrand = new SecureRandom(); // SecureRandom is thread-safe

function getRandom() {
  return _jrand;
}

function randomString(nchars) {
  var result = '';

  // 48-58  or  65-91  or  97-123    (inclusive-exclusive)
  // 0-10   or  0-26   or  0-26
  // 0-62

  for (var i = 0; i < nchars; i++) {
    var x = _jrand.nextInt(62);
    var code;
    if (x < 10) { code = x + 48; }
    if (x >= 10 && x < 36) { code = x - 10 + 65/*a*/; }
    if (x >= 36) { code = x - 36 + 97/*A*/; }
    result += String.fromCharCode(code);
  }
  return result;
}

function md5(x) {
  return net.appjet.ajstdlib.md5.md5(x);
}

function randomHash(len) {
  var x = md5(""+_jrand.nextDouble()*1e12+_jrand.nextDouble()*1e12);
  if (len) {
    return String(x).substr(0,len);
  } else {
    return x;
  }
}

function gzip(x) {
  return net.appjet.oui.Util.gzip(x)
}

function isNumeric(x) {
  return !!(/^\d+$/.test(x));
}

