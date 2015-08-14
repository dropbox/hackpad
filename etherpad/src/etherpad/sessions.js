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

import("sessions");
import("stringutils.randomHash");
import("funhtml.*");

import("etherpad.log");
import("etherpad.globals.*");
import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");
import("etherpad.utils.*");
import("etherpad.helpers");
import("cache_utils.syncedWithCache");
import("etherpad.pad.pad_security");

jimport("java.lang.System.out.println");

var _TRACKING_COOKIE_NAME = "ET";
var _SESSION_COOKIE_NAME = "ES2";

function _updateInitialReferrer(data) {

  if (data.initialReferer) {
    return;
  }

  var ref = request.headers["Referer"];

  if (!ref) {
    return;
  }
  if (ref.indexOf('http://'+request.host) == 0) {
    return;
  }
  if (ref.indexOf('https://'+request.host) == 0) {
    return;
  }

  data.initialReferer = ref;
  log.custom("referers", {referer: ref});
}

function getScopedDomain(subDomain) {
  if (!request.isDefined) {
    return undefined;
  }

  var d = pro_utils.getRequestSuperdomain() || request.domain;
  if (d.indexOf(".") == -1) {
    // special case for "localhost".  For some reason, firefox does not like cookie domains
    // to be ".localhost".
    return undefined;
  }
  if (subDomain) {
    d = subDomain + "." + d;
  }
  return "." + d;
}

//--------------------------------------------------------------------------------

// pass in subDomain to get the session data for a particular subdomain --
// intended for debugging.
function getSession(subDomain) {
  var sessionData = sessions.getSession({
    cookieName: _SESSION_COOKIE_NAME,
    domain: getScopedDomain(subDomain)
  });
  if (sessionData) {
    _updateInitialReferrer(sessionData);
  }
  return sessionData;
}

function saveSession(subDomain) {
  sessions.saveSession({
    cookieName: _SESSION_COOKIE_NAME,
    domain: getScopedDomain(subDomain)
  });
}

function getSessionId() {
  return sessions.getSessionId(_SESSION_COOKIE_NAME, false, getScopedDomain());
}

function destroySession() {
  sessions.destroySession({
    cookieName: _SESSION_COOKIE_NAME,
    domain: getScopedDomain()
  });
}

function getSessionIdProAccounts(sessionId) {
  var records = [];
  var subdomainSessions = sessions.getSessionIdSubdomains(sessionId);
  for (var d in subdomainSessions) {
    if (subdomainSessions[d].proAccount && subdomainSessions[d].proAccount.id) {
      records.push(subdomainSessions[d].proAccount);
    }
  }
  return records;
}

function _getGlobalSessionId() {
  return (request.isDefined && request.cookies[_SESSION_COOKIE_NAME]) || null;
}

function isAnEtherpadAdmin() {
  var sessionId = _getGlobalSessionId();
  if (! sessionId) {
    return false;
  }

  return syncedWithCache("isAnEtherpadAdmin", function(c) {
    return !! c[sessionId];
  });
}

function setIsAnEtherpadAdmin(v) {
  var sessionId = _getGlobalSessionId();
  if (! sessionId) {
    return;
  }

  syncedWithCache("isAnEtherpadAdmin", function(c) {
    if (v) {
      c[sessionId] = true;
    }
    else {
      delete c[sessionId];
    }
  });
}

//--------------------------------------------------------------------------------

function setTrackingCookie() {
  if (request.cookies[_TRACKING_COOKIE_NAME]) {
    return;
  }

  var trackingVal = randomHash(16);
  var expires = new Date(32503708800000); // year 3000

  response.setCookie({
    name: _TRACKING_COOKIE_NAME,
    value: trackingVal,
    path: "/",
    domain: getScopedDomain(),
    expires: expires,
    secure: appjet.config.useHttpsUrls,
    httpOnly: true /* disallow client js access */
  });
}

function getTrackingId() {
  // returns '-' if no tracking ID (caller can assume)
  return helpers.escapeHtml(request.cookies[_TRACKING_COOKIE_NAME] || response.getCookie(_TRACKING_COOKIE_NAME) || '-');
}

//--------------------------------------------------------------------------------

function preRequestCookieCheck() {
  if (isStaticRequest() || isAPIRequest()) {
    return;
  }
  // If this function completes without redirecting, then it means
  // there is a valid session cookie and tracking cookie.

  if (request.cookies[_SESSION_COOKIE_NAME] &&
      request.cookies[_TRACKING_COOKIE_NAME]) {

    if (request.params.cookieShouldBeSet) {
      response.redirect(qpath({cookieShouldBeSet: null}));
    }

    // check if we need to redirect back to a subdomain.
    if ((request.path == "/") &&
        (request.params.setCookie) &&
        (request.params.contUrl)) {

      // Make sure we're redirecting to a hackpad.com URL; otherwise go to /
      var contUrl = pad_security.sanitizeContUrlForCookies(request.params.contUrl);
      if (contUrl.indexOf("?") == -1) {
        contUrl += "?";
      }
      contUrl += "&cookieShouldBeSet=1";
      response.redirect(contUrl);
    }
    return;
  }

  if (pro_utils.isProDomainRequest() && !request.params.cookieShouldBeSet) {

    getSession();
    setTrackingCookie();

    // check if we need to redirect back to a subdomain.
    if ((request.path == "/") &&
        (request.params.setCookie) &&
        (request.params.contUrl)) {

      var contUrl = pad_security.sanitizeContUrlForCookies(request.params.contUrl);
      if (contUrl.indexOf("?") == -1) {
        contUrl += "?";
      }
      contUrl += "&cookieShouldBeSet=1";
      response.redirect(contUrl);
    }
  } else {
    var parts = request.domain.split(".");
    if (parts.length < 3) {
      // invalid superdomain
      response.write("invalid superdomain");
      response.stop();
    }

    // subdomain without cookies
    if (request.params.cookieShouldBeSet) {
      if (request.path.indexOf("/ep/api/embed-pad") == 0 ) {
        var contUrl = request.url;
        var p = request.host.split(':')[1];
        p = (p ? (":"+p) : "");

        var contURL = request.scheme+"://"+pro_utils.getRequestSuperdomain()+p+"/?setCookie=1";
        log.warn("Embed cookie failure!");
        helpers.hideHeader();

        var content = DIV({style: "line-height:25px; font-size:18px"},
        P("Oops, your browser has 3rd party cookies disabled.", A({href:"#", onclick:"top.postMessage('hackpad:getcookie:"+encodeURIComponent(contURL)+"', '*'); return false"}, BR(), B("Join this hackpad now")), " so you can participate!"),
        BR());

        renderFramedHtml(helpers.modalDialog("Welcome to Hackpad", content, false, "block"));

        response.stop();
      } else {
        log.warn("Cookie failure!");
        if (request.path.indexOf("/ep/account/") == 0 && request.headers["User-Agent"].indexOf("facebookexternalhit")==-1) {
          renderFramedHtml(DIV({style: "border: 1px solid #ccc; padding: 1em; width: 600px; margin: 1em auto; font-size: 1.4em;"},
            P("Please enable cookies in your browser in order to access this site."),
            BR(),
            P(A({href: "/"}, "Continue"))));
          response.stop();
        }
      }
    } else {
      var contUrl = request.url;
      var p = request.host.split(':')[1];
      p = (p ? (":"+p) : "");
      response.redirect(request.scheme+"://"+pro_utils.getRequestSuperdomain()+p+
                        "/?setCookie=1&contUrl="+encodeURIComponent(contUrl));
    }
  }
}


