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

import("fastJSON");
import("sqlbase.sqlobj");
import("cache_utils.syncedWithCache");

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("etherpad.pro.pro_utils");

function _guessSiteName() {
  var x = request.isDefined ? request.host.split('.')[0] : "";
  //x = (x.charAt(0).toUpperCase() + x.slice(1));
  return x.toLowerCase();
}

function _getDefaultConfig() {
  return {
    siteName: _guessSiteName(),
    defaultPadText: "",
    allowFacebookSignin: false,
    publicDomain: false,
    defaultGuestPolicy: "domain",
    allowMemberLinkAccess: false,
  };
}

// must be fast! gets called per request, on every request.
function getConfig(optDomainId) {
  if (!optDomainId && !pro_utils.isProDomainRequest()) {
    return null;
  }

  if (!appjet.cache.pro_config) {
    appjet.cache.pro_config = {};
  }

  var domainId = optDomainId || domains.getRequestDomainId();
  if (!appjet.cache.pro_config[domainId]) {
    reloadConfig(domainId);
  }

  return appjet.cache.pro_config[domainId];
}

function reloadConfig(opt_domainId) {
  var domainId = opt_domainId || domains.getRequestDomainId();
  var config = _getDefaultConfig();
  var records = sqlobj.selectMulti('pro_config', {domainId: domainId}, {});

  records.forEach(function(r) {
    var name = r.name;
    var val = fastJSON.parse(r.jsonVal).x;
    config[name] = val;
  });

  if (!appjet.cache.pro_config) {
    appjet.cache.pro_config = {};
  }

  appjet.cache.pro_config[domainId] = config;
}

function setConfigVal(name, val, opt_domainId) {
  var domainId = opt_domainId || domains.getRequestDomainId();
  var jsonVal = fastJSON.stringify({x: val});

  var r = sqlobj.selectSingle('pro_config', {domainId: domainId, name: name});
  if (!r) {
    sqlobj.insert('pro_config',
                  {domainId: domainId, name: name, jsonVal: jsonVal});
  } else {
    sqlobj.update('pro_config',
                  {name: name, domainId: domainId},
                  {jsonVal: jsonVal});
  }

  reloadConfig(opt_domainId);
}


var BLACKLIST_ALLOW_DOMAINS = {
  "hotmail.com": 1,
  "hotmail.co.uk": 1,
  "hotmail.fr": 1,
  "aol.com": 1,
  "gmail.com": 1,
  "gmail.co": 1,
  "googlemail.com": 1,
  "msn.com": 1,
  "live.com": 1,
  "comcast.net": 1,
  "sbcglobal.net": 1,
  "yahoo.co.uk": 1,
  "yahoo.co.in": 1,
  "bellsouth.net": 1,
  "verizon.net": 1,
  "earthlink.net": 1,
  "cox.net": 1,
  "rediffmail.com": 1,
  "yahoo.com": 1,
  "yahoo.ca": 1,
  "ymail.com": 1,
  "yahoo.co.uk": 1,
  "yahoo.fr": 1,
  "rocketmail.com": 1,
  "btinternet.com": 1,
  "rockets.rochester3a.net" : 1,
  "charter.net": 1,
  "shaw.ca": 1,
  "ntlworld.com": 1,
  "me.com": 1,
  "mac.com": 1,
  "gmx.de": 1,
  "gmx.net": 1,
  "mail.ru": 1,
  "web.de": 1,
  "free.fr": 1,
  "mailinator.com": 1
};

function getDomainIdsWithAllowDomain(emailDomain) {
  if (!emailDomain || BLACKLIST_ALLOW_DOMAINS[emailDomain]) { return []; }
  return sqlobj.selectMulti('pro_config', { name: 'allowDomain', jsonVal: fastJSON.stringify({x:emailDomain.toLowerCase()})})
    .map(function (r) { return r.domainId; });
}

function domainAllowsEmail(email, optDomainId) {
  var domainId = optDomainId || domains.getRequestDomainId();

  if (domainId == domains.getPrimaryDomainId() || domains.isPublicDomain(domainId)) {
    return true;
  }

  var emailDomain = email.toLowerCase().split("@")[1];
  if (!emailDomain) {
    return false;
  }

  var allowDomain = (getConfig(domainId).allowDomain || "").toLowerCase();
  if (allowDomain && emailDomain == allowDomain) {
    return true;
  }

  return false;
}
