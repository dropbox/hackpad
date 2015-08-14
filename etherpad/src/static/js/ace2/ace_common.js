/*!
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


function isNodeText(node) {
  return (node.nodeType == 3);
}

function nodeText(n) {
  // support for image faketext
  if ($(n).children() && $(n).children()[0] && $($(n).children()[0]).attr("faketext")) {
    return $($(n).children()[0]).attr("faketext");
  }
  return  n.innerText || n.textContent || n.nodeValue || n.getAttribute("faketext") || '';
}


var _blockElems = { "div":1, "p":1, "pre":1, "li":1, "ol":1, "ul":1 };
function isBlockElement(n) {
  return !!_blockElems[(n.tagName || "").toLowerCase()];
}

function object(o) {
  var f = function() {};
  f.prototype = o;
  return new f();
}

function extend(obj, props, skip) {
  for(var p in props) {
    if (typeof(skip) == "undefined" || !(p in skip)) {
      obj[p] = props[p];
    }
  }
  return obj;
}

function forEach(array, func) {
  for(var i=0;i<array.length;i++) {
    var result = func(array[i], i);
    if (result) break;
  }
}

function decorate(derived, base) {
  for (var property in base) {
    if (!derived[property]) {
      derived[property] = base[property];
    }
  }
}

function map(array, func) {
  var result = [];
  // must remain compatible with "arguments" pseudo-array
  for(var i=0;i<array.length;i++) {
    if (func) result.push(func(array[i], i));
    else result.push(array[i]);
  }
  return result;
}

function filter(array, func) {
  var result = [];
  // must remain compatible with "arguments" pseudo-array
  for(var i=0;i<array.length;i++) {
    if (func(array[i], i)) result.push(array[i]);
  }
  return result;
}

function isArray(testObject) {
  return testObject && typeof testObject === 'object' &&
    !(testObject.propertyIsEnumerable('length')) &&
    typeof testObject.length === 'number';
}

// Figure out what browser is being used (stolen from jquery 1.2.1)
var userAgent = navigator.userAgent.toLowerCase();
var browser = {
  version: (userAgent.match(/.+(?:rv|it|ra|ie)[\/: ]([\d.]+)/) || [])[1],
  safari: /webkit/.test(userAgent),
  opera: /opera/.test(userAgent),
  msie: /msie/.test(userAgent) && !/opera/.test(userAgent),
  mozilla: /mozilla/.test(userAgent) && !/(compatible|webkit)/.test(userAgent),
  windows: /windows/.test(userAgent), // dgreensp
  mobile: /(iphone|ipad|android|ipod)/.test(userAgent),
  phone: /(iphone)/.test(userAgent),
  android: /(android)/.test(userAgent)
};


var iOS = ( navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ? true : false );


function getAssoc(obj, name) {
  return obj["_magicdom_"+name];
}

function setAssoc(obj, name, value) {
  // note that in IE designMode, properties of a node can get
  // copied to new nodes that are spawned during editing; also,
  // properties representable in HTML text can survive copy-and-paste
  obj["_magicdom_"+name] = value;
}

// "func" is a function over 0..(numItems-1) that is monotonically
// "increasing" with index (false, then true).  Finds the boundary
// between false and true, a number between 0 and numItems inclusive.
function binarySearch(numItems, func) {
  if (numItems < 1) return 0;
  if (func(0)) return 0;
  if (! func(numItems-1)) return numItems;
  var low = 0; // func(low) is always false
  var high = numItems-1; // func(high) is always true
  while ((high - low) > 1) {
    var x = Math.floor((low+high)/2); // x != low, x != high
    if (func(x)) high = x;
    else low = x;
  }
  return high;
}

function binarySearchInfinite(expectedLength, func) {
  var i = 0;
  while (!func(i)) i += expectedLength;
  return binarySearch(i, func);
}

function htmlPrettyEscape(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\r?\n/g, '\\n');
}

function getClassArray(elem, optFilter) {
  if (!elem.className) { return []; }
  var bodyClasses = [];
  elem.className.replace(/\S+/g, function (c) {
    if ((! optFilter) || (optFilter(c))) {
      bodyClasses.push(c);
    }
  });
  return bodyClasses;
}
function hasClass(elem, class_) {
  var classes = getClassArray(elem, function(c){return c==class_;});
  return classes.length;
}

function setClassArray(elem, array) {
  elem.className = array.join(' ');
}
function addClass(elem, className) {
  var seen = false;
  var cc = getClassArray(elem, function(c) { if (c == className) seen = true; return true; });
  if (! seen) {
    cc.push(className);
    setClassArray(elem, cc);
  }
}
function removeClass(elem, className) {
  var seen = false;
  var cc = getClassArray(elem, function(c) {
    if (c == className) { seen = true; return false; } return true; });
  if (seen) {
    setClassArray(elem, cc);
  }
}
function setClassPresence(elem, className, present) {
  if (present) addClass(elem, className);
  else removeClass(elem, className);
}

function hasParent(node, parent) {
  while (node) {
    if (node == parent) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

function nodeMaxIndex(nd) {
  if (isNodeText(nd)) return nd.nodeValue.length;
  else return 1;
}

function childIndex(n) {
  var idx = 0;
  while (n.previousSibling) {
    idx++;
    n = n.previousSibling;
  }
  return idx;
}

// retrieves the computed style
function getStyle(el, styleProp) {
  var camelize = function (str) {
    return str.replace(/\-(\w)/g, function(str, letter){
      return letter.toUpperCase();
    });
  };

  if (el.currentStyle) {

    return el.currentStyle[camelize(styleProp)];
  } else if (document.defaultView && document.defaultView.getComputedStyle) {
    return document.defaultView.getComputedStyle(el,null)
                               .getPropertyValue(styleProp);
  } else {
    return el.style[camelize(styleProp)];
  }
}

function _contains(arr, item) {
  for (var i=0; i<arr.length; i++) {
    if (item === arr[i]) {
      return true;
    }
  }
  return false;
}

function _hashCode(str) {
  var hash = 0, i, chr;
  if (str.length == 0) return hash;
  for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i);
      hash = ((hash<<5)-hash)+chr;
      hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

function now() { return (new Date()).getTime(); }

function showContextMenu(event, menuName, menu) {
  var targetEl = event.target;
  if (event.target.nodeName != 'DIV') {
    targetEl = event.target.parentNode;
  }
  menu.css({
      'left': clientVars.isDesktopApp ? '18px' : '20px',
      'top': String($(targetEl).position().top + 2) + "px"}).
      show().
      click();
}

// From: http://css-tricks.com/snippets/jquery/display-browser-and-version/
function userAgentInfo() {
  var userAgent = navigator.userAgent.toLowerCase(),
      browser   = '',
      version   = 0;

  $.browser.chrome = /chrome/.test(navigator.userAgent.toLowerCase());

  // Is this a version of IE?
  if ($.browser.msie) {
    userAgent = $.browser.version;
    userAgent = userAgent.substring(0,userAgent.indexOf('.'));
    version = userAgent;
    browser = "Internet Explorer";
  }

  // Is this a version of Chrome?
  if ($.browser.chrome) {
    userAgent = userAgent.substring(userAgent.indexOf('chrome/') + 7);
    userAgent = userAgent.substring(0,userAgent.indexOf('.'));
    version = userAgent;
    // If it is chrome then jQuery thinks it's safari so we have to tell it it isn't
    $.browser.safari = false;
    browser = "Chrome";
  }

  // Is this a version of Safari?
  if ($.browser.safari) {
    userAgent = userAgent.substring(userAgent.indexOf('safari/') + 7);
    userAgent = userAgent.substring(0,userAgent.indexOf('.'));
    version = userAgent;
    browser = "Safari";
  }

  // Is this a version of Mozilla?
  if ($.browser.mozilla) {
    //Is it Firefox?
    if (navigator.userAgent.toLowerCase().indexOf('firefox') != -1) {
      userAgent = userAgent.substring(userAgent.indexOf('firefox/') + 8);
      userAgent = userAgent.substring(0,userAgent.indexOf('.'));
      version = userAgent;
      browser = "Firefox"
    }
    // If not then it must be another Mozilla
    else {
      browser = "Mozilla (not Firefox)"
    }
  }

  // Is this a version of Opera?
  if ($.browser.opera) {
    userAgent = userAgent.substring(userAgent.indexOf('version/') + 8);
    userAgent = userAgent.substring(0,userAgent.indexOf('.'));
    version = userAgent;
    browser = "Opera";
  }

  return {browser: browser, version: version};
}

function noop() {}
function identity(x) { return x; }
