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

import("ejs.EJS");
import("funhtml.*");
import("jsutils.{scalaF0,scalaF1}");
import("stringutils.{toHTML,sprintf}");

function _getException(ex) {
  if (ex instanceof java.lang.Throwable) {
    return new net.appjet.bodylock.JSRuntimeException(ex.getMessage(), ex);
  } else if (ex.javaException) {
    return new net.appjet.bodylock.JSRuntimeException(ex.javaException.getMessage(), ex.javaException);
  } else if (ex.rhinoException) {
    return new net.appjet.bodylock.JSRuntimeException(ex.rhinoException.getMessage(), ex.rhinoException);
  } else {
    return ex;
  }
}

function _convertStackFrameToTable(id, frame) {
  var r = frame.errorContext(4);
  var out = [];
  var t = TABLE({className: "codecontext"});
  var counter = r._1();
  r._3().foreach(scalaF1(function(s) {
    var row = TR(TD({className: "linecell"}, counter++), TD(String(s)));
    if (counter-1 == frame.errorLine())
      row[1].attribs['class'] = "offendingline";
    t.push(row);
  }));
  if (id != 0)
    out.push(DIV({className: "errorframe",
                  onclick: "toggleFrameView('"+id+"')"},
                 IMG({className: "zippy", style: "margin-right: 0.5em;", align: "top", src: "http://appjet.com/img/open-arrow.png", id: "image"+id}),
                 SPAN({className: "errordetail"}, "...was called from "+frame.name()+ " (line "+frame.errorLine()+"):"),
                 SPAN({className: "sourceline"}, " "+frame.errorContext(0)._3().head())));
  out.push(DIV({id: 'frame'+id, style: (id == 0 ? "" : "display: none;")}, t));
  return out.map(function(tag) { return toHTML(tag); }).join("");
}

function getStackTraceHTML(ex) {
  ex = _getException(ex);
  if (ex.frames().isEmpty()) 
    return "No stack trace available.";
  var out = [];
  var counter = 0;
  var firstFrame = ex.frames().head();
  out.push(toHTML(DIV({id: "errortitle"}, "Error in "+firstFrame.name())));
  out.push(toHTML(DIV({id: "errormessage"}, ""+ex.cause().getMessage()+" at "+firstFrame.name()+" (Line "+firstFrame.errorLine()+")")));
  ex.frames().foreach(scalaF1(function(frame) {
    out.push(_convertStackFrameToTable(counter++, frame));
  }));
  return out.join("");
}

function getStackTraceFullpage(ex) {
  var tmpl = new EJS({text: _tmpl});
  return tmpl.render({trace: getStackTraceHTML(ex)});
}

function getStackTracePlain(ex) {
  ex = _getException(ex);
  if (ex.frames().isEmpty()) {
    var cause = ex.cause();
    var sw = new java.io.StringWriter();
    cause.printStackTrace(new java.io.PrintWriter(sw));
    return sw.toString();
  }
  var out = [];
  var firstFrame = ex.frames().head();
  out.push("Error in "+firstFrame.name());
  out.push(""+ex.cause().getMessage()+" at "+firstFrame.name()+" (Line "+firstFrame.errorLine()+")");
  var counter = 0;
  ex.frames().foreach(scalaF1(function(frame) {
    if (counter++ > 0) {
      out.push("");
      out.push("...was called from "+frame.name()+" (line "+frame.errorLine()+"): "+frame.errorContext(0)._3().head());
    }
    var r = frame.errorContext(4);
    var c2 = r._1();
    r._3().foreach(scalaF1(function(s) {
      var pre = " ";
      if (c2 == frame.errorLine())
        pre = ">";
      out.push(sprintf("%s %4s | %s", pre, ""+c2, s));
      c2++;
    }));
  }));
  return out.join("\n");
}

/* template follows */
var _tmpl = '<!DOCTYPE HTML PUBLIC' +
          '"-//W3C//DTD XHTML 1.0 Strict//EN"' +
          '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">' +
