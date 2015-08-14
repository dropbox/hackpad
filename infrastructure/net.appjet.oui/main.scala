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

import net.appjet.bodylock.{BodyLock, Executable};

import java.io.File;
import java.util.{Properties, Date};
import java.lang.annotation.Annotation;
import java.text.SimpleDateFormat;

import scala.collection.mutable.{HashMap, SynchronizedMap, HashSet};
import scala.collection.JavaConversions;

import org.mortbay.thread.QueuedThreadPool;
import org.mortbay.jetty.servlet.{Context, HashSessionIdManager, FilterHolder, ServletHolder};
import org.mortbay.jetty.handler.{HandlerCollection, RequestLogHandler, HandlerList};
import org.mortbay.jetty.{Server, NCSARequestLog, Request, Response, Handler};
import org.mortbay.servlet.GzipFilter;

// removed due to license restrictions; REMOVED_COS_OF_COS
// import com.oreilly.servlet.MultipartFilter;

import net.appjet.common.util.HttpServletRequestFactory;
import net.appjet.common.util.BetterFile;
import net.appjet.common.cli._;
import net.appjet.bodylock.JSCompileException;

import org.apache.solr.servlet.SolrDispatchFilter;

object main {
  val startTime = new java.util.Date();

  var lastTimeThreadPoolGrew = new java.util.Date();
  def maybeGrowThreadPool() {
    if (queuedThreadPool.getIdleThreads() == 0 && queuedThreadPool.getMaxThreads() < config.maxThreads) {
      val now = new java.util.Date();
      if (now.getTime() - lastTimeThreadPoolGrew.getTime() > config.maxThreadsIncrementDelay) {
        lastTimeThreadPoolGrew = now;
        queuedThreadPool.setMaxThreads(queuedThreadPool.getMaxThreads() + config.maxThreadsIncrementValue);
      }
    }
  }

  def quit(status: Int) {
    java.lang.Runtime.getRuntime().halt(status);
  }

  def setupFilesystem() {
    val logdir = new File(config.logDir+"/backend/access");
    if (! logdir.isDirectory())
      if (! logdir.mkdirs())
        quit(1);
  }

  val options =
    for (m <- config.allProperties if (m.getAnnotation(classOf[ConfigParam]) != null)) yield {
      val cp = m.getAnnotation(classOf[ConfigParam])
      new CliOption(m.getName(), cp.value(), if (cp.argName().length > 0) Some(cp.argName()) else None);
    }

  def printUsage() {
    println("\n--------------------------------------------------------------------------------");
    println("usage:");
    println((new CliParser(options)).usage);
    println("--------------------------------------------------------------------------------\n");
  }

  def extractOptions(args: Array[String]) {
    val parser = new CliParser(options);
    val opts =
      try {
        parser.parseOptions(args)._1;
      } catch {
        case e: ParseException => {
          println("error: "+e.getMessage());
          printUsage();
          System.exit(1);
          null;
        }
      }
    if (opts.contains("configFile")) {
      val p = new Properties();
      p.load(new java.io.FileInputStream(opts("configFile")));
      extractOptions(p);
    }
    for ((k, v) <- opts) {
      config.values(k) = v;
    }
  }

  def extractOptions(props: Properties) {
    for (k <- for (o <- JavaConversions.enumerationAsScalaIterator(props.propertyNames())) yield o.asInstanceOf[String]) {
      config.values(k) = props.getProperty(k);
    }
  }

