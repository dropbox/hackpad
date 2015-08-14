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

/**
 * @fileOverview serving static files, including js and css, and cacheing
 *               and minifying.
 *
 * Terminology Note:
 *    "path" is confusing because paths can be part of URLs and part
 *     of filesystem paths, and static files have both types of paths
 *     associated with them.  Therefore, in this module:
 *
 *      LOCALDIR or LOCALFILE refers to directories or files on the filesystem.
 *
 *      HREF is used to describe things that go in a URL.
 */

import("fileutils.{readFile,readFileBytes}");
import("less.less");
import("yuicompressor");
import("stringutils");
import("varz");
import("ejs.EJS");
import("jsutils.{keys}");
import("etherpad.statistics.email_tracking");
import("etherpad.log");


//----------------------------------------------------------------
// Content Type Guessing
//----------------------------------------------------------------

var _contentTypes = {
  'gif': 'image/gif',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'css': 'text/css; charset=utf-8',
  'js': 'application/javascript; charset=utf-8',
  'txt': 'text/plain',
  'html': 'text/html; charset=utf-8',
  'ico': 'image/x-icon',
  'swf': 'application/x-shockwave-flash',
  'zip': 'application/zip',
  'xml': 'application/xml',
  'svg': 'image/svg+xml',
  'ttf': 'application/x-font-ttf',
  'eot': 'application/vnd.ms-fontobject',
  'woff': 'application/x-font-woff'
};

var _gzipableTypes = {
  'text/css; charset=utf-8': true,
  'application/javascript; charset=utf-8': true,
  'text/html; charset=utf-8': true,
  'image/svg+xml': true,
  'application/x-font-ttf': true,
  'application/vnd.ms-fontobject': true,
  'application/x-font-woff': true,
};

function _guessContentType(path) {
  var ext = path.split('.').pop().toLowerCase();
  return _contentTypes[ext] || 'text/plain';
}

//----------------------------------------------------------------

function _getCache(name) {
  var m = 'faststatic';
  if (!appjet.cache[m]) {
    appjet.cache[m] = {};
  }
  var c = appjet.cache[m];
  if (!c[name]) {
    c[name] = {};
  }
  return c[name];
}

var _mtimeCheckInterval = 5000; // 5 seconds

function _getMTime(f) {
  var mcache = _getCache('mtimes');
  var now = +(new Date);
  if (appjet.config.devMode ||
      !(mcache[f] && (now - mcache[f].lastCheck < _mtimeCheckInterval))) {
    var jfile = new net.appjet.oui.JarVirtualFile(f);
    if (jfile.exists() && !jfile.isDirectory()) {
      mcache[f] = {
	lastCheck:  now,
	mtime: jfile.lastModified()
      };
    } else {
      mcache[f] = null;
    }
  }
  if (mcache[f]) {
    return +mcache[f].mtime;
  } else {
    return null;
  }
}

function _wrapFile(localFile) {
  return {
    getPath: function() { return localFile; },
    getMTime: function() { return _getMTime(localFile); },
    getContents: function() { return _readFileAndProcess(localFile, 'string'); }
  };
}

function _baseFileName(path) {
  return path.split("?")[0].split('/').slice(-1)[0];
}

function _readFileAndProcess(fileName, type) {
  if (fileName.slice(-8) == "_ejs.css" || fileName.slice(-9) == "_ejs.less" ) {
    // run CSS through EJS
    var template = readFile(fileName);
    var ejs = new EJS({text:template, name:fileName});
    var resultString = ejs.render({});
    if (type == 'bytes') {
      return new java.lang.String(resultString).getBytes("UTF-8");
    }
    else {
      return resultString;
    }
  } else if (_baseFileName(fileName) in {"hackpad.js":1}) {
    // run JS through EJS
    var template = readFile(fileName);
    var ejs = new EJS({text:template, name:fileName});
    var resultString = ejs.render({});
    if (type == 'bytes') {
      return new java.lang.String(resultString).getBytes("UTF-8");
    }
    else {
      return resultString;
    }
  }
  else if (type == 'string') {

    return readFile(fileName);
  }
  else if (type == 'bytes') {

    return readFileBytes(fileName);
  }
}

function _cachedFileBytes(f) {
  var mtime = _getMTime(f);
  if (!mtime) { return null; }
  var fcache = _getCache('file-bytes-cache');
  if (!(fcache[f] && (fcache[f].mtime == mtime))) {
    varz.incrementInt("faststatic-file-bytes-cache-miss");
    var bytes = _readFileAndProcess(f, 'bytes');
    if (bytes) {
      fcache[f] = {mtime: mtime, bytes: bytes};
    };
  }
  if (fcache[f] && fcache[f].bytes) {
    return fcache[f].bytes;
  } else {
    return null;
  }
}

function _shouldGzip(contentType) {
  var userAgent = request.headers["User-Agent"];
  if (! userAgent) return false;
  //  if (! (/Firefox/.test(userAgent) || /webkit/i.test(userAgent))) return false;
  if (! _gzipableTypes[contentType]) return false;

	return request.acceptsGzip;
}

function _getCachedGzip(original, key) {
  var c = _getCache("gzipped");
  if (! c[key] || ! java.util.Arrays.equals(c[key].original, original)) {
    c[key] = {original: original,
              gzip: stringutils.gzip(original)};
  }
  return c[key].gzip;
}

