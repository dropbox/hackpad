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

import net.appjet.common.rhino.rhinospect;

import scala.collection.mutable.{SynchronizedMap, ArrayBuffer, HashMap};

import org.mozilla.javascript.{Context, Scriptable, ScriptableObject, Script, JavaScriptException, NativeJavaObject, WrappedException, IdScriptableObject};

trait Executable {
  def execute(scope: Scriptable): Object;
}

trait JSStackFrame {
  def errorLine: Int; // 1-indexed.
  def errorContext(rad: Int): (Int, Int, Seq[String]); // 1-indexed
  def name: String;
}

class ExecutionException(message: String, cause: Throwable) extends RuntimeException(message, cause) {
  def this(message: String) = this(message, null);
}

class JSRuntimeException(val message: String, val cause: Throwable) extends ExecutionException(message, cause) {
  private val i_frames: Seq[JSStackFrame] = if (cause == null) List() else {
    val ab = new ArrayBuffer[JSStackFrame];
    for (elt <- cause.getStackTrace() if (elt.getFileName != null && BodyLock.map.filter(_.contains(elt.getFileName)).isDefined && elt.getLineNumber >= 0)) {
      ab += new JSStackFrame {
        val errorLine = elt.getLineNumber;
        val name = elt.getFileName;
        val code = BodyLock.map.getOrElse(collection.Map[String, String]()).getOrElse(elt.getFileName, "").split("\n"); // 0-indexed.
        def errorContext(rad: Int) = {
          val start_i = math.max(errorLine-rad, 1)-1;
          val end_i = math.min(errorLine+rad, code.length)-1;
          (start_i+1, end_i+1, code.slice(start_i, end_i+1));
        }
      }
    }
    ab;
  }
  def frames = i_frames;
}

class JSCompileException(message: String, cause: org.mozilla.javascript.EvaluatorException) extends JSRuntimeException(message, cause) {
  override val frames =
    List(new JSStackFrame {
      val errorLine = cause.lineNumber();
      val name = cause.sourceName();
      val code = BodyLock.map.getOrElse(collection.Map[String, String]()).getOrElse(cause.sourceName(), "").split("\n"); // 0-indexed.
      def errorContext(rad: Int) = {
        val start_i = math.max(errorLine-rad, 1)-1;
        val end_i = math.min(errorLine+rad, code.length)-1;
        (start_i+1, end_i+1, code.slice(start_i, end_i+1));
      }
    }) ++ super.frames;
}

private[bodylock] class InnerExecutable(val code: String, val script: Script) extends Executable {
  def execute(scope: Scriptable) = try {
    BodyLock.runInContext { cx =>
      script.exec(cx, scope);
    }
  } catch {
    case e: Throwable => {
      val orig = BodyLock.unwrapExceptionIfNecessary(e);
      orig match {
        case e: JSRuntimeException => throw e;
        case e: org.mortbay.jetty.RetryRequest => throw e;
        case _ => throw new JSRuntimeException("Error while executing: "+orig.getMessage, orig);
      }
    }
  }

  override def toString() = 
    rhinospect.dumpFields(script, 1, "");
}   

object CustomContextFactory extends org.mozilla.javascript.ContextFactory {
  val wrapFactory = new org.mozilla.javascript.WrapFactory {
    setJavaPrimitiveWrap(false); // don't wrap strings, numbers, booleans
  }
  
  class CustomContext() extends Context() {
    setWrapFactory(wrapFactory);
  }
  
  override def makeContext(): Context = new CustomContext();
}

object BodyLock {
  var map: Option[SynchronizedMap[String, String]] = None;

  def runInContext[E](expr: Context => E): E = {
    val cx = CustomContextFactory.enterContext();
    try {
      expr(cx);
    } finally {
      Context.exit();
    }
  } 

  def newScope = runInContext { cx =>
    cx.initStandardObjects(null, true);
  }
  def subScope(scope: Scriptable) = runInContext { cx =>
    val newObj = cx.newObject(scope).asInstanceOf[ScriptableObject];
    newObj.setPrototype(scope);
    newObj.setParentScope(null);
    newObj;
  }

  def evaluateString(scope: Scriptable, source: String, sourceName: String, 
                     lineno: Int /*, securityDomain: AnyRef = null */) = runInContext { cx =>
    cx.evaluateString(scope, source, sourceName, lineno, null);
  }
  def compileString(source: String, sourceName: String, lineno: Int
                    /*, securityDomain: AnyRef = null */) = runInContext { cx =>
    map.foreach(_(sourceName) = source);
    try {
      new InnerExecutable(source, compileToScript(source, sourceName, lineno));
    } catch {
      case e: org.mozilla.javascript.EvaluatorException => {
        throw new JSCompileException(e.getMessage(), e);
      }
    }
  }

  private val classId = new java.util.concurrent.atomic.AtomicInteger(0);
  
  private def compileToScript(source: String, sourceName: String, lineNumber: Int): Script = {
    val className = "JS$"+sourceName.replaceAll("[^a-zA-Z0-9]", "\\$")+"$"+classId.incrementAndGet();
    compilationutils.compileToScript(source, sourceName, lineNumber, className);
  }

