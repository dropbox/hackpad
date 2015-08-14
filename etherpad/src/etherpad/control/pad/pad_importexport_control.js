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

import("jsutils.arrayToSet");
import("stringutils.{toHTML,md5}");
import("stringutils");
import("sync");
import("varz");

import("etherpad.control.pad.pad_view_control.getRevisionInfo");
import("etherpad.helpers");
import("etherpad.importexport.importexport");
import("etherpad.importexport.dropbox");
import("etherpad.log");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.importhtml");
import("etherpad.pad.exporthtml");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.utils.{render404,renderFramedError,randomUniquePadId}");
import("etherpad.collab.server_utils");
import("etherpad.pro.pro_tokens");

jimport("org.apache.commons.fileupload");

function _log(obj) {
  log.custom("import-export", obj);
}

//---------------------------------------
// utilities
//---------------------------------------

function _getPadTextBytes(padId, revNum) {
  if (revNum === undefined) {
    return null;
  }
  return padutils.accessPadLocal(padId, function(pad) {
    if (pad.exists()) {
      var txt = exporthtml.getPadPlainText(pad, revNum);
      return (new java.lang.String(txt)).getBytes("UTF-8");
    } else {
      return null;
    }
  }, 'r');
}

function _getPadHtmlBytes(padId, revNum, noDocType) {
  if (revNum === undefined) {
    return null;
  }
  var html = padutils.accessPadLocal(padId, function(pad) {
    if (pad.exists()) {
      return exporthtml.getPadHTMLDocument(pad, revNum, noDocType);
    }
  });
  if (html) {
    return (new java.lang.String(html)).getBytes("UTF-8");
  } else {
    return null;
  }
}

function _getFileExtension(fileName, def) {
  if (fileName.lastIndexOf('.') > 0) {
    return fileName.substr(fileName.lastIndexOf('.')+1);
  } else {
    return def;
  }
}

function _guessFileType(contentType, fileName) {
  function _f(str) { return function() { return str; }}
  var unchangedExtensions =
    arrayToSet(['txt', 'htm', 'html', 'doc', 'docx', 'rtf', 'pdf', 'odt']);
  var textExtensions =
    arrayToSet(['js', 'scala', 'java', 'c', 'cpp', 'log', 'h', 'htm', 'html', 'css', 'php', 'xhtml',
                'dhtml', 'jsp', 'asp', 'sh', 'bat', 'pl', 'py']);
  var contentTypes = {
    'text/plain': 'txt',
    'text/html': 'html',
    'application/msword': 'doc',
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/rtf': 'rtf',
    'application/pdf': 'pdf'
  }

  var ext = _getFileExtension(fileName);
  if (ext) {
    if (unchangedExtensions[ext]) {
      return ext;
    } else if (textExtensions[ext]) {
      return 'txt';
    }
  }
  if (contentType in contentTypes) {
    return contentTypes[contentType]
  }
  // unknown type, nothing to return.
  _log({type: "warning", error: "unknown-type", contentType: contentType, fileName: fileName});
}

function _noteExportFailure() {
  varz.incrementInt("export-failed");
}

function _noteImportFailure() {
  varz.incrementInt("import-failed");
}

//---------------------------------------
// export
//---------------------------------------

// handles /ep/pad/export/*
function renderExport() {
  var parts = request.path.split('/');
  var padId = server_utils.parseUrlId(parts[4]).localPadId;
  var revisionId = parts[5];
  var rev = null;
  var format = request.params.format || 'txt';

  if (!revisionId) {
    render404();
  }

  if (! request.cache.skipAccess) {
    _log({type: "request", direction: "export", format: format});
    rev = getRevisionInfo(padId, revisionId);
    if (! rev) {
      render404();
    }
    request.cache.skipAccess = true;
  }

  var result = _exportToFormat(padId, revisionId, (rev || {}).revNum, format);
  if (result === true) {
    response.stop();
  } else {
    renderFramedError(result);
  }
  return true;
}

function _exportToFormat(padId, revisionId, revNum, format) {
  var bytes = padutils.accessPadLocal(padId, function(pad) {
    if (pad.exists()) {
      return importexport.exportPadContent(pad, revNum, format);
    }
  });

  if (! bytes) {
    return "Unable to convert file for export... try a different format?"
  } else {
    response.setContentType(importexport.formats[format]);
    response.setHeader("Content-Disposition", "attachment; filename=\""+padId+"-"+revisionId+"."+format+"\"");
    response.writeBytes(bytes);
    return true;
  }
}


