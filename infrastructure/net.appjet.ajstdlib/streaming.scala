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

import scala.collection.mutable.{Queue, HashMap, SynchronizedMap, ArrayBuffer};
import scala.util.matching.Regex;
import scala.collection.JavaConversions._

import javax.servlet.http.{HttpServletRequest, HttpServletResponse, HttpServlet};
import org.mortbay.jetty.servlet.{ServletHolder, Context};
import org.mortbay.jetty.{HttpConnection, Handler, RetryRequest};
import org.mortbay.jetty.nio.SelectChannelConnector;
import org.mortbay.io.nio.SelectChannelEndPoint;
import org.mortbay.util.ajax.{ContinuationSupport, Continuation};

import java.util.{Timer, TimerTask};
import java.lang.ref.WeakReference;

import org.mozilla.javascript.{Context => JSContext, Scriptable};

import net.appjet.oui._;
import net.appjet.common.util.HttpServletRequestFactory;

trait SocketConnectionHandler {
  def message(sender: StreamingSocket, data: String, req: HttpServletRequest);
  def connect(socket: StreamingSocket, req: HttpServletRequest);
  def disconnect(socket: StreamingSocket, req: HttpServletRequest);
}

object SocketManager {
  val sockets = new HashMap[String, StreamingSocket] with SynchronizedMap[String, StreamingSocket];
  val handler = new SocketConnectionHandler {
    val cometLib = new FixedDiskLibrary(new SpecialJarOrNotFile(config.ajstdlibHome, "oncomet.js"));
    def cometExecutable = cometLib.executable;

    def message(socket: StreamingSocket, data: String, req: HttpServletRequest) {
      val t1 = profiler.time;
//      println("Message from: "+socket.id+": "+data);
      val runner = ScopeReuseManager.getRunner;
      val ec = ExecutionContext(new RequestWrapper(req), new ResponseWrapper(null), runner);
      ec.attributes("cometOperation") = "message";
      ec.attributes("cometId") = socket.id;
      ec.attributes("cometData") = data;
      ec.attributes("cometSocket") = socket;
      net.appjet.oui.execution.execute(
        ec,
        (sc: Int, msg: String) =>
          throw new HandlerException(sc, msg, null),
        () => {},
        () => { ScopeReuseManager.freeRunner(runner); },
				Some(cometExecutable));
      cometlatencies.register(((profiler.time-t1)/1000).toInt);
    }
    def connect(socket: StreamingSocket, req: HttpServletRequest) {
//      println("Connect on: "+socket);
      val runner = ScopeReuseManager.getRunner;
      val ec = ExecutionContext(new RequestWrapper(req), new ResponseWrapper(null), runner);
      ec.attributes("cometOperation") = "connect";
      ec.attributes("cometId") = socket.id;
      ec.attributes("cometSocket") = socket;
      net.appjet.oui.execution.execute(
        ec,
        (sc: Int, msg: String) =>
          throw new HandlerException(sc, msg, null),
        () => {},
        () => { ScopeReuseManager.freeRunner(runner); },
				Some(cometExecutable));
    }
    def disconnect(socket: StreamingSocket, req: HttpServletRequest) {
      val toRun = new Runnable {
        def run() {
      	  val runner = ScopeReuseManager.getRunner;
      	  val ec = ExecutionContext(new RequestWrapper(req), new ResponseWrapper(null), runner);
      	  ec.attributes("cometOperation") = "disconnect";
      	  ec.attributes("cometId") = socket.id;
      	  ec.attributes("cometSocket") = socket;
          net.appjet.oui.execution.execute(
            ec,
            (sc: Int, msg: String) =>
              throw new HandlerException(sc, msg, null),
            () => {},
            () => { ScopeReuseManager.freeRunner(runner); },
    				Some(cometExecutable));
      	}
      }
      main.server.getThreadPool().dispatch(toRun);
    }
  }
  def apply(id: String, create: Boolean) = {
    if (create) {
      val socket = Some(sockets.getOrElseUpdate(id, new StreamingSocket(id, handler)));
      socket.get.logCreate();
      socket;
    } else {
      if (id == null)
        error("bad id: "+id);
      sockets.get(id);
    }
  }
  class HandlerException(val sc: Int, val msg: String, val cause: Exception)
    extends RuntimeException("An error occurred while handling a request: "+sc+" - "+msg, cause);
}

