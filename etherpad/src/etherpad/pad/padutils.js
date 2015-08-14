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
import("stringutils");
import("stringutils.trim");

import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_padmeta");
import("etherpad.pad.model");
import("etherpad.sessions.getSession");
import("etherpad.helpers");
import("etherpad.log");

jimport("java.lang.System.out.println");


function setCurrentPad(p) {
  appjet.context.attributes().update("currentPadId", p);
}

function clearCurrentPad() {
  appjet.context.attributes()['$minus$eq']("currentPadId");
}

function getCurrentPad() {
  var padOpt = appjet.context.attributes().get("currentPadId");
  if (padOpt.isEmpty()) return null;
  return padOpt.get();
}

/**
 * Not valid to call this function outisde a HTTP request.
 */
function accessPadLocal(localPadId, fn, rwMode, skipAccessChecks) {
  if (!request.isDefined) {
    throw Error("accessPadLocal() cannot run outside an HTTP request.");
  }
  var globalPadId = getGlobalPadId(localPadId);
  var fnwrap = function(pad) {
    pad.getLocalId = function() {
      return getLocalPadId(pad);
    };
    return fn(pad);
  }

  return model.accessPadGlobal(globalPadId, fnwrap, rwMode, skipAccessChecks);
}

function accessPadGlobal(domainId, localPadId, fn, rwMode, skipAccessChecks) {
  var globalPadId = makeGlobalId(domainId, localPadId);
  return model.accessPadGlobal(globalPadId, fn, rwMode, skipAccessChecks);
}

/**
 * Not valid to call this function outisde a HTTP request.
 */
function getGlobalPadId(localPadId, optDomain) {
  if (!request.isDefined && !optDomain) {
    throw Error("getGlobalPadId() cannot run outside an HTTP request.");
  }
  if (optDomain) {
    return makeGlobalId(optDomain, localPadId);
  } else if (pro_utils.isProDomainRequest()) {
    return makeGlobalId(domains.getRequestDomainId(), localPadId);
  } else {
    // etherpad.com pads
    return localPadId;
  }
}

function makeGlobalId(domainId, localPadId) {
  return [domainId, localPadId].map(String).join('$');
}

function globalToLocalId(globalId) {
  var parts = globalId.split('$');
  if (parts.length == 1) {
    return parts[0];
  } else {
    return parts[1];
  }
}
function globalToLocalIds(globalIds) {
  for (var i = globalIds.length - 1; i >= 0; i--) {
    globalIds[i] = globalToLocalId(String([globalIds[i]]));
  };
  return globalIds;
}

function getLocalPadId(pad) {
  var globalId = pad.getId();
  return globalToLocalId(globalId);
}

function isProPadId(globalPadId) {
  return (globalPadId.indexOf("$") > 0);
}

function isProPad(pad) {
  return isProPadId(pad.getId());
}

function getDomainId(globalPadId) {
  var parts = globalPadId.split("$");
  if (parts.length < 2) {
    return null;
  } else {
    return Number(parts[0]);
  }
}

function makeValidLocalPadId(str) {
  return str.replace(/[^a-zA-Z0-9\-]/g, '-');
}

function getProDisplayTitle(localPadId, title) {
  if (title) {
    return title;
  }
  if (stringutils.isNumeric(localPadId)) {
    return ("Untitled "+localPadId);
  } else {
    return ("Untitled");
  }
}

function truncatedPadText(pad, optLength) {
  var length = optLength || 300;
  var text = trim(pad.text());
  var desc = trim(text.substring(text.indexOf('\n')+1)).substring(0, length);
  desc = desc.substring(0, desc.lastIndexOf('.')+1) /* Truncate at sentence/newline/word boundary */
            || desc.substring(0, desc.lastIndexOf('\n')+1)
            || desc.substring(0, desc.lastIndexOf(' ')+1)
            || desc;
  return desc;
}

function urlForGlobalPadId(globalPadId, optTitle) {
  var scheme = appjet.config.useHttpsUrls ? "https" : "http";
  return scheme+'://'+domains.fqdnForGlobalPadId(globalPadId)+'/'+globalToLocalId(globalPadId)+(optTitle ? '#' + title.replace(/ /g, '-') : '');
}

function urlForLocalPadId(localPadId, title) {
  return request.scheme+'://'+request.host+'/'+localPadId + "#" + title.replace(/ /g, '-');
}

function localPadIdFromURL(url) {
  var padUrl = url.split("#")[0];
  if (padUrl) {
    // NOTE: we accept absolute or relative URLs
    var parts = padUrl.split("/");
    if (parts) {
      // handle new style urls title-here-padId
      parts = parts[parts.length-1].split("-");
    }
    var localPadId = parts[parts.length-1]; // last part
    return localPadId;
  }
  return null;
}

function globalPadIdFromUrl(url) {
  var localPadId = localPadIdFromURL(url);
  var subdomain = pro_utils.subdomainFromURL(url);
  var subdomainId;
  if (subdomain) {
    var subdomainRecord = domains.getDomainRecordFromSubdomain(subdomain);
    if (subdomainRecord) {
      subdomainId = subdomainRecord.id;
    }
  } else {
    subdomainId = domains.getPrimaryDomainId();
  }

  return getGlobalPadId(localPadId, subdomainId);
}


function setOptsAndCookiePrefs(request) {
  // no prefs cookie anymore
  response.deleteCookie("prefs", null, "/");

  return;

  opts = {};
  if (request.params.fullScreen) { // embedding
    opts.fullScreen = true;
  }
  if (request.params.sidebar) {
    opts.sidebar = Boolean(Number(request.params.sidebar));
  }
  helpers.addClientVars({opts: opts});


  var prefs = getPrefsCookieData();

  var prefsToSet = {
    fullWidth:false,
    hideSidebar:false
  };
  if (prefs) {
    prefsToSet.isFullWidth = !! prefs.fullWidth;
    prefsToSet.hideSidebar = !! prefs.hideSidebar;
  }
  if (opts.fullScreen) {
    prefsToSet.isFullWidth = true;
  }
  if ('sidebar' in opts) {
    prefsToSet.hideSidebar = ! opts.sidebar;
  }
  helpers.addClientVars({cookiePrefsToSet: prefsToSet});
}
