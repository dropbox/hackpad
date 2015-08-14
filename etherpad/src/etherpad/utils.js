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

import ("crypto");
import("email");
import("email.sendEmail");
import("exceptionutils");
import("fileutils.{readFile,fileLastModified,readRealFile}");
import("ejs.EJS");
import("fastJSON");
import("funhtml.*");
import("stringutils");
import("stringutils.startsWith");
import("jsutils.*");
import("varz");

import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.collab.collab_server");
import("etherpad.i18next");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.google_account");
import("etherpad.pro.pro_oauth");
import("etherpad.log");

jimport("java.lang.System.out.print");
jimport("java.lang.System.out.println");

jimport("java.io.File");
jimport("org.apache.commons.fileupload");
jimport("org.apache.commons.lang.StringEscapeUtils.escapeHtml");

//----------------------------------------------------------------
// utilities
//----------------------------------------------------------------

// returns globally-unique padId
var SECURE_PAD_ID_LENGTH = 11;
function randomUniquePadId(optDomain) {
  var id = stringutils.randomString(SECURE_PAD_ID_LENGTH);
  while (model.accessPadGlobal(padutils.getGlobalPadId(id, optDomain), function(p) { return p.exists(); }, "r")) {
    id = stringutils.randomString(SECURE_PAD_ID_LENGTH);
  }
  return id;
}

function isSecurePadId(localPadId) {
  return localPadId.length >= SECURE_PAD_ID_LENGTH;
}

//----------------------------------------------------------------
// template rendering
//----------------------------------------------------------------

function findExistsingFile(files) {
  for (var i = 0; i < files.length; i++) {
    var f = new File('./src' + files[i]);
    if (f.exists())
      return files[i];
  }
}

function findThemeFile(filename) {
  var files = [];
  var theme = appjet.config.theme;
  if (   request && request.params
      && request.params._theme != undefined
      && request.params._theme.match(new RegExp("^[^/]*$", "g")) != null) {
    theme = request.params._theme;
  }

  files.push('/themes/' + theme + '/' + filename);
  files.push('/themes/default/' + filename);

  return findExistsingFile(files);
}

function findTemplate(filename) {
 return findThemeFile('templates/' + filename);
}

function Template(params) {
 this._defines = {}
 this._params = params;
 this._params.template = this;
}

Template.prototype.define = function(name, fn) {
  this._defines[name] = fn;
  return '';
}


Template.prototype.use = function (name, fn) {
  var args = Array.prototype.slice.call(arguments, 2);

  if (this._defines[name] != undefined)
    return this._defines[name].apply(this._defines[name], args);
  else if (fn != undefined)
    return fn.apply(fn, args);
  else
    return '';
}

Template.prototype.defineuse = function(name, paramList, fn) {
  // similar to use but with support for %partial rendering
  this._defines[name] = fn;
  if (this._params['renderPartial'] == name) {
    var that = this;
    var args = [];
    paramList.forEach(function(paramName) {
      args.push(that._params[paramName]);
    });
    return fn.apply(fn, args);
  } else {
    return '';
  }
}


Template.prototype.inherit = function (template) {
  return renderTemplateAsString(template, this._params);
}

Template.prototype.include = function (template, params) {
  var sendArgs = {};
  for (var name in this._params)
    if (name != 'template')
      sendArgs[name] = this._params[name];
  if (params != undefined)
    for (var name in params)
      sendArgs[name] = params[name];

  return renderTemplateAsString(template, sendArgs);
}

function renderJSON(value) {
  response.setContentType('application/json; charset=utf-8');
  var val = fastJSON.stringify(value);
  response.write(val);
  if (val.length > 1024) {
    if (request.acceptsGzip) {
      response.setGzip(true);
    }
  }
  return true;
}

function renderJSONError(statusCode, msg) {
  response.reset();
  response.setStatusCode(statusCode);
  renderJSON({ success: false, error: msg });
  response.stop();
}

