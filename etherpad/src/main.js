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

import("dispatch.{Dispatcher,PrefixMatcher,DirMatcher,forward}");
import("email.onEmailStartup");
import("exceptionutils");
import("fastJSON");
import("jsutils.*");
import("netutils");
import("sqlbase.sqlcommon");
import("stringutils");
import("sessions.{readLatestSessionsFromDisk,writeSessionsToDisk}");

import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.log.{logRequest,logException}");
import("etherpad.log");
import("etherpad.utils.*");
import("etherpad.statistics.statistics");
import("etherpad.sessions");
import("etherpad.db_migrations.migration_runner");
import("etherpad.importexport.importexport");

import("etherpad.control.admincontrol");
import("etherpad.control.apicontrol");
import("etherpad.control.api_v1_control");
import("etherpad.control.connection_diagnostics_control");
import("etherpad.control.healthz_control");
import("etherpad.control.invitecontrol");
import("etherpad.control.maincontrol");
import("etherpad.control.sheet_control");
import("etherpad.control.pad.pad_control");
import("etherpad.control.pro.account_control");
import("etherpad.control.pro.admin.pro_admin_control");
import("etherpad.control.pro_beta_control");
import("etherpad.control.pro.new_site_control");
import("etherpad.control.pro.pro_main_control");
import("etherpad.control.pro.profile_control");
import("etherpad.control.pro_signup_control");
import("etherpad.control.pro.group_control");
import("etherpad.control.pro.dropbox_control");
import("etherpad.control.pro.mediawiki_control");
import("etherpad.control.pro.pro_padlist_control");
import("etherpad.control.scriptcontrol");
import("etherpad.control.searchcontrol");
import("etherpad.control.sitesimportcontrol");
import("etherpad.control.static_control");
import("etherpad.control.testcontrol");
import("etherpad.control.admin.recovercontrol");

import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_pad_editors");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_invite");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_public");
import("etherpad.pro.pro_pad_tracking");

import("etherpad.collab.collabroom_server");
import("etherpad.collab.collab_server");
import("etherpad.collab.readonly_server");
import("etherpad.changes.changes");
import("etherpad.changes.digest");
import("etherpad.changes.email");
import("etherpad.pad.model");
import("etherpad.pad.search");
import("etherpad.pad.dbwriter");
import("etherpad.pad.pad_migrations");
import("etherpad.importexport.dropbox");


jimport("java.lang.System.out.println");

serverhandlers.startupHandler = function() {
  var trueRegex = /\s*true\s*/i;
  if (trueRegex.test(appjet.config.solrOnly)) {
    println("Starting dedicated Solr instance");
    return;
  }

  // Order matters.
  checkSystemRequirements();

  var sp = function(k) { return appjet.config['etherpad.SQL_'+k] || null; };
  sqlcommon.init(sp('JDBC_DRIVER'), sp('JDBC_URL'), sp('USERNAME'), sp('PASSWORD'), sp('REQUIRE_SSL') == "true");

  log.onStartup();
  statistics.onStartup();
  onEmailStartup();

  if (!appjet.config.proOnly) {
    migration_runner.onStartup();
    pad_migrations.onStartup();
  }

  model.onStartup();
  pad_control.onStartup();
  dbwriter.onStartup();
  importexport.onStartup();
  pro_pad_editors.onStartup();

  collabroom_server.onStartup();
  changes.onStartup();
  digest.onStartup();
  email.onStartup();
  readLatestSessionsFromDisk();
  google_account.onStartup();
  dropbox.onStartup();
  search.onStartup();
  searchcontrol.onStartup();
  netutils.onStartup();
  recovercontrol.onStartup();
  pro_public.onStartup();
  pro_pad_tracking.onStartup();
  pro_apns.onStartup();
};

serverhandlers.resetHandler = function() {
  //statistics.onReset();
}

serverhandlers.shutdownHandler = function() {
  appjet.cache.shutdownHandlerIsRunning = true;

  var trueRegex = /\s*true\s*/i;
  if (trueRegex.test(appjet.config.solrOnly)) {
    println("Stopping dedicated Solr instance");
    return;
  }

  log.callCatchingExceptions(writeSessionsToDisk);
  log.callCatchingExceptions(dbwriter.onShutdown);
  log.callCatchingExceptions(sqlcommon.onShutdown);
  log.callCatchingExceptions(pro_pad_editors.onShutdown);
};

// Quick profiler
var Profile = function () {
  this.datapoints = [];
  this.startTime = (new Date()).getTime();
  this.tick = function (label) {
    this.datapoints.push ([label, (new Date()).getTime() - this.startTime]);
  }

  this.asString = function () {
    return this.datapoints.join(" | ");
  }
}

//----------------------------------------------------------------
// request handling
//----------------------------------------------------------------

serverhandlers.requestHandler = function() {
  if(appjet.cache.shutdownHandlerIsRunning && !stringutils.startsWith(request.path, "/admin")) {
    response.setStatusCode(503);
    return;
  }
  checkRequestIsWellFormed();
  request.profile = new Profile();
  checkHost();
  sessions.preRequestCookieCheck();
  response.setHeader("Content-Security-Policy", helpers.getCSPPolicy());
  handlePath();
};

