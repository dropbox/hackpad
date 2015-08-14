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


jimport("java.lang.System.err")
jimport("yuicompressor.org.mozilla.javascript.ErrorReporter");
jimport("com.yahoo.platform.yui.compressor.JavaScriptCompressor")
jimport("com.yahoo.platform.yui.compressor.CssCompressor")
jimport("java.io.StringReader");
jimport("java.io.StringWriter");

/**
 * Compresses the given JavaScript code into an equivalent, shorter string of code using
 * YUICompressor.  In addition to removing white-space and comments, YUICompressor
 * does a full semantic parse of the code and renames non-global variables to have
 * very short names.  Scopes that are visible to "eval" and "with" are excluded from
 * variable renaming, making the operation very safe.
 * <p>
 * For example,
 * yuicompressor.compressJS("function foo() { var longVariableName = 3; return longVariableName }");
 * produces
 * "function foo(){var A=3;return A;}"
 */

function compressJS(code) {
  function getComplaint(message, sourceName, line, lineSource, lineOffset) {
    if (line < 0) return message;
    else return (line+":"+lineOffset+":"+message);
  }
  function complaintHandler(func) {
    return function(message, sourceName, line, lineSource, lineOffset) {
      return func(getComplaint(message, sourceName, line, lineSource, lineOffset));
    }
  }
  var myErrorReporter = new JavaAdapter(ErrorReporter, {
    warning: complaintHandler(function (msg) {
      if (msg.indexOf("Try to use a single 'var' statement per scope.") >= 0)
	return;
      err.println("yuicompressor.compressJS warning: "+msg);
    }),
    error: complaintHandler(function (msg) {
      throw new Error("yuicompressor.compressJS error: "+msg);
    }),
    runtimeError: complaintHandler(function (msg) {
      throw new Error("yuicompressor.compressJS error: "+msg);
    })
  });

  var munge = true;
  var verbose = false;
  var optimize = true;
  var wrapPos = 100; // characters, no wrap == -1
  var compressor = new JavaScriptCompressor(new StringReader(code), myErrorReporter);
  var writer = new StringWriter();
  compressor.compress(writer, 100, munge, verbose, true, !optimize);
  return String(writer.toString());
}

/**
 * Compresses the given CSS code into an equivalent, shorter string of code using
 * YUICompressor.  Besides removing unnecessary white-space and comments, the operation
 * performs an assortment of semantics-preserving optimizations.  The operation attempts
 * to preserve common "hacks" that take advantage of browser differences in parsing.
 */

function compressCSS(code) {
  var compressor = new CssCompressor(new StringReader(code));
  var wrapPos = 100; // characters, no wrap == -1
  var writer = new StringWriter();
  compressor.compress(writer, wrapPos);
  return String(writer.toString());
}
