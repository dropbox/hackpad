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
import("jsutils.{eachProperty,extend}");
import("faststatic");
import("comet");
import("funhtml");
import("funhtml.*");
import("sha1");
import("stringutils");

import("etherpad.globals.*");
import("etherpad.debug.dmesg");
import("etherpad.utils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.sessions");

//----------------------------------------------------------------
// array that supports contains() in O(1)

var __UniqueArray = function() {
  this._a = [];
  this._m = {};
};
__UniqueArray.prototype.add = function(x) {
  if (!this._m[x]) {
    this._a.push(x);
    this._m[x] = true;
  }
};
__UniqueArray.prototype.unshift = function(x) {
  if (!this._m[x]) {
    this._a.unshift(x);
    this._m[x] = true;
  }
};
__UniqueArray.prototype.asArray = function() {
  return this._a;
};

//----------------------------------------------------------------
// EJS template helpers
//----------------------------------------------------------------

function _hd() {
  if (!appjet.requestCache.helperData || !(appjet.requestCache.helperData.bodyClasses instanceof __UniqueArray)) {
    appjet.requestCache.helperData = {
      clientVars: {},
      htmlTitle: siteName(),
      headExtra: "",
      tailExtra: "",
      bodyId: "",
      bodyClasses: new __UniqueArray(),
      cssIncludes: new __UniqueArray(),
      jsIncludes: new __UniqueArray(),
      includeCometJs: false,
      includeJQueryJs: false,
      includeMobileCss: false,
      suppressGA: false,
      showHeader: true,
      robotsPolicy: null,
      cacheManifest: 'manifest="/cache.manifest"',
      noJs: false
    };
  }
  return appjet.requestCache.helperData;
}

function addBodyClass(c) {
  _hd().bodyClasses.add(c);
}

function addClientVars(vars) {
  eachProperty(vars, function(k,v) {
    _hd().clientVars[k] = v;
  });
}

function getClientVar(name) {
  return _hd().clientVars[name];
}

function addToHead(stuff) {
  _hd().headExtra += stuff;
}

function addToTail(stuff) {
  _hd().tailExtra += stuff;
}

function setHtmlTitle(t) {
  _hd().htmlTitle = t;
}

function setBodyId(id) {
  _hd().bodyId = id;
}

function includeJs(relpath) {
  _hd().jsIncludes.add(relpath);
}

function includeJQuery() {
  if (!_hd().includeJQueryJs) {
    if (isProduction()) {
      // use the google CDN version in production
      addToHead('<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js" type="text/javascript"></script>');
    } else {
      // use the local version otherwise
      addToHead('<script src="/static/js/jquery-1.7.2.js" type="text/javascript"></script>');
    }
    _hd().includeJQueryJs = true;
  }
}

function includeCss(relpath) {
  _hd().cssIncludes.add(relpath);
}

function includeMobileCss() {
  _hd().includeMobileCss = true;
}

function includeCometJs() {
  _hd().includeCometJs = true;
}

function suppressGA() {
  _hd().suppressGA = true;
}

function isGASuppressed() {
  return _hd().suppressGA;
}

function hideHeader() {
  _hd().showHeader = false;
}

//----------------------------------------------------------------
// for rendering HTML
//----------------------------------------------------------------

function bodyClasses() {
  return _hd().bodyClasses.asArray().join(' ');
}

function getClientVars() {
  return _hd().clientVars;
}
function clientVarsScript() {
  addClientVars({isDogfood: isDogfood()});
  addClientVars({cdn: cdn()});

  var x = _hd().clientVars;

  x = fastJSON.stringify(x);

  // strip characters which are valid JSON but invalid JS
  // it would be great if we could properly escape them in a single
  // pass, but there doesn't appear to be a way to do so?!
  // http://timelessrepo.com/json-isnt-a-javascript-subset
  x = x.replace(/[\u2028\u2029]/g, '?');

  if (x == '{}') {
    return '<!-- no client vars -->';
  }
  x = x.replace(/</g, '\\x3c');
  return [
    '<script type="text/javascript" nonce="' + cspNonce() + '">',
    '  // <![CDATA[',
    'var clientVars = '+x+';',
    '  // ]]>',
    '</script>'
  ].join('\n');
}

