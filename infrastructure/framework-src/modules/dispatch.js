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
 * @fileOverview Dispatching for dynamic pages and static files rendered from disk.
 */

import("jsutils.eachProperty");
import("stringutils");
import("etherpad.log");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------
// Util
//----------------------------------------------------------------

function PrefixMatcher(p) {
  var rs = p.replace(/([\[\]\^\$\\\.\*\+\?\(\)\{\}\|])/g, "\\$1");
  var r = new RegExp('^' + rs + '(.*)$');
  return function(path) {
    return r.exec(path);
  }
}

// Like PrefixMatcher, but makes trailing '/' optional, as in /ep/admin or /ep/admin/.
// If trailing '/' is omitted, will redirect to same path with trailing /.
function DirMatcher(p) {
  if (p.substr(-1) == '/') {
    p = p.substr(0, p.length-1);
  }
  var prefixMatcher = PrefixMatcher(p+'/');
  return function(path) {
    if (path == p) {
      response.redirect(p+'/' + (request.query ? "?"+request.query : ""));
    }
    return prefixMatcher(path);
  }
}

function _pathMatches(p, loc) {
  // returns a regex-result kind of array with length >= 1, or null
  if (typeof(loc) == 'string') {
    return (p == loc) ? [loc] : null;
  }
  if (typeof(loc) == 'function') {
    return (loc(p) || null);
  }
  if (loc.exec) { // regexp
    var r = loc.exec(p);
    return r || null;
  }
  throw new Error('Uknown type of location: '+loc);
}

//----------------------------------------------------------------
// Dispatcher
//----------------------------------------------------------------

var Dispatcher = function() {
  this._routes = [];  // Array([location, (local file path or function)])
};

Dispatcher.prototype.addLocations = function(l) {
  var that = this;
  l.forEach(function(x) { that._routes.push(x); });
};

Dispatcher.prototype.dispatch = function() {
  var p = request.path;
  var served = false;

  for (var i = 0; (i < this._routes.length) && (served == false); i++) {
    var route = this._routes[i];
    if (!route) { continue; }
    var loc = route[0];
    var dst = route[1];

    var match = _pathMatches(p, loc);
    if (match) {
      if (typeof(dst) != 'function') {
        throw new Error('dispatch only dispatches to functions, and this is not a function: '+typeof(dst));
      }

      // If we're dispatching to a function with a name,
      // we ensure that it's suffix matches the request method
      if (dst['name']) {
        var handlerNameSuffix = dst['name'].split("_").slice(-1);

        var handlerNameSuffixToAllowedMethods = {
          'get': ['HEAD', 'GET'],
          'post': ['POST'],
          'delete': ['DELETE'],
          'getpost': ['HEAD', 'GET', 'POST'],
        };
        var allowedMethodForHandler = handlerNameSuffixToAllowedMethods[handlerNameSuffix];
        if (allowedMethodForHandler && allowedMethodForHandler.indexOf(request.method) < 0) {
          log.warn('Refusing to serve a ' + request.method + ' to ' + request.path);
          // TODO: enable
          // response.forbid();
        } else if (!allowedMethodForHandler) {
          log.warn('Cant find allowed methods for ' + request.method + ' to ' + request.path);
          // TODO: enable
          // response.forbid();
        }
      }

      // call dst(group1, group2, group3, ...)
      served = dst.apply(this, Array.prototype.slice.call(match, 1));
    }
  };

  return served;
};

//----------------------------------------------------------------
// fdisp
//----------------------------------------------------------------

function forward(module) {
  return function(name) {
    if (name === "") {
      name = "main";
    }
    if (name) {
      name = name.replace(/\-/g, '_');
    }
    var onreq = module['onRequest'];
    var f = module['render_'+name+'_both'];
    var fg = module['render_'+name+'_get'];
    var fp = module['render_'+name+'_post'];

    var served = false;

    if (onreq) {
      served = onreq(name);
    }

    if (served) {
      return true;
    }

    var method = request.method;
    if (method == "HEAD") {
      method = "GET";
    }

    if (f) {
      f();
      served = true;
    } else if (method == "GET" && fg) {
      fg();
      served = true;
    } else if (method == "POST" && fp) {
      fp();
      served = true;
    }

    return served;
  };
}
