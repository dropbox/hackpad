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

package net.appjet.oui;

import java.net.URLDecoder;
import java.util.Enumeration;
import java.util.concurrent.atomic.AtomicLong;

import javax.servlet.http.{HttpServletRequest, HttpServletResponse, HttpServlet};

import scala.collection.mutable.{ListBuffer, LinkedHashSet, HashMap, ArrayBuffer};
import scala.collection.immutable.Map;
import scala.collection.JavaConversions;

import org.mozilla.javascript.{Scriptable, Context, Function, ScriptableObject, JavaScriptException};
import org.mortbay.jetty.RetryRequest;

import net.appjet.bodylock.{BodyLock, Executable, JSRuntimeException, JSCompileException};
import net.appjet.common.util.HttpServletRequestFactory;
import net.appjet.common.util.BetterFile;


// Removed due to licensing issues; REMOVED_COS_OF_COS
// import com.oreilly.servlet.MultipartFilter;

class RequestWrapper(val req: HttpServletRequest) {
  req.setCharacterEncoding("UTF-8");
// REMOVED_COS_OF_COS ... ?
//   private lazy val parameterNames =
//     (for (i <- Conversions.convertSet(req.getParameterMap.keySet().asInstanceOf[java.util.Set[String]])) yield i).toList.toArray
//   private def parameterValues(k: String) = req.getParameterValues(k);
  def headerCapitalize(s: String) =
    s.split("-").map(
      s =>
        if (s == null || s.length < 1) s
        else s.substring(0, 1).toUpperCase()+s.substring(1).toLowerCase()
    ).mkString("-");
  def isFake = false;
  lazy val path = req.getRequestURI();
  lazy val host = {
    val hostFromHeader = req.getHeader("Host");
    if ((hostFromHeader ne null) && hostFromHeader.indexOf(':') >= 0) {
      // fix the port, which may be wrong in Host header (e.g. IE 6)
      hostFromHeader.substring(0, hostFromHeader.indexOf(':')) + ":" +
        req.getLocalPort;
    }
    else {
      hostFromHeader;
    }
  }
  lazy val query = req.getQueryString();
  lazy val method = req.getMethod();
  lazy val scheme = {
    val xscheme = req.getHeader("X-Scheme");
    if (xscheme != null) xscheme else req.getScheme();
  }
  lazy val clientAddr = {
    val ip = req.getHeader("X-Real-Ip");
    if (ip != null) ip else req.getRemoteAddr();
  }

  def decodeWwwFormUrlencoded(content: => String): Map[String, Array[String]] = {
    val map = new HashMap[String, ArrayBuffer[String]];
    if (content != null && content != "") {
      for (pair <- content.split("&").map(_.split("=", 2))) {
        val key = URLDecoder.decode(pair(0), "UTF-8");
        val list = map.getOrElseUpdate(key, new ArrayBuffer[String]);
        if (pair.length > 1) {
          list += URLDecoder.decode(pair(1), "UTF-8");
        }
      }
    }
    Map((for ((k, v) <- map) yield (k, v.toArray)).toSeq: _*);
  }

  def postParams = decodeWwwFormUrlencoded(content.asInstanceOf[String]);
  def getParams = decodeWwwFormUrlencoded(query);

  lazy val params_i = {
    if (contentType != null && contentType.startsWith("application/x-www-form-urlencoded")) {
      if (req.getAttribute("ajcache_parameters") == null) {
        req.setAttribute("ajcache_parameters",
          Map((for (k <- (postParams.keys ++ getParams.keys).toList)
                 yield (k, postParams.getOrElse(k, Array[String]()) ++
                           getParams.getOrElse(k, Array[String]()))).toSeq: _*));
      }
      req.getAttribute("ajcache_parameters").asInstanceOf[Map[String, Array[String]]];
    } else {
      JavaConversions.mapAsScalaMap(req.getParameterMap().asInstanceOf[java.util.Map[String, Array[String]]]);
    }
  }