function htmlTitle() {
  return _hd().htmlTitle;
}

function bodyId() {
  return _hd().bodyId;
}

function baseHref() {
  return request.scheme + "://"+ request.host + "/";
}

function headExtra() {
  return _hd().headExtra;
}

function tailExtra() {
  return _hd().tailExtra;
}

function jsIncludes() {
  if (_hd().noJs) { return ""; }

  // Always include common.js
  _hd().jsIncludes.unshift('common.js');

  if (isProduction()) {
    var jsincludes = _hd().jsIncludes.asArray();
    if (_hd().includeCometJs) {
      jsincludes.splice(0, 0, {
        getPath: function() { return 'comet-client.js'; },
        getContents: function() { return comet.clientCode(); },
        getMTime: function() { return comet.clientMTime(); }
      });
    }
    if (jsincludes.length < 1) { return ''; }
    var key = faststatic.getCompressedFilesKey('js', '/static/js', jsincludes);
    var url = cdn() + '/static/compressed/' + key;

    var crossorigin = 'crossorigin="anonymous"';
    function isOldMobileApp() {
      // No way to distinguish b/t the app on iOS 6 and 7 before it was fixed to
      // always use the UIWebView userAgent.
      return stringutils.startsWith(request.userAgent.toString(), 'Hackpad/');
    }
    if (request.userAgent.isIOS6() || request.userAgent.isSafari6() || isOldMobileApp()) {
      // setting crossorigin=anon breaks these devices.
      crossorigin = '';
    }
    return '<script nonce="' + cspNonce() + '" type="text/javascript" src="'+url+'" '+crossorigin+'></script>';
  } else {
    var ts = +(new Date);
    var r = [];
    if (_hd().includeCometJs) {
      r.push('<script nonce="' + cspNonce() + '" type="text/javascript" src="'+COMETPATH+'/js/client.js?'+ts+'"></script>');
    }
    _hd().jsIncludes.asArray().forEach(function(relpath) {
      r.push('<script nonce="' + cspNonce() + '" type="text/javascript" src="/static/js/'+relpath+'?'+ts+'"></script>');
    });

    return r.join('\n');
  }
}

function setNoJs(val) {
  _hd().noJs = val;
}

function cssIncludes() {
  if (_hd().includeMobileCss) {
    if (request.cache.isMobileApp) {
      _hd().cssIncludes.add('mobile-app.less');
    } else {
      _hd().cssIncludes.add('mobile-web.less');
    }

    if (request.userAgent.isIPad()) {
      _hd().cssIncludes.add('tablet.less');
    } else {
      _hd().cssIncludes.add('phone.less');
    }
  }

  if (isProduction()) {
    var key = faststatic.getCompressedFilesKey('css', '/static/css', _hd().cssIncludes.asArray());
    var url = cdn() + '/static/compressed/' + key;
    var cssSrc = '<link href="'+url+'" rel="stylesheet" type="text/css" onError="this.loadError=true;" />';

    return cssSrc;
  } else {
    var r = [];
    _hd().cssIncludes.asArray().forEach(function(relpath) {
      var key = faststatic.getCompressedFilesKey('css', '/static/css', [relpath]);
      var url = cdn() + '/static/compressed/' + key;
      r.push('<link href="' + url + '" rel="stylesheet" type="text/css" data-file="'+relpath+'" onError="this.loadError=true;" />');
    });

    return r.join('\n');
  }
}

function oemail(username) {
  return '&lt;<a class="obfuscemail" href="mailto:'+username+'@e***rp*d.com">'+
    username+'@e***rp*d.com</a>&gt;';
}

