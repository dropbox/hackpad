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

jimport("java.io.File");
jimport("java.io.FileOutputStream");
jimport("java.lang.System.out.println");
jimport("java.io.ByteArrayInputStream");
jimport("java.io.ByteArrayOutputStream");
jimport("java.io.DataInputStream");
jimport("java.io.DataOutputStream");
jimport("net.appjet.common.sars.SarsClient");
jimport("com.etherpad.openofficeservice.OpenOfficeService");
jimport("com.etherpad.openofficeservice.UnsupportedFormatException");
jimport("com.etherpad.openofficeservice.TemporaryFailure");

import("etherpad.log");
import("etherpad.utils");
import("sync");
import("execution");
import("varz");
import("exceptionutils");
import("etherpad.pad.exporthtml");
import("etherpad.importexport.toMarkdown.toMarkdown");
import("etherpad.control.pad.pad_view_control");

function _log(obj) {
  log.custom("import-export", obj);
}

function onStartup() {
  execution.initTaskThreadPool("importexport", 1);
}

var formats = {
//  pdf: 'application/pdf',
//  doc: 'application/msword',
//  odt: 'application/vnd.oasis.opendocument.text',
  html: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md : 'text/x-web-markdown',
  'native' : 'text/html; charset=utf-8',
}

function _createTempFile(bytes, type) {
        var f = File.createTempFile("ooconvert-", (type === null ? null : (type == "" ? "" : "."+type)));
	if (bytes) {
		var fos = new FileOutputStream(f);
		fos.write(bytes);
	}
	return f;
}

function _initConverterClient(convertServer) {
  if (convertServer) {
    var convertHost = convertServer.split(":")[0];
    var convertPort = Number(convertServer.split(":")[1]);
    if (! appjet.scopeCache.converter) {
      var converter = new SarsClient("ooffice-password", convertHost, convertPort);
      appjet.scopeCache.converter = converter;
      converter.setConnectTimeout(5000);
      converter.setReadTimeout(40000);
      appjet.scopeCache.converter.connect();
    }
    return appjet.scopeCache.converter;
  } else {
    return null;
  }
}

function _conversionSarsFailure() {
  delete appjet.scopeCache.converter;
}

function errorUnsupported(from) {
  return "Unsupported file type"+(from ? ": <strong>"+from+"</strong>." : ".")+" Etherpad can only import <strong>txt</strong>, <strong>html</strong>, <strong>rtf</strong>, <strong>doc</strong>, and <strong>docx</strong> files.";
}
var errorTemporary = "A temporary failure occurred; please try again later.";

function doSlowFileConversion(from, to, bytes, continuation) {
  var bytes = convertFileSlowly(from, to, bytes);
  //continuation.resume();
  return bytes;
}

function _convertOverNetwork(convertServer, from, to, bytes) {
  var c = _initConverterClient(convertServer);
  var reqBytes = new ByteArrayOutputStream();
  var req = new DataOutputStream(reqBytes);
  req.writeUTF(from);
  req.writeUTF(to);
  req.writeInt(bytes.length);
  req.write(bytes, 0, bytes.length);

  var retBtyes;
  try {
    retBytes = c.message(reqBytes.toByteArray());
  } catch (e) {
    if (e.javaException) {
      net.appjet.oui.exceptionlog.apply(e.javaException)
    }
    _conversionSarsFailure();
    return "A communications failure occurred; please try again later.";
  }

  if (retBytes.length == 0) {
    return "An unknown failure occurred; please try again later. (#5)";
  }
  var res = new DataInputStream(new ByteArrayInputStream(retBytes));
  var status = res.readInt();
  if (status == 0) { // success
    var len = res.readInt();
    var resBytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, len);
    res.readFully(resBytes);
    return resBytes;
  } else if (status == 1) {
    return errorTemporary;
  } else if (status == 2) {
    var permFailureCode = res.readInt();
    if (permFailureCode == 0) {
      return "An unknown failure occurred. (#1)";
    } else if (permFailureCode == 1) {
      return errorUnsupported(from);
    }
  } else {
    return "An unknown failure occurred. (#2)";
  }
}