function renderTemplateAsString(filename, data) {
  data = data || {};
  if (request.isDefined) {
    data.session = getSession();
    if (!data["googleSignInUrl"]) {
      data.__defineGetter__("googleSignInUrl", function () {  return domains.getRequestDomainRecord() ? google_account.googleOAuth2URLForLogin() : ""; });
    }
    data.isSubDomain = !domains.isPrimaryDomainRequest();
    data.renderPartial = data.renderPartial || false;
    data.signedInAccounts = data.signedInAccounts || [];
  }

  data.helpers = helpers; // global helpers
  data.N_ = i18next.i18n.t; // translation hook
  if (data.template == undefined)
    new Template(data);

  var f = findTemplate(filename); //"/templates/"+filename;
  if(f == undefined) throw 'Couldn\'t find template "'+filename+'"!';
  if (! appjet.cache.ejs) {
    appjet.cache.ejs = {};
  }
  var cacheObj = appjet.cache.ejs[filename];
  if (cacheObj === undefined || fileLastModified(f) != cacheObj.mtime) {
    var templateText = readFile(f);
    templateText += "<%- template.use('body', function () { return ''; }); %> ";
    cacheObj = {};
    cacheObj.tmpl = new EJS({text: templateText, name: filename});
    cacheObj.mtime = fileLastModified(f);
    appjet.cache.ejs[filename] = cacheObj;
  }
  var html = cacheObj.tmpl.render(data);
  return html;
}

function loadTranslations() {
  var tCache = appjet.cache['translations'];
  if (!tCache) {
    tCache = {};
  }

  var language = request.isDefined ?
      (request.headers["Accept-Language"] || 'en-US') : 'en-US';
  // Accept-language example string: "en-US,en;q=0.8"
  language = language.split(',')[0];
  i18next.i18n.init({
    lng: language,
    customLoad: function(lng, ns, options, loadComplete) {
      try {
        // load the file for given language and namespace
        var path;
        var loadedLanguage;
        var cacheHit = false;
        var langsToCheck = [
          options.lng, options.lng.split('-')[0], 'en-US'
        ];

        function getLangFilePath(lang) {
          return '/locales/' + lang + '/translation.json';
        }

        // Check cache first.
        langsToCheck.every(function(lang, index, array) {
          if (tCache[lang]) {
            // See if file has since been updated.
            var langPath = getLangFilePath(lang);
            if (new File('./src' + langPath).exists() &&
                fileLastModified(langPath) != tCache[lang].mtime) {
              return false;
            }
            cacheHit = true;
            loadComplete(null, tCache[lang].data);
            return false;
          }
          return true;
        });

        if (cacheHit) {
          return;
        }

        langsToCheck.every(function(lang, index, array) {
          loadedLanguage = lang;
          path = getLangFilePath(lang);
          return !new File('./src' + path).exists();
        });

        tCache[loadedLanguage] = {
            data: JSON.parse(readFile(path)),
            mtime: fileLastModified(path)
        };
        // callback with parsed json data
        loadComplete(null, tCache[loadedLanguage].data);
      } catch (ex) {
        // We get here if parsing of the translation file failed.
        ex.message = "Exception thrown parsing translation file:" +
            String(ex.message);
        log.logException(ex);
      }
    }
  });
}

function renderTemplate(filename, data) {
  response.write(renderTemplateAsString(filename, data));
  if (request.acceptsGzip) {
    response.setGzip(true);
  }
}

function renderHtml(bodyFileName, data) {
  var bodyHtml = renderTemplateAsString(bodyFileName, data);
  response.write(renderTemplateAsString("html.ejs", {bodyHtml: bodyHtml}));
  if (request.acceptsGzip) {
    response.setGzip(true);
  }
}

function renderFramedHtml(contentHtml, data) {

  var getContentHtml;
  if (typeof(contentHtml) == 'function') {
    getContentHtml = contentHtml;
  } else {
    getContentHtml = function() { return contentHtml; }
  }

  var template = "framed/framedpage.ejs";

  if (request.userAgent.isIPad()) {
    helpers.addBodyClass("ipad");
  }

  var data = data || {};
  data.renderHeader = function() {return renderMainHeader(data)},
  data.getContentHtml = getContentHtml;
  data.isProDomainRequest = isProDomainRequest();
  data.renderGlobalProNotice = pro_utils.renderGlobalProNotice;

  renderHtml(template, data);
}

function renderFramed(bodyFileName, data) {
  function _getContentHtml() {
    return renderTemplateAsString(bodyFileName, data);
  }
  // HACK: We render the signingNotes in the outer frame, so pass it through
  renderFramedHtml(_getContentHtml, {signinNotice: data.signinNotice, errorDiv: data.errorDiv});
}