function googleAnalytics() {
  if (!appjet.config.googleAnalyticsAccount ||
      !appjet.config.googleAnalyticsDomainName ||
      !isProduction() || _hd().suppressGA) {
    return [
    '<script type="text/javascript" nonce="' + cspNonce() + '">',
      'var _gaq = _gaq || [];',
    '</script>'
    ].join('\n');
  }

  var userType = getSessionProAccount() ? "User" : "Guest";

  return [
  '<script type="text/javascript" nonce="' + cspNonce() + '">',
    'var _gaq = _gaq || [];',
    '_gaq.push([\'_setAccount\', \'' + appjet.config.googleAnalyticsAccount + '\']);',
    '_gaq.push([\'_setDomainName\', \'' + appjet.config.googleAnalyticsDomainName + '\']);',
    '_gaq.push([\'_setCustomVar\', 1, \'User Type\', \''+userType+'\', 2]);',
    '_gaq.push([\'_trackPageview\']);',
    '(function() {',
      'var ga = document.createElement(\'script\'); ga.type = \'text/javascript\'; ga.async = true;',
      'ga.src = (\'https:\' == document.location.protocol ? \'https://ssl\' : \'http://www\') + \'.google-analytics.com/ga.js\';',
      'var s = document.getElementsByTagName(\'script\')[0]; s.parentNode.insertBefore(ga, s);',
    '})();',
    '</script>'
  ].join('\n');
}

function isGuest() {
  return getSessionProAccount() == null;
}

function isChatEnabled() {
  return getSessionProAccount() &&
      !pro_accounts.getIsDomainGuest(getSessionProAccount()) &&
      isDogfood() && !request.userAgent.isMobile();
}

function mixPanel() {
  if (!appjet.config.mixpanelToken || !isProduction() || _hd().suppressGA) {
    return [
      '<script type="text/javascript" nonce="' + cspNonce() + '">',
      'function _mixpanelnoop() { };',
      'var mixpanel = mixpanel || { track: _mixpanelnoop, track_links: _mixpanelnoop, name_tag: _mixpanelnoop, track_pageview: _mixpanelnoop };',
      '</script>'
    ].join('\n');
  }

  return [
    '<script type="text/javascript" nonce="' + cspNonce() + '">',
    '//<![CDATA[',
    '(function(c,a){window.mixpanel=a;var b,d,h,e;b=c.createElement("script");b.type="text/javascript";b.async=!0;b.src=("https:"===c.location.protocol?"https:":"http:")+"//cdn.mxpnl.com/libs/mixpanel-2.1.min.js";d=c.getElementsByTagName("script")[0];d.parentNode.insertBefore(b,d);a._i=[];a.init=function(b,c,f){function d(a,b){var c=b.split(".");2==c.length&&(a=a[c[0]],b=c[1]);a[b]=function(){a.push([b].concat(Array.prototype.slice.call(arguments,0)))}}var g=a;"undefined"!==typeof f?g=a[f]=[]:f="mixpanel";g.people=g.people||[];h="disable track track_pageview track_links track_forms register register_once unregister identify name_tag set_config people.identify people.set people.increment".split(" ");for(e=0;e<h.length;e++)d(g,h[e]);a._i.push([b,c,f])};a.__SV=1.1})(document,window.mixpanel||[]);',
    'mixpanel.init("' + appjet.config.mixpanelToken + '");',
    'mixpanel.identify("' + sessions.getTrackingId() + '");',
    'if (clientVars && !clientVars.userIsGuest && clientVars.userName) {',
    '  mixpanel.name_tag(clientVars.userName);',
    '  mixpanel.people.identify("' + sessions.getTrackingId() + '");',
    '}',
    '//]]>',
    '</script>'
  ].join('\n');
}

function track() {
  return utils.renderTemplateAsString("track.ejs");
}

function includeDropboxChooser() {
  if (!request.userAgent.isMobile()) {
    addToTail('<script type="text/javascript" async src="https://www.dropbox.com/static/api/1/dropins.js" id="dropboxjs" data-app-key="0d6svpz10vgp18t"></script>');
  }
}

function isHeaderVisible() {
  return _hd().showHeader;
}

function siteName() {

  return toHTML((pro_config.getConfig() && pro_config.getConfig().siteName) || "hackpad");
}

function siteImage() {
  return "/static/img/banner.jpg";
}

function siteBannerPosition() {
  return -160;
}

function setRobotsPolicy(policy) {
  _hd().robotsPolicy = policy;
}
function robotsMeta() {
  if (!_hd().robotsPolicy) { return ''; }
  var content = "";
  content += (_hd().robotsPolicy.index ? 'INDEX' : 'NOINDEX');
  content += ", ";
  content += (_hd().robotsPolicy.follow ? 'FOLLOW' : 'NOFOLLOW');
  return META({name: "ROBOTS", content: content});
}