  def executableFromBytes(bytes: Array[Byte], className: String) =
    new InnerExecutable("(source not available)", compilationutils.bytesToScript(bytes, className));
  
  def unwrapExceptionIfNecessary(e: Throwable): Throwable = {
    e match {
      case e: JavaScriptException => e.getValue() match {
        case njo: NativeJavaObject => Context.jsToJava(njo, classOf[Object]) match {
          case e: Throwable => e;
          case _ => e;
        }
        case ne: IdScriptableObject => new JSRuntimeException("Error: "+ne.get("message", ne), e);
        case t: Throwable => t;
        case _ => e;
      }
      case e: WrappedException => unwrapExceptionIfNecessary(e.getWrappedException());
      case _ => e;
    }
  }
}

private[bodylock] object compilationutils {
  class Loader(parent: ClassLoader) extends ClassLoader(parent) {
    def this() = this(getClass.getClassLoader);
    def defineClass(className: String, bytes: Array[Byte]): Class[_] = {
      // call protected method
      defineClass(className, bytes, 0, bytes.length);
    }
  }
  
  def compileToBytes(source: String, sourceName: String, lineNumber: Int,
                     className: String): Array[Byte] = {
    val environs = new org.mozilla.javascript.CompilerEnvirons;
    BodyLock.runInContext(environs.initFromContext(_));
    environs.setGeneratingSource(false);
    val compiler = new org.mozilla.javascript.optimizer.ClassCompiler(environs);
    
    // throws EvaluatorException
    val result:Array[Object] =
      compiler.compileToClassFiles(source, sourceName, lineNumber, className);
    
    // result[0] is class name, result[1] is class bytes
    result(1).asInstanceOf[Array[Byte]];
  }

  def compileToScript(source: String, sourceName: String, lineNumber: Int,
                       className: String): Script = {
    bytesToScript(compileToBytes(source, sourceName, lineNumber, className), className);
  }

  def bytesToScript(bytes: Array[Byte], className: String): Script = {
    (new Loader()).defineClass(className, bytes).newInstance.asInstanceOf[Script];
  }
}


import java.io.File;
import scala.collection.mutable.HashMap;
import net.appjet.common.util.BetterFile;
import net.appjet.common.cli._;

object Compiler {
  val optionsList = Array(
    ("destination", true, "Destination for class files", "path"),
    ("cutPrefix", true, "Drop this prefix from files", "path"),
    ("verbose", false, "Print debug information", "")
  );
  val chosenOptions = new HashMap[String, String];
  val options = 
    for (opt <- optionsList) yield 
      new CliOption(opt._1, opt._3, if (opt._2) Some(opt._4) else None)

//     var o = new Options;
//     for (m <- optionsList) {
//       o.addOption({
//         if (m._2) {
//           withArgName(m._4);
//           hasArg();
//         }
//         withDescription(m._3);
// //          withLongOpt(m.getName());
//         create(m._1);
//       });
//     }
//     o;
//   }

  var verbose = true;
  def vprintln(s: String) {
    if (verbose) println(s);
  }

  def printUsage() {
    println((new CliParser(options)).usage);
  }
  def extractOptions(args0: Array[String]) = {
    val parser = new CliParser(options);
    val (opts, args) = 
      try {
        parser.parseOptions(args0);
      } catch {
        case e: ParseException => {
          println("error: "+e.getMessage());
          printUsage();
          System.exit(1);
          null;
        }
      }
    for ((k, v) <- opts) {
      chosenOptions(k) = v;
    }
    args
  }
  def compileSingleFile(src: File, dst: File) {
    val source = BetterFile.getFileContents(src);
    vprintln("to: "+dst.getPath());
    val classBytes = compilationutils.compileToBytes(source, src.getName(), 1, dst.getName().split("\\.")(0));

    val fos = new java.io.FileOutputStream(dst);
    fos.write(classBytes);
  }

  def main(args0: Array[String]) {
    // should contain paths, relative to PWD, of javascript files to compile.
    val args = extractOptions(args0);
    val dst = chosenOptions("destination");
    val pre = chosenOptions.getOrElse("cutPrefix", "");
    verbose = chosenOptions.getOrElse("verbose", "false") == "true";
    for (p <- args) {
      val srcFile = new File(p);
      if (srcFile.getParent() != null && ! srcFile.getParent().startsWith(pre))
        throw new RuntimeException("srcFile "+srcFile.getPath()+" doesn't start with "+pre);
      val parentDir = 
        if (srcFile.getParent() != null) {
          new File(dst+"/"+srcFile.getParent().substring(pre.length));
        } else {
          new File(dst);
        }
      parentDir.mkdirs();
      compileSingleFile(srcFile, new File(parentDir.getPath()+"/JS$"+srcFile.getName().split("\\.").reverse.drop(1).reverse.mkString(".").replaceAll("[^a-zA-Z0-9]", "\\$")+".class"));
    }
  }
}