// And this would be the javascript interface. Whee.
object Comet extends CometSupport.CometHandler {
  def init() {
    CometSupport.cometHandler = this;
    context.start();
  }

  val acceptableTransports = {
    val t = new ArrayBuffer[String];
    if (! config.disableShortPolling) {
      t += "shortpolling";
    }
    if (config.transportUseWildcardSubdomains) {
      t += "longpolling";
    }
    t += "streaming";
    t.mkString("['", "', '", "']");
  }


  val servlet = new StreamingSocketServlet();
  val holder = new ServletHolder(servlet);
  val context = new Context(null, "/", Context.NO_SESSIONS | Context.NO_SECURITY);
  context.addServlet(holder, "/*");
  context.setMaxFormContentSize(1024*1024);

  def handleCometRequest(req: HttpServletRequest, res: HttpServletResponse) {
    context.handle(req.getRequestURI().substring(config.transportPrefix.length), req, res, Handler.FORWARD);
  }

  lazy val ccLib = new FixedDiskResource(new JarOrNotFile(config.ajstdlibHome, "streaming-client.js") {
    override val classBase = "/net/appjet/ajstdlib/";
    override val fileSep = "/../../net.appjet.ajstdlib/";
  });
  def clientCode(contextPath: String, acceptableChannelTypes: String) = {
    ccLib.contents.replaceAll("%contextPath%", contextPath).replaceAll("\"%acceptableChannelTypes%\"", acceptableChannelTypes).replaceAll("\"%canUseSubdomains%\"", if (config.transportUseWildcardSubdomains) "true" else "false");
  }
  def clientMTime = ccLib.fileLastModified;

  lazy val ccFrame = new FixedDiskResource(new JarOrNotFile(config.ajstdlibHome, "streaming-iframe.html") {
    override val classBase = "/net/appjet/ajstdlib/";
    override val fileSep = "/../../net.appjet.ajstdlib/";
  });
  def frameCode = {
    if (! config.devMode)
      ccFrame.contents.replace("<head>\n<script type=\"text/javascript\">", """<head>
  <script type="text/javascript">
  window.onerror = function() { /* silently drop errors */ };
  </script>
  <script type="text/javascript">""");
    else
      ccFrame.contents;
  }


  // public
  def connections(ec: ExecutionContext): Scriptable = {
    JSContext.getCurrentContext().newArray(ec.runner.globalScope, SocketManager.sockets.keys.toList.toArray[Object]);
  }

  // public
  def connectionStatus = {
    val m = new HashMap[String, Int];
    for (socket <- SocketManager.sockets.values) {
      val key = socket.currentChannel.map(_.kind.toString()).getOrElse("(unconnected)");
      m(key) = m.getOrElse(key, 0) + 1;
    }
    m;
  }

  // public
  def getNumCurrentConnections = SocketManager.sockets.size;

  // public
  def write(id: String, msg: String) {
    SocketManager.sockets.get(id).foreach(_.sendMessage(false, msg));
  }

  // public
  def isConnected(id: String): java.lang.Boolean = {
    SocketManager.sockets.contains(id);
  }

  // public
  def getTransportType(id: String): String = {
    SocketManager.sockets.get(id).map(_.currentChannel.map(_.kind.toString()).getOrElse("none")).getOrElse("none");
  }

  // public
  def disconnect(id: String) {
    SocketManager.sockets.get(id).foreach(x => x.close());
  }

  // public
  def setAttribute(ec: ExecutionContext, id: String, key: String, value: String) {
    ec.attributes.get("cometSocket").map(x => Some(x.asInstanceOf[StreamingSocket])).getOrElse(SocketManager.sockets.get(id))
      .foreach(_.attributes(key) = value);
  }
  // public
  def getAttribute(ec: ExecutionContext, id: String, key: String): String = {
    ec.attributes.get("cometSocket").map(x => Some(x.asInstanceOf[StreamingSocket])).getOrElse(SocketManager.sockets.get(id))
      .map(_.attributes.getOrElse(key, null)).getOrElse(null);
  }