function _setGzipHeader() {
  response.setHeader("Content-Encoding", "gzip");
}

function _setAccessControlHeader() {
  response.setHeader("Access-Control-Allow-Origin",  "*");
}

//----------------------------------------------------------------

/**
 * Function for serving a single static file.
 */
function singleFileServer(localPath, opts) {
  var contentType = _guessContentType(localPath);

  if (request.params.eid) {
    email_tracking.trackEmailOpen(request.params.eid);
  }

  return function() {
    (opts.cache ? response.alwaysCache() : response.neverCache());
    response.setContentType(contentType);
    var bytes = _cachedFileBytes(localPath);
    if (bytes) {
      if (_shouldGzip(contentType)) {
        bytes = _getCachedGzip(bytes, "file:"+localPath);
        _setGzipHeader();
      }
      _setAccessControlHeader();
      response.writeBytes(bytes);
      return true;
    } else {
      return false;
    }
  };
}

/**
 * valid opts:
 *   alwaysCache: default false
 */
function directoryServer(localDir, opts) {
  if (stringutils.endsWith(localDir, "/")) {
    localDir = localDir.substr(0, localDir.length-1);
  }
  return function(relpath) {
    if (stringutils.startsWith(relpath, "/")) {
      relpath = relpath.substr(1);
    }
    if (relpath.indexOf('..') != -1) {
      response.forbid();
    }
    (opts.cache ? response.alwaysCache() : response.neverCache());
    var contentType = _guessContentType(relpath);
    response.setContentType(contentType);
    var fullPath = localDir + "/" + relpath;
    var bytes = _cachedFileBytes(fullPath);

    if (bytes) {
      if (_shouldGzip(contentType)) {
        bytes = _getCachedGzip(bytes, "file:"+fullPath);
        _setGzipHeader();
      }
      _setAccessControlHeader();
      response.writeBytes(bytes);
      return true;
    } else {
      return false;
    }
  };
}

/**
 * Serves cat files, which are concatenated versions of many files.
 */
function compressedFileServer(opts) {
  var cfcache = _getCache('compressed-files');
  return function() {
    var key = request.path.split('/').slice(-1)[0];
    var contentType = _guessContentType(request.path);
    response.setContentType(contentType);
    response.alwaysCache();
    var data = cfcache[key];
    if (data) {
      _setAccessControlHeader();
      if (_shouldGzip(contentType)) {
        data = _getCachedGzip((new java.lang.String(data)).getBytes(response.getCharacterEncoding()), "comp:"+key);
        _setGzipHeader();
        response.writeBytes(data);
      } else {
        response.write(data);
      }
      return true;
    } else {
      return false;
    }
  };
}

function getCompressedFilesKey(type, baseLocalDir, localFileList) {
  if (stringutils.endsWith(baseLocalDir, '/')) {
    baseLocalDir = baseLocalDir.substr(0, baseLocalDir.length-1);
  }

  var fileList = [];
  // convert passed-in file list into list of our file objects
  localFileList.forEach(function(f) {
    if (typeof(f) == 'string') {
      fileList.push(_wrapFile(baseLocalDir+'/'+f));
    } else {
      fileList.push(f);
    }
  });

  // have we seen this exact fileset before?
  var fsId = fileList.map(function(f) { return f.getPath(); }).join('|');
  var fsMTime = Math.max.apply(this,
			       fileList.map(function(f) { return f.getMTime(); }));

  var kdcache = _getCache('fileset-keydata-cache');
  if (!(kdcache[fsId] && (kdcache[fsId].mtime == fsMTime))) {
    //println("cache miss for fileset: "+fsId);
    //println("compressing fileset...");
    kdcache[fsId] = {
      mtime: fsMTime,
      keyString: _compressFilesAndMakeKey(type, fileList)
    };
  }
  return kdcache[fsId].keyString;
}

function _compressFilesAndMakeKey(type, fileList) {
  function _compress(s) {
    if (type == 'css') {
      varz.incrementInt("faststatic-yuicompressor-compressCSS");

      try {
        var lessParser = new(less.Parser)({
          paths: ['/static/css/'], // Specify search paths for @import directives
        });

        lessParser.parse(s, function (e, tree) {
          if (!e) {
            s = tree.toCSS();
          } else {
            throw Error(JSON.stringify(e));
          }
        });
      } catch(ex) {
        log.custom('LESS', ex);
        // If less compilation fails, ignore.
      }

      return yuicompressor.compressCSS(s);
    } else if (type == 'js') {
      varz.incrementInt("faststatic-yuicompressor-compressJS");
      return yuicompressor.compressJS(s);
    } else {
      throw Error('Dont know how to compress this filetype: '+type);
    }
  }

  var fullstr = "";
  fileList.forEach(function(f) {
    fullstr += f.getContents();
  });

  fullstr = _compress(fullstr);

  var key = stringutils.md5(fullstr) + '.' + type;
  var cfcache = _getCache('compressed-files');
  cfcache[key] = fullstr;
  return key;
}

function getAllCompressedFileKeys() {
  var cfcache = _getCache('compressed-files');
  return keys(cfcache);
}

function getAllStaticFiles() {
  var fbcache = _getCache('file-bytes-cache');
  return keys(fbcache);
}
