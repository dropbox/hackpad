$('html').removeClass('no-js');

$.ajaxPrefilter(function(options, originalOptions, jqXHR) {
  if (options.type.toLowerCase() == 'get' || !options.contentType) {
    return;
  }

  // Parse the XSRF token from the cookie
  var tokenValue;
  var tokenCookie = $.grep(document.cookie.split(/;\s+/),
    function(c){ return c.split("=")[0] == "TOK" })[0];
  if (tokenCookie) {
    tokenValue = tokenCookie.split("=")[1];
  }

  if (options.contentType.indexOf('json') != -1) {
    options.data = options.data || "{}";
    options.data = JSON.stringify($.extend(JSON.parse(options.data),
        { xsrf: tokenValue }));
  } else if (options.contentType.indexOf('application/x-www-form-urlencoded') != -1) {
    options.data = options.data || '';
    if (options.data.indexOf('xsrf=') == -1) {
      options.data += (options.data ? '&' : '') +
          'xsrf=' + tokenValue
    }
  }
  var a=0;
});

//     Underscore.js 1.5.2
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.
// Returns a function, that, when invoked, will only be triggered at most once
// during a given window of time. Normally, the throttled function will run
// as much as it can, without ever going more than once per `wait` duration;
// but if you'd like to disable the execution on the leading edge, pass
// `{leading: false}`. To disable execution on the trailing edge, ditto.
function throttle(func, wait, options) {
  var context, args, result;
  var timeout = null;
  var previous = 0;
  options || (options = {});
  var later = function() {
    previous = options.leading === false ? 0 : new Date;
    timeout = null;
    result = func.apply(context, args);
  };
  return function() {
    var now = new Date;
    if (!previous && options.leading === false) previous = now;
    var remaining = wait - (now - previous);
    context = this;
    args = arguments;
    if (remaining <= 0) {
      clearTimeout(timeout);
      timeout = null;
      previous = now;
      result = func.apply(context, args);
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining);
    }
    return result;
  };
};

function showGlobalMsg(msg) {
  var globalMsg = $('.global-msg');
  if (!globalMsg.length) {
    globalMsg = $('<div>').
        addClass('global-msg').
        hide().
        appendTo($('body'));
  }

  window.clearTimeout(globalMsg.data('fadeOutTimer'));
  globalMsg.
    fadeIn().
    text(msg).
    data('fadeOutTimer', window.setTimeout(function() {
      globalMsg.fadeOut();
    } , 3000));
}

// Cross-browser capabilities.
var caps = {};
caps.hasLocalStorage = false;
try {
  var mod = 'hackpad';
  localStorage.setItem(mod, mod);
  localStorage.removeItem(mod);
  caps.hasLocalStorage = true;
} catch(e) {
  caps.hasLocalStorage = false;
}

caps.hidden = '';
caps.visibilityChange = '';
if (typeof document.hidden !== "undefined") {
  caps.hidden = "hidden";
  caps.visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
  caps.hidden = "mozHidden";
  caps.visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  caps.hidden = "msHidden";
  caps.visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  caps.hidden = "webkitHidden";
  caps.visibilityChange = "webkitvisibilitychange";
}

function escapeRegExp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

if (!clientVars.isDogfood || !window['console']) {
  console = {};
  var names = ['log', 'debug', 'info', 'warn', 'error', 'assert', 'dir',
      'dirxml', 'group', 'groupEnd', 'time', 'timeEnd', 'count', 'trace',
      'profile', 'profileEnd'];
  for (var i = 0; i < names.length; ++i) {
    console[names[i]] = function() {};
  }
}