function renderFramedError(error) {
  var content = DIV({className: 'fpcontent'},
                  DIV({style: "padding: 2em 1em;"},
                    DIV({style: "padding: 1em; border: 1px solid #faa; background: #fdd;"},
                        B("Error: "), error)));
  renderFramedHtml(content);
}

function renderNotice(bodyFileName, data) {
  renderNoticeString(renderTemplateAsString(bodyFileName, data));
}

function renderNoticeString(contentHtml) {
  renderFramed("notice.ejs", {content: contentHtml});
}

function render404(noStop) {
  response.reset();
  response.setStatusCode(404);
  renderFramedHtml(DIV({className: "fpcontent"},
                    DIV({style: "padding: 2em 1em;"},
                       DIV({style: "border: 1px solid #aaf; background: #def; padding: 1em; font-size: 150%;"},
                        "404 not found: "+request.path))));
  if (! noStop) {
    response.stop();
  }
}

function render400(msg) {
  response.reset();
  response.setStatusCode(400);
  response.write(msg);
  response.stop();
}

function render401(msg) {
  response.reset();
  response.setStatusCode(401);
  response.write(msg);
  response.stop();
}

function render500(ex) {
  response.reset();
  response.setStatusCode(500);
  var trace = null;
  if (ex && (!isProduction())) {
    trace = exceptionutils.getStackTracePlain(ex);
  }
  varz.incrementMetric("render-500");
  renderFramed("500_body.ejs", {trace: trace});
}

function renderPartial(template, name, data) {
  response.write(renderPartialAsString(template, name, data));
}

function renderPartialAsString(template, name, data) {
  data['renderPartial'] = name;
  return renderTemplateAsString(template, data);
}

function _renderProHeader(data) {

  var r = domains.getRequestDomainRecord();
  if (!data) { data = {}; }
  data.navSelection = (data.navSelection || appjet.requestCache.proTopNavSelection || '');
  data.proDomainOrgName = (pro_config.getConfig() && pro_config.getConfig().siteName) || "hackpad";
  data.proDomainOrgName = data.proDomainOrgName.toLowerCase(); //temporary till next reboot.
  data.isPNE = isPrivateNetworkEdition();
  data.account = getSessionProAccount();
  data.userPic = getSessionProAccount() ? pro_accounts.getPicById(getSessionProAccount().id) : "";
  data.isMultiAccount = pro_accounts.isMultiAccount();
  data.isAnEtherpadAdmin = sessions.isAnEtherpadAdmin();
  data.fullSuperdomain = pro_utils.getFullSuperdomainHost();
  data.signedInAccounts = pro_accounts.accountsForSignInAsPicker();
  data.asNewAccount = request.params.new;
  data.selectedSection = request.params.section || request.cookies['padlistSection'] || "stream";

  helpers.addClientVars({
    initialSpaces: pro_accounts.getSessionSpaces()
  })

  return renderTemplateAsString("framed/framedheader.ejs", data);
}

function renderMainHeader(data) {
  return _renderProHeader(data);
}


function sendHtmlTemplateEmail(toAddress, subject, templateFilename, data, optFromAddress, optHeaders) {
  optHeaders = optHeaders || {};
  data = extend({
    optOuterStyling: '',
    homeURL: absoluteURL("/"),
    email: toAddress,
    logoURL: absoluteURL('/static/img/email-logo.png', {eid: data.eid || ""}),
    domain: domains.fqdnForDomainId(request.isDefined? domains.getRequestDomainId() : domains.getPrimaryDomainId()),
    unsubscribeLink: "foo"}, data);

  var body = renderTemplateAsString(templateFilename, data);
  email.sendAsyncEmail(toAddress, optFromAddress || pro_utils.getEmailFromAddr(), subject, optHeaders, body, "text/html; charset=utf-8");
}


//----------------------------------------------------------------
// isValidEmail
//----------------------------------------------------------------

// TODO: make better and use the better version on the client in
// various places as well (pad.js and etherpad.js)
function isValidEmail(x) {
  return (x &&
          ((x.length > 0) &&
           (x.match(/^[\w\.\_\+\-]+\@[\w\_\-]+\.[\w\_\-\.]+$/))));
}

//----------------------------------------------------------------

function timeAgo(d, now) {
  if (!now) { now = new Date(); }

  function format(n, word) {
    n = Math.round(n);
    return ('' + n + ' ' + word + (n != 1 ? 's' : '') + ' ago');
  }

  d = (+now - (+d)) / 1000;
  if (d < 60) { return format(d, 'second'); }
  d /= 60;
  if (d < 60) { return format(d, 'minute'); }
  d /= 60;
  if (d < 24) { return format(d, 'hour'); }
  d /= 24;
  return format(d, 'day');
};