  // public
  def getClientCode(ec: ExecutionContext) = {
    clientCode(config.transportPrefix, acceptableTransports);
  }
  def getClientMTime(ec: ExecutionContext) = clientMTime;
}

class StreamingSocket(val id: String, handler: SocketConnectionHandler) {
  var hasConnected = false;
  var shutdown = false;
  var killed = false;
  var currentChannel: Option[Channel] = None;
  val activeChannels = new HashMap[ChannelType.Value, Channel]
                         with SynchronizedMap[ChannelType.Value, Channel];

  lazy val attributes = new HashMap[String, String] with SynchronizedMap[String, String];

  def channel(typ: String, create: Boolean, subType: String): Option[Channel] = {
    val channelType = ChannelType.withNameOpt(typ);
    if (channelType.isEmpty) {
      streaminglog(Map(
        "type" -> "error",
        "error" -> "unknown channel type",
        "channelType" -> channelType));
      None;
    } else if (create) {
      Some(activeChannels.getOrElseUpdate(channelType.get, Channels.createNew(channelType.get, this, subType)));
    } else {
      activeChannels.get(channelType.get);
    }
  }

  val outgoingMessageQueue = new Queue[SocketMessage];
  val unconfirmedMessages = new HashMap[Int, SocketMessage];

  var lastSentSeqNumber = 0;
  var lastConfirmedSeqNumber = 0;

  // external API
  def sendMessage(isControl: Boolean, body: String) {
    if (hasConnected && ! shutdown) {
      synchronized {
        lastSentSeqNumber += 1;
        val msg = new SocketMessage(lastSentSeqNumber, isControl, body);
        outgoingMessageQueue += msg;
        unconfirmedMessages(msg.seq) = msg;
      }
      currentChannel.foreach(_.messageWaiting());
    }
  }
  def close() {
    synchronized {
      sendMessage(true, "kill");
      shutdown = true;
      Channels.timer.schedule(new TimerTask {
        def run() {
          kill("server request, timeout");
        }
      }, 15000);
    }
  }

  var creatingRequest: Option[HttpServletRequest] = None;
  // internal API
  def kill(reason: String) {
    synchronized {
      if (! killed) {
        streaminglog(Map(
          "type" -> "event",
          "event" -> "connection-killed",
          "connection" -> id,
          "reason" -> reason));
        killed = true;
        SocketManager.sockets -= id;
        activeChannels.foreach(_._2.close());
        currentChannel = None;
        if (hasConnected) {
          handler.disconnect(this, creatingRequest.getOrElse(null));
        }
      }
    }
  }
  def receiveMessage(body: String, req: HttpServletRequest) {
//    println("Message received on "+id+": "+body);
    handler.message(this, body, req);
  }
  def getWaitingMessage(channel: Channel): Option[SocketMessage] = {
    synchronized {
      if (currentChannel.isDefined && currentChannel.get == channel &&
          ! outgoingMessageQueue.isEmpty) {
        Some(outgoingMessageQueue.dequeue);
      } else {
        None;
      }
    }
  }
  def getUnconfirmedMessages(channel: Channel): Iterable[SocketMessage] = {
    synchronized {
      for (i <- lastConfirmedSeqNumber+1 until lastSentSeqNumber+1)
        yield unconfirmedMessages(i);
    }
  }
  def updateConfirmedSeqNumber(channel: Channel, received: Int) {
    synchronized {
      if (received > lastConfirmedSeqNumber && (channel == null || (currentChannel.isDefined && channel == currentChannel.get))) {
        val oldConfirmed = lastConfirmedSeqNumber;
        lastConfirmedSeqNumber = received;
        for (i <- oldConfirmed+1 until lastConfirmedSeqNumber+1) { // inclusive!
          unconfirmedMessages -= i;
        }
      }
    }
  }

