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

package com.etherpad.openofficeservice;

import net.appjet.common.sars.{SarsServer,SarsMessageHandler};

import java.io.{DataInputStream,DataOutputStream};
import java.io.{File,FileOutputStream,ByteArrayInputStream,ByteArrayOutputStream};

/* Libraries needed for OO.org Conversion */
import com.sun.star.bridge.{XBridge,XBridgeFactory};
import com.sun.star.beans.{PropertyValue,XPropertySet};
import com.sun.star.connection.{NoConnectException,XConnection,XConnector};
import com.sun.star.container.XNamed;
import com.sun.star.document.{XExporter,XFilter};
import com.sun.star.frame.{XComponentLoader,XStorable};
import com.sun.star.lang.{XComponent,XMultiComponentFactory};
import com.sun.star.uno.{UnoRuntime,XComponentContext};

class OOSException(m: String) extends RuntimeException(m);
class UnsupportedFormatException(format: String) extends OOSException("Unsupported format: "+format);
object TemporaryFailure extends OOSException("Temporary failure");

object OpenOfficeServerUtility {
  def checkServerAvailability(host: String, port: Int): Boolean = {
    // Assume the server is running; this is the responsibility of the user
    return true;
  }
  def runOpenOfficeServer(path: String, host: String, port: Int, timeout: Int, wait: Boolean) {
    // nothing
  }
}

class OpenOfficeFileConverter {
  var host: String = "localhost";
  var port: Int = 8100;

  def setOpenOfficeServerDetails(host: String, port: Int) {
    this.host = host;
    this.port = port;
  }
  
  def convertFile(src: File, dst: File, converter: String, extension: String): Boolean = {
    try {
      val fromFile: String = "file:///" + src.getAbsolutePath();
      val toFile: String = "file:///" + dst.getAbsolutePath();

      val cnx: String = "socket,host="+this.host+",port="+this.port+"";
      val xRemoteContext: XComponentContext  = com.sun.star.comp.helper.Bootstrap.createInitialComponentContext(null);
      val x: Object = xRemoteContext.getServiceManager().createInstanceWithContext("com.sun.star.connection.Connector", xRemoteContext);
      val xConnector: XConnector  = UnoRuntime.queryInterface(classOf[XConnector], x).asInstanceOf[XConnector];
      val connection: XConnection  = xConnector.connect(cnx);

      if(connection == null) {
        throw new OOSException("Connection failure");
      }
      val x2: Object = xRemoteContext.getServiceManager().createInstanceWithContext("com.sun.star.bridge.BridgeFactory", xRemoteContext);
      val xBridgeFactory: XBridgeFactory = UnoRuntime.queryInterface(classOf[XBridgeFactory], x2).asInstanceOf[XBridgeFactory];
      val xBridge: XBridge = xBridgeFactory.createBridge("", "urp", connection, null);
      val x3: Object = xBridge.getInstance("StarOffice.ServiceManager");
      if (x3 == null) {
        throw new OOSException("Failed to get bridge");
      }

      val xMultiComponentFactory: XMultiComponentFactory  = UnoRuntime.queryInterface(classOf[XMultiComponentFactory], x3).asInstanceOf[XMultiComponentFactory];
      val xProperySet: XPropertySet  = UnoRuntime.queryInterface(classOf[XPropertySet], xMultiComponentFactory).asInstanceOf[XPropertySet];
      val oDefaultContext: Object  = xProperySet.getPropertyValue("DefaultContext");
      val xComponentContext: XComponentContext = UnoRuntime.queryInterface(classOf[XComponentContext], oDefaultContext).asInstanceOf[XComponentContext];

      val desktopObj: Object  = xMultiComponentFactory.createInstanceWithContext("com.sun.star.frame.Desktop", xComponentContext);
      val xcomponentloader: XComponentLoader = UnoRuntime.queryInterface(classOf[XComponentLoader], desktopObj).asInstanceOf[XComponentLoader];

      if(xcomponentloader == null) {
        throw new OOSException("XComponent Loader could not be loaded");
      }

      val loadProps: Array[PropertyValue] = new Array[PropertyValue](2);
      loadProps(0) = new PropertyValue();
      loadProps(0).Name = "Hidden";
      loadProps(0).Value = boolean2Boolean(false);

      loadProps(1) = new PropertyValue();
      loadProps(1).Name = "UpdateDocMode";
      loadProps(1).Value = "1";

      val component: XComponent = xcomponentloader.loadComponentFromURL(fromFile,"_blank", 0, loadProps);

      if (component == null) {
                       throw new OOSException("Failed to load document");
               }

               val convProps: Array[PropertyValue] = new Array[PropertyValue](2);
      convProps(0) = new PropertyValue();
      convProps(0).Name = "FilterName";
      convProps(0).Value = converter;

      val xstorable: XStorable = UnoRuntime.queryInterface(classOf[XStorable],component).asInstanceOf[XStorable];
      if (xstorable == null) {
          throw new OOSException("Storable could not be loaded");
      }
      xstorable.storeToURL(toFile, convProps);
      component.dispose();
      return true;
    }
    catch {
      case e => {
           e.printStackTrace();
                 throw new OOSException("Unknown exception occurred: "+e.getMessage());
                 }
    }
  }
}

