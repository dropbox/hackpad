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

import("funhtml.*");

import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.control.pro.admin.pro_admin_control");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.domains");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_public");
import("etherpad.pad.padutils");
import("etherpad.utils.*");

function _renderTopDiv(mid, htmlId) {
  var m = getSession()[mid];
  if (m) {
    delete getSession()[mid];
    saveSession();
    return DIV({id: htmlId}, m);
  } else {
    return '';
  }
}

function _messageDiv() {
  return _renderTopDiv('proConfigMessage', 'pro-config-message');
}

function onRequest() {
  pro_accounts.requireAdminAccount();
}

function render_main_get() {
  pro_config.reloadConfig();
  var config = pro_config.getConfig();
  pro_admin_control.renderAdminPage('pro-config', {
    config: config,
    messageDiv: _messageDiv
  });
}

function _updateAllowDomainGuests(allowDomain) {
  if (!allowDomain) { return; }
  var domainId = domains.getRequestDomainId();
  var accts = pro_accounts.listAllDomainAccounts(domainId);

  accts.forEach(function (acct) {
    if (pro_accounts.getIsDomainGuest(acct) &&
      acct.email && pro_config.domainAllowsEmail(acct.email, domainId)) {
      pro_accounts.setIsDomainGuest(acct, false);
    }
  });
}

function render_main_post() {
  var previousAllowDomain = pro_config.getConfig().allowDomain;
  var previousPublicDomain = pro_config.getConfig().publicDomain;

  pro_config.setConfigVal('welcomePadURL', request.params.welcomePadURL);
  pro_config.setConfigVal('homePadURL', request.params.homePadURL);
  pro_config.setConfigVal('allowDomain', request.params.allowDomain);
  pro_config.setConfigVal('mwRoot', request.params.mwRoot);
  pro_config.setConfigVal('siteName', request.params.siteName);
  pro_config.setConfigVal('defaultPadText', request.params.defaultPadText);
  pro_config.setConfigVal('showHome', request.params.showHome ? true : false);
  pro_config.setConfigVal('publicDomain', request.params.publicDomain ? true : false);

  // We need to convert guests to members if their email matches the allowDomain
  if (request.params.allowDomain != previousAllowDomain) {
    _updateAllowDomainGuests(request.params.allowDomain);
  }

  if (request.params.publicDomain != previousPublicDomain) {
    pro_public.scheduleRebuildRecentPublicDomains(0);
  }

  getSession().proConfigMessage = "New settings applied.";
  saveSession();
  response.redirect(request.path);
}