  var lastChannelUpdate = 0;
  def useChannel(seqNo: Int, channelType0: String, req: HttpServletRequest) = synchronized {
    if (seqNo <= lastChannelUpdate) false else {
      lastChannelUpdate = seqNo;
      val channelType = ChannelType.withNameOpt(channelType0);
      if (channelType.isDefined) {
        val channel = activeChannels.get(channelType.get);
        if (channel.isDefined) {
          if (! hasConnected) {
            hasConnected = true;
            creatingRequest = Some(HttpServletRequestFactory.createRequest(req));
            handler.connect(this, req);
          }
          currentChannel = channel;
//          println("switching "+id+" to channel: "+channelType0);
          if (currentChannel.get.isConnected) {
            revive(channel.get);
          } else {
            hiccup(channel.get);
          }
          currentChannel.get.messageWaiting();
          true;
        } else
          false;
      } else
        false;
    }
  }
//   def handleReceivedMessage(seq: Int, data: String) {
//     synchronized {
//       handler.message(this, data)
// //  TODO: add client->server sequence numbers.
// //      if (seq == lastReceivedSeqNumber+1){
// //        lastReceivedSeqNumber = seq;
// //        handler.message(this, data);
// //      } else {
// //        // handle error.
// //      }
//     }
//   }
  def hiccup(channel: Channel) = synchronized {
    if (currentChannel.isDefined && channel == currentChannel.get) {
//      println("hiccuping: "+id);
      scheduleTimeout();
    }
  }
  def revive(channel: Channel) = synchronized {
    if (currentChannel.isDefined && channel == currentChannel.get) {
//      println("reviving: "+id);
      cancelTimeout();
    }
  }
  def prepareForReconnect() = synchronized {
//    println("client-side hiccup: "+id);
    activeChannels.foreach(_._2.close());
    activeChannels.clear();
    currentChannel = None;
    scheduleTimeout();
  }

  // helpers
  var timeoutTask: TimerTask = null;

  def scheduleTimeout() {
    if (timeoutTask != null) return;
    val p = new WeakReference(this);
    timeoutTask = new TimerTask {
  	  def run() {
    	  val socket = p.get();
    	  if (socket != null) {
    	    socket.kill("timeout");
	      }
  	  }
  	}
  	Channels.timer.schedule(timeoutTask, 15*1000);
  }
  def cancelTimeout() {
    if (timeoutTask != null)
      timeoutTask.cancel();
    timeoutTask = null;
  }
  scheduleTimeout();

  def logCreate() {
    streaminglog(Map(
      "type" -> "event",
      "event" -> "connection-created",
      "connection" -> id));
  }
}

object ChannelType extends Enumeration() {
  // The Tuple(names) constructor on 'Enumeration' was deprecated in 2.10 and removed in 2.11, so define them here:
  val ShortPolling = Value("shortpolling")
  val LongPolling = Value("longpolling")
  val Streaming = Value("streaming")

  /* Enumeration.valueOf is deprecated in Scala 2.8, but the replacement (withName) is not suitable for the
   * case where we don't know if an Enumeration exists with the provided name */
  def withNameOpt(s: String): Option[ChannelType.Value] = values.find(_.toString == s)
}

object Channels {
  def createNew(typ: ChannelType.Value, socket: StreamingSocket, subType: String): Channel = {
    typ match {
      case ChannelType.ShortPolling => new ShortPollingChannel(socket);
      case ChannelType.LongPolling => new LongPollingChannel(socket);
      case ChannelType.Streaming => {
        subType match {
          case "iframe" => new StreamingChannel(socket) with IFrameChannel;
          case "opera" => new StreamingChannel(socket) with OperaChannel;
          case _ => new StreamingChannel(socket);
        }
      }
    }
  }

  val timer = new Timer(true);
}

class SocketMessage(val seq: Int, val isControl: Boolean, val body: String) {
  def payload = seq+":"+(if (isControl) "1" else "0")+":"+body;
}

trait Channel {
  def messageWaiting();
  def close();
  def handle(req: HttpServletRequest, res: HttpServletResponse);
  def isConnected: Boolean;

  def kind: ChannelType.Value;
  def sendRestartFailure(ec: ExecutionContext);
}

trait XhrChannel extends Channel {
  def wrapBody(msg: String) = msg.length+":"+msg;