  def params(globalScope: Scriptable) = new ScriptableFromMapOfStringArrays(
    globalScope,
    params_i.keys.toList,
    params_i.get(_),
    false);
  def headers(globalScope: Scriptable) = new ScriptableFromMapOfStringArrays(
    globalScope,
    JavaConversions.enumerationAsScalaIterator(req.getHeaderNames().asInstanceOf[Enumeration[String]])
      .map(headerCapitalize).toList,
    h => h match {
      case "Host" => Some(Array(host));
      case hh => Some(Util.enumerationToArray(req.getHeaders(headerCapitalize(hh)).asInstanceOf[Enumeration[String]])) },
    true);
  lazy val protocol = req.getProtocol();
  lazy val contentType = req.getHeader("Content-Type");
  lazy val postParamsInBody = contentType != null && contentType.startsWith("application/x-www-form-urlencoded");
  lazy val content =
    if ((contentType != null && contentType.startsWith("text/")) || postParamsInBody) {
      val reader = req.getReader();
      if (reader != null)
        BetterFile.getReaderString(req.getReader());
      else
        null;
    } else {
      val stream = req.getInputStream();
      if (stream != null)
        BetterFile.getStreamBytes(req.getInputStream());
      else
        null;
    }

  // Depends on cos.jar; REMOVED_COS_OF_COS
  def files(globalScope: Scriptable): Object = {
//    if (! req.isInstanceOf[com.oreilly.servlet.MultipartWrapper]) {
      new ScriptableAdapter();
//    } else {
//      val r = req.asInstanceOf[com.oreilly.servlet.MultipartWrapper];
//      val fileScriptables = new HashMap[String, Scriptable]();
//      val fileBytes = new HashMap[String, Array[byte]]();
//      new ScriptableFromMapOfScriptableArrays(globalScope,
//        r.getFileNames().asInstanceOf[Enumeration[String]].toList,
//        name => {
//          if (r.getFile(name) == null)
//            None
//          else
//            Some(Array(fileScriptables.getOrElseUpdate(name,
//              new ScriptableFromMapOfArrays[Object](globalScope,
//                Set("contentType", "filesystemName", "bytes").toSeq,
//                _ match {
//                  case "contentType" => Some(Array(r.getContentType(name)));
//                  case "filesystemName" =>
//                    Some(Array(r.getFilesystemName(name)));
//                  case "bytes" =>
//                    Some(Array(Context.javaToJS(fileBytes.getOrElseUpdate(name,
//                      BetterFile.getFileBytes(r.getFile(name))), globalScope)));
//                  case _ => None;
//                },
//                true))))
//        },
//        true);
//    }
  }
}

class ResponseWrapper(val res: HttpServletResponse) {
  private lazy val outputStrings = new ListBuffer[String];
  private lazy val outputBytes = new ListBuffer[Array[Byte]];
  private var statusCode = 200;
  private var contentType = "text/html;";
  private var redirect: String = null;
  private lazy val headers = new LinkedHashSet[(String, String, HttpServletResponse => Unit)] {
    def removeAll(k: String) {
      this.foreach(x => if (x._1 == k) remove(x));
    }
  }

  private[oui] def overwriteOutputWithError(code: Int, errorStr: String) {
    statusCode = code;
    outputStrings.clear();
    outputStrings += errorStr;
    outputBytes.clear();
    headers.clear();
    Util.noCacheHeaders.foreach(x => headers += (x._1, x._2, res => res.setHeader(x._1, x._2)));
    redirect = null;
    contentType = "text/html; charset=utf-8";
  }

  def reset() {
    outputStrings.clear();
    outputBytes.clear();
    redirect = null;
    headers.clear();
    Util.noCacheHeaders.foreach(x => headers += (x._1, x._2, res => res.setHeader(x._1, x._2)));
    statusCode = 200;
    contentType = "text/html; charset=utf-8";
  }
  def error(code: Int, errorStr: String) {
    overwriteOutputWithError(code, errorStr);
    stop();
  }
  def stop() {
    throw AppGeneratedStopException;
  }