// In theory, this should never get called.
// Exceptions that are thrown in frontend etherpad javascript should
//   always be caught and treated specially.
// If serverhandlers.errorHandler gets called, then it's a bug in the frontend.
serverhandlers.errorHandler = function(ex) {
  logException(ex);
  response.setStatusCode(500);
  if (request.isDefined) {
    render500(ex);
  } else {
    if (! isProduction()) {
      response.write(exceptionutils.getStackTracePlain(ex));
    } else {
      response.write(ex.getMessage());
    }
  }
};

serverhandlers.postRequestHandler = function() {
  logRequest();
};

//----------------------------------------------------------------
// Scheduled tasks
//----------------------------------------------------------------

serverhandlers.tasks.writePad = function(globalPadId) {
  dbwriter.taskWritePad(globalPadId);
};
serverhandlers.tasks.flushPad = function(globalPadId, reason) {
  dbwriter.taskFlushPad(globalPadId, reason);
};
serverhandlers.tasks.checkForStalePads = function() {
  dbwriter.taskCheckForStalePads();
};
serverhandlers.tasks.statisticsDailyUpdate = function() {
  statistics.dailyUpdate();
};
serverhandlers.tasks.doSlowFileConversion = function(from, to, bytes, cont) {
  return importexport.doSlowFileConversion(from, to, bytes, cont);
};
serverhandlers.tasks.proPadmetaFlushEdits = function(domainId) {
  pro_pad_editors.flushEditsNow(domainId);
};
serverhandlers.tasks.collabRoomDisconnectSocket = function(connectionId, socketId) {
  collabroom_server.disconnectDefunctSocket(connectionId, socketId);
};
serverhandlers.tasks.sessionsWriteToDisk = function() {
  writeSessionsToDisk();
};

//----------------------------------------------------------------
// cometHandler()
//----------------------------------------------------------------

serverhandlers.cometHandler = function(op, id, data) {
  checkRequestIsWellFormed();
  if (!data) {
    // connect/disconnect message, notify all comet receivers
    collabroom_server.handleComet(op, id, data);
    return;
  }

  while (data[data.length-1] == '\u0000') {
    data = data.substr(0, data.length-1);
  }

  var wrapper;
  try {
    wrapper = fastJSON.parse(data);
  } catch (err) {
    try {
      // after removing \u0000 might have to add '}'
      wrapper = fastJSON.parse(data+'}');
    }
    catch (err) {
      log.custom("invalid-json", {data: data});
      throw err;
    }
  }
  if(wrapper.type == "COLLABROOM") {
    collabroom_server.handleComet(op, id, wrapper.data);
  } else {
    //println("incorrectly wrapped data: " + wrapper['type']);
  }
};

//----------------------------------------------------------------
// sarsHandler()
//----------------------------------------------------------------

serverhandlers.sarsHandler = function(str) {
  str = String(str);
  println("sarsHandler: parsing JSON string (length="+str.length+")");
  var message = fastJSON.parse(str);
  println("dispatching SARS message of type "+message.type);
  if (message.type == "migrateDiagnosticRecords") {
    pad_control.recordMigratedDiagnosticInfo(message.records);
    return 'OK';
  }
  return 'UNKNOWN_MESSAGE_TYPE';
};

//----------------------------------------------------------------
// checkSystemRequirements()
//----------------------------------------------------------------
function checkSystemRequirements() {
  var jv = Packages.java.lang.System.getProperty("java.version");
  jv = +(String(jv).split(".").slice(0,2).join("."));
  if (jv < 1.6) {
    println("Error: EtherPad requires JVM 1.6 or greater.");
    println("Your version of the JVM is: "+jv);
    println("Aborting...");
    Packages.java.lang.System.exit(1);
  }
}

function checkRequestIsWellFormed() {
  // We require the "host" field to be present.
  // This should always be true, as long as the protocl is HTTP/1.1
  // TODO: check (request.protocol != "HTTP/1.1")
  if (request.isDefined && !request.host) {
    response.setStatusCode(505);
    response.setContentType('text/plain');
    response.write('Protocol not supported.  HTTP/1.1 required.');
    response.stop();
  }
}

//----------------------------------------------------------------
// checkHost()
//----------------------------------------------------------------
function checkHost() {
  function _redirectRequestToDomain (domain) {
    var newurl = request.scheme + "://" + domain + request.path;
    if (request.query) { newurl += "?"+request.query; }
    response.redirect(newurl);
  }

  var trueRegex = /\s*true\s*/i;
  if (trueRegex.test(appjet.config['etherpad.skipHostnameCheck'])) {
    return;
  }

  if (isPrivateNetworkEdition()) {
    return;
  }

  // we require the domain to be a <superdomain>
  if (pro_utils.getRequestSuperdomain()) {
    return;
  }

  // redirect to main site
  response.redirect(appjet.config['etherpad.canonicalDomain']);
}

