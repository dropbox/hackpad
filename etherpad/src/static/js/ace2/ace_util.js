ace.util = {};

ace.util.newTimeLimit = function(ms) {
  //console.log("new time limit");
  var startTime = now();
  var lastElapsed = 0;
  var exceededAlready = false;
  var printedTrace = false;
  var isTimeUp =  function () {
    if (exceededAlready) {
      if ((! printedTrace)) {// && now() - startTime - ms > 300) {
        //console.trace();
        printedTrace = true;
      }
      return true;
    }
    var elapsed = now() - startTime;
    if (elapsed > ms) {
      exceededAlready = true;
      //console.log("time limit hit, before was %d/%d", lastElapsed, ms);
      //console.trace();
      return true;
    }
    else {
      lastElapsed = elapsed;
      return false;
    }
  }
  isTimeUp.elapsed = function() { return now() - startTime; }
  return isTimeUp;
};


ace.util.doAlert = function(str) {
  var hpEditorAlertMsgEl = $('.hp-editor-alert-msg');
  if (!hpEditorAlertMsgEl.length) {
    hpEditorAlertMsgEl = $('<div>').
        addClass('global-msg hp-editor-alert-msg').
        hide().
        appendTo($('body'));
  }

  window.clearTimeout(hpEditorAlertMsgEl.data('fadeOutTimer'));
  hpEditorAlertMsgEl.
      fadeIn().
      text(str).
      data('fadeOutTimer', window.setTimeout(function() {
        hpEditorAlertMsgEl.fadeOut();
      } , 3000));
};


ace.util.makeIdleAction = function(func) {
  var scheduledTimeout = null;
  var scheduledTime = 0;
  function unschedule() {
    if (scheduledTimeout) {
      window.clearTimeout(scheduledTimeout);
      scheduledTimeout = null;
    }
  }

  function reschedule(time) {
    unschedule();
    scheduledTime = time;
    var delay = time - now();
    if (delay < 0) delay = 0;
    scheduledTimeout = window.setTimeout(callback, delay);
  }

  function callback() {
    scheduledTimeout = null;
    // func may reschedule the action
    func();
  }

  return {
    atMost: function (ms) {
      var latestTime = now() + ms;
      if ((! scheduledTimeout) || scheduledTime > latestTime) {
        reschedule(latestTime);
      }
    },
    // atLeast(ms) will schedule the action if not scheduled yet.
    // In other words, "infinity" is replaced by ms, even though
    // it is technically larger.
    atLeast: function (ms) {
      var earliestTime = now() + ms;
      if ((! scheduledTimeout) || scheduledTime < earliestTime) {
        reschedule(earliestTime);
      }
    },
    never: function() {
      unschedule();
    }
  }
};

ace.util.isValidBrowserForSpellcheck = function() {
  var uaInfo = userAgentInfo();
  if ((uaInfo.browser == 'Chrome' && uaInfo.version >= 29) ||
      (uaInfo.browser == 'Firefox' && uaInfo.version >= 20) ||
      (uaInfo.browser == 'Internet Explorer' && uaInfo.version >= 8)) {
    return true;
  }

  return false;
};

ace.util.cachedStrFunc = function(func) {
  var cache = {};
  return function(s) {
    if (!cache[s]) {
      cache[s] = func(s);
    }
    return cache[s];
  };
};

ace.util.equalLineAndChars = function (a, b) {
  if (!a) return !b;
  if (!b) return !a;
  return (a[0] == b[0] && a[1] == b[1]);
};