//----------------------------------------------------------------
// linking to a set of new CGI parameters
//----------------------------------------------------------------
function qpath(m) {
  var q = {};
  if (request.query) {
    request.query.split('&').forEach(function(kv) {
      if (kv) {
        var parts = kv.split('=');
        q[parts[0]] = parts[1];
      }
    });
  }
  eachProperty(m, function(k,v) {
    q[k] = v;
  });
  var r = '';
  eachProperty(q, function(k,v) {
    if (v !== undefined && v !== null) {
      r += ('&' + k + '=' + v);
    }
  });
  return r.length ? request.path + '?' + r : request.path;
}

//----------------------------------------------------------------

function ipToHostname(ip) {
  var DNS = Packages.org.xbill.DNS;

  if (!DNS.Address.isDottedQuad(ip)) {
    return null
  }

  try {
    var addr = DNS.Address.getByAddress(ip);
    return DNS.Address.getHostName(addr);
  } catch (ex) {
    return null;
  }
}

function extractGoogleQuery(ref) {
  ref = String(ref);
  ref = ref.toLowerCase();
  if (!(ref.indexOf("google") >= 0)) {
    return "";
  }

  ref = ref.split('?')[1];

  var q = "";
  ref.split("&").forEach(function(x) {
    var parts = x.split("=");
    if (parts[0] == "q") {
      q = parts[1];
    }
  });

  q = decodeURIComponent(q);
  q = q.replace(/\+/g, " ");

  return q;
}

function isTestEmail(x) {
  return (x.indexOf("+appjetseleniumtest+") >= 0);
}

function isPrivateNetworkEdition() {
  return false;
}

function isProDomainRequest() {
  return pro_utils.isProDomainRequest();
}

function hasOffice() {
  return appjet.config["etherpad.soffice"] || appjet.config["etherpad.sofficeConversionServer"];
}

function parseUrlParams(url){
  if (!url) {
    return {};
  }
  var query = url.split('?')[1];
  if (!query) {
    return {};
  }
  var params = {};
  query.split("&").forEach(function(x) {
    var parts = x.split("=");
    params[parts[0]] = decodeURIComponent(parts[1]);
  });

  return params;
}

function encodeUrlParams(params) {
  var components = [];
  eachProperty(params, function(k, v) {
    components.push(encodeURIComponent(k)+"="+encodeURIComponent(v));
  });
  return components.join('&');
}

////////// console progress bar

function startConsoleProgressBar(barWidth, updateIntervalSeconds) {
  barWidth = barWidth || 40;
  updateIntervalSeconds = ((typeof updateIntervalSeconds) == "number" ? updateIntervalSeconds : 1.0);

  var unseenStatus = null;
  var lastPrintTime = 0;
  var column = 0;

  function replaceLineWith(str) {
    //print((new Array(column+1)).join('\b')+str);
    print('\r'+str);
    column = str.length;
  }

  var bar = {
    update: function(frac, msg, force) {
      var t = +new Date();
      if ((!force) && ((t - lastPrintTime)/1000 < updateIntervalSeconds)) {
        unseenStatus = {frac:frac, msg:msg};
      }
      else {
        var pieces = [];
        pieces.push(' ', ('  '+Math.round(frac*100)).slice(-3), '%', ' [');
        var barEndLoc = Math.max(0, Math.min(barWidth-1, Math.floor(frac*barWidth)));
        for(var i=0;i<barWidth;i++) {
          if (i < barEndLoc) pieces.push('=');
          else if (i == barEndLoc) pieces.push('>');
          else pieces.push(' ');
        }
        pieces.push('] ', msg || '');
        replaceLineWith(pieces.join(''));

        unseenStatus = null;
        lastPrintTime = t;
      }
    },
    finish: function() {
      if (unseenStatus) {
        bar.update(unseenStatus.frac, unseenStatus.msg, true);
      }
      println();
    }
  };

  println();
  bar.update(0, null, true);

  return bar;
}

function isStaticRequest() {
  return startsWith(request.path, '/static/') ||
         request.path == '/favicon.ico' ||
         startsWith(request.path, '/apple-touch-icon') ||
         request.path == '/robots.txt' ||
         request.path == '/humans.txt' ||
         request.path == '/sitemap.xml' ||
         request.path == '/crossdomain.xml' ||
         request.path == '/cache.manifest';
}

