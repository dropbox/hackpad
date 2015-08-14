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

import("stringutils.{contains,trim}");
import("jsutils.scalaF0")
import("etherpad.log")
import("sha1");

function _cx() { return appjet.context };

function _addIfNotPresent(obj, key, value) {
  if (!(key in obj)) obj[key] = value;
}

var request = {

get isDefined() {
  return (
    _cx() != null &&
    _cx().request() != null &&
    (! _cx().request().isFake()) &&
    _cx().request().req() != null
  );
},

get cache() {
  var req = _cx().request().req();
  if (req.getAttribute("jsCache") == null) {
    req.setAttribute("jsCache", {});
  }
  return req.getAttribute("jsCache");
},

get continuation() {
  if (this.isDefined) {
    var c = Packages.net.appjet.ajstdlib.execution.getContinuation(_cx());
    var u = this.underlying;
    return {
      suspend: function(timeout) {
        return Packages.net.appjet.ajstdlib.execution.sync(
          u, scalaF0(function() { return c.suspend(timeout); }));
      },
      resume: function() {
        Packages.net.appjet.ajstdlib.execution.sync(
          u, scalaF0(function() { c.resume(); }))
      }
    }
  }
},

get underlying() {
  if (this.isDefined) {
    return _cx().request().req();
  }
},

/**
 * The request path following the hostname.  For example, if the user
 * is visiting yourapp.appjet.net/foo, then this will be set to
 * "/foo".
 *
 * This does not include CGI parameters or the domain name, and always
 * begins with a "/".
 *
 * @type string
 */
get path() {
  if (this.isDefined) {
    return String(_cx().request().path());
  }
},

/**
 * The value request query string.
 *
 * For example, if the user visits "yourapp.appjet.net/foo?id=20", then
 * query will be "id=20".
 *
 * @type string
 */
get query() {
  if (this.isDefined) {
    if (_cx().request().query() != null) {
      return _cx().request().query();
    }
  }
},

/**
 * The content of a POST request. Retrieving this value may interfere
 * with the ability to get post request parameters sent in the body of
 * a request via the "params" property. Use with care.
 *
 * @type string
 */
get content() {
  if (this.isDefined) {
    if (_cx().request().content() != null) {
      return _cx().request().content();
    }
  }
},

/**
 * Either "GET" or "POST" (uppercase).
 * @type string
 */
get method() {
  if (this.isDefined) {
    return String(_cx().request().method().toUpperCase());
  }
},

/**
 * Whether the curent HTTP request is a GET request.
 * @type boolean
 */
get isGet() {
  return (this.method == "GET");
},

/**
 * Whether the current HTTP request is a POST request.
 * @type boolean
 */
get isPost() {
  return (this.method == "POST");
},

/**
 * Either "http" or "https" (lowercase).
 * @type string
 */
get scheme() {
  if (this.isDefined) {
    return String(_cx().request().scheme());
  }
},

/**
 * Whether the current request arrived using HTTPS.
 * @type boolean
 */
get isSSL() {
  return (this.scheme == "https");
},

/**
 * Holds the IP address of the user making the request.
 * @type string
 */
get clientAddr() {
  if (this.isDefined) {
    return String(_cx().request().clientAddr());
  }
},

/**
 * Parameters associated with the request, either from the query string
 * or from the contents of a POST, e.g. from a form.  Parameters are accessible
 * by name as properties of this object.  The property value is either a
 * string (typically) or an array of strings (if the parameter occurs
 * multiple times in the request).
 *
 * @type object
 */
get params() {
  if (this.isDefined) {
    var cx = _cx();
    var req = cx.request();
    return cx.attributes().getOrElseUpdate("requestParams",
      scalaF0(function() { return req.params(cx.runner().globalScope()); }));
  }
},

/**
 * Uploaded files associated with the request, from the contents of a POST.
 *
 * @type object
 */
get files() {
  if (this.isDefined) {
    var cx = _cx();
    var req = cx.request();
    return cx.attributes().getOrElseUpdate("requestFiles",
      scalaF0(function() { return req.files(cx.runner().globalScope()); }));
  }
},

/**
 * Used to access the HTTP headers of the current request.  Properties are
 * header names, and each value is either a string (typically) or an
 * array of strings (if the header occurs multiple times in the request).
 *
 * @example
print(request.headers["User-Agent"]);
 *
 * @type object
 */
get headers() {
  if (this.isDefined) {
    var cx = _cx();
    var req = cx.request();
    return cx.attributes().getOrElseUpdate("requestHeaders",
      scalaF0(function() { return req.headers(cx.runner().globalScope()); }));
  } else {
    log.logException("Accessing request.url outside of request context.");
  }
},

// TODO: this is super inefficient to do each time someone accesses
// request.cookies.foo.  We should probably store _cookies in the requestCache.
get cookies() {
  var _cookies = {};
  var cookieHeaderArray = this.headers['Cookie'];
  if (!cookieHeaderArray) { return {}; }
  if (!(cookieHeaderArray instanceof Array))
    cookieHeaderArray = [cookieHeaderArray];
  var name, val;

  cookieHeaderArray.forEach(function (cookieHeader) {
    cookieHeader.split(';').forEach(function(cs) {
      var parts = cs.split('=');
      if (parts.length == 2) {
	name = trim(parts[0]);
	val = trim(unescape(parts[1]));
	_addIfNotPresent(_cookies, name, val);
      }
    });
  });

  return _cookies;
},

/**
 * Get a value (if any) from a signed Cookie
 */
signedCookie : function(name) {
  if (this.cookies[name]) {
    try {
      var signedObj = JSON.parse(this.cookies[name]);
    } catch (e) {
      return null;
    }
    var value = signedObj[0];
    var timestamp = signedObj[1];
    var sig = signedObj[2];
    if (sig && sha1.b64_hmac_sha1(appjet.config.secureCookieKey, value+timestamp) == sig) {
      return value;
    }
    log.warn("Signed cookie " + name + "has an invalid signature");
  }
  return null;
},

/**
 * Holds the full URL of the request.
 */
get url() {
  if (this.isDefined) {
    return this.scheme+"://"+this.host+this.path+(this.query ? "?"+this.query : "");
  } else {
    log.logException("Accessing request.url outside of request context.");
  }
},

get host() {
  if (this.isDefined) {
    // required by HTTP/1.1 to be present.
    return String(this.headers['Host']).toLowerCase();
  } else {
    log.logException("Accessing request.host outside of request context.");
  }
},

get realDomain() {
  if (this.isDefined) {
    // like host, but without the port if there is one.
    return this.host.split(':')[0];
  } else {
    log.logException("Accessing request.realDomain outside of request context.");
  }
},

get domain() {
  if (this.isDefined) {
    var domain = this.host.split(':')[0];
    // like host, but without the port if there is one.
    return domain;
  } else {
    log.logException("Accessing request.domain outside of request context.");
  }
},

get uniqueId() {
  return String(_cx().executionId());
},

get protocol() {
  if (this.isDefined) {
    return String(_cx().request().protocol());
  } else {
    log.logException("Accessing request.protocol outside of request context.");
  }
},

get userAgent() {
  if (this.isDefined) {
    var agentString = (request.headers['User-Agent'] || "?");
    return {
      toString: function() { return agentString; },
      isMobile: function() { return contains(agentString, "Mobile"); },
      isIPhone: function() { return contains(agentString, "(iPhone;") ||
        // iPod on iOS 6 is (iPod; on iOS 7 (iPod touch;
        contains(agentString, "(iPod"); },
      isIOS6: function() { return contains(agentString, "(iPhone; CPU iPhone OS 6_") ||
        contains(agentString, "(iPod; CPU iPhone OS 6_") ||
        contains(agentString, "(iPad; CPU OS 6_"); },
      isSafari6: function() { return contains(agentString, "(KHTML, like Gecko) Version/6.") &&
          contains(agentString, "Safari/"); },
      isIPad: function() { return contains(agentString, "(iPad;"); },
      isMac: function() { return contains(agentString, "Mac"); },
      isHackpadApp: function() {return contains(agentString, "Hackpad");}
    };
  } else {
    log.logException("Accessing request.userAgent outside of request context.");
  }
},

get acceptsGzip() {
	if (this.isDefined) {
  	var headerArray = this.headers["Accept-Encoding"];
  	if (! (headerArray instanceof Array)) {
  		headerArray = [headerArray];
  	}
    // Want to see if some accept-encoding header OK's gzip.
    // Starting with: "Accept-Encoding: gzip; q=0.5, deflate; q=1.0"
    // 1. Split into ["gzip; q=0.5", "delfate; q=1.0"]
    // 2. See if some entry is gzip with q > 0. (q is optional.)
    return headerArray.some(function(header) {
      if (! header) return false;
      return header.split(/,\s*/).some(function(validEncoding) {
          if (!validEncoding.indexOf("gzip") == 0) {
              return false;
          }
          if (/q=[0\.]*$/.test(validEncoding)) {
              return false;
          }
          return true;
      });
    });
  } else {
    log.logException("Accessing request.acceptsGzip outside of request context.");
  }
}

}; // end: var request = {...
