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

package net.appjet.ajstdlib;

import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.{ScheduledThreadPoolExecutor, Callable};
import scala.collection.mutable.{HashMap, SynchronizedMap};

import org.mozilla.javascript.{Context, ScriptableObject, Function, RhinoException, Scriptable};

import net.appjet.oui.{SpecialJarOrNotFile, DiskLibrary, FixedDiskLibrary, VariableDiskLibrary, ExecutionContext, ExecutionContextUtils, ScopeReuseManager, config, exceptionlog};
import net.appjet.bodylock.{BodyLock, ExecutionException};
import net.appjet.common.util.LenientFormatter;

import org.mortbay.jetty.nio.SelectChannelConnector;
import org.mortbay.util.ajax.ContinuationSupport;

object ajstdlib {
  def runModuleInNewScope(cx: ExecutionContext, moduleName: String): Any = {
    val newScope = BodyLock.subScope(cx.runner.globalScope);
    if (! libraryExists(moduleName))
      return Context.getUndefinedValue(); // unfortunately, returning "false" doesn't really do the right thing here.
    try {
      libraryExecutable(moduleName).execute(newScope);
    } catch {
      case e: ExecutionException => throw e;
      case e => throw new ExecutionException("Error occurred while running module: "+moduleName, e);
      // TODO: There was code here to print errors to the response if something didn't compile. Replace this code?
    }
    newScope;
  }

  private val modules = new HashMap[String, DiskLibrary] with SynchronizedMap[String, DiskLibrary];
  private def library(name: String) = modules.getOrElseUpdate(name+".js", new VariableDiskLibrary(name+".js"));
  private def libraryExists(name: String) = {
    val lib = library(name);
    // ScopeReuseManager.watch(lib);
    lib.exists;
  }
  private def libraryExecutable(name: String) = {
    val lib = library(name);
    // ScopeReuseManager.watch(lib);
    lib.executable;
  }

  val globalLock = new ReentrantLock();
  val attributes = new HashMap[String, Any] with SynchronizedMap[String, Any];

  def init() {
    // any other ajstdlib initialization goes here.
    Comet.init();
  }
}

object printf {
  def printf(format: String, list: Array[Object]): String = {
//     val list: Array[Object] = new Array[Object](argList.getLength)
//     for (i <- List.range(0, list.length))
//       list(i) = argList.getElement(i).getOrElse(null) match {
//         case AppVM.JSNumber(n) => n
//         case AppVM.JSString(s) => s
//         case AppVM.JSBoolean(b) => b
//         case _ => null
//       }
    val args = list.map(x => Context.jsToJava(x, classOf[Object]));
    try {
      val fmt = new LenientFormatter()
      fmt.format(format, args: _*)
      fmt.toString()
    } catch {
      case e: java.util.IllegalFormatException =>
        throw new ExecutionException("String Format Error: <tt>printf</tt> error: "+e.getMessage(), e)
    }
  }
}


import java.security.MessageDigest;

object md5 {
  def md5(input: String): String = {
    val bytes = input.getBytes("UTF-8");
    md5(bytes);
  }
  def md5(bytes: Array[Byte]): String = {
    var md = MessageDigest.getInstance("MD5");
    var digest = md.digest(bytes);
    var builder = new StringBuilder();
    for (b <- digest) {
      builder.append(Integer.toString((b >> 4) & 0xf, 16));
      builder.append(Integer.toString(b & 0xf, 16));
    }
    builder.toString();
  }
}

object execution {
  def runAsync(ec: ExecutionContext, f: Function) {
    ec.asyncs += f;
  }

  def executeCodeInNewScope(parentScope: Scriptable,
                            code: String, name: String,
                            startLine: Int): Scriptable = {
    val ec = ExecutionContextUtils.currentContext;
    val executable =
      try {
        BodyLock.compileString(code, name, startLine);
      } catch {
        case e: RhinoException =>
          throw new ExecutionException(
            "Failed to execute code in new scope.", e);
      }
    if (ec == null || ec.runner == null) {
      Thread.dumpStack();
    }
    val scope = BodyLock.subScope(
      if (parentScope != null) parentScope
      else ec.runner.mainScope);
    scope.setParentScope(ec.runner.mainScope);
    executable.execute(scope);
    scope;
  }

