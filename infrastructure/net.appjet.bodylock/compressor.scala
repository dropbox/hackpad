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

package net.appjet.bodylock;

import java.io.{StringWriter, StringReader}
import net.appjet.common.util.BetterFile;

object compressor {
  def compress(code: String): String = {
    import yuicompressor.org.mozilla.javascript.{ErrorReporter, EvaluatorException};
    object MyErrorReporter extends ErrorReporter {
      def warning(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int) {
	if (message startsWith "Try to use a single 'var' statement per scope.") return;
	if (line < 0) System.err.println("\n[WARNING] " + message);
	else System.err.println("\n[WARNING] " + line + ':' + lineOffset + ':' + message);
      }
      def error(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int) {
	if (line < 0) System.err.println("\n[ERROR] " + message);
	else System.err.println("\n[ERROR] " + line + ':' + lineOffset + ':' + message);
	java.lang.System.exit(1);
      }
      def runtimeError(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int): EvaluatorException = {
	error(message, sourceName, line, lineSource, lineOffset);
	return new EvaluatorException(message);
      }
    }

    val munge = true;
    val verbose = false;
    val optimize = true;
    val wrap = true;
    val compressor = new com.yahoo.platform.yui.compressor.JavaScriptCompressor(new StringReader(code), MyErrorReporter);
    val writer = new StringWriter;
    compressor.compress(writer, if (wrap) 100 else -1, munge, verbose, true, optimize);
    writer.toString;
  }

  def main(args: Array[String]) {
    for (fname <- args) {
      try {
	val src = BetterFile.getFileContents(fname);
	val obfSrc = compress(src);
	val fw = (new java.io.FileWriter(new java.io.File(fname)));
	fw.write(obfSrc, 0, obfSrc.length);
	fw.close();
      } catch {
	case e => {
	  println("Failed to compress: "+fname+". Quitting.");
	  e.printStackTrace();
	  System.exit(1);
	}
      }
    }
  }
}