  // wire format: msgLength:seq:[01]:msg
  def wireFormat(msg: SocketMessage) = wrapBody(msg.payload);
  def controlMessage(data: String) = wrapBody("oob:"+data);

  def sendRestartFailure(ec: ExecutionContext) {
    ec.response.write(controlMessage("restart-fail"));
  }
}

// trait IFrameChannel extends Channel {
//   def wireFormat(msg: SocketMessage)
// }

class ShortPollingChannel(val socket: StreamingSocket) extends Channel with XhrChannel {
  def kind = ChannelType.ShortPolling;

  def messageWaiting() {
    // do nothing.
  }
  def close() {
    // do nothing
  }
  def isConnected = false;

  def handle(req: HttpServletRequest, res: HttpServletResponse) {
    val ec = req.getAttribute("executionContext").asInstanceOf[ExecutionContext];

    res.setContentType("text/html; charset=utf-8");

    val out = new StringBuilder();
    socket.synchronized {
      socket.revive(this);
      if (req.getParameter("new") == "yes") {
        out.append(controlMessage("ok"));
      } else {
        val lastReceivedSeq = java.lang.Integer.parseInt(req.getParameter("seq"));
        socket.updateConfirmedSeqNumber(this, lastReceivedSeq);
        for (msg <- socket.getUnconfirmedMessages(this)) {
          out.append(wireFormat(msg));
        }
        // ALL MESSAGES ARE UNCONFIRMED AT THIS POINT! JUST CLEAR QUEUE.
        var msg = socket.getWaitingMessage(this);
        while (msg.isDefined) {
          msg = socket.getWaitingMessage(this);
        }
      }
    }
//    println("Writing to "+socket.id+": "+out.toString);
    ec.response.write(out.toString);
    socket.synchronized {
      socket.hiccup(this);
    }
  }
}

trait IFrameChannel extends StreamingChannel {
  override def wrapBody(msgBody: String) = {
    val txt = "<script type=\"text/javascript\">p('"+
        msgBody.replace("\\","\\\\").replace("'", "\\'")+"');</script>";
    if (txt.length < 256)
      String.format("%256s", txt);
    else
      txt;
  }

  def header(req: HttpServletRequest) = {
    val document_domain =
        "\""+req.getHeader("Host").split("\\.").take(2).mkString(".").split(":")(0)+"\"";
    """<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"
"http://www.w3.org/TR/html4/strict.dtd">
<html><head><title>f</title></head><body id="thebody" onload="(!parent.closed)&&d()"><script type="text/javascript">document.domain = """+document_domain+""";
var p = function(data) { try { parent.comet.pass_data } catch (err) { /* failed to pass data. no recourse. */ } };
var d = parent.comet.disconnect;"""+(if(!config.devMode)"\nwindow.onerror = function() { /* silently drop errors */ };\n" else "")+"</script>"; // " - damn textmate mode!
  }

  override def sendRestartFailure(ec: ExecutionContext) {
    ec.response.write(header(ec.request.req));
    ec.response.write(controlMessage("restart-fail"));
  }

  override def handleNewConnection(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    super.handleNewConnection(req, res, out);
    res.setContentType("text/html; charset=utf-8");
    out.append(header(req));
  }
}

trait OperaChannel extends StreamingChannel {
  override def wrapBody(msgBody: String) = {
    "Event: message\ndata: "+msgBody+"\n\n";
  }
  override def handleNewConnection(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    super.handleNewConnection(req, res, out);
    res.setContentType("application/x-dom-event-stream");
  }
}

class StreamingChannel(val socket: StreamingSocket) extends Channel with XhrChannel {
  def kind = ChannelType.Streaming;

  var c: Option[SelectChannelConnector.RetryContinuation] = None;
  var doClose = false;

  def messageWaiting() {
    main.server.getThreadPool().dispatch(new Runnable() {
      def run() {
        socket.synchronized {
          c.filter(_.isPending()).foreach(_.resume());
        }
      }
    });
  }

  def setSequenceNumberIfAppropriate(req: HttpServletRequest) {
    if (c.get.isNew) {
      val lastReceivedSeq = java.lang.Integer.parseInt(req.getParameter("seq"));
      socket.updateConfirmedSeqNumber(this, lastReceivedSeq);
    }
  }

