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


jimport("org.ccil.cowan.tagsoup.Parser");
jimport("org.ccil.cowan.tagsoup.PYXWriter");
jimport("java.io.StringReader");
jimport("java.io.StringWriter");
jimport("org.xml.sax.InputSource");

import("etherpad.collab.ace.easysync2.{Changeset,AttribPool}");
import("etherpad.collab.ace.contentcollector.makeContentCollector");
import("etherpad.collab.ace.linestylefilter");
import("etherpad.collab.collab_server");

function setPadHTML(pad, html) {
  var atext = htmlToAText(html, pad.pool());
  collab_server.setPadAText(pad, atext);
}

function _html2pyx(html) {
  var p = new Parser();
  var w = new StringWriter();
  var h = new PYXWriter(w);
  p.setContentHandler(h);
  var s = new InputSource();
  s.setCharacterStream(new StringReader(html));
  p.parse(s);
  return w.toString().replace(/\r\n|\r|\n/g, '\n');
}

function _htmlBody2js(html) {
  var pyx = _html2pyx(html);
  var plines = pyx.split("\n");

  function pyxUnescape(s) {
    return s.replace(/\\t/g, '\t').replace(/\\/g, '\\');
  }
  var inAttrs = false;

  var nodeStack = [];
  var topNode = {};

  var bodyNode = {name:"body"};

  plines.forEach(function(pline) {
    var t = pline.charAt(0);
    var v = pline.substring(1);
    if (inAttrs && t != 'A') {
      inAttrs = false;
    }
    if (t == '?') { /* ignore */ }
    else if (t == '(') {
      var newNode = {name: v};
      if (v.toLowerCase() == "body") {
        bodyNode = newNode;
      }
      topNode.children = (topNode.children || []);
      topNode.children.push(newNode);
      nodeStack.push(topNode);
      topNode = newNode;
      inAttrs = true;
    }
    else if (t == 'A') {
      var spaceIndex = v.indexOf(' ');
      var key = v.substring(0, spaceIndex);
      var value = pyxUnescape(v.substring(spaceIndex+1));
      topNode.attrs = (topNode.attrs || {});
      topNode.attrs['$'+key] = value;
    }
    else if (t == '-') {
      if (v == "\\n") {
        v = '\n';
      }
      else {
        v = pyxUnescape(v);
      }
      if (v) {
        topNode.children = (topNode.children || []);
        if (topNode.children.length > 0 &&
            ((typeof topNode.children[topNode.children.length-1]) == "string")) {
          // coallesce
          topNode.children.push(topNode.children.pop() + v);
        }
        else {
          topNode.children.push(v);
        }
      }
    }
    else if (t == ')') {
      topNode = nodeStack.pop();
    }
  });

  return bodyNode;
}

function _trimDomNode(n) {
  function isWhitespace(str) {
    return /^\s*$/.test(str);
  }
  function trimBeginningOrEnd(n, endNotBeginning) {
    var cc = n.children;
    var backwards = endNotBeginning;
    if (cc) {
      var i = (backwards ? cc.length-1 : 0);
      var done = false;
      var hitActualText = false;
      while (! done) {
        if (! (backwards ? (i >= 0) : (i < cc.length-1))) {
          done = true;
        }
        else {
          var c = cc[i];
          if ((typeof c) == "string") {
            if (! isWhitespace(c)) {
              // actual text
              hitActualText = true;
              break;
            }
            else {
              // whitespace
              cc[i] = '';
            }
          }
          else {
            // recurse
            if (trimBeginningOrEnd(cc[i], endNotBeginning)) {
              hitActualText = true;
              break;
            }
          }
          i += (backwards ? -1 : 1);
        }
      }
      n.children = n.children.filter(function(x) { return !!x; });
      return hitActualText;
    }
    return false;
  }
  trimBeginningOrEnd(n, false);
  trimBeginningOrEnd(n, true);
}

function htmlToAText(html, apool, preserveAuthors) {

  var body = _htmlBody2js(html);
  //  _trimDomNode(body);

  var dom = {
    isNodeText: function(n) {
      return (typeof n) == "string";
    },
    nodeTagName: function(n) {
      return ((typeof n) == "object") && n.name;
    },
    nodeValue: function(n) {
      return String(n);
    },
    nodeNumChildren: function(n) {
      return (((typeof n) == "object") && n.children && n.children.length) || 0;
    },
    nodeChild: function(n, i) {
      return (((typeof n) == "object") && n.children && n.children[i]) || null;
    },
    nodeProp: function(n, p) {
      return (((typeof n) == "object") && n.attrs && n.attrs["$" + p]) || null;
    },
    nodeAttr: function(n, a) {
      return (((typeof n) == "object") && n.attrs && n.attrs["$" + a]) || null;
    },
    optNodeInnerHTML: function(n) {
      return null;
    }
  }

  var className2Author = null;
  if (preserveAuthors) {
    className2Author = linestylefilter.linestylefilter.className2Author;
  }
  var cc = makeContentCollector(true, null, apool, dom, className2Author);
  for(var i=0; i<dom.nodeNumChildren(body); i++) {
    var n = dom.nodeChild(body, i);
    cc.collectContent(n);
  }
  cc.notifyNextNode(null);
  var ccData = cc.finish();

  var textLines = ccData.lines;
  var attLines = ccData.lineAttribs;
  for(var i=0;i<textLines.length;i++) {
    var txt = textLines[i];
    if (txt == " " || txt == "\xa0") {
      // space or nbsp all alone on a line, remove
      textLines[i] = "";
      attLines[i] = "";
    }
  }

  var text = textLines.join('\n')+'\n';
  var attribs = _joinLineAttribs(attLines);
  var atext = Changeset.makeAText(text, attribs);

  return atext;
}

function _joinLineAttribs(lineAttribs) {
  var assem = Changeset.smartOpAssembler();

  var newline = Changeset.newOp('+');
  newline.chars = 1;
  newline.lines = 1;

  lineAttribs.forEach(function(aline) {
    var iter = Changeset.opIterator(aline);
    while (iter.hasNext()) {
      assem.append(iter.next());
    }
    assem.append(newline);
  });

  return assem.toString();
}