function clearFloats() {
  return '<div style="clear: both;"><!-- --></div>';
}

function rafterBlogUrl() {
  return '/ep/blog/posts/google-acquires-appjet';
}

function rafterNote() {
  return "<div style='border: 1px solid #ccc; background: #fee; padding: 1em; margin: 1em 0;'>" +
    "<b>Note: </b>We are no longer accepting new accounts. <a href='"+rafterBlogUrl()+"'>Read more</a>." +
    "</div>";
}

function updateToUrl(setParams, deleteParams, setPath) {
  var params = {};

  for (param in request.params)
    if (deleteParams === undefined || deleteParams.indexOf(param) == -1)
      params[param] = request.params[param];

  if (setParams !== undefined)
    for (param in setParams)
      params[param] = setParams[param];

  var path = request.path;
  if (setPath !== undefined)
    path = setPath;

  var paramStr = '';
  for (param in params) {
    if (paramStr == '')
      paramStr += '?';
    else
      paramStr += '&';
    paramStr += param + '=' + params[param];
  }

  return path + paramStr;
}

function xsrfToken() {
  return utils.currentXSRFToken();
}

function xsrfTokenElement() {
  return funhtml.INPUT({name: 'xsrf', type: 'hidden', value: utils.currentXSRFToken()});
}

function facebookOpenGraphMetadata(pageArgs) {
  var args = {
    title: '',
    type: 'hackpad:private',
    description: '',
  };
  extend(args, pageArgs);

  addToHead('<meta property="og:title" content="' + escapeHtml(args.title) + '" />');
  addToHead('<meta property="og:description" content="' + escapeHtml(args.description) + '" />');
  addToHead('<meta property="og:image" content="https://hackpad.com/static/img/hackpad-logo.png" />');
  addToHead('<meta property="fb:app_id" content="' + appjet.config.facebookClientId + '" />');
  addToHead('<meta property="og:url" content="' + request.scheme+'://'+request.host+request.path+ '" />');
  addToHead('<meta property="og:type" content="' + args.type + '" />');
  addToHead('<meta property="twitter:site" content="@hackpad" />');
  addToHead('<meta name="twitter:widgets:csp" content="on" />');
}

function addDefaultMetadata() {
  addToHead("<meta content='hackpad.com' name='title' />");
  addToHead("<meta content='Real-time collaborative wiki' name='description' />");
  addToHead("<link href='/static/img/hackpad-logo.png' rel='image_src' />");
}

function addSmartAppBanner(url) {
  // Disable on stage so that screenshot testing on iOS works.
  if (appjet.config.disableSmartAppBanner == "true") {
    return;
  }
  url = url || (request.scheme+'://'+request.host+request.path);
  addToHead('<meta name="apple-itunes-app" content="app-id=789857184, app-argument=' + escapeHtml(url) + '">');
}

function allowFacebookSignin() {
  return domains.supportsFacebookSignin();
}

function supportEmailAddress() {
  return appjet.config.supportEmailAddress;
}