'<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">' +
'<head>' +
'  <title>AppJet Error</title>' +
'  <meta http-equiv="Content-type" content="text/html; charset=utf-8" />' +
'  <meta http-equiv="Content-Language" content="en-us" />' +
'  <script type="text/javascript" src="http://appjet.com/js/343607636acfee88faa2b638330a3370/jquery-1.2.6.js"></script>' +
'  <script type="text/javascript">' +
'function toggleFrameView(frameId) {' +
'  var hidden = $("#frame"+frameId+":hidden")' +
'  var visible = $("#frame"+frameId+":visible")' +
'  if (hidden.length > 0) {' +
'    hidden.show("normal")' +
'    $("#image"+frameId).attr("src", "http://appjet.com/img/close-arrow.png")' +
'  } else {' +
'    visible.hide("normal")' +
'    $("#image"+frameId).attr("src", "http://appjet.com/img/open-arrow.png")' +
'  }' +
'}' +
'' +
'function toggleErrorView() {' +
'  var hidden = $("#hiddentrace:hidden");' +
'  var visible = $("#hiddentrace:visible");' +
'  if (hidden.length > 0) {' +
'    hidden.slideDown("normal");' +
'  } else {' +
'    visible.slideUp("normal");' +
'  }' +
'  return false;' +
'}' +
'' +
'function load() {' +
'  $(".zippy").attr("src", "http://appjet.com/img/open-arrow.png")' +
'}' +
'</script>' +
'<style>' +
'body {' +
'  font-family: verdana, helvetica, sans-serif;' +
'  font-size: 60%;' +
'  margin: 1em;' +
'}' +
'#header { border-bottom: 1px solid red; margin-bottom: 0.8em; }' +
'#errortitle { font-weight: bold; font-size: 1.6em; margin-bottom: 0.76em;}' +
'#errormessage { font-size: 1.4em; margin-bottom: 1.0em}' +
'#errorexplanation {' +
'  background-color: #ffd; margin: 1em; padding: 0 1em;' +
'  border: 1px solid #cc9;' +
'  line-height: 150%;' +
'}' +
'#errorexplanation ul, #errorexplanation li { margin: 0; padding: 0; }' +
'#errorexplanation ul { padding-left: 2em; }' +
'#errorexplanation { font-size: 9pt; }' +
'#errorexplanation code { font-size: 10pt; }' +
'#errorexplanation code { padding: 1px; background: #ddc; margin: 0 5px;' +
'    white-space:nowrap; }' +
'#errorexplanation code.quote { background: #fcc; }' +
'#errorexplanation p, #errorexplanation li { margin: 1em 0 }' +
'#frame0 { margin-top: 2.0em; }' +
'.errorframe {' +
'  margin-bottom: 0.5em;' +
'  margin-top: 1em;' +
'  cursor: pointer;' +
'  color: blue;' +
'}' +
'.errordetail {' +
'  text-decoration: underline;' +
'}' +
'.errorframe:hover {' +
'  color: #c47827;' +
'}' +
'.sourceline {' +
'  font-size: 1.4em;' +
'  color: black;' +
'  font-family: monospace;' +
'}' +
'#statuscode {' +
'  float: right;' +
'  font-size: 2.4em;' +
'  font-weight: bold;' +
'}' +
'.codecontext {' +
'  border: 1px solid black;' +
'  font-family: monospace;' +
'  font-size: 1.4em;' +
'}' +
'.codecontext td { padding: 0.1em 0.3em; }' +
'.codecontext .linecell { border-right: 1px solid #888; }' +
'.codecontext .offendingline { background-color: #ffcccc; }' +
'.errotemplate .codecontext .linecell { border-right: 1px solid black; }' +
'pre {' +
'  margin: 0px;' +
'  padding: 0px;' +
'  border: 0px;' +
'}' +
'' +
'#errorexplanation tt { font-size: 85%; color: #666; }' +
'</style>' +
'</head>' +
'<body onload="load()">' +
'<%= trace %>' +
'</body>' +
'</html>';
