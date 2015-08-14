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

package net.appjet.common.sars;

import scala.collection.mutable.HashSet;
import java.net.{Socket, ServerSocket, InetSocketAddress, SocketException};
import java.io.{DataInputStream, DataOutputStream, IOException}
import java.util.concurrent.atomic.AtomicBoolean;

trait SarsMessageHandler {
  def handle(s: String): Option[String] = None;
  def handle(b: Array[Byte]): Option[Array[Byte]] = None;
}

class SarsException(m: String) extends RuntimeException(m);
class ChannelClosedUnexpectedlyException extends SarsException("Sars channel closed unexpectedly.");
class BadAuthKeyException extends SarsException("Sars authKey not accepted.");
class NotAuthenticatedException extends SarsException("Sars must authenticate before sending message.");
class UnknownTypeException(t: String) extends SarsException("Sars type unknown: "+t);

private[sars] trait SarsMessageReaderWriter {
  def byteArray = 1;
  def utf8String = 2;

  def inputStream: DataInputStream;
  def outputStream: DataOutputStream;

  def readMessage: Option[Any] = {
    val messageType = inputStream.readInt;
    if (messageType == byteArray) {
      try {
        val len = inputStream.readInt;
        val bytes = new Array[Byte](len);
        inputStream.readFully(bytes);
        Some(bytes);
      } catch {
        case ioe: IOException => None;
      }
    } else if (messageType == utf8String) {
      try {
        Some(inputStream.readUTF);
      } catch {
        case ioe: IOException => None;
      }
    } else {
      throw new UnknownTypeException("type "+messageType);
    }
  }
  def readString: Option[String] = {
    val m = readMessage;
    m.filter(_.isInstanceOf[String]).asInstanceOf[Option[String]];
  }
  def readBytes: Option[Array[Byte]] = {
    val m = readMessage;
    m.filter(_.isInstanceOf[Array[Byte]]).asInstanceOf[Option[Array[Byte]]];
  }
  def writeMessage(bytes: Array[Byte]) {
    outputStream.writeInt(byteArray);
    outputStream.writeInt(bytes.length);
    outputStream.write(bytes);
  }
  def writeMessage(string: String) {
    outputStream.writeInt(utf8String);
    outputStream.writeUTF(string);
  }
}

class SarsClient(authKey: String, host: String, port: Int) {
  
  class SarsClientHandler(s: Socket) {
    val readerWriter = new SarsMessageReaderWriter {
      val inputStream = new DataInputStream(s.getInputStream());
      val outputStream = new DataOutputStream(s.getOutputStream());
    }
    var authenticated = false;

    def auth() {
      val challenge = readerWriter.readString;
      if (challenge.isEmpty) { 
        throw new ChannelClosedUnexpectedlyException;
      }
      readerWriter.writeMessage(SimpleSHA1(authKey+challenge.get));
      val res = readerWriter.readString;
      if (res.isEmpty || res.get != "ok") {
        println(res.get);
        throw new BadAuthKeyException;
      }
      authenticated = true;
    }

    def message[T](q: T, writer: T => Unit, reader: Unit => Option[T]): T = {
      if (! authenticated) {
        throw new NotAuthenticatedException;
      }
      try {
        writer(q);
        val res = reader();
        if (res.isEmpty) {
          throw new ChannelClosedUnexpectedlyException;
        }
        res.get;
      } catch {
        case e => { 
          if (! s.isClosed()) {
            s.close();
          }
          throw e; 
        }
      }
    }
    
    def message(s: String): String =
      message[String](s, readerWriter.writeMessage, Unit => readerWriter.readString);
    
    def message(b: Array[Byte]): Array[Byte] = 
      message[Array[Byte]](b, readerWriter.writeMessage, Unit => readerWriter.readBytes);

    def close() {
      if (! s.isClosed) {
        s.close();
      }
    }
  }

  var socket: Socket = null;
  var connectTimeout = 0;
  var readTimeout = 0;
  
  def setConnectTimeout(timeout: Int) {
    connectTimeout = timeout;
  }
  def setReadTimeout(timeout: Int) {
    readTimeout = timeout;
  }
  
  var client: SarsClientHandler = null;
  def connect() {
    if (socket != null && ! socket.isClosed) {
      socket.close();
    }
    socket = new Socket();
    socket.connect(new InetSocketAddress(host, port), connectTimeout);
    socket.setSoTimeout(readTimeout);
    client = new SarsClientHandler(socket);
    client.auth();
  }

  def message(q: String) = {
    if (! socket.isConnected || socket.isClosed) {
      connect();
    }
    client.message(q);
  }
  