function convertFileSlowly(from, to, bytes) {
  var convertServer = appjet.config["etherpad.sofficeConversionServer"];
  if (convertServer) {
    return _convertOverNetwork(convertServer, from, to, bytes);
  }

  if (! utils.hasOffice()) {
    return "EtherPad is not configured to import or export formats other than <strong>txt</strong> and <strong>html</strong>. Please contact your system administrator for details.";
  }
  OpenOfficeService.setExecutable(appjet.config["etherpad.soffice"]);
  try {
    return OpenOfficeService.convertFile(from, to, bytes);
  } catch (e) {
    if (e.javaException instanceof TemporaryFailure) {
      return errorTemporary;
    } else if (e.javaException instanceof UnsupportedFormatException) {
      return errorUnsupported(from);
    } else {
      return "An unknown failure occurred. (#3)";
    }
  }
}

function _noteConversionAttempt() {
  varz.incrementInt("importexport-conversions-attempted");
}

function _noteConversionSuccess() {
  varz.incrementInt("importexport-conversions-successful");
}

function _noteConversionFailure() {
  varz.incrementInt("importexport-conversions-failed");
}

function _noteConversionTimeout() {
  varz.incrementInt("importexport-conversions-timeout");
}

function _noteConversionImpossible() {
  varz.incrementInt("importexport-conversions-impossible");
}

function precomputedConversionResult(from, to, bytes) {
  try {
    var retBytes = request.cache.conversionCallable.get(500, java.util.concurrent.TimeUnit.MILLISECONDS);
    var delay = Date.now() - request.cache.startTime;
    _log({type: "conversion-latency", from: from, to: to,
          numBytes: request.cache.conversionByteLength,
          delay: delay});
    varz.addToInt("importexport-total-conversion-millis", delay);
    if (typeof(retBytes) == 'string') {
      _log({type: "error", error: "conversion-failed", from: from, to: to,
            numBytes: request.cache.conversionByteLength,
            delay: delay});
      _noteConversionFailure();
    } else {
      _noteConversionSuccess();
    }
    return retBytes;
  } catch (e) {
    if (e.javaException instanceof java.util.concurrent.TimeoutException) {
      _noteConversionTimeout();
      request.cache.conversionCallable.cancel(false);
      _log({type: "error", error: "conversion-failed", from: from, to: to,
            numBytes: request.cache.conversionByteLength,
            delay: -1});
      return "Conversion timed out. Please try again later.";
    }
    _log({type: "error", error: "conversion-failed", from: from, to: to,
          numBytes: request.cache.conversionByteLength,
          trace: exceptionutils.getStackTracePlain(e)});
    _noteConversionFailure();
    return "An unknown failure occurred. (#4)";
  }
}

function convertFile(from, to, bytes) {
//  if (request.cache.conversionCallable) {
//    return precomputedConversionResult(from, to, bytes);
//  }

  _noteConversionAttempt();
  if (from == to) {
    _noteConversionSuccess();
    return bytes;
  }
  if (from == "txt" && to == "html") {
    _noteConversionSuccess();
    throw 'not implemented!';
    /*return (new java.lang.String(utils.renderTemplateAsString('pad/exporthtml.ejs', {
      content: String(new java.lang.String(bytes, "UTF-8")).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
      pre: true
    }))).getBytes("UTF-8");*/
  }

  return doSlowFileConversion(from, to, bytes);

/*  request.cache.conversionByteLength = bytes.length;
  request.cache.conversionCallable =
    execution.scheduleTask("importexport", "doSlowFileConversion", 0, [
      from, to, bytes, request.continuation
    ]);
  request.cache.startTime = Date.now();
  request.continuation.suspend(45000);
  _noteConversionImpossible();
  return "An unexpected error occurred."; // Shouldn't ever get here.*/
}


function exportPadContent(pad, revisionId, format) {
  var out;
  switch(format) {
    case "txt":
      out = exporthtml.getPadPlainText(pad, revisionId);
      break;
    case "md":
      //out = exporthtml.getPadMarkdown(pad, revisionId);
      var html = exporthtml.getPadHTML(pad, revisionId);
      out = toMarkdown(html);
      break;
    case "native":
      out = pad_view_control.getPadHTML(pad, revisionId);
      break;
    case "html":
      out = exporthtml.getPadHTMLDocument(pad, revisionId);
      break;
    default:
      throw new Error("Unsupported Format.")
  }
  return out;
}

function contentTypeForFormat(format) {
  return formats[format];
}

function formatFileExtension(format) {
  return "." + format;
}