  lazy val startupExecutable = (new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onstartup.js"))).executable;
  def runOnStartup() {
    execution.runOutOfBand(startupExecutable, "Startup", None, { error =>
      error match {
        case e: JSCompileException => { }
        case e: Throwable => { e.printStackTrace(); }
        case (sc: Int, msg: String) => { println(msg); }
        case x => println(x);
      }
      System.exit(1);
    });
  }

  lazy val shutdownExecutable = (new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "onshutdown.js"))).executable;
  def runOnShutdown() {
    execution.runOutOfBand(shutdownExecutable, "Shutdown", None, { error =>
      error match {
        case e: JSCompileException => { }
        case e: Throwable => { }
        case (sc: Int, msg: String) => { println(msg); }
        case x => println(x);
      }
    });
  }

  def runOnSars(q: String) = {
    val ec = execution.runOutOfBand(execution.sarsExecutable, "SARS", Some(Map("sarsRequest" -> q)), { error =>
      error match {
        case e: JSCompileException => { throw e; }
        case e: Throwable => { exceptionlog(e); throw e; }
        case (sc: Int, msg: String) => { println(msg); throw new RuntimeException(""+sc+": "+msg) }
        case x => { println(x); throw new RuntimeException(x.toString()) }
      }
    });
    ec.attributes.get("sarsResponse").map(_.toString());
  }

  def stfu() {
    System.setProperty("org.mortbay.log.class", "net.appjet.oui.STFULogger");
    System.setProperty("com.mchange.v2.log.MLog", "com.mchange.v2.log.FallbackMLog");
    System.setProperty("com.mchange.v2.log.FallbackMLog.DEFAULT_CUTOFF_LEVEL", "OFF");
  }
  var server: Server = null;
  var sarsServer: net.appjet.common.sars.SarsServer = null;
  var queuedThreadPool: QueuedThreadPool = null;

  var loggers = new HashSet[GenericLogger];
  def main(args: Array[String]) {
    val etherpadProperties = getClass.getResource("/etherpad.properties");
    if (etherpadProperties != null) {
      val p = new Properties();
      p.load(etherpadProperties.openStream);
      extractOptions(p);
    }
    extractOptions(args);

    if (! config.verbose)
      stfu();
    setupFilesystem();
    if (config.devMode)
      config.print;
    if (config.profile)
      profiler.start();
    if (config.listenMonitoring != "0:0")
      monitoring.startMonitoringServer();

    // this needs a better place.
    if (config.devMode)
      BodyLock.map = Some(new HashMap[String, String] with SynchronizedMap[String, String]);

    server = new Server();
    if (config.maxStartupThreads > 0)
      queuedThreadPool = new QueuedThreadPool(config.maxStartupThreads);
    else
      queuedThreadPool = new QueuedThreadPool();
    server.setThreadPool(queuedThreadPool);


    // set up socket connectors
    val nioconnector = new CometSelectChannelConnector;
    var sslconnector: CometSslSelectChannelConnector = null;

    nioconnector.setHeaderBufferSize(8192);

    nioconnector.setPort(config.listenPort);
    if (config.listenHost.length > 0)
      nioconnector.setHost(config.listenHost);
    if (config.listenSecurePort == 0) {
      server.setConnectors(Array(nioconnector));
    } else {
      sslconnector = new CometSslSelectChannelConnector;
      sslconnector.setPort(config.listenSecurePort);
      sslconnector.setHeaderBufferSize(8192);
      if (config.listenSecureHost.length > 0)
        sslconnector.setHost(config.listenSecureHost);
      if (! config.sslKeyStore_isSet) {
        val url = getClass.getResource("/mirror/snakeoil-ssl-cert");
        if (url != null)
          sslconnector.setKeystore(url.toString());
        else
          sslconnector.setKeystore(config.sslKeyStore);
      } else {
        sslconnector.setKeystore(config.sslKeyStore);
      }
      sslconnector.setPassword(config.sslStorePassword);
      sslconnector.setKeyPassword(config.sslKeyPassword);
      sslconnector.setTrustPassword(config.sslStorePassword);
      sslconnector.setExcludeCipherSuites(Array[String](
        "SSL_RSA_WITH_3DES_EDE_CBC_SHA",
        "SSL_DHE_RSA_WITH_DES_CBC_SHA",
        "SSL_DHE_DSS_WITH_DES_CBC_SHA",
        "SSL_DHE_RSA_WITH_3DES_EDE_CBC_SHA",
        "SSL_DHE_DSS_WITH_3DES_EDE_CBC_SHA",
        "SSL_RSA_WITH_DES_CBC_SHA",
        "SSL_RSA_EXPORT_WITH_RC4_40_MD5",
        "SSL_RSA_EXPORT_WITH_DES40_CBC_SHA",
        "SSL_DHE_RSA_EXPORT_WITH_DES40_CBC_SHA",
        "SSL_DHE_DSS_EXPORT_WITH_DES40_CBC_SHA",
        "SSL_RSA_WITH_NULL_MD5",
        "SSL_RSA_WITH_NULL_SHA",
        "SSL_DH_anon_WITH_3DES_EDE_CBC_SHA",
        "SSL_DH_anon_WITH_DES_CBC_SHA",
        "SSL_DH_anon_EXPORT_WITH_RC4_40_MD5",
        "SSL_DH_anon_EXPORT_WITH_DES40_CBC_SHA"));
      server.setConnectors(Array(nioconnector, sslconnector));
    }

    // set up Context and Servlet
    val handler = new Context(server, "/", Context.NO_SESSIONS | Context.NO_SECURITY);
    handler.addServlet(new ServletHolder(new OuiServlet), "/");

    // Solr
    val solrHolder = handler.addFilter(classOf[SolrDispatchFilter], "/solr/*", Handler.REQUEST);
    solrHolder.setInitParameter("solrconfig-filename", "solrconfig.xml");
    solrHolder.setInitParameter("path-prefix", "/solr");

//    removed due to license restrictions; REMOVED_COS_OF_COS

//    val filterHolder = new FilterHolder(new MultipartFilter());
//    filterHolder.setInitParameter("uploadDir", System.getProperty("java.io.tmpdir"));
//    handler.addFilter(filterHolder, "/*", 1);

    global.context = handler;
    //main.server.getThreadPool()

    // set up apache-style logging
    val requestLogHandler = new RequestLogHandler();
    val requestLog = new NCSARequestLog(config.logDir+"/backend/access/access-yyyy_mm_dd.request.log") {
      override def log(req: Request, res: Response) {
        try {
          if (config.devMode || config.specialDebug)
            super.log(req, res);
          else if (res.getStatus() != 200 || config.transportPrefix == null || ! req.getRequestURI().startsWith(config.transportPrefix))
            super.log(req, res);
          val d = new Date();
          appstats.stati.foreach(_(if (res.getStatus() < 0) 404 else res.getStatus()).hit(d));
        } catch {
          case e => { exceptionlog("Error writing to log?"); exceptionlog(e); }
        }
      }
    };
    requestLog.setRetainDays(365);
    requestLog.setAppend(true);
    requestLog.setExtended(true);
    requestLog.setLogServer(true);
    requestLog.setLogLatency(true);
    requestLog.setLogTimeZone("PST");
    requestLogHandler.setRequestLog(requestLog);

    // set handlers with server
    val businessHandlers = new HandlerList();
    businessHandlers.setHandlers(Array(handler));
    val allHandlers = new HandlerCollection();
    allHandlers.setHandlers(Array(businessHandlers, requestLogHandler));
    server.setHandler(allHandlers);

    // fix slow startup bug
    server.setSessionIdManager(new HashSessionIdManager(new java.util.Random()));

    // run the onStartup script.
    runOnStartup();

    // preload some runners, if necessary.
    if (config.preloadRunners > 0) {
      val b = new java.util.concurrent.CountDownLatch(config.preloadRunners);
      for (i <- 0 until config.preloadRunners)
        (new Thread {
          ScopeReuseManager.freeRunner(ScopeReuseManager.newRunner);
          b.countDown();
        }).start();
      while (b.getCount() > 0) {
        b.await();
      }
      println("Preloaded "+config.preloadRunners+" runners.");
    }

    // start SARS server.
    if (config.listenSarsPort > 0) {
      try {
        import net.appjet.common.sars._;
        sarsServer = new SarsServer(config.sarsAuthKey,
                                    new SarsMessageHandler { override def handle(q: String) = runOnSars(q) },
                                    if (config.listenSarsHost.length > 0) Some(config.listenSarsHost) else None,
                                    config.listenSarsPort);
        sarsServer.daemon = true;
        sarsServer.start();
      } catch {
        case e: java.net.SocketException => {
          println("SARS: A socket exception occurred: "+e.getMessage()+" on SARS server at "+config.listenSarsHost+":"+config.listenSarsPort);
          java.lang.Runtime.getRuntime().halt(1);
        }
      }
    }

    // start server
    java.lang.Runtime.getRuntime().addShutdownHook(new Thread() {
      override def run() {
  val df = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSSZ");
  def printts(str: String) {
    println("["+df.format(new Date())+"]: "+str);
  }
        printts("Shutting down...");
        handler.setShutdown(true);
        Thread.sleep(if (config.devMode) 500 else 3000);
        printts("...done, running onshutdown.");
        runOnShutdown();
        printts("...done, stopping server.");
        server.stop();
        server.join();
        printts("...done, flushing logs.");
        for (l <- loggers) { l.flush(); l.close(); }
        printts("...done.");
      }
    });

    def socketError(c: org.mortbay.jetty.Connector, e: java.net.SocketException) {
      var msg = e.getMessage();
      println("SOCKET ERROR: "+msg+" - "+(c match {
        case null => "(unknown socket)";
        case x => {
          (x.getHost() match {
            case null => "localhost";
            case y => y;
          })+":"+x.getPort();
        }
      }));
      if (msg.contains("Address already in use")) {
        println("Did you make sure that ports "+config.listenPort+" and "+config.listenSecurePort+" are not in use?");
      }
      if (msg.contains("Permission denied")) {
        println("Perhaps you need to run as the root user or as an Administrator?");
      }
    }

    var c: org.mortbay.jetty.Connector = null;

    try {
      c = nioconnector;
      c.open();
      if (sslconnector != null) {
        c = sslconnector;
        c.open();
      }
      c = null;
      allHandlers.start();
      server.start();
    } catch {
      case e: java.net.SocketException => {
        socketError(c, e);
        java.lang.Runtime.getRuntime().halt(1);
      }
      case e: org.mortbay.util.MultiException => {
        println("SERVER ERROR: Couldn't start server; multiple errors.");
        for (i <- JavaConversions.asScalaIterator(e.getThrowables.iterator())) {
          i match {
            case se: java.net.SocketException => {
              socketError(c, se);
            }
            case e =>
              println("SERVER ERROR: Couldn't start server: "+i.asInstanceOf[Throwable].getMessage());
          }
        }
        java.lang.Runtime.getRuntime().halt(1);
      }
      case e => {
        println("SERVER ERROR: Couldn't start server: "+e.getMessage());
        java.lang.Runtime.getRuntime().halt(1);
      }
    }

    println("HTTP server listening on http://"+
            (if (config.listenHost.length > 0) config.listenHost else "localhost")+
            ":"+config.listenPort+"/");
    if (config.listenSecurePort > 0)
      println("HTTPS server listening on https://"+
              (if (config.listenSecureHost.length > 0) config.listenSecureHost else "localhost")+
              ":"+config.listenSecurePort+"/");
    if (config.listenSarsPort > 0)
      println("SARS server listening on "+
              (if (config.listenSarsHost.length > 0) config.listenSarsHost else "localhost")+
              ":"+config.listenSarsPort);
  }
}