  def write(s: String) {
    outputStrings += s;
  }
  def getOutput() = outputStrings.mkString("");
  def writeBytes(bytes: String) {
    val a = new Array[Byte](bytes.length());
    bytes.getBytes(0, bytes.length(), a, 0);
    outputBytes += a;
  }
  def writeBytes(bytes: Array[Byte]) {
    outputBytes += bytes;
  }
  def getOutputBytes() = outputBytes.flatMap(x => x).toArray
  def setContentType(s: String) {
    contentType = s;
  }
  def getCharacterEncoding() = {
    res.setContentType(contentType);
    res.getCharacterEncoding();
  }
  def setStatusCode(sc: Int) {
    statusCode = sc;
  }
  def getStatusCode() = statusCode;
  def redirect(loc: String) {
    statusCode = 302;
    redirect = loc;
    stop();
  }
  def setHeader(name: String, value: String) {
    headers += ((name, value, res => res.setHeader(name, value)));
  }
  def addHeader(name: String, value: String) {
    headers += ((name, value, res => res.addHeader(name, value)));
  }
  def getHeader(name: String) = {
    headers.filter(_._1 == name).toArray.map(_._2);
  }
  def removeHeader(name: String) {
    headers.removeAll(name);
  }

  var gzipOutput = false;
  def setGzip(gzip: Boolean) {
    gzipOutput = gzip;
  }

  def print() {
    if (redirect != null && statusCode == 302) {
      headers.foreach(_._3(res));
      res.sendRedirect(redirect);
    } else {
      res.setStatus(statusCode);
      res.setContentType(contentType);
      headers.foreach(_._3(res));
      if (gzipOutput) res.setHeader("Content-Encoding", "gzip");
      if (outputStrings.length > 0) {
        var bytes: Seq[Array[Byte]] = outputStrings.map(_.getBytes(res.getCharacterEncoding()));
        if (gzipOutput) bytes = List(Util.gzip(Array.concat(bytes:_*)));
        res.setContentLength((bytes :\ 0) {_.length + _});
        bytes.foreach(res.getOutputStream.write(_));
      } else if (outputBytes.length > 0) {
        var bytes: Seq[Array[Byte]] = outputBytes;
        if (gzipOutput) bytes = List(Util.gzip(Array.concat(bytes:_*)));
        res.setContentLength((bytes :\ 0) {_.length + _});
        bytes.foreach(res.getOutputStream.write(_));
      }
    }
  }
}

class ScriptableAdapter extends Scriptable {
  private def unsupported() = throw UnsupportedOperationException;
  def delete(index: Int) { unsupported(); }
  def delete(name: String) { unsupported(); }
  def get(index: Int, start: Scriptable): Object = Context.getUndefinedValue();
  def get(name: String, start: Scriptable): Object = Context.getUndefinedValue();
  def getClassName() = getClass.getName();
  def getDefaultValue(hint: Class[_]) = "[ScriptableAdapter]";
  def getIds(): Array[Object] = Array[Object]();
  def getParentScope: Scriptable = null;
  def getPrototype: Scriptable = null;
  def has(index: Int, start: Scriptable): Boolean = false;
  def has(name: String, start: Scriptable): Boolean = false;
  def hasInstance(instance: Scriptable): Boolean = false;
  def put(index: Int, start: Scriptable, value: Object) { unsupported(); }
  def put(name: String, start: Scriptable, value: Object) { unsupported(); }
  def setParentScope(parent: Scriptable) { unsupported(); }
  def setPrototype(prototype: Scriptable) { unsupported(); }
}

class ScriptableFromMapOfStringArrays(globalScope: Scriptable,
  keys: Seq[String], values: String => Option[Array[String]],
  zeroMeansNone: Boolean) extends ScriptableFromMapOfArrays[String](
    globalScope, keys, values, zeroMeansNone);

class ScriptableFromMapOfScriptableArrays(globalScope: Scriptable,
  keys: Seq[String], values: String => Option[Array[Scriptable]],
  zeroMeansNone: Boolean) extends ScriptableFromMapOfArrays[Scriptable](
    globalScope, keys, values, zeroMeansNone);