  def sendHandshake(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    out.append(controlMessage("ok"));
  }

  def sendUnconfirmedMessages(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    for (msg <- socket.getUnconfirmedMessages(this)) {
      out.append(wireFormat(msg));
    }
  }

  def sendWaitingMessages(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    var msg = socket.getWaitingMessage(this);
    while (msg.isDefined) {
      out.append(wireFormat(msg.get));
      msg = socket.getWaitingMessage(this);
    }
  }

  def handleUnexpectedDisconnect(req: HttpServletRequest, res: HttpServletResponse, ep: KnowsAboutDispatch) {
    socket.synchronized {
      socket.hiccup(this);
    }
    ep.close();
  }

  def writeAndFlush(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder, ep: KnowsAboutDispatch) {
//    println("Writing to "+socket.id+": "+out.toString);
    res.getWriter.print(out.toString);
    res.getWriter.flush();
  }

  def suspendIfNecessary(req: HttpServletRequest, res: HttpServletResponse,
                         out: StringBuilder, ep: KnowsAboutDispatch) {
    scheduleKeepalive(50*1000);
    ep.undispatch();
    c.get.suspend(0);
  }

  def sendKeepaliveIfNecessary(out: StringBuilder, sendKeepalive: Boolean) {
    if (out.length == 0 && sendKeepalive) {
      out.append(controlMessage("keepalive"));
    }
  }

  def shouldHandshake(req: HttpServletRequest, res: HttpServletResponse) = c.get.isNew;

  var sendKeepalive = false;
  var keepaliveTask: TimerTask = null;
  def scheduleKeepalive(timeout: Int) {
    if (keepaliveTask != null) {
      keepaliveTask.cancel();
    }
    val p = new WeakReference(this);
    keepaliveTask = new TimerTask {
  	  def run() {
    	  val channel = p.get();
    	  if (channel != null) {
    	    channel.synchronized {
      	    channel.sendKeepalive = true;
      	    channel.messageWaiting();
          }
	      }
  	  }
  	}
    Channels.timer.schedule(keepaliveTask, timeout);
  }

  def handleNewConnection(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    req.setAttribute("StreamingSocketServlet_channel", this);
    res.setHeader("Connection", "close");
    for ((k, v) <- Util.noCacheHeaders) { res.setHeader(k, v); } // maybe this will help with proxies?
    res.setContentType("text/messages; charset=utf-8");
  }

  def handle(req: HttpServletRequest, res: HttpServletResponse) {
    val ec = req.getAttribute("executionContext").asInstanceOf[ExecutionContext];
    val ep = HttpConnection.getCurrentConnection.getEndPoint.asInstanceOf[KnowsAboutDispatch];
    val out = new StringBuilder;
    try {
      socket.synchronized {
        val sendKeepaliveNow = sendKeepalive;
        sendKeepalive = false;
        if (keepaliveTask != null) {
          keepaliveTask.cancel();
          keepaliveTask = null;
        }
        c = Some(ContinuationSupport.getContinuation(req, socket).asInstanceOf[SelectChannelConnector.RetryContinuation]);
        setSequenceNumberIfAppropriate(req);
        if (doClose) {
          ep.close();
          return;
        }
        if (c.get.isNew) {
          handleNewConnection(req, res, out);
        } else {
          c.get.suspend(-1);
          if (ep.isDispatched) {
            handleUnexpectedDisconnect(req, res, ep);
            return;
          }
        }
        if (shouldHandshake(req, res)) {
//        println("new stream request: "+socket.id);
          sendHandshake(req, res, out);
          sendUnconfirmedMessages(req, res, out);
        }
        sendWaitingMessages(req, res, out);
        sendKeepaliveIfNecessary(out, sendKeepaliveNow);
        suspendIfNecessary(req, res, out, ep);
      }
    } finally {
      writeAndFlush(req, res, out, ep);
    }
  }

  def close() {
    doClose = true;
    messageWaiting();
  }

  def isConnected = ! doClose;
}