object OpenOfficeService {
  val formats = Map(
    "pdf" -> "writer_pdf_Export",
    "doc" -> "MS Word 97",
    "html" -> "HTML (StarWriter)",
    "odt" -> "writer8",
    //"html" -> "XHTML Writer File",
    "txt" -> "Text"
  );

  def createTempFile(bytes: Array[Byte], suffix: String) = {
    var f = File.createTempFile("ooconvert-", if (suffix == null) { null } else if (suffix == "") { "" } else { "."+suffix });
  	if (bytes != null) {
  		val fos = new FileOutputStream(f);
  		fos.write(bytes);		
  	}
  	f;
  }

  var soffice = "soffice";
  def setExecutable(exec: String) {
    soffice = exec;
  }

  var openOfficeServerHost: String = "localhost";
  var openOfficeServerPort: Int = 8100;

  def setOpenOfficeServer(host: String, port: Int) {
    openOfficeServerHost = host;
    openOfficeServerPort = port;
  }

  def convertFile(from: String, to: String, bytes: Array[Byte]): Array[Byte] = {
    if (from == to) {
      return bytes;
    }

  	val tempFile = createTempFile(bytes, from);
  	val outFile = createTempFile(null, to);

       /*
        Just hardcoding server and port here.
        If you intend to use an Openoffice.org instance on a network machine,
        do it at your risk.

        Just, remember to setOpenOfficeServer from etherpad/importexport/importexport.js,
        Also, remember that OO.org is reading and writing files over file:/// URI. So, make sure that
        you can access the files from network machine. Hint, NFS. Not Need for Speed game, you idiot,
        Network File System.

       */

  	if (! OpenOfficeServerUtility.checkServerAvailability(openOfficeServerHost, openOfficeServerPort)) {
  		try {
  			OpenOfficeServerUtility.runOpenOfficeServer(soffice, openOfficeServerHost, openOfficeServerPort, 20000, true);
  		} catch {
  		  case e: java.io.IOException => {
  		    e.printStackTrace();
  		    throw TemporaryFailure;
    		}
  		}
  	}
  	var converter = new OpenOfficeFileConverter();
  	converter.setOpenOfficeServerDetails(openOfficeServerHost, openOfficeServerPort);
  	var status = false;
  	try {
  		status = converter.convertFile(tempFile, outFile, formats(to), to);
  	} catch {
  	  case e => {
  	    e.printStackTrace();
  		  throw new OOSException("Unknown exception occurred: "+e.getMessage());
		  }
  	}
  	if (status == false) {
  	  throw new UnsupportedFormatException(from);
  	}
  	net.appjet.common.util.BetterFile.getFileBytes(outFile);
  }

  def main(args: Array[String]) {
    if (args.length > 0) {
      soffice = args(0);
      if (soffice.length == 0) {
        System.exit(1)
      }
    }
    
    // Query format:
    // from: String, to: String, count: Int, bytes: Array[Byte]
    // Response format:
    // status: Int, <data>
    //   status 0 (success) - <data>: count: Int, bytes: Array[Byte]
    //   status 1 (temporary failure) - <data>: <none>
    //   status 2 (permanent failure) - <data>: type: Int
    //               type - 0: unknown failure.
    //                    - 1: unsupported format
    val handler = new SarsMessageHandler {
      override def handle(b: Array[Byte]): Option[Array[Byte]] = {
        val is = new DataInputStream(new ByteArrayInputStream(b));
        val from = is.readUTF;
        val to = is.readUTF;
        val len = is.readInt;
        val bytes = new Array[Byte](len);
        is.readFully(bytes);
        var status = 0;
        var permfailuretype = 0;
        
        println("Converting "+from+" -> "+to+" ("+len+" bytes)");
        
        val output = try {
          convertFile(from, to, bytes);
        } catch {
          case TemporaryFailure => {
            status = 1;
            null;
          }
          case e: UnsupportedFormatException => {
            status = 2;
            permfailuretype = 1;
            null;
          }
          case e => {
            status = 2;
            permfailuretype = 0;
            e.printStackTrace();
            null;
          }
        }
        
        val retBytes = new ByteArrayOutputStream();
        val ret = new DataOutputStream(retBytes);
        if (status != 0) {
          ret.writeInt(status); // error
          status match {
            case 2 => {
              ret.writeInt(permfailuretype);
            }
            case _ => { }
          }
        } else {
          ret.writeInt(0); // success
          ret.writeInt(output.length);
          ret.write(output, 0, output.length);
        }
        Some(retBytes.toByteArray());
      }
    }
    
    val server = new SarsServer("ooffice-password", handler, None, 8101);
    server.start();
    println("Server running...");
    server.join();
    println("Server quitting...");
  }
}





