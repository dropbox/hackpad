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

object monitoring {

  def startMonitoringServer() {
    // remote JMX monitoring
    // see: http://java.sun.com/javase/6/docs/technotes/guides/management/agent.html

    import java.rmi.registry.LocateRegistry;
    import java.lang.management.ManagementFactory;
    import javax.management.ObjectName;
    import javax.management.remote.{JMXServiceURL, JMXConnectorServerFactory};
    
    def REGISTRY_PORT = config.listenMonitoringPrimaryPort;
    def SECONDARY_PORT = config.listenMonitoringSecondaryPort;
    System.setProperty("java.rmi.server.randomIDs", "true");
    
    // we must set 'java.rmi.server.hostname' to the host that the client machine
    // should connect to; in production, it will be the dashboard host, but the property
    // can also be specified on the command-line, in which case it takes precedence.
    var listenHost = config.listenMonitoringHost
    if (listenHost == null || listenHost.length == 0) listenHost = "localhost";
    if (System.getProperty("java.rmi.server.hostname") == null) {
      System.setProperty("java.rmi.server.hostname", listenHost);
    }
    else {
      listenHost = System.getProperty("java.rmi.server.hostname");
    }
    
    LocateRegistry.createRegistry(REGISTRY_PORT);
    val mbs = ManagementFactory.getPlatformMBeanServer();

    mbs.createMBean(classOf[JSExecutor].getName, new ObjectName("net.appjet:type=JSExecutor"));
    
    val env = new java.util.HashMap[String,Object]();
    //val csf = new javax.rmi.ssl.SslRMIClientSocketFactory();
    //val ssf = new javax.rmi.ssl.SslRMIServerSocketFactory();
    //env.put(javax.management.remote.rmi.RMIConnectorServer.RMI_CLIENT_SOCKET_FACTORY_ATTRIBUTE, csf);
    //env.put(javax.management.remote.rmi.RMIConnectorServer.RMI_SERVER_SOCKET_FACTORY_ATTRIBUTE, ssf);
    val PASSWORD_FILE_PATH = "data/jconsole-password.properties";
    val ACCESS_FILE_PATH = "data/jconsole-access.properties";
    def writeStringToFile(str: String, path: String) {
      val out = new java.io.PrintStream(new java.io.BufferedOutputStream(
	new java.io.FileOutputStream(path)));
      out.println(str);
      out.close;
    }
    if (! new java.io.File(PASSWORD_FILE_PATH).exists) {
      System.err.println("Creating "+PASSWORD_FILE_PATH+"...");
      writeStringToFile("appjet foo", PASSWORD_FILE_PATH);
    }
    if (! new java.io.File(ACCESS_FILE_PATH).exists) {
      System.err.println("Creating "+ACCESS_FILE_PATH+"...");
      writeStringToFile("appjet readwrite", ACCESS_FILE_PATH);
    }
    env.put("jmx.remote.x.password.file", PASSWORD_FILE_PATH);
    env.put("jmx.remote.x.access.file", ACCESS_FILE_PATH);
    val url = new JMXServiceURL(
      "service:jmx:rmi://localhost:"+SECONDARY_PORT+"/jndi/rmi://localhost:"+REGISTRY_PORT+"/server");
    try {
      val cs = JMXConnectorServerFactory.newJMXConnectorServer(url, env, mbs);
      cs.start();
      System.err.println("Monitor server listening on "+listenHost+":{"+REGISTRY_PORT+
	","+SECONDARY_PORT+"}");
    }
    catch {
      case e => {
	System.err.println("!!Could not start monitor server on "+listenHost+":{"+REGISTRY_PORT+
	  ","+SECONDARY_PORT+"} due to:");
	e.printStackTrace(System.err);
      }
    }
  }
  
}

trait JSExecutorMXBean {
  def executeJS(code: String): String;
}

class JSExecutor extends JSExecutorMXBean {
  import org.mozilla.javascript.{Context,ContextFactory,ContextAction};
  import org.mozilla.javascript.tools.ToolErrorReporter;
  import org.mozilla.javascript.tools.shell.{Global, ShellContextFactory};
  
  def executeJS(code: String): String = {
    val outStream = new java.io.ByteArrayOutputStream;
    val out = new java.io.PrintStream(outStream, true, "UTF-8");

    val contextFactory = new ShellContextFactory;
    try {
      contextFactory.call(new ContextAction { def run(cx: Context): Object = {
	val global = new Global(cx);
	global.setOut(out);
	global.setErr(out);
	val errorReporter = new ToolErrorReporter(false, global.getErr);
	val result = cx.evaluateString(global, code, "<script>", 1, null);
	out.println(Context.toString(result));
	null;
      } });
    }
    catch {
      case e => {
	e.printStackTrace(out);
      }
    }
    return new String(outStream.toByteArray, "UTF-8");
  }
}