// Takes an ISO time and returns a string representing how
// long ago the date represents.
function prettyDate(date){
  diff = (((new Date()).getTime() - date.getTime()) / 1000),
    day_diff = Math.floor(diff / 86400);

  if ( isNaN(day_diff) || day_diff < 0)
    return;

  return day_diff == 0 && (
      diff < 60 && "just now" ||
      diff < 120 && "1 minute ago" ||
      diff < 3600 && Math.floor( diff / 60 ) + " minutes ago" ||
      diff < 7200 && "1 hour ago" ||
      diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
      day_diff == 1 && "Yesterday" ||
      day_diff < 7 && day_diff + " days ago" ||
      day_diff < 31 && Math.ceil( day_diff / 7 ) + " weeks ago" ||
      day_diff < 365 && Math.ceil( day_diff / 31 ) + " months ago" ||
      Math.ceil( day_diff / 365 ) + " years ago";
}

function ellipsize(content, length) {
  return content.length < length ? content : content.substr(0, Math.max(0, length-3)) + "...";
}

function modalDialog(title, content, dismissable, display) {
  // Important: return rendered html here, not a funhtml object as we
  // often serialize this into JSON
  return "" + DIV({className:"modaldialog", style:"opacity:1.0; display:"+(display||"none"), id:stringutils.randomString(6)}, H1({}, title), DIV({className:"modaldialog-inner"}, DIV({}, content), dismissable?_dismissButton() : ""));
}

function _dismissButton() {
  return DIV({'style': 'text-align:right; margin-top:20px' }, BUTTON({'class':'hp-ui-button hp-ui-button-primary', 'data-click':'hidemodal'}, "Ok"));
}


function disableOffline() {
  _hd().cacheManifest = "";
}

function cacheManifest() {
  return _hd().cacheManifest;
}

function cdn() {
  if (isProduction()) {
    if (appjet.config['etherpad.fakeProduction'] == "true") { return ""; }

    if (appjet.config['etherpad.cdnUrl']) {
      return appjet.config['etherpad.cdnUrl'];
    }
  } else {
    return "";
  }
}

function absoluteCDNUrl(path) {
  if (request.isDefined && cdn()) {
    return cdn() + path;
  } else {
    return utils.absoluteURL(path);
  }
}

function documentDomain() {
  return '<script nonce="' + cspNonce() + '" type="text/javascript">try { document.domain = document.domain.split(".").slice(-2).join("."); } catch (ex) { console.log("error setting document.domain: " + ex); }</script>';
}

function profileTicks() {
  return "<!--" + request.profile.asString() + "-->";
}

// hijack all links with target=_blank to prevent phishing
function hijackBlankClicks() {
  return [
    '<script nonce="' + cspNonce() + '" type="text/javascript">',
    '$(document).on("click", "a[target]", function(e) {',
    '  e.preventDefault();',
    '  var newWindow = window.open("", this.target || "_blank");',
    '  if (newWindow) {',
    '    newWindow.opener = null;',
    '    newWindow.location = this.href;',
    '    newWindow.focus();',
    '  }',
    '});',
    '</script>'
  ].join('\n');
}

function escapeHtml(s) {
  var re = /[&<>'"]/g; /']/; // stupid indentation thing
  if (! re.MAP) {
    // persisted across function calls!
    re.MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&#34;',
      "'": '&#39;'
    };
  }
  return s && s.replace(re, function(c) { return re.MAP[c]; });
}

function _getCSPPolicy() {
  // CSP Policy with some helper constants
  // single quotes are important and easy to miss. Better define constants.
  var SELF = "'self'";
  var UNSAFE_INLINE = "'unsafe-inline'";
  var UNSAFE_EVAL = "'unsafe-eval'";
  var NONE = "'none'";

  var cspPolicy = {
    "default-src": [SELF, "https://*", UNSAFE_INLINE, UNSAFE_EVAL, "data:"],
    "img-src": ["https:", "http:", "data:"],
    "object-src": [NONE],
    "script-src": [SELF, UNSAFE_INLINE, "",
      "https://www.dropbox.com/static/api/1/dropins.js",
      "https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js",
      "https://ssl.google-analytics.com/ga.js",
      "https://cdn.mxpnl.com/libs/mixpanel-2.1.min.js",
      "https://connect.facebook.net/en_US/all.js",
      "https://platform.twitter.com/widgets.js",
      "https://syndication.twitter.com/",
      "https://gist.github.com/"
    ],
    "frame-ancestors": [SELF],
    "report-uri": ["https://hackpad.com/csp_log"],
    "referrer": ["origin-when-crossorigin"]
  };

  if (cdn()) {
    cspPolicy["script-src"].push(cdn() + "/");
  }

  if (!isProduction()) {
    cspPolicy["script-src"].push(
      "http://www.google-analytics.com/ga.js",
      "http://cdn.mxpnl.com/libs/mixpanel-2.1.min.js");
    cspPolicy["default-src"].push("http://*");
  }

  var scriptSrcStr = "script-src " + cspPolicy["script-src"].join(" ");
  delete cspPolicy["script-src"];
  var cspstr = "";
  for (var directiveName in cspPolicy) {
    cspstr += directiveName + " " + cspPolicy[directiveName].join(" ") + "; "
  }
  return cspstr + scriptSrcStr;
}

function cspNonce() {
  return sha1.hex_hmac_sha1(appjet.config.requestSigningSecret, xsrfToken());
}

function getCSPPolicy() {
  return _getCSPPolicy() + "';";
}