  def message(b: Array[Byte]) = {
    if (! socket.isConnected || socket.isClosed) {
      connect();
    }
    client.message(b);
  }

  def close() {
    if (client != null) {
      client.close();
    }
  }
}   
      
class SarsServer(authKey: String, handler: SarsMessageHandler, host: Option[String], port: Int) {

  // handles a single client.
  class SarsServerHandler(cs: Socket) extends Runnable {
    var thread: Thread = null;
    var running = new AtomicBoolean(false);
    
    def run() {
      try {
        thread = Thread.currentThread();
        if (running.compareAndSet(false, true)) {
          val readerWriter = new SarsMessageReaderWriter {
            val inputStream = new DataInputStream(cs.getInputStream());
            val outputStream = new DataOutputStream(cs.getOutputStream());
          }
          val challenge = math.random*1e20;

          readerWriter.writeMessage(String.valueOf(challenge));
          val res = readerWriter.readString;
          if (res.isEmpty || res.get != SimpleSHA1(authKey+challenge)) {
            readerWriter.writeMessage("invalid key");
          } else {
            readerWriter.writeMessage("ok");
            while (running.get()) {
              val q = readerWriter.readMessage;
              if (q.isEmpty) {
                running.set(false);
              } else {
                q.get match {
                  case s: String => readerWriter.writeMessage(handler.handle(s).getOrElse(""));
                  case b: Array[Byte] => 
                    readerWriter.writeMessage(handler.handle(b).getOrElse(new Array[Byte](0)));
                  case x: AnyRef => throw new UnknownTypeException(x.getClass.getName);
                }
              }
            }
          }
        }
      } catch {
        case e => { }
      } finally {
        cs.close();
      }
    }

    def stop() {
      if (running.compareAndSet(true, false)) {
        thread.interrupt();
      }
    }
  }

  val ss = new ServerSocket(port);
  if (host.isDefined) {
    ss.bind(InetSocketAddress.createUnresolved(host.get, port));
  }
  var running = new AtomicBoolean(false);
  var hasRun = false;
  var serverThread: Thread = null;
  val clients = new HashSet[SarsServerHandler];
  var daemon = false;
  val server = this;

  def start() {
    if (hasRun)
      throw new RuntimeException("Can't reuse server.");
    hasRun = true;
    if (running.compareAndSet(false, true)) {
      serverThread = new Thread() {
        override def run() {
          while(running.get()) {
            val cs = try {
              ss.accept();
            } catch {
              case e: SocketException => { 
                if (running.get()) {
                  println("socket exception.");
                  e.printStackTrace();
                  if (! ss.isClosed) {
                    ss.close();
                  }
                  return;
                } else { // was closed by user.
                  return;
                }
              }
              case e: IOException => { 
                println("i/o error");
                e.printStackTrace();
                ss.close();
                return;
              }
            }
            val client = new SarsServerHandler(cs);
            server.synchronized {
              clients += client;
            }
            (new Thread(client)).start();
          }
        }
      }
      if (daemon)
        serverThread.setDaemon(true);
      serverThread.start();
    } else {
      throw new RuntimeException("WTF, fool? Server's running already.");
    }
  }

  def stop() {
    if (running.compareAndSet(true, false)) {
      if (! ss.isClosed) {
        ss.close();
      }
      server.synchronized {
        for (client <- clients) {
          client.stop();
        }
      }
    } else {
      throw new RuntimeException("Not running.");
    }
  }

  def join() {
    serverThread.join();
  }
}

object test {
  def main(args: Array[String]) { 
    val handler = new SarsMessageHandler {
      override def handle(s: String) = {
        println("SERVER: "+s);
        if (s == "hello!") {
          Some("hey there.");
        } else {
          None;
        }
      }
      override def handle(b: Array[Byte]) = {
        var actually = new String(b, "UTF-8");
        println("SERVER: "+actually);
        if (actually == "hello!") {
          Some("hey there.".getBytes("UTF-8"));
        } else {
          None;
        }
      }
    }

    val server = new SarsServer("nopassword", handler, None, 9001);
    server.start();

    val client = new SarsClient("nopassword", "localhost", 9001);
    client.connect();
    println("CLIENT: "+client.message("hello!"));
    println("CLIENT: "+client.message("goodbye!"));
    println("CLIENT: "+new String(client.message("hello!".getBytes("UTF-8")), "UTF-8"));
    println("CLIENT: "+new String(client.message("goodbye!".getBytes("UTF-8")), "UTF-8"));
    client.close();
    server.stop();
    server.join();
    println("done.");
  }
}  
