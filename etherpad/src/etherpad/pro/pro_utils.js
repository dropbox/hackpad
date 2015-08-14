/**
 * Copyright 2009 Google Inc.
 * Copyright 2010 Pita, Peter Martischka <petermartischka@googlemail.com>
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

import("funhtml.*");
import("stringutils.startsWith");

import("etherpad.utils.*");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.log");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("etherpad.sessions");
import("etherpad.sessions.getSession");

import("etherpad.control.pro.pro_main_control");

jimport("java.lang.System.out.println");
jimport("java.net.URL");

function _stripComet(x) {
  if (x.indexOf('comet.') > 0) {
    x = x.split('comet.')[1];
  }
  return x;
}

function getProRequestSubdomain() {
  var d = _stripComet(request.domain);
  return d.split('.')[0];
}

function getRequestSuperdomain() {
  var parts = request.domain.split('.');
  var subdomainLevel = 0;
  while (parts.length > 0) {
    var domain = parts.join('.');
    if (domainEnabled(domain)) {
      // we only allow one level of subdomain
      if (subdomainLevel > 1) {
        return false;
      }
      return domain;
    }
    subdomainLevel += 1;
    parts.shift();
  }
  return false;
}

function getRequestIsSuperdomain() {
  return domainEnabled(_stripComet(request.domain));
}

function isProDomainRequest() {
  if(!isProAccountEnabled())
    return false;

  // the result of this function never changes within the same request.
  var c = appjet.requestCache;
  if (c.isProDomainRequest === undefined) {
    c.isProDomainRequest = _computeIsProDomainRequest();
  }
  return c.isProDomainRequest;
}

function _computeIsProDomainRequest() {

  // we now allow the top level domain to be a pro domain
  //if (domainEnabled(domain)) {
  //  return false;
  //}

  // now see if this subdomain is actually in our database.
  if (domains.getRequestDomainRecord()) {
    return true;
  } else {
    return false;
  }
}

function preDispatchAccountCheck() {
  // if account is not logged in, redirect to /ep/account/login
  //
  // if it's PNE and there is no admin account, allow them to create an admin
  // account.

  if (pro_main_control.isActivationAllowed()) {
    return;
  }

  /*if (!pro_accounts.doesAdminExist()) {
    if (request.path != '/ep/account/create-admin-account') {
      // should only happen for eepnet installs
      response.redirect('/ep/account/create-admin-account');
    }
  }*/ else {
    pro_accounts.requireAccount();
  }
}

function renderFramedMessage(m) {
  renderFramedHtml(
      DIV(
        {style: "font-size: 2em; padding: 2em; margin: 4em; border: 1px solid #ccc; background: #e6e6e6;"},
        m));
}

function getFullProDomain() {
  // TODO: have a special config param for this? --etherpad.canonicalDomain
  return request.domain;
}

// domain, including port if necessary
function getFullProHost() {
  var h = getFullProDomain();
  var parts = request.host.split(':');
  if (parts.length > 1) {
    h += (':' + parts[1]);
  }
  return h;
}

function subDomainFromHostname(hostname) {
  hostname = hostname.split(":")[0];
  if (domainEnabled(hostname)) {
    return "";
  } else {
    return hostname.split(".")[0];
  }
}

function subdomainFromURL(url) {
  var parsedUrl = new URL(url);
  return subDomainFromHostname(parsedUrl.getHost());
}

function getFullSuperdomainHost() {
  if (isProDomainRequest()) {
    var h = getRequestSuperdomain()
    var parts = request.host.split(':');
    if (parts.length > 1) {
      h += (':' + parts[1]);
    }
    return h;
  } else {
    return request.host;
  }
}

function getEmailFromAddr() {
  return (appjet.config.customBrandingName +'<'+appjet.config.customEmailAddress+'>');
}

function getSupportEmailFromAddr() {
  return (appjet.config.customBrandingName +'<'+(helpers.supportEmailAddress())+'>');
}

function renderGlobalProNotice() {
  if (request.cache.globalProNotice) {
    return DIV({className: 'global-pro-notice'},
      request.cache.globalProNotice);
  } else {
    return "";
  }
}