class LongPollingChannel(socket: StreamingSocket) extends StreamingChannel(socket) {
//  println("creating longpoll!");
  override def kind = ChannelType.LongPolling;

  override def shouldHandshake(req: HttpServletRequest, res: HttpServletResponse) =
    req.getParameter("new") == "yes";

  override def sendHandshake(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
//    println("sending handshake");
    out.append(controlMessage("ok"));
  }

  override def suspendIfNecessary(req: HttpServletRequest, res: HttpServletResponse,
                                  out: StringBuilder, ep: KnowsAboutDispatch) {
    if (out.length == 0) {
//      println("suspending longpoll: "+socket.id);
      val to = java.lang.Integer.parseInt(req.getParameter("timeout"));
//      println("LongPoll scheduling keepalive for: "+to);
      scheduleKeepalive(to);
      ep.undispatch();
      c.get.suspend(0);
    }
  }

  override def writeAndFlush(req: HttpServletRequest, res: HttpServletResponse,
                             out: StringBuilder, ep: KnowsAboutDispatch) {
    if (out.length > 0) {
//      println("Writing to "+socket.id+": "+out.toString);
//      println("writing and flushing longpoll")
      val ec = req.getAttribute("executionContext").asInstanceOf[ExecutionContext];
      for ((k, v) <- Util.noCacheHeaders) { ec.response.setHeader(k, v); } // maybe this will help with proxies?
//      println("writing: "+out);
      ec.response.write(out.toString);
      socket.synchronized {
        socket.hiccup(this);
        c = None;
      }
    }
  }

  override def handleNewConnection(req: HttpServletRequest, res: HttpServletResponse, out: StringBuilder) {
    socket.revive(this);
    req.setAttribute("StreamingSocketServlet_channel", this);
    res.setContentType("text/html; charset=utf-8");
  }

  override def isConnected = socket.synchronized {
    c.isDefined;
  }
}

class StreamingSocketServlet extends HttpServlet {
  val version = 2;