//----------------------------------------------------------------
// dispatching
//----------------------------------------------------------------

function _isPathExemptFromXSRF(path) {
  switch (path) {
  case '/ep/account/as': // requires your session to have the same confirmed email
  case '/ep/account/session-sign-in': //clientIdFromSignature
  case '/ep/account/oauth-token':
  case '/ep/account/openid':
    return true;
  }
  return path.indexOf('/api/') == 0;
}

function handlePath() {
  // Default.  Can be overridden in case of static files.
  response.neverCache();

  // Protect from click-jacking
  response.disallowFraming();

  helpers.addBodyClass(request.userAgent.isMobile() ? 'mobile-web' : '');
  helpers.addBodyClass(request.userAgent.isMobile() && !request.userAgent.isIPad() ? 'mobile-phone' : '');

  if (request.userAgent.isIPad()) {
    helpers.addBodyClass("ipad");
  }

  // /api/ is protected by oAauth.
  if (request.method == 'POST' && !_isPathExemptFromXSRF(request.path)) {
    if (!extractXSRFToken()) {
      log.custom("missing-xsrf", {request: request.path});
      render400("Missing token. Please contact " + helpers.supportEmailAddress() + ".");
    }

    validateXSRFToken();
  }

  pro_accounts.reloadAccountIfNeeded();

  // Drop requests for non-domains (except for pro-signup)
  if (!domains.getRequestDomainRecord() &&
      request.path != '/' &&
      request.path.indexOf('/static') != 0 &&
      request.path.indexOf('/ep/pro-signup/') != 0) {
    render400("Please contact " + helpers.supportEmailAddress());
  }

  // these paths are handled identically on all sites/subdomains.
  var commonDispatcher = new Dispatcher();
  commonDispatcher.addLocations([
    // dispatches to pro_main_control, pro_signup_control, or renders splash page
    ['/', maincontrol.render_main_get],

    // toplevel one-off paths
    ['/public', pro_main_control.render_main_get],
    ['/hidden', pro_main_control.render_main_get],
    ['/healthz', forward(healthz_control)],
    ['/clck', pro_main_control.render_clck_get],

    // toplevel wildcard matchers
    [/^\/([^\/]+)$/, forward(static_control)],
    [/^\/([^\/]+)$/, forward(pad_control)],

    // one-off paths
    ['/ep/finish-activation', pro_main_control.render_finish_activation_get],
    ['/ep/domain-members-list', pro_main_control.render_domain_members_list_get],
    ['/ep/pin-pad', pro_main_control.render_pin_pad_post],
    ['/ep/hide-pad', pro_main_control.render_hide_pad_post],
    ['/ep/ajax-list', pro_main_control.render_ajax_list_get],
    ['/ep/sheet', sheet_control.render_sheet_get],
    ['/ep/support', maincontrol.render_support_get],

    // controls
    [PrefixMatcher('/static/'), forward(static_control)],
    [PrefixMatcher('/api/1.0/'), forward(api_v1_control)],
    [DirMatcher('/ep/account/'), forward(account_control)],
    [DirMatcher('/admin/'), forward(admincontrol)],
    [DirMatcher('/ep/admin/'), forward(pro_admin_control)],
    [PrefixMatcher('/ep/api/'), forward(apicontrol)],
    [PrefixMatcher('/ep/dropbox/'), forward(dropbox_control)],
    [PrefixMatcher('/ep/group/'), forward(group_control)],
    [PrefixMatcher('/collection/'), forward(group_control)],
    [PrefixMatcher('/ep/import/'), forward(sitesimportcontrol)],
    [PrefixMatcher('/ep/invite/'), forward(invitecontrol)],
    [PrefixMatcher('/ep/mwproxy/'), forward(mediawiki_control)],
    [DirMatcher('/ep/new-site/'), forward(new_site_control)],
    [PrefixMatcher('/ep/pad/'), forward(pad_control)],
    [PrefixMatcher('/ep/oembed/'), forward(pad_control)],
    [DirMatcher('/ep/profile/'), forward(profile_control)],
    [DirMatcher('/ep/pro-signup/'), forward(pro_signup_control)],
    [PrefixMatcher('/ep/padlist/'), forward(pro_padlist_control)],
    [PrefixMatcher('/ep/script/'), forward(scriptcontrol)],
    [DirMatcher('/ep/search/'), forward(searchcontrol)],

    // XXX: group ids and group_control actions are ambiguous,
    //      so need to let forward(group_control) above fail first :(
    [/^\/ep\/group\/([\w-]+)$/, group_control.render_group_get],
    [/^\/collection\/([\w-]+)$/, group_control.render_group_get],
  ]);

  if (!isProduction()) {
    commonDispatcher.addLocations([
      [PrefixMatcher('/ep/unit-tests/'), forward(testcontrol)]
    ]);
  }

  if (commonDispatcher.dispatch()) {
    return;
  }

  render404();
}