class ScriptableFromMapOfArrays[V <: Object](globalScope: Scriptable,
                                keys: Seq[String], values: String => Option[Array[V]],
                                zeroMeansNone: Boolean) extends ScriptableAdapter {
  override def get(n: String, start: Scriptable): Object = {
    val v = values(n);
    if (v.isEmpty || (zeroMeansNone && v.get.length == 0)) {
      Context.getUndefinedValue();
    } else if (v.get.length == 1) {
      v.get.apply(0);
    } else {
      Context.getCurrentContext().newArray(globalScope, v.get.map(x => x.asInstanceOf[Object]));
    }
  }
  override def getIds(): Array[Object] = keys.toArray[Object];
  override def getPrototype = ScriptableObject.getObjectPrototype(globalScope);
  override def has(n: String, start: Scriptable): Boolean = ! (values(n).isEmpty || (zeroMeansNone && values(n).get.length == 0));
}

object AppGeneratedStopException extends JSRuntimeException("User-generated stop.", null);
class NoHandlerException(msg: String) extends JSRuntimeException(msg, null);
object UnsupportedOperationException extends JSRuntimeException("Unsupported operation.", null);

object ExecutionContextUtils {
  val uniqueIds = new AtomicLong(0);

  val ecVar = new NoninheritedDynamicVariable[ExecutionContext](null);
  def withContext[E](ec: ExecutionContext)(block: => E): E = {
    ecVar.withValue(ec)(block);
  }

  def currentContext = ecVar.value;
}

case class ExecutionContext(
  val request: RequestWrapper,
  val response: ResponseWrapper,
  var runner: ScopeReuseManager.Runner) {
  val asyncs = new ListBuffer[Function];
  lazy val attributes = new HashMap[String, Any];
  var completed = false;
  lazy val executionId = ""+ExecutionContextUtils.uniqueIds.incrementAndGet();
  var result: AnyRef = null;
}

object CometSupport {
  trait CometHandler {
    def handleCometRequest(req: HttpServletRequest, res: HttpServletResponse);
  }
  var cometHandler: CometHandler = null;
}

