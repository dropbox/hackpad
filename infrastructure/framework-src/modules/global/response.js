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

import("sha1");
import("fastJSON");
/**
 * @fileOverview Helpers for the HTTP response.
 */

/** @ignore */
function _cx() { return appjet.context };

/** @ignore */
function _cookiestring(c) {
  var x = '';
  if (!c.name) { throw new Error('cookie name is required'); }
  if (!c.value) { c.value = ''; }
  x += (c.name + '=' + escape(c.value));

  // expires
  if (c.expires instanceof Date) {
    x += ('; expires='+_cookiedate(c.expires));
  }
  if (typeof(c.expires) == 'number') {
    var today = (new Date()).valueOf();
    var d = new Date(today + 86400000*c.expires);
    x += ('; expires='+_cookiedate(d));
  }

  // domain
  if (c.domain) { x += ('; domain='+c.domain); }

  // path
  if (c.path) { x += ('; path='+c.path); }

  // secure
  if (c.secure == true) { x += '; secure'; }

  // httpOnly
  if (c.httpOnly == true) { x += '; httponly'; }

  return x;
};

/** @ignore */
function _cookiedate(d) {
  var x = d.toGMTString();
  var p = x.split(' ');
  return [p[0], [p[1], p[2], p[3]].join('-'), p[4], p[5]].join(' ');
};

var response = {

get isDefined() {
  return _cx().response() != null;
}

};

/**
 * Halts the program immediately and returns 403 Forbidden error to the user.
 */
response.forbid = function() {
  _cx().response().error(403, "Forbidden");
};

/**
 * Halts the program immediately.
 *
 * @param {boolean} renderCurrentPage if false, an empty page will be rendered,
 *   otherwise calls to print() so far will be displayed.  Either way, no more
 *   code will be executed.
 */
response.stop = function(renderCurrentPage) {
  _cx().response().stop();
};

/**
 * Halts the program immediately and returns a 404 not found error to the user.
 */
response.notFound = function() {
  _cx().response().error(404, "404: Not found");
};

/**
 * Halts the program immediately and sends an HTTP redirect response (302),
 * redirecting to the given path (relative or absolute).
 *
 * @param {string} path The new path
 */
response.redirect = function(path) {
  if ((! path) && path != "") {
    throw new Error("Invalid redirect: "+path);
  }
  if (path.indexOf('/') == 0) {
    // make sure absolute URL has proper host/port
    path = request.scheme+"://"+request.host+path;
  }
  _cx().response().redirect(path);
};

/**
 * Sets the status code in the HTTP response.
 *
 * @param {number} newCode
 */
response.setStatusCode = function(newCode) {
  _cx().response().setStatusCode(newCode);
};
response.getStatusCode = function() {
  return _cx().response().getStatusCode();
};

response.sendError = function(errorCode, errorHtml) {
  _cx().response().error(errorCode, errorHtml);
};

response.reset = function() {
  _cx().response().reset();
};

/**
 * Sets any header of the HTTP response.
 *
 * @example
response.setHeader('Cache-Control', 'no-cache');
 *
 * @param {string} name
 * @param {string} value
 */
response.setHeader = function(name, value) {
  _cx().response().setHeader(name, value);
};

/**
 * Adds the name,value pair to the headers.  Useful for headers that are
 * allowed to repeat, such as Set-Cookie.
 *
 * @param {string} name
 * @param {string} value
 */
response.addHeader = function(name, value) {
  _cx().response().addHeader(name, value);
};

/**
 * Returns the value of a previously-set header. Useful in the
 * postRequestHandler to see values of headers set during normal
 * request processing.
 *
 * @param {string} name
 * @return {array} An array of header values. Empty array if none set.
 */
response.getHeader = function(name) {
  if (! this.isDefined) {
    return [];
  } else {
    return _cx().response().getHeader(name);
  }
};

/**
 * Removes all instances of a header of the HTTP response.
 *
 * @param {string} name
 */
response.removeHeader = function(name) {
  _cx().response().removeHeader(name);
};

/**
 * Low-level hook for writing raw data to the response.
 * @param {string} data will be written, verbatim, to the HTTP resonse.
 */
response.write = function(data) {
  _cx().response().write(data);
};

/**
 * Low-level hook for writing raw byte data to the response. Especially
 * useful for writing the result of a <code>wget</code> of image data,
 * or writing an uploaded file.
 * @param {string} data will be written, verbatim, to the HTTP resonse.
 */
response.writeBytes = function(data) {
  _cx().response().writeBytes(data);
};

//----------------------------------------------------------------
// Cookies!
//----------------------------------------------------------------