function _doExportConversion(format, getTextBytes, getHtmlBytes) {
  if (! (format in importexport.formats)) {
    return false;
  }
  var bytes;
  var srcFormat;

  if (format == 'txt') {
    bytes = getTextBytes();
    srcFormat = 'txt';
  } else {
    bytes = getHtmlBytes(format == 'doc' || format == 'odt');
    srcFormat = 'html';
  }
  if (bytes == null) {
    bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 0);
  }

  try {
    var ret = importexport.convertFile(srcFormat, format, bytes);
    if (typeof(ret) == 'string') {
      _log({type: "error", error: "export-failed", format: format, message: ret});
      _noteExportFailure();
      return ret;
    }
    bytes = ret;
  } catch (e) {
    if (e.javaException instanceof org.mortbay.jetty.RetryRequest) {
      throw e.javaException
    }
    if (e.javaException || e.rhinoException) {
      net.appjet.oui.exceptionlog.apply(e.javaException || e.rhinoException);
    }
    bytes = null;
  }
  if (bytes == null || bytes.length == 0) {
    _log({type: "error", error: "export-failed", format: format, message: ret});
    _noteExportFailure();
    return false;
  }
  return bytes;
}

//---------------------------------------
// import
//---------------------------------------

function _getImportInfo(key) {
  var session = getSession();
  sync.callsyncIfTrue(session, function() { return ! ('importexport' in session) },
    function() {
      session.importexport = {};
    });
  var tokens = session.importexport;
  sync.callsyncIfTrue(tokens, function() { return ! (key in tokens) },
    function() {
      tokens[key] = {};
    });
  sessions.saveSession();
  return tokens[key];
}

function render_import_dropbox_post() {
  var dropboxPath = request.params.path;
  var tokenInfo = pro_tokens.getDropboxKeyAndSecretForProUserId(getSessionProAccount().id);

  var docContent = dropbox.getFileContents(dropboxPath, tokenInfo.key, tokenInfo.secret, getSessionProAccount().id);
  var bytes = net.appjet.common.util.BetterFile.getStreamBytes(docContent);

  var newBytes = importexport.convertFile("doc", "html", bytes);
  newHTML = String(new java.lang.String(newBytes, "UTF-8"));

  var padId = randomUniquePadId();
  padutils.accessPadLocal(padId, function(pad) {
    if (pad.exists()) {
      return;
    }
    pad.create();
    importhtml.setPadHTML(pad, newHTML);
  });


  response.redirect("/"+padId);
}

function render_import_post() {
  function _r(code) {
    response.setContentType("text/html");
    response.write("<html><body><script>try{parent.document.domain}catch(e){document.domain=document.domain}\n"+code+"</script></body></html>");
    response.stop();
  }

  var padId = decodeURIComponent(request.params.padId);
  if (! padId) {
    response.stop();
  }

  /* Maybe we should encapsulate this a bit and put it in utils sometime? */
  var file = null;
  var itemFactory = new fileupload.disk.DiskFileItemFactory();
  var handler = new fileupload.servlet.ServletFileUpload(itemFactory);
  var items = handler.parseRequest(request.underlying).toArray();
  for (var i = 0; i < items.length; i++) {
    if (!items[i].isFormField()) {
      file = items[i];
      break;
    }
  }

  if (! file) {
    _r('parent.pad.handleImportExportFrameCall("importFailed", "Please select a file to import.")');
  }

  var bytes = file.get();
  var type = _guessFileType(file.getContentType(), file.name);

  _log({type: "request", direction: "import", format: type});

  if (! type) {
    type = _getFileExtension(file.name, "no file extension found");
    _r('parent.pad.handleImportExportFrameCall("importFailed", "'+importexport.errorUnsupported(type)+'")');
  }

  var token = md5(bytes);
  var state = _getImportInfo(token);
  state.bytes = bytes;
  state.type = type;


//  response.write("/ep/pad/impexp/import2?token="+token+"&padId="+request.params.padId)
//  _r("parent.pad.handleImportExportFrameCall('importSuccessful', '"+token+"')");
//}


//function render_import2() {
  //var token = request.params.token;

  function _r(txt) {
    response.write(txt);
    response.stop();
  }

  if (! token) { _r("fail"); }

  var state = _getImportInfo(token);
  if (! state.type || ! state.bytes) { _r("fail"); }

  var newBytes;
  try {
    newBytes = importexport.convertFile(state.type, "html", state.bytes);
  } catch (e) {
    if (e.javaException instanceof org.mortbay.jetty.RetryRequest) {
      throw e.javaException;
    }
    net.appjet.oui.exceptionlog.apply(e);
    throw e;
  }

  if (typeof(newBytes) == 'string') {
    _log({type: "error", error: "import-failed", format: state.type, message: newBytes});
    _noteImportFailure();
    _r("msg:"+newBytes);
  }

  if (! newBytes || newBytes.length == 0) {
    _r("fail");
  }

  var newHTML;
  try {
    newHTML = String(new java.lang.String(newBytes, "UTF-8"));
  } catch (e) {
    _r("fail");
  }


  if (! request.params.padId) { _r("fail"); }
  padutils.accessPadLocal(request.params.padId, function(pad) {
    if (! pad.exists()) {
      _r("fail");
    }
    importhtml.setPadHTML(pad, newHTML);

  });

  var globalId = padutils.getGlobalPadId(request.params.padId);
  pro_padmeta.accessProPad(globalId, function(ppad) {
    ppad.setLastEditor(getSessionProAccount().id);
    ppad.setLastEditedDate(new Date());
  });

  _r("ok");
}