class OuiServlet extends HttpServlet {
  override def doGet(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  override def doPost(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  override def doHead(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  override def doPut(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  override def doDelete(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  override def doTrace(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  override def doOptions(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }

  def execute(req: HttpServletRequest, res: HttpServletResponse) {
    // adjust the thread pool as needed
    main.maybeGrowThreadPool();

    if (req.getProtocol() == "HTTP/1.1" && req.getHeader("Host") == null) {
      res.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid HTTP/1.1 request: No \"Host\" header found.");
    } else if (config.transportPrefix != null && req.getRequestURI().startsWith(config.transportPrefix)) {
      val runner = ScopeReuseManager.getRunner;
      val ec = new ExecutionContext(new RequestWrapper(req), new ResponseWrapper(res), runner);
      req.setAttribute("executionContext", ec);
      req.setAttribute("isServerPushConnection", true);
      try {
        CometSupport.cometHandler.handleCometRequest(req, res);
      } catch {
        case e: RetryRequest => {
          ec.runner = null;
          ScopeReuseManager.freeRunner(runner);
          throw e;
        }
        case _ => {};
      }
      try {
        ec.response.print();
        execution.onprint(ec, BodyLock.subScope(runner.mainScope));
      } finally {
        ec.runner = null;
        ScopeReuseManager.freeRunner(runner);
      }
    } else {
      execution.execute(req, res);
    }
  }
}

object execution {
  // maybe find a better place for this?
  { // initialize ajstdlib
    val c = Class.forName("net.appjet.ajstdlib.ajstdlib$");
    val m = c.getDeclaredMethod("init");
    val o = c.getDeclaredField("MODULE$");
    m.invoke(o.get(null));
  }

  val requestLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onrequest.js"));
  val errorLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onerror.js"));
  val printLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onprint.js"));
  val syntaxErrorLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "syntaxerror.js"));
  val onSyntaxErrorLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onsyntaxerror.js"));
  val sarsLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onsars.js"));
  val scheduledTaskLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onscheduledtask.js"));
  def requestExecutable = requestLib.executable;
  def errorExecutable = errorLib.executable;
  def printExecutable = printLib.executable;
  def syntaxErrorExecutable = syntaxErrorLib.executable;
  def onSyntaxErrorExecutable = onSyntaxErrorLib.executable;
  def sarsExecutable = sarsLib.executable;
  def scheduledTaskExecutable = scheduledTaskLib.executable;

  def postSuccessfulRun(ec: ExecutionContext) {
    try {
      for (f <- ec.asyncs) {
        BodyLock.runInContext({ cx =>
          f.call(cx, f.getParentScope(), ec.runner.mainScope, Array[Object]());
        });
      }
    } catch {
      case e => exceptionlog(e);
    }
  }

  def onprint(ec: ExecutionContext, scope: Scriptable) {
    try {
//      ec.runner.globalScope.put("_appjetcontext_", ec.runner.globalScope, ec);
      printExecutable.execute(scope);
    } catch {
      case e => { exceptionlog(e); } // shrug. this was best-effort anyway.
    }
  }

  def execute(req: HttpServletRequest, res: HttpServletResponse) {
    val runner = try {
      ScopeReuseManager.getRunner;
    } catch {
      case e: JSCompileException => {
        val r = ScopeReuseManager.getEmpty { r =>
          syntaxErrorExecutable.execute(r.globalScope)
        }
        val ec = ExecutionContext(new RequestWrapper(req), new ResponseWrapper(res), r);
//        r.globalScope.put("_appjetcontext_", r.globalScope, ec);
        ExecutionContextUtils.withContext(ec) {
          ec.attributes("error") = e;
          ec.result = onSyntaxErrorExecutable.execute(r.globalScope);
          ec.response.print();
        }
        return;
      }
    }
    val ec = ExecutionContext(new RequestWrapper(req), new ResponseWrapper(res), runner);
    val startTime = executionlatencies.time;
    execute(ec,
            (sc: Int, msg: String) => {
              ec.response.overwriteOutputWithError(sc, msg);
            },
            () => { executionlatencies.log(Map(
              "time" -> (executionlatencies.time - startTime)));
              ec.response.print() },
            () => { ScopeReuseManager.freeRunner(runner) },
            None);
  }

  def errorToHTML(e: Throwable) = {
    val trace = new java.io.StringWriter();
    e.printStackTrace(new java.io.PrintWriter(trace));
    trace.toString().split("\n").mkString("<br>\n");
  }
  def execute(ec: ExecutionContext,
              errorHandler: (Int, String) => Unit,
              doneWritingHandler: () => Unit,
              completedHandler: () => Unit,
              customExecutable: Option[Executable]) =
    ExecutionContextUtils.withContext(ec) {
//      ec.runner.globalScope.put("_appjetcontext_", ec.runner.globalScope, ec);
      val runScope = BodyLock.subScope(ec.runner.mainScope);
      try {
        ec.result = customExecutable.getOrElse(requestExecutable).execute(runScope);
        ec.completed = true;
      } catch {
        case AppGeneratedStopException => { ec.completed = true; }
        case e: NoHandlerException => errorHandler(500, "No request handler is defined.");
        case e: RetryRequest => { completedHandler(); throw e; }
        case e => {
          ec.attributes("error") = e;
          try {
            ec.result = errorExecutable.execute(runScope);
          } catch {
            case AppGeneratedStopException => { }
            case nhe: NoHandlerException => {
              exceptionlog(e);
              e.printStackTrace();
              errorHandler(500, "An error occurred and no error handler is defined.");
            }
            case e2 => {
              exceptionlog(e); exceptionlog(e2);
              val etext = e2 match {
                case jse: JavaScriptException => { (jse.getValue() match {
                  case ne: org.mozilla.javascript.IdScriptableObject => ne.get("message", ne)
                  case e => e.getClass.getName
                }) + "<br>\n" + errorToHTML(jse); }
                case _ => errorToHTML(e2);
              }
              errorHandler(
                500,
                "Apologies!  An error has occured.  If this error persists, please contact us at support."); //+ etext+"<br>\nCaused by:<br>\n"+errorToHTML(e));
            }
          }
        }
      }
      onprint(ec, runScope);
      doneWritingHandler();
      if (ec.completed && ! ec.asyncs.isEmpty) {
        main.server.getThreadPool().dispatch(new Runnable {
          def run() {
            postSuccessfulRun(ec);
            completedHandler();
          }
        });
      } else {
        completedHandler();
      }
    }

  def runOutOfBandSimply(executable: Executable,
                         props: Option[Map[String, Any]]) = {
    // there must be a context already.
    val currentContext = ExecutionContextUtils.currentContext;
    val request =
      if (currentContext != null) {
        currentContext.request;
      } else {
        val fakeHeaders = scala.collection.JavaConversions.mapAsScalaMap(
          new java.util.HashMap[String, String]);
        fakeHeaders("Host") = "unknown.local";
        new RequestWrapper(HttpServletRequestFactory.createRequest(
            "/", JavaConversions.mapAsJavaMap(fakeHeaders), "GET", null)) {
          override val isFake = true;
        }
      }
    val response =
      if (currentContext != null && currentContext.response != null) {
        currentContext.response;
      } else {
        new ResponseWrapper(null);
      }
    val runner =
      if (currentContext != null) {
        (false, currentContext.runner);
      } else {
        (true, ScopeReuseManager.getRunner);
      }
    val ec = new ExecutionContext(request, response, runner._2)
    if (props.isDefined) {
      for ((k, v) <- props.get) {
        ec.attributes(k) = v;
      }
    }
    try {
      ExecutionContextUtils.withContext(ec) {
        executable.execute(BodyLock.subScope(ec.runner.mainScope));
      }
    } finally {
      if (runner._1) {
        ScopeReuseManager.freeRunner(runner._2);
      }
    }
  }

  def runOutOfBand(executable: Executable, name: String,
                   props: Option[Map[String, Any]],
                   onFailure: Any => Unit) = {
    var ec: ExecutionContext = null;
    try {
      val runner = ScopeReuseManager.getRunner;
      val currentContext = ExecutionContextUtils.currentContext;
      val request =
        if (currentContext != null) {
          currentContext.request;
        } else {
          val fakeHeaders = scala.collection.JavaConversions.mapAsScalaMap(
            new java.util.HashMap[String, String]);
          fakeHeaders("Host") = "unknown.local";
          new RequestWrapper(HttpServletRequestFactory.createRequest(
              "/", JavaConversions.mutableMapAsJavaMap(fakeHeaders), "GET", null)) {
            override val isFake = true;
          }
        }
      val response =
        if (currentContext != null && currentContext.response != null) {
          new ResponseWrapper(currentContext.response.res);
        } else {
          new ResponseWrapper(null);
        }
      ec = new ExecutionContext(request, response, runner);
      if (props.isDefined)
        for ((k, v) <- props.get) {
          ec.attributes(k) = v;
        }
      Thread.currentThread().setName(name);
      execution.execute(ec,
                        (sc: Int, msg: String) => { println(name+" execution failed with error: "+sc+"\n"+msg); onFailure((sc, msg)); },
                        () => { },
                        () => { ScopeReuseManager.freeRunner(runner) },
                        Some(executable));
      if (ec.response != null && ec.response.getStatusCode() != 200) {
        println(name+" execution failed with non-200 response: "+ec.response.getStatusCode());
        onFailure((ec.response.getStatusCode, ec.response.getOutput()));
      }
      ec;
    } catch {
      case e: JSCompileException => {
        val r = ScopeReuseManager.getEmpty { r =>
          execution.syntaxErrorExecutable.execute(r.globalScope);
        }
        val ec = ExecutionContext(null, null, r);
//        r.globalScope.put("_appjetcontext_", r.globalScope, ec);
        ExecutionContextUtils.withContext(ec) {
          ec.attributes("error") = e;
          ec.result = execution.onSyntaxErrorExecutable.execute(r.globalScope);
          onFailure(e);
        }
        ec;
      }
      case e => {
        println(name+" execution failed with error."); onFailure(e); ec;
      }
    }
  }
}