/**
 * Set a cookie in the response.
 *
 * @example
response.setCookie({
  name: "SessionID",
  value: "25",
  secure: true,
  expires: 14 // 14 days
});
 *
 * @param {object} cookieObject This may contain any of the following:
<ul>
  <li>name (required): The name of the cookie</li>
  <li>value (required): The value of the cookie.  (Note: this value will be escaped).
  <li>expires (optional): If an integer, means number of days until it expires;
        if a Date object, means exact date on which to expire.</li>
  <li>domain (optional): The cookie domain</li>
  <li>path (optional): To restrict the cookie to a specific path.</li>
  <li>secure (optional): Whether this cookie should only be sent securely.</li>
</ul>
 */
response.setCookie = function(cookieObject) {
  this.addHeader('Set-Cookie', _cookiestring(cookieObject));

  var p3pHeader = this.getHeader("P3P");
  if ((! p3pHeader) || p3pHeader.length == 0) {
    // The existence of this "privacy policy" header allows cookies set on
    // pages inside iframes to be accepted by IE.  (This is some kind of
    // default policy copied from an example online. -- dgreensp)
    this.setHeader('P3P', 'CP="IDC DSP COR CURa ADMa OUR IND PHY ONL COM STA"');
  }
};

/**
 * Set a signed cookie in the response.
 *
 * @example
response.setSignedCookie({
  name: "SessionID",
  value: "25",
  secure: true,
  expires: 14 // 14 days
});
 *
 * @param {object} cookieObject This may contain any of the following:
<ul>
  <li>name (required): The name of the cookie</li>
  <li>value (required): The value of the cookie.  (Note: this value will be escaped).
  <li>expires (optional): If an integer, means number of days until it expires;
        if a Date object, means exact date on which to expire.</li>
  <li>domain (optional): The cookie domain</li>
  <li>path (optional): To restrict the cookie to a specific path.</li>
</ul>
 */

response.setSignedCookie = function(cookieObject) {
  // sign the value and json encode it
  var timestamp = String(Math.floor(+(new Date())/1000));
  cookieObject.value = fastJSON.stringify([cookieObject.value, timestamp,
    sha1.b64_hmac_sha1(appjet.config.secureCookieKey, cookieObject.value+timestamp)]);

  this.setCookie(cookieObject);
};

/**
 * Tells the client to delete the cookie of the given name (by setting
 * its expiration time to zero).
 * @param {string} name The name of the cookie to delete.
 */
response.deleteCookie = function(name, optDomain, optPath) {
  if (request && request.isDefined && !request.cookies[name]) {
    return;
  }

  var cookieObj = {name: name, value: '', expires: 0};
  if (optDomain) {
    cookieObj['domain'] = optDomain;
  }
  if (optPath) {
    cookieObj['path'] = optPath;
  }
  this.setCookie(cookieObj);
};

function _trim(s) {
  return String((new java.lang.String(s)).trim());
}

response.getCookie = function(name) {
  var cookieHeaders = this.getHeader('Set-Cookie');
  if (! cookieHeaders) { return; }
  for (var i = 0; i < cookieHeaders.length; ++i) {
    if (_trim(cookieHeaders[i].split("=")[0]) == name)
      return _trim(cookieHeaders[i].split(";")[0].split("=")[1]);
  }
};

/**
 * Sets the Content-Type header of the response.  If the content-type includes
 * a charset, that charset is used to send the response.
 * @param {string} contentType the new content-type
 */
response.setContentType = function(contentType) {
  _cx().response().setContentType(contentType);
};

response.getCharacterEncoding = function() {
  return _cx().response().getCharacterEncoding();
}

response.neverCache = function() {
  // be aggressive about not letting the response be cached.
  var that = this;
  function sh(k,v) { that.setHeader(k,v); }
  sh('Expires', 'Sat, 18 Jun 1983 07:07:07 GMT');
  sh('Last-Modified', (new Date()).toGMTString());
  sh('Cache-Control', ('no-store, no-cache, must-revalidate, '+
		       'post-check=0, pre-check=0'));
  sh('Pragma', 'no-cache');
};

response.alwaysCache = function() {
  var that = this;
  function sh(k,v) { that.setHeader(k,v); }
  that.removeHeader('Last-Modified');
  that.removeHeader('Pragma');
  var futureDate = new Date();
  futureDate.setTime(Date.now() + 315360000000);
  sh('Expires', futureDate.toGMTString());
  sh('Cache-Control', 'max-age=315360000');
};

response.setGzip = function(gzip) {
  _cx().response().setGzip(gzip);
}

response.disallowFraming = function() {
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

response.allowFraming = function() {
  response.setHeader('X-Frame-Options', '');
  response.setHeader('Content-Security-Policy', "");
}