function isAPIRequest() {
  if (startsWith(request.path, '/api/1.0/') ||
      request.path == "/ep/account/session-sign-in") {
    return true;
  }
  // clientVars isn't an 'API request' when requested as a guest.
  if (request.path != "/ep/pad/client-vars") {
    return false;
  }
  // clientIdFromSignature does requireParam on oauth_signature, and we don't
  // want to fail if that's not present.
  if (!request.params.oauth_signature && !request.headers.Authorization) {
    return false;
  }
  return !!pro_oauth.clientIdFromSignature();
}

function httpsHost(h) {
  h = h.split(":")[0];  // strip any existing port
  if (appjet.config.listenSecurePort != "443" && !appjet.config.hidePorts) {
    h = (h + ":" + appjet.config.listenSecurePort);
  }
  return h;
}

function httpHost(h) {
  h = h.split(":")[0];  // strip any existing port
  if (appjet.config.listenPort != "80" && !appjet.config.hidePorts) {
    h = (h + ":" + appjet.config.listenPort);
  }
  return h;
}

function toJavaException(e) {
  var exc = (((e instanceof java.lang.Throwable) && e) || e.rhinoException || e.javaException);
  if (!exc) {
    if (e.message || e.filename || e.lineNumber || e.stack) {
      exc = new java.lang.Throwable(e.message+"/"+e.fileName+"/"+e.lineNumber+"/"+e.stack);
    } else {
      exc = new java.lang.Throwable(String(e));
    }
  }
  return exc;
}

function requireParam(name) {
  var val = request.params[name];
  if (!val || val == "") {
    render400("Missing " + name + " parameter");
  }
  return String(val);
}

function intParam(name, legalRange, defaultValue) {
  var val = parseInt(request.params[name]) || defaultValue;
  if (legalRange) {
    val = Math.max(val, legalRange[0]);
    val = Math.min(val, legalRange[1]);
  }
  return val;
}

function enumParam(name, enumDict, defaultValue) {
  var val = request.params[name];
  if (enumDict[val]) {
    return val;
  } else {
    return defaultValue;
  }
}

function requireEmailParam(name) {
  name = name || "email";
  return stringutils.trim(request.params[name].toLowerCase());
}


function getParamIfExists(name) {
  var val = request.params[name];
  if(val) {
    return String(val);
  }
  else {
    return null;
  }
}

var XSRF_COOKIE_NAME = "TOK";
/**
 * Resets the XSRF token associated with the current session.
 * @return The new token
 */
function resetXSRFToken() {
  var token = stringutils.randomHash(16);
  var domain = "." + pro_utils.getRequestSuperdomain();
  if (!isProduction() && domain == ".localhost") {
    domain = "";
  }

  response.setCookie({
    name: XSRF_COOKIE_NAME,
    value: token,
    path: "/",
    domain: domain,
    secure: appjet.config.useHttpsUrls,
    httpOnly: false /* allow client js access */
  });
  request.cache.xsrfToken = token;
  return token;
}

function currentXSRFToken(action) {
  if (!request.cache.xsrfToken) {
    // grab from the cookie or generate new
    var cookieToken = request.cookies[XSRF_COOKIE_NAME];
    if (!cookieToken) {
      cookieToken = resetXSRFToken();
    }
    request.cache.xsrfToken = cookieToken;
  }

  return request.cache.xsrfToken;
}

function validateXSRFToken() {
  var providedToken = extractXSRFToken();

  if (providedToken == currentXSRFToken()) {
    return;
  }

  var isIOSApp = false;
  if (/^Hackpad.*/.test(request.userAgent)) {
    isIOSApp = true;
  }

  if (isIOSApp) {
    // We run the old code for the iOS app
    if (sessions.getTrackingId() == '-' ||
       (extractXSRFToken() != sessions.getTrackingId())) {
      log.custom("missing-xsrf", {request: request.path});
      render400("Invalid request");
    }
  } else {
    log.custom("missing-xsrf", {request: request.path});
    render400("Invalid request");
  }
}

