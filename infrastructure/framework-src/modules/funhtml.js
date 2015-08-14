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
 * @fileOverview Functional HTML tag writing.<br/>
 *
 * <p>This library allows you to write HTML in the form of nested function
 * calls.  By default, a function is predefined for each tag, with the function
 * name being in all caps.  A dictionary of HTML attributes can optionally be
 * passed as a first argument to a tag; other arguments become child tags.
 * Attribute names that conflict with JavaScript
 * keywords have been renamed; use "className" in place of "class" and
 * "htmlFor" in place of "for".</p>
 *
 * <p>Tag objects inherit from Array, so array methods can be used to
 * manipulate a tag's list of child tags.</p>
 *
 * @example
print(P({id:"sec3"},"Tags are ",B(I("crazy"))," awesome."));
 */

import("jsutils.eachProperty");
import("etherpad.log");
import("stringutils");
import("stringutils.toHTML");

function html(x) {
  // call out to stringutils.html().
  var args = Array.prototype.slice.call(arguments);
  return stringutils.html.apply(this, args);
};

function toHTML(x) {
  // call out to stringutils.toHTML().
  var args = Array.prototype.slice.call(arguments);
  return stringutils.toHTML.apply(this, args)
};

//----------------------------------------------------------------
// tags.
//----------------------------------------------------------------

var _neverSingletones = {
  'TEXTAREA': true,
  'SCRIPT': true,
  'DIV': true,
  'IFRAME': true,
  'UL': true,
  'TABLE': true
};

/**
 * Imports a specified list of tags. All HTML tags are automatically imported
 * by default, but you may wish to use the tag library to write other kinds
 * of mark-up.  For each tag you want to import, pass in the name (including
 * any punctuation) with the (upper/lower) case you want to use for the function
 * (traditionally all uppercase).  The function name will have punctuation
 * replaced with underscores, and the printed tag will be all lowercase.
 *
 * @param {object} scopeObj where to define the tags; to define in the global scope, pass <code>this</code> from the top level (not from inside a function)
 * @param {array} tagArray an array of strings, the tags to import
 * @example
importTags(this, ["MEDIA:TITLE"]);
print(MEDIA_TITLE({type:"html"}, "funny pictures"));
// prints &lt;media:title type="html"&gt;funny pictures&lt;/media:title&gt;
 */
function _importTags(scopeObj, tagArray) {
  tagArray.forEach(function(arg) {
      var funcName = arg.replace(/:/g, "_").replace(/-/g, "_");
      var tagName = arg.toLowerCase();
      scopeObj[funcName] = function() {
	var tag = [];
	tag.name = tagName;
	var contents = Array.prototype.slice.call(arguments);
	if (contents.length > 0) {
	  if (contents[0] &&
	      (! contents[0].toHTML) &&
	      ((typeof contents[0]) == "object") &&
	      (! Array.prototype.isPrototypeOf(contents[0])) &&
	      (! Date.prototype.isPrototypeOf(contents[0]))) {
	    // first arg is attributes
	    tag.attribs = contents[0];
	    contents.shift();
	  }
	  else {
	    tag.attribs = {};
	  }
	  contents.forEach(function (content) {
	      tag.push(content);
	    });
	}
	else {
	  tag.attribs = {};
	}
	tag.toString = function() { return this.toHTML(); }; // this behavior is relied on
	tag.toHTML = function() {
	  var t = this;
	  var result = [];
	  result.add = function(x) { this.push(x); return this; };
	  result.add('<').add(t.name);

	  if (t.attribs) {
	    eachProperty(t.attribs, function(k,v) {
	      if (k == "className") k = "class";
	      if (k == "htmlFor") k = "for";
        if (!(v === undefined)) {
          // escape quotes and newlines in values
          v = String(v).replace(/\"/g, '&quot;').replace(/\n/g, '\\n').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          result.add(' ').add(k).add('="').add(v).add('"');
        }
	    });
	  }
	  if ((t.length < 1) && (!(t.name.toUpperCase() in _neverSingletones))) {
	    result.add(' />');
	  }
	  else {
	    result.add('>');
	    t.forEach(function (x) {
		result.add(toHTML(x));
	      });
	    result.add('</').add(t.name).add('>\n');
	  }
	  return result.join("");
	};
	return tag;
      };
    });
}

var _html_tags =
  ["A", "ABBR", "ACRONYM", "ADDRESS", "APPLET", "AREA", "B",
   "BASE", "BASEFONT", "BDO", "BIG", "BLOCKQUOTE", "BODY",
   "BR", "BUTTON", "CAPTION", "CENTER", "CITE", "CODE", "COL",
   "COLGROUP", "DD", "DEL", "DIR", "DIV", "DFN", "DL", "DT",
   "EM", "FIELDSET", "FONT", "FORM", "FRAME", "FRAMESET",
   "H1", "H2", "H3", "H4", "H5", "H6",
   "HEAD", "HR", "HTML", "I", "IFRAME", "IMG", "INPUT",
   "INS", "ISINDEX", "KBD", "LABEL", "LEGEND", "LI", "LINK",
   "MAP", "MENU", "META", "NOFRAMES", "NOSCRIPT", "OBJECT",
   "OL", "OPTGROUP", "OPTION", "P", "PARAM", "PRE", "Q", "S",
   "SAMP", "SCRIPT", "SELECT", "SMALL", "SPAN", "STRIKE",
   "STRONG", "STYLE", "SUB", "SUP", "TABLE", "TBODY", "TD",
   "TEXTAREA", "TFOOT", "TH", "THEAD", "TITLE", "TR", "TT",
   "U", "UL", "VAR", "XMP"];

_importTags(this, _html_tags);