  def runTask(taskName: String, args: Array[Object]): AnyRef = {
    val ec = net.appjet.oui.execution.runOutOfBand(
      net.appjet.oui.execution.scheduledTaskExecutable,
      "Task "+taskName,
      Some(Map("taskName" -> taskName,
               "taskArguments" -> args)),
      { error =>
        error match {
          case e: Throwable => exceptionlog(e);
          case _ => exceptionlog(error.toString);
        }
      });
    ec.result;
  }

  def runTaskSimply(taskName: String, args: Array[Object]): AnyRef = {
    net.appjet.oui.execution.runOutOfBandSimply(
      net.appjet.oui.execution.scheduledTaskExecutable,
      Some(Map("taskName" -> taskName,
               "taskArguments" -> args)));
  }

  def wrapRunTask(taskName: String, args: Array[Object],
                  returnType: Class[_]): Function0[AnyRef] = {
    new Function0[AnyRef] {
      def apply = Context.jsToJava(runTaskSimply(taskName, args), returnType);
    }
  }

  val threadpools = new HashMap[String, ScheduledThreadPoolExecutor]
                      with SynchronizedMap[String, ScheduledThreadPoolExecutor];

  def createNamedTaskThreadPool(name: String, poolSize: Int) {
    threadpools.put(name, new ScheduledThreadPoolExecutor(poolSize));
  }

  class TaskRunner(val taskName: String, args: Array[Object]) extends Callable[AnyRef] {
    def call(): AnyRef = {
      runTask(taskName, args);
    }
  }

  def scheduleTaskInPool(poolName: String, taskName: String, delayMillis: Long, args: Array[Object]) = {
    val pool = threadpools.getOrElse(poolName, throw new RuntimeException("No such task threadpool: "+poolName));
    pool.schedule(new TaskRunner(taskName, args), delayMillis, java.util.concurrent.TimeUnit.MILLISECONDS);
  }

  def shutdownAndWaitOnTaskThreadPool(poolName: String, timeoutMillis: Long) = {
    val pool = threadpools.getOrElse(poolName, throw new RuntimeException("No such task threadpool: "+poolName));
    pool.shutdown();
    pool.awaitTermination(timeoutMillis, java.util.concurrent.TimeUnit.MILLISECONDS);
  }

  def getContinuation(ec: ExecutionContext) = {
    val req = ec.request.req;
    ContinuationSupport.getContinuation(req, req).asInstanceOf[SelectChannelConnector.RetryContinuation];
  }

  def sync[T](obj: AnyRef)(block: => T): T = {
    obj.synchronized {
      block;
    }
  }
}

import javax.mail._;
import javax.mail.internet._;
import java.util.Properties;

object email {
  def sendEmail(toAddr: Array[String], fromAddr: String, subject: String, headers: Scriptable, content: String, mimeType: String): String = {
    try {
      val badAddresses = for (a <- toAddr if (a.indexOf("@") == -1)) yield a;
      if (badAddresses.length > 0) {
        "The email address"+(if (badAddresses.length > 1) "es" else "")+" "+
        badAddresses.mkString("\"", "\", \"", "\"")+" do"+(if (badAddresses.length == 1) "es" else "")+
        " not appear to be valid.";
      } else {
        val debug = false;

        val props = new Properties;
        props.put("mail.smtp.host", config.smtpServerHost);
        props.put("mail.smtp.port", config.smtpServerPort.toString());
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.starttls.required", "true");
        if (config.smtpUser != "")
          props.put("mail.smtp.auth", "true");

        val session = Session.getInstance(props, if (config.smtpUser != "") new Authenticator {
          override def getPasswordAuthentication() =
            new PasswordAuthentication(config.smtpUser, config.smtpPass);
        } else null);
        session.setDebug(debug);

        val msg = new MimeMessage(session);
        val fromIAddr = new InternetAddress(fromAddr);
        msg.setFrom(fromIAddr);
        val toIAddr: Array[Address] = toAddr.map(x => (new InternetAddress(x))); // new InternetAddress(toAddr);
        msg.setRecipients(Message.RecipientType.TO, toIAddr);

        if (headers != null)
          for (o <- headers.getIds() if o.isInstanceOf[String]) {
            val k = o.asInstanceOf[String]
            msg.addHeader(k, headers.get(k, headers).asInstanceOf[String]);
          }

        msg.setSubject(subject);
        msg.setContent(content, mimeType);
        Transport.send(msg);
        "";
      }
    } catch {
      case e: MessagingException => { exceptionlog(e); e.printStackTrace() ; "Messaging exception: "+e.getMessage+"."; }
      case e: Exception => { exceptionlog(e); e.printStackTrace(); "Unknown error."; }
    }
  }
}