  override def doGet(req: HttpServletRequest, res: HttpServletResponse) {
    //describeRequest(req);

    val ec = req.getAttribute("executionContext").asInstanceOf[ExecutionContext];

    val CometHostname = new Regex("""\d+comet\.(.*)""");
    val CometSubdomainHostname = new Regex("""\d+comet([^\.]*)\.(.*)""");
    if (CometHostname.pattern.matcher(req.getServerName()).matches) {
      val scheme = if (req.getHeader("X-Scheme") != null) {
        req.getHeader("X-Scheme");
      } else {
        req.getScheme();
      }
      val CometHostname(host) = req.getServerName();
      val port = req.getServerPort();
      val portSuffix = if (port == 80) {
         "";
      } else {
          ":" + port;
      }
      res.setHeader("Access-Control-Allow-Origin", scheme + "://" + host + portSuffix);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else if (CometSubdomainHostname.pattern.matcher(req.getServerName()).matches) {
      val scheme = if (req.getHeader("X-Scheme") != null) {
        req.getHeader("X-Scheme");
      } else {
        req.getScheme();
      }
      val CometSubdomainHostname(subdomain, host) = req.getServerName();
      val port = req.getServerPort();
      val portSuffix = if (port == 80) {
         "";
      } else {
          ":" + port;
      }
      res.setHeader("Access-Control-Allow-Origin", scheme + "://" + subdomain + "." + host + portSuffix);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    try {
      if (req.getPathInfo() == "/js/client.js") {
        val contextPath = config.transportPrefix;
        val acceptableTransports = Comet.acceptableTransports;
        ec.response.setContentType("application/x-javascript");
        ec.response.write(Comet.clientCode(contextPath, acceptableTransports));
      } else if (req.getPathInfo() == "/xhrXdFrame") {
        ec.response.setContentType("text/html; charset=utf-8");
        ec.response.write(Comet.frameCode);
      } else {
        val v = req.getParameter("v");
        if (v == null || java.lang.Integer.parseInt(v) != version) {
          res.sendError(HttpServletResponse.SC_BAD_REQUEST, "bad version number!");
          return;
        }
        val existingChannel = req.getAttribute("StreamingSocketServlet_channel");
        if (existingChannel != null) {
          existingChannel.asInstanceOf[Channel].handle(req, res);
        } else {
          val socketId = req.getParameter("id");
          val channelType = req.getParameter("channel");
          val isNew = req.getParameter("new") == "yes";
          val shouldCreateSocket = req.getParameter("create") == "yes";
          val subType = req.getParameter("type");
          val channel = SocketManager(socketId, shouldCreateSocket).map(_.channel(channelType, isNew, subType)).getOrElse(None);
          if (channel.isDefined) {
            channel.get.handle(req, res);
          } else {
            streaminglog(Map(
              "type" -> "event",
              "event" -> "restart-failure",
              "connection" -> socketId));
            val failureChannel = ChannelType.withNameOpt(channelType).map(Channels.createNew(_, null, subType));
            if (failureChannel.isDefined) {
              failureChannel.get.sendRestartFailure(ec);
            } else {
              ec.response.setStatusCode(HttpServletResponse.SC_NOT_FOUND);
              ec.response.write("No such socket, and/or unknown channel type");
            }
          }
        }
      }
    } catch {
      case e: RetryRequest => throw e;
      case t: Throwable => {
        exceptionlog("A comet error occurred: ");
        exceptionlog(t);
        ec.response.setStatusCode(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        ec.response.write(t.getMessage());
      }
    }
  }

  def describeRequest(req: HttpServletRequest) {
    println(req.getMethod+" on "+req.getRequestURI()+"?"+req.getQueryString());
    for (pname <-
        req.getParameterNames.asInstanceOf[java.util.Enumeration[String]]) {
      println("  "+pname+" -> "+req.getParameterValues(pname).mkString("[", ",", "]"));
    }
  }

  override def doPost(req: HttpServletRequest, res: HttpServletResponse) {
    val v = req.getParameter("v");
    if (v == null || java.lang.Integer.parseInt(v) != version) {
      res.sendError(HttpServletResponse.SC_BAD_REQUEST, "bad version number!");
      return;
    }
    val ec = req.getAttribute("executionContext").asInstanceOf[ExecutionContext];
    val socketId = req.getParameter("id");
    val socket = SocketManager(socketId, false);

//    describeRequest(req);

    if (socket.isEmpty) {
      ec.response.write("restart-fail");
      streaminglog(Map(
        "type" -> "event",
        "event" -> "restart-failure",
        "connection" -> socketId));
//      println("socket restart-fail: "+socketId);
    } else {
      val seq = java.lang.Integer.parseInt(req.getParameter("seq"));
      socket.get.updateConfirmedSeqNumber(null, seq);
      val messages = req.getParameterValues("m");
      val controlMessages = req.getParameterValues("oob");
      try {
        if (messages != null)
          for (msg <- messages) socket.get.receiveMessage(msg, req);
        if (controlMessages != null)
          for (msg <- controlMessages) {
//            println("Control message from "+socket.get.id+": "+msg);
            msg match {
              case "hiccup" => {
                streaminglog(Map(
                  "type" -> "event",
                  "event" -> "hiccup",
                  "connection" -> socketId));
                socket.get.prepareForReconnect();
              }
              case _ => {
                if (msg.startsWith("useChannel")) {
                  val msgParts = msg.split(":");
                  socket.get.useChannel(java.lang.Integer.parseInt(msgParts(1)), msgParts(2), req);
                } else if (msg.startsWith("kill")) {
                  socket.get.kill("client request: "+msg.substring(math.min(msg.length, "kill:".length)));
                } else {
                  streaminglog(Map(
                    "type" -> "error",
                    "error" -> "unknown control message",
                    "connection" -> socketId,
                    "message" -> msg));
                }
              }
            }
          }
        ec.response.write("ok");
      } catch {
        case e: SocketManager.HandlerException => {
          exceptionlog(e);
          ec.response.setStatusCode(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
          ec.response.write(e.getMessage());
          // log these?
        }
        case t: Throwable => {
          // shouldn't happen...
          exceptionlog(t);
          ec.response.setStatusCode(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
          ec.response.write(t.getMessage());
        }
      }
    }
  }
}
