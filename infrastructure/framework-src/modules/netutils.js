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
 * @fileOverview A collection of network-related utilities.
 */

import("execution");
import("jsutils.eachProperty");

jimport("java.net.InetAddress");
jimport("java.io.OutputStreamWriter");

function onStartup() {
  execution.initTaskThreadPool("async-netutils", 1);
}

function urlPostAsync(url0, params, options, callback) {
  if (!callback) {
    callback = null;
  }
  execution.scheduleTask('async-netutils', 'performAsyncRequest', 0, [urlPost, [url0, params, options], callback]);
}

serverhandlers.tasks.performAsyncRequest = function(func, args, callback) {
  var retVal = func.apply(this, args);
  if (callback) {
    callback(retVal);
  }
}

function urlPost(url0, params, options, acceptErrorCodes) {
  var url = new java.net.URL(url0);
  options = options || {};

  var data = _encodeParams(params);
  var dataBytes = (new java.lang.String(data)).getBytes("UTF-8");

  // configure the request
  var conn = url.openConnection();
  conn.setInstanceFollowRedirects(options['noredirect'] == undefined ? true : false);
  conn.setRequestMethod("POST");
  conn.setRequestProperty("Content-Type",
          options['Content-Type'] || "application/x-www-form-urlencoded; charset=utf-8");
  if (options && options['Authorization']) {
    conn.setRequestProperty("Authorization", options['Authorization']);
  }

  if (options && options.headers) {
    for (name in options.headers) {
      conn.setRequestProperty(name, options.headers[name]);

    }
  }

  conn.setRequestProperty("Content-Length", dataBytes.length);
  conn.setDoInput(true);
  conn.setDoOutput(true);
  conn.setConnectTimeout(options.connectTimeout || 30*1000);
  conn.setReadTimeout(options.readTimeout || 30*1000);
  conn.getOutputStream().write(dataBytes);

  return _processResponse(conn, acceptErrorCodes);
}

function urlGet(url0, params, headers, timeout, acceptErrorCodes, dontFollowRedirects) {
  var timeout = timeout || 30;

  var urlString = _addQueryString(url0, params);
  var url = new java.net.URL(urlString);
  var conn = url.openConnection();

  _configureURLConnection(conn, "GET", timeout, headers, dontFollowRedirects);

  return _processResponse(conn, acceptErrorCodes)
}

function urlPut(url0, fileData, params, headers, timeout, acceptErrorCodes) {
  var timeout = timeout || 30;

  var urlString = _addQueryString(url0, params);
  var url = new java.net.URL(urlString);
  var conn = url.openConnection();

  _configureURLConnection(conn, "PUT", timeout, headers);

  var out = new OutputStreamWriter(conn.getOutputStream());
  out.write(fileData);
  out.close();

  return _processResponse(conn, acceptErrorCodes);
}

function _cookiesBeingSet(conn) {
  var cookieList = [];
  var cookieJavaList = conn.getHeaderFields().get((new java.lang.String("Set-Cookie")));
  if (cookieJavaList) {
    for (var i=0; i<cookieJavaList.size(); i++) {
      cookieList.push(String(cookieJavaList.get(i)).split(";")[0]);
    }
  }
  return cookieList.join(";");
}


function urlHead(url0, params, headers, timeout, acceptErrorCodes) {
  var timeout = timeout || 30;

  var urlString = _addQueryString(url0, params);
  var url = new java.net.URL(urlString);
  var conn = url.openConnection();

  _configureURLConnection(conn, "HEAD", timeout, headers);

  var responseCode = conn.getResponseCode();
  var contentLength = conn.getContentLength();
  var contentType = conn.getContentType();
  var contentEncoding = conn.getContentEncoding();

  return {
    content: null,
    status: responseCode,
    contentLength: contentLength,
    contentType: contentType,
    contentEncoding: contentEncoding,
    cookie: _cookiesBeingSet(conn),
    location: conn.getHeaderField(new java.lang.String("Location"))
  };
}

function getHostnameFromIp(ip) {
  var ret = null;
  try {
    var addr = InetAddress.getByName(ip);
    ret = addr.getHostName();
  } catch (ex) { }
  return ret;
}

function parseQueryString(qs) {
  var q = {};
  if (qs) {
    qs.split('&').forEach(function(kv) {
      if (kv) {
        var parts = kv.split('=');
        q[parts[0]] = parts[1];
      }
    });
  }
  return q;
}

// Internal helpers:

function _startsWith(str, substr) {
  return str.substring(0, substr.length) === substr;
}

function _encodeParams(params) {
  var queryString = '';
  if (typeof(params) == 'string') {
    queryString = params;
  } else if (typeof(params) == 'object') {
    var components = [];
    eachProperty(params, function(k, v) {
      if (typeof(v) == 'object') {
        eachProperty(v, function(k2, v2) {
          components.push(encodeURIComponent(k)+"="+encodeURIComponent(v2));
        });
      } else {
        components.push(encodeURIComponent(k)+"="+encodeURIComponent(v));
      }
    });
    queryString = components.join('&');
  }
  return queryString;
}

// Adds a query to the url and returns the result
// http://example.com/path + {p1:'s1'} => http://example.com/path?p1=s1
function _addQueryString(url, params) {
  var queryString = _encodeParams(params);

  if (queryString.length > 0) {
      url += '?' + queryString;
  }

  return url;
}

function _configureURLConnection(conn, method, timeout, headers, dontFollowRedirects) {
  conn.setInstanceFollowRedirects(dontFollowRedirects ? false : true);
  conn.setRequestMethod(method);
  if (headers) {
    for (name in headers) {
      conn.setRequestProperty(name, headers[name]);
    }
  }
  conn.setDoOutput(true);
  conn.setConnectTimeout(timeout*1000);
  conn.setReadTimeout(timeout*1000);
}

function _processResponse(conn, acceptErrorCodes) {
  var responseCode = conn.getResponseCode();
  var content = null;
  if (responseCode == 200) {
    content = conn.getContent();
  } else if (acceptErrorCodes) {
    content = conn.getErrorStream();
  }
  var contentLength = conn.getContentLength();
  var contentType = conn.getContentType();
  var contentEncoding = conn.getContentEncoding();

  if ((content instanceof java.io.InputStream) && (_startsWith(contentType, "text/") ||
    _startsWith(contentType, "application/json") ||
    _startsWith(contentType, "application/atom+xml") ||
    _startsWith(contentType, "application/x-www-form-urlencoded")
  )) {
    if (! contentEncoding) {
      var encoding = contentType.split(/;\s*/);
      if (encoding.length > 1) {
        encoding = encoding[1].split("=");
        if (encoding[0] == "charset")
          contentEncoding = encoding[1];
      }
      if (! contentEncoding) {
            contentEncoding = "utf-8";
      }
    }
    content = net.appjet.common.util.BetterFile.getStreamBytes(content);
    if (contentEncoding) {
      content = (new java.lang.String(content, contentEncoding));
    }
  } else {
    if (acceptErrorCodes && (responseCode >= 400)) {
      // we'll just return the error
    } else {
      // this may throw
      content = conn.getInputStream();
    }
  }

  return {
    content: content,
    status: responseCode,
    contentLength: contentLength,
    contentType: contentType,
    contentEncoding: contentEncoding,
    cookie: _cookiesBeingSet(conn),
    location: conn.getHeaderField(new java.lang.String("Location"))
  };
}