function extractXSRFToken() {
  if (request.headers['X-Xsrf-Protection']) {
    return request.headers['X-Xsrf-Protection'];
  } else if (request.params && request.params.xsrf) {
    return request.params.xsrf;
  } else if (request.headers['Content-Type'] &&
      request.headers['Content-Type'].indexOf('json') != -1 &&
      request.content) {  // Check jQuery json posts
    try {
      return JSON.parse(String(new java.lang.String(request.content)))['xsrf'];
    } catch (ex) {
      // bad JSON parse
      return null;
    }
  }

  return null;
}

function getMultipartUpload() {
  var file = null;
  var uploads = [];
  var itemFactory = new fileupload.disk.DiskFileItemFactory();
  var handler = new fileupload.servlet.ServletFileUpload(itemFactory);
  var items = handler.parseRequest(request.underlying).toArray();
  for (var i = 0; i < items.length; i++) {
    if (!items[i].isFormField()) {
      uploads.push({file: items[i].getInputStream(), name: items[i].name,
          type: items[i].getContentType()});
    }
  }

  return uploads;
}

function ValidationError(message) {
  this.message = message;
  this.stack = Error().stack;
}
ValidationError.prototype = Object.create(Error.prototype);
ValidationError.prototype.name = "ValidationError";

function absoluteURL(path, queryDict, opt_subDomain) {
  var subDomainStr = "";
  if (opt_subDomain) {
    subDomainStr = opt_subDomain + ".";
  } else if (opt_subDomain == "") {
    // force superdomain
  } else {
    if (request.isDefined && !pro_utils.getRequestIsSuperdomain()) {
      subDomainStr = pro_utils.getProRequestSubdomain() + ".";
    } else {
      subDomainStr = "";
    }
  }

  var queryComponents = [];
  eachProperty(queryDict, function(k, v) {
    queryComponents.push(encodeURIComponent(k)+"="+encodeURIComponent(v));
  });

  return [(appjet.config.useHttpsUrls ? "https://" : "http://"),
      subDomainStr,
      appjet.config['etherpad.canonicalDomain'],
      path,
      queryComponents.length ?  "?" : "",
      queryComponents.join("&")].join("") ;
}


function absoluteSignedURL(path, queryDict, optSubdomain) {
  queryDict['sig'] =  crypto.signRequest(queryDict);
  return absoluteURL(path, queryDict, optSubdomain);
}

function _prettyPadId(localPadId, optTitle) {
  var urlTitle = optTitle ? optTitle.replace(/[^\w\s-\.]/g, '').replace(/[\s-]+/g, '-') + "-" : "";
  if (localPadId.length == SECURE_PAD_ID_LENGTH) {
    return urlTitle + localPadId;
  } else {
    return localPadId;
  }
}
function absolutePadURL(localPadId, optQueryDict, optSubdomain, optTitle) {
  var urlTitle = optTitle ? optTitle.replace(/[^\w\s-\.]/g, '').replace(/[\s-]+/g, '-') + "-" : "";
  return absoluteURL('/'+_prettyPadId(localPadId, optTitle), optQueryDict || {}, optSubdomain);
}
function absoluteProfileURL(accountId, optSubdomain) {
  return absoluteURL(pro_accounts.getUserLinkById(accountId), optSubdomain);
}
function relativePadUrl(localPadId, optTitle) {
  return '/'+_prettyPadId(localPadId, optTitle);
}

function relativeCollectionUrl(encryptedId) {
  return '/collection/'+encryptedId;
}

// Returns a global pad id from any valid absolute pad URL
var PAD_URL_RE = new RegExp("^https?://([^/\:]+)(?:\:[0-9]+)?(/[^/#]+)#?.*$");
var PRETTY_RELATIVE_PAD_URL_RE = new RegExp("^/(?:[^/]+-)*([a-zA-Z0-9]{11})$");
function parsePadURL(padURL) {
  var matched = padURL.match(PAD_URL_RE);
  if (!matched) {
    return null;
  }
  var hostname = matched[1];
  var path = matched[2];

  // Look up the domain id
  var domainId;
  if (domainEnabled(hostname)) {
    domainId = domains.getPrimaryDomainId();
  } else if (domainEnabled(hostname.split(".").slice(1).join("."))){
    domainId = domains.getDomainRecordFromSubdomain(hostname.split(".")[0]);
  } else {
    return null;
  }

  var matchedPath = path.match(PRETTY_RELATIVE_PAD_URL_RE);
  if (matchedPath) {
    localPadId = matchedPath[1];
  } else {
    localPadId = path.slice(1);
  }

  return domainId+"$"+localPadId;
}


