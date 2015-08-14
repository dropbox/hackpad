
var padnotify = (function() {
  var NOTIFY_TIMEOUT = 10 * 1000;
  var NOTIFY_MIN_DELAY = 60 * 1000;
  var NOTIFY_PERMISSION_RETRY_DELAY = 5 * 60 * 1000;

  var hasFocusedSinceLastNotify = true;
  var lastPermissionTime = null;
  var lastNotifyTime = null;
  var lastNotify = null;

  function _showUserEditNotification(userInfo, changeset) {
    var userPic = userInfo.userPic || "/static/img/hackpad-logo.png";
    var userName = userInfo.name;

    // TODO: get longest run of added text from changeset and use it for the notification description
    //       cancel and reshow if new changes come in

    var notify = new Notification(pad.getTitle(), {icon: userPic, body: "Edited by " + userName});
    notify.onclick = function() {
      // TODO: make clicking the notification go to the change location
       window.focus();
       padeditor.ace.focus();
       notify.close();
    };
    notify.onclose = function() {
      lastNotify = null;
    };
    setTimeout(function() { notify.close(); }, NOTIFY_TIMEOUT);

    lastNotify = notify;
  }

  function _showUserChatNotification(msg) {
    var userInfo = clientVars.siteUserInfos[msg.userId];
    var userPic = userInfo.userPic || "/static/img/hackpad-logo.png";
    var userName = userInfo.name;

    var notify = new Notification(userName + ' (' + clientVars.siteName + ')', {icon: userPic, body: msg.lineText});
    notify.onclick = function() {
       window.focus();
       notify.close();
    };
    notify.onclose = function() {
    };
    setTimeout(function() { notify.close(); }, NOTIFY_TIMEOUT);
  }

  function _focusHandler() {
    hasFocusedSinceLastNotify = true;
    if (lastNotify) {
      lastNotify.close();
    }
  }

  function _isSharedPad() {
    if ((clientVars.invitedGroupInfos && clientVars.invitedGroupInfos.length > 0) ||
        (clientVars.invitedUserInfos && clientVars.invitedUserInfos.filter(
          function(u) { return u.userId != clientVars.userId; }).length > 0)) {
      return true;
    }
    return false;
  }

  var self = {
    init: function() {
      if (!window['Notification']) { return; }

      if (Notification.permission != 'granted' ) {
        padeditor.aceObserver.on('keypress', function (evt) {
          if (!lastPermissionTime || new Date() - lastPermissionTime > NOTIFY_PERMISSION_RETRY_DELAY) {
            if (_isSharedPad() && !clientVars.demoMode) {
              lastPermissionTime = new Date();
              Notification.requestPermission();
            }
          }
        });
      }

      // setup focus handlers to allow more notifications
      $(window).focus(_focusHandler);
      padeditor.aceObserver.on('focus', _focusHandler);
    },
    userEdited: function(userInfo, changeset) {
      if (!window['Notification']) { return; }

      if (!userInfo || userInfo.userId == clientVars.userId) { // FIXME: userId is empty sometimes
        return;
      }
      if (hasFocusedSinceLastNotify) {
        if (!lastNotifyTime || new Date() - lastNotifyTime > NOTIFY_MIN_DELAY) {
          lastNotifyTime = new Date();
          hasFocusedSinceLastNotify = false;

          // notify userId is editing
          _showUserEditNotification(userInfo, changeset);
        }
      }
    },
    userChat: function(msg) {
      if (!window['Notification']) { return; }
      _showUserChatNotification(msg);
    }
  };
  return self;
}());
