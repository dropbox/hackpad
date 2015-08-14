/*!
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

$(window).bind("load", function() {
  getCollabClient.windowLoaded = true;
});

/** Call this when the document is ready, and a new Ace2Editor() has been created and inited.
    ACE's ready callback does not need to have fired yet.
    "serverVars" are from calling doc.getCollabClientVars() on the server. */
function getCollabClient(ace2editor, serverVars, initialUserInfo, options, keepStatic) {
  var editor = ace2editor;

  var rev = serverVars.rev;
  var padId = serverVars.padId;
  var globalPadId = serverVars.globalPadId;

  var state = "IDLE";
  var stateMessage;
  var stateMessageSocketId;
  var channelState = "CONNECTING";
  var appLevelDisconnectReason = null;
  var haveChanges = false;

  var lastCommitTime = 0;
  var initialStartConnectTime = 0;
  var lastMsgSentTime = 0;

  var userId = initialUserInfo.userId;
  var socketId;
  var oldSocketId;
  var socket;
  var userSet = {}; // userId -> userInfo
  var groupSet = {}; // groupId -> groupInfo
  var userSiteSet = {}; // userId -> userInfo
  userSet[userId] = initialUserInfo;
  userSiteSet[userId] = initialUserInfo;

  var reconnectTimes = [];
  var liteReconnects = 0;

  var caughtErrors = [];
  var caughtErrorCatchers = [];
  var caughtErrorTimes = [];
  var debugMessages = [];

  var lastFlushedSeqNumber = 0;

  tellAceAboutHistoricalAuthors(serverVars.historicalAuthorData);
  tellAceActiveAuthorInfo(initialUserInfo);

  var callbacks = {
    onUserJoin: function() {},
    onUserLeave: function() {},
    onUserKill: function() {},
    onUpdateUserInfo: function() {},
    onUserSiteJoin: function() {},
    onUpdateUserSiteInfo: function() {},
    onUserSiteLeave: function() {},
    onUserEdited: function() {},
    onGroupJoin: function() {},
    onGroupRemove: function() {},
    onUpdateGroupInfo: function() {},
    onChannelStateChange: function() {},
    onClientMessage: function() {},
    onInternalAction: function() {},
    onConnectionTrouble: function() {},
    onServerMessage: function() {},
    onSiteToClientMessage: function() {},
    onModeratedPadEdited: function() {}
  };

  $(window).bind("unload", function() {
    if (socket) {
      socket.onclosed = function() {};
      socket.onhiccup = function() {};
      socket.disconnect(true);
    }
  });
  if ($.browser.mozilla) {
    // Prevent "escape" from taking effect and canceling a comet connection;
    // doesn't work if focus is on an iframe.
    $(window).bind("keydown", function(evt) { if (evt.which == 27) { evt.preventDefault() } });
  }

  editor.setProperty("userAuthor", userId);
  editor.setBaseAttributedText({ text: unescape(serverVars.initialAttributedText.text), attribs: serverVars.initialAttributedText.attribs }, serverVars.apool);
  editor.setUserChangeNotificationCallback(wrapRecordingErrors("handleUserChanges", handleUserChanges));
  if (serverVars.missedChanges) {
    editor.callWithAce(function(ace) {
      var rep = ace.getRep();
      var cs;
      var wireApool;
      if (serverVars.missedChanges.committedChangeset) {
        state = "COMMITTING";
        oldSocketId = serverVars.missedChanges.committedChangesetSocketId;
        cs = serverVars.missedChanges.committedChangeset;
        wireApool = (new AttribPool()).fromJsonable(serverVars.missedChanges.committedChangesetAPool);
        cs = Changeset.moveOpsToNewPool(cs, wireApool, rep.apool);
        ace.performDocumentApplyChangeset(cs);
        prepareCommitMessage();
      }
      if (serverVars.missedChanges.furtherChangeset) {
        cs = serverVars.missedChanges.furtherChangeset;
        wireApool = (new AttribPool()).fromJsonable(serverVars.missedChanges.furtherChangesetAPool);
        cs = Changeset.moveOpsToNewPool(cs, wireApool, rep.apool);
        ace.performDocumentApplyChangeset(cs);
      }
    }, 'applyMissedChanges', true);
  }

  function abandonConnection(reason) {
    dmesg("abandoning connect " + reason);
    if (socket) {
      socket.onclosed = function() {};
      socket.onhiccup = function() {};
      socket.disconnect();
    }
    socket = null;
    setChannelState("DISCONNECTED", reason);
  }

  function freakout(msg) {
    dmesg(msg);
    window.onfreakout && window.onfreakout(msg);
  }

  function dmesg(str) {
    if (typeof window.ajlog == "string") window.ajlog += str+'\n';
    debugMessages.push(str);
  }

  var handleUserChangesTimeout = 0;
  function queueUserChanges(timeout) {
    // console.log('Queuing handleUserChanges in', timeout / 1000);
    handleUserChangesTimeout = setTimeout(wrapRecordingErrors("setTimeout(handleUserChanges)",
                                                              handleUserChanges), timeout);
  }
  function handleUserChanges() {
    dmesg("handling user changes");

    if (handleUserChangesTimeout) {
      clearTimeout(handleUserChangesTimeout);
      handleUserChangesTimeout = 0;
    }
    haveChanges = true;

    if (clientVars.userIsGuest) {
      if (top.location.pathname == "/") {
        return;
      }
      if (!padutils.getIsMobile() && clientVars.padId == "AWELCOMEPAD") {
        $('body').addClass('guestbanner');
        $("#guestbanner #guest-banner-msg").html("Your changes are not being saved. <a href=\"#\">Sign In</a> to start using Hackpad.")
          .effect("pulsate",{times:1}, 500, function() { $(this).stop(true); }).click(function() { modals.showModal('#page-login-box', 0); return false; });
      } else {
        modals.showHTMLModal($("#page-login-box"));
      }
      return;
    }

    if ((! socket) || channelState == "CONNECTING") {
      if (channelState == "CONNECTING" && initialStartConnectTime && (((+new Date()) - initialStartConnectTime) > 20000)) {
        abandonConnection("initsocketfail"); // give up
      }
      else {
        if (state == "IDLE") {
          state = "WAITING";
          callbacks.onInternalAction("userChangesBeforeConnected");
        }
        // check again in a bit
        queueUserChanges(1000);
      }
      return;
    }

    var t = (+new Date());

    if (state == "COMMITTING") {
      if (t - lastCommitTime > 45000) {
        dmesg ("slow commit: disconnecting");
        // a commit is taking too long
        appLevelDisconnectReason = "slowcommit";
        socket.disconnect();
      }
      else if (t - lastCommitTime > 5000) {
        callbacks.onConnectionTrouble("SLOW");
        queueUserChanges(lastCommitTime + 45000 - t);
      }
      else {
        // run again in a few seconds, to detect a disconnect
        queueUserChanges(3000);
      }
      return;
    }
    if (!padId) {
      // leave haveChanges = true for sendClientReady();
      if (state == "IDLE") {
        // Let client know there are pending changes
        state = "WAITING";
        callbacks.onInternalAction("userChangesBeforePadId");
      }
      return;
    }
    haveChanges = false;


    // delay commit if there was a commit in the last 500ms
    var earliestCommit = lastCommitTime + 500;
    if (t < earliestCommit) {
      queueUserChanges(earliestCommit - t);
      return;
    }

    dmesg("performing commit");
    if (prepareCommitMessage()) {
      lastCommitTime = t;
      stateMessageSocketId = socketId;
      sendMessage(stateMessage);
      callbacks.onInternalAction("commitPerformed");
      // run again in a few seconds, to detect a disconnect
      queueUserChanges(3000);
    }
  }

  function prepareCommitMessage() {
    var userChangesData = editor.prepareUserChangeset();
    if (!userChangesData.changeset) {
      return false;
    }
    state = "COMMITTING";
    stateMessage = {type:"USER_CHANGES", baseRev:rev,
                    changeset:userChangesData.changeset,
                    apool: userChangesData.apool };
    return true;
  }

  function getStats() {
    var stats = {};

    stats.screen = [$(window).width(), $(window).height(),
                    window.screen.availWidth, window.screen.availHeight,
                    window.screen.width, window.screen.height].join(',');
    stats.ip = serverVars.clientIp;
    stats.useragent = serverVars.clientAgent;

    return stats;
  }

  function sendClientReady() {
    var msg = { type:"CLIENT_READY", roomType:'padpage',
                roomName:'padpage/'+globalPadId,
                data: {
                  lastRev:rev,
                  userInfo:userSet[userId],
                  stats: getStats() } };
    if (oldSocketId) {
      msg.data.isReconnectOf = oldSocketId;
      msg.data.isCommitPending = (state == "COMMITTING");
      if (msg.data.isCommitPending) {
        // Skip 500ms delay when reconnecting.
        lastCommitTime = (+new Date()) - 1;
      }
    }
    sendMessage(msg);
    doDeferredActions();
    if (haveChanges) {
      handleUserChanges();
    }
  }

  function setUpSocket(connectLite) {
    var success = false;
    if (keepStatic) {
      return;
    }
    callCatchingErrors("setUpSocket", function() {
      appLevelDisconnectReason = null;

      oldSocketId = socketId;
      socketId = String(Math.floor(Math.random()*1e12));
      socket = new EtherpadWebSocket(socketId, padId);
      socket.onmessage = wrapRecordingErrors("socket.onmessage", handleMessageFromServer);
      socket.onclosed = wrapRecordingErrors("socket.onclosed", handleSocketClosed);
      socket.onopen = wrapRecordingErrors("socket.onopen", function() {
        hiccupCount = 0;
        liteReconnects = 0;
        setChannelState("CONNECTED");
        if (padId) {
          sendClientReady();
        }
      });
      socket.onhiccup = wrapRecordingErrors("socket.onhiccup", handleCometHiccup);
      socket.onlogmessage = dmesg;
      socket.connectLite = connectLite;
      socket.connect();
      success = true;
    });
    if (success) {
      initialStartConnectTime = +new Date();
    }
    else {
      abandonConnection("initsocketfail");
    }
  }
  function setUpSocketWhenWindowLoaded() {
    if (getCollabClient.windowLoaded) {
      setUpSocket();
    }
    else {
      setTimeout(setUpSocketWhenWindowLoaded, 200);
    }
  }
  setTimeout(setUpSocketWhenWindowLoaded, 0);

  function reconnect() {
    if (channelState == "DISCONNECTED") {
      setChannelState("CONNECTING");
      setUpSocket();
    }
  }

  function setPadId(newPadId, newGlobalPadId) {
    padId = newPadId;
    globalPadId = newGlobalPadId;
    if (channelState == "CONNECTED") {
      sendClientReady();
    }
  }

  var hiccupCount = 0;
  function handleCometHiccup(params) {
    dmesg("HICCUP (connected:"+(!!params.connected)+")");
    var connectedNow = params.connected;
    if (! connectedNow) {
      hiccupCount++;
      // skip first "cut off from server" notification
      if (hiccupCount > 1) {
        setChannelState("RECONNECTING");
      }
    }
    else {
      hiccupCount = 0;
      setChannelState("CONNECTED");
    }
  }

  function sendMessage(msg) {
    if (!socket) {
      dmesg("Can't sendMessage without a socket!");
      return;
    }
    socket.postMessage(JSON.stringify({type: "COLLABROOM", data: msg}));
    lastMsgSentTime = +(new Date());
    lastFlushedSeqNumber = socket.getLastReceivedSeqNumber();
  }

  function wrapRecordingErrors(catcher, func) {
    return function() {
      try {
        return func.apply(this, Array.prototype.slice.call(arguments));
      }
      catch (e) {
        caughtErrors.push(e);
        caughtErrorCatchers.push(catcher);
        caughtErrorTimes.push(+new Date());
        //console.dir({catcher: catcher, e: e});
        throw e;
      }
    };
  }

  function callCatchingErrors(catcher, func) {
    try {
      wrapRecordingErrors(catcher, func)();
    }
    catch (e) { /*absorb*/ }
  }

  function handleMessageFromServer(evt) {
    if (! socket) return;
    if (! evt.data) return;
    var wrapper = JSON.parse(evt.data);
    if(wrapper.type != "COLLABROOM") return;
    var msg = wrapper.data;
    if (msg.type == "NEW_CHANGES") {
      var newRev = msg.newRev;
      var changeset = msg.changeset;
      var author = (msg.author || '');
      var apool = msg.apool;
      if (newRev != (rev+1)) {
        freakout("bad message revision on NEW_CHANGES: "+newRev+" not "+(rev+1));
        socket.disconnect();
        return;
      }
      rev = newRev;
      editor.applyChangesToBase(changeset, author, apool);
      if (author != "") {
        callCatchingErrors("onUserEdited", function() {
          callbacks.onUserEdited(userSet[author], changeset);
        });
      }
    } else if (msg.type == "ACCEPT_COMMIT") {
      var newRev = msg.newRev;
      if (newRev != (rev+1)) {
        freakout("bad message revision on ACCEPT_COMMIT: "+newRev+" not "+(rev+1));
        socket.disconnect();
        return;
      }
      rev = newRev;
      editor.applyPreparedChangesetToBase();
      setStateIdle();
      callCatchingErrors("onInternalAction", function() {
        callbacks.onInternalAction("commitAcceptedByServer");
      });
      callCatchingErrors("onConnectionTrouble", function() {
        callbacks.onConnectionTrouble("OK");
      });
      handleUserChanges();
    }
    else if (msg.type == "NO_COMMIT_PENDING") {
      if (state == "COMMITTING") {
        // server missed our commit message; abort that commit
        setStateIdle();
        handleUserChanges();
      }
    }
    else if (msg.type == "USER_NEWINFO") {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;
      if (userSet[id]) {
        userSet[id] = userInfo;
        callbacks.onUpdateUserInfo(userInfo);
        dmesgUsers();
      }
      else {
        userSet[id] = userInfo;
        callbacks.onUserJoin(userInfo);
        dmesgUsers();
      }
      tellAceActiveAuthorInfo(userInfo);
    }
    else if (msg.type == "USER_SITE_NEWINFO") {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;
      if (userSiteSet[id]) {
        userSiteSet[id] = userInfo;
        callbacks.onUpdateUserSiteInfo(userInfo);
      }
      else {
        userSiteSet[id] = userInfo;
        callbacks.onUserSiteJoin(userInfo);
      }
    }
    else if (msg.type == "EDITOR_NEWINFO") {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;
      tellAceActiveAuthorInfo(userInfo);
    }
    else if (msg.type == "USER_LEAVE") {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;
      if (userSet[id]) {
        delete userSet[userInfo.userId];
        fadeAceAuthorInfo(userInfo);
        callbacks.onUserLeave(userInfo);
        dmesgUsers();
      }
    }
    else if (msg.type == "USER_SITE_LEAVE") {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;
      if (userSiteSet[id]) {
        delete userSiteSet[userInfo.userId];
        callbacks.onUserSiteLeave(userInfo);
      }
    }
    else if (msg.type == "USER_KILL") {
      var userInfo = msg.userInfo;
      delete userSet[userInfo.userId];
      callbacks.onUserKill(userInfo);
      dmesgUsers();
    }
    else if (msg.type == "GROUP_REMOVEPAD") {
      var userInfo = msg.userInfo;
      var groupId = userInfo.groupId;
      if (groupSet[groupId]) {
        delete groupSet[groupId];
      }
      callbacks.onGroupRemove(userInfo);
      dmesgUsers();
    }
    else if (msg.type == "GROUP_NEWINFO") {
      var userInfo = msg.userInfo;
      var groupId = userInfo.groupId;
      if (groupSet[groupId]) {
        groupSet[groupId] = userInfo;
        callbacks.onUpdateGroupInfo(userInfo);
        dmesgUsers();
      }
      else {
        groupSet[groupId] = userInfo;
        callbacks.onGroupJoin(userInfo);
        dmesgUsers();
      }
    }
    else if (msg.type == "DISCONNECT_REASON") {
      appLevelDisconnectReason = msg.reason;
      switch (appLevelDisconnectReason) {
        case "unauth":
          modals.showModal("#page-login-box", 0);
          break;
        case "invalidrev":
          freakout("bad message revision on CLIENT_READY: " + rev);
          break;
        default:
          break;
      }
    }
    else if (msg.type == "MODERATION_MESSAGE") {
      callbacks.onModeratedPadEdited();
    }
    else if (msg.type == "CLIENT_MESSAGE") {
      callbacks.onClientMessage(msg.payload);
    }
    else if (msg.type == "SERVER_MESSAGE") {
      callbacks.onServerMessage(msg.payload);
    }
    else if (msg.type == "SITE_TO_CLIENT_MESSAGE") {
      callbacks.onSiteToClientMessage(msg.payload);
    }
    else if (msg.type == "SITE_MESSAGE") {
      callbacks.onSiteMessage(msg.payload);
    }
  }
  function updateUserInfo(userInfo) {
    userInfo.userId = userId;
    userSet[userId] = userInfo;
    tellAceActiveAuthorInfo(userInfo);
    if (! socket) return;
    sendMessage({type: "USERINFO_UPDATE", userInfo:userInfo});
  }

  function tellAceActiveAuthorInfo(userInfo) {
    tellAceAuthorInfo(userInfo.userId, userInfo.colorId, false, userInfo.name, userInfo.userLink);
  }
  function tellAceAuthorInfo(userId, colorId, inactive, name, userLink) {
    if (colorId || (typeof colorId) == "number") {
      colorId = Number(colorId);
      if (options && options.colorPalette && options.colorPalette[colorId % options.colorPalette.length]) {
        var cssColor = options.colorPalette[colorId % options.colorPalette.length];
        if (inactive) {
          // disable fading, we have other indicators of presence
          // editor.setAuthorInfo(userId, {bgcolor: cssColor, fade: 0.5, name: name, userLink: userLink});
          editor.setAuthorInfo(userId, {bgcolor: cssColor, name: name, userLink: userLink});
        }
        else {
          editor.setAuthorInfo(userId, {bgcolor: cssColor, name: name, userLink: userLink});
        }
      }
    }
  }
  function fadeAceAuthorInfo(userInfo) {
    tellAceAuthorInfo(userInfo.userId, userInfo.colorId, true, userInfo.name, userInfo.userLink);
  }

  function getConnectedUsers() {
    return valuesArray(userSet);
  }

  function tellAceAboutHistoricalAuthors(hadata) {
    for(var author in hadata) {
      var data = hadata[author];
      if (! userSet[author]) {
        tellAceAuthorInfo(author, data.colorId, true, data.name, data.userLink);
      }
    }
  }

  function dmesgUsers() {
    //pad.dmesg($.map(getConnectedUsers(), function(u) { return u.userId.slice(-2); }).join(','));
  }

  function handleSocketClosed(params) {
    // console.log("socket has closed");

    socket.onmessage = function() {};
    socket.onclosed = function() {};
    socket.onopen = function() {};
    socket.onhiccup = function() {};
    socket.onlogmessage = function(msg) {
      dmesg("(closed) " + msg);
    };
    socket = null;
    $.each(keys(userSet), function() {
      var uid = String(this);
      if (uid != userId) {
        var userInfo = userSet[uid];
        delete userSet[uid];
        callbacks.onUserLeave(userInfo);
        dmesgUsers();
      }
    });

    var reason = appLevelDisconnectReason || params.reason;
    var shouldReconnect = params.reconnect;
    if (shouldReconnect) {

      // determine if this is a tight reconnect loop due to weird connectivity problems
      reconnectTimes.push(+new Date());
      var TOO_MANY_RECONNECTS = 8;
      var TOO_SHORT_A_TIME_MS = 10000;
      if (reconnectTimes.length >= TOO_MANY_RECONNECTS &&
          ((+new Date()) - reconnectTimes[reconnectTimes.length-TOO_MANY_RECONNECTS]) <
          TOO_SHORT_A_TIME_MS) {
        setChannelState("DISCONNECTED", "looping");
      }
      else {
        setChannelState("RECONNECTING", reason);
        setUpSocket();
      }

    }
    else {
      reconnectTimes.push(+new Date());
      var MAX_RECONNECTS = 100;

      if (haveChanges || !params.reconnectLite || liteReconnects > MAX_RECONNECTS) {
        setChannelState("DISCONNECTED", reason);
      } else {
        // Backoff reconnect
        liteReconnects+=1;
        setChannelState("RECONNECTING", reason);
        var retryDelay = Math.min(30000, 1000 * Math.pow(2, liteReconnects+1));

        // Fuzz the retry delay by 40%, the new delay will be in the interval [0.6 * retryDelay, 1.4 * retryDelay]
        var fuzzedRetryDelay = _generateFuzzyInterval(retryDelay, 0.4 * retryDelay /* maxFuzz */);
        setTimeout(function() {setUpSocket(true/*connectLite*/)}, fuzzedRetryDelay);
        reconnectTimes = reconnectTimes.slice(0, 50);
      }
    }
  }

  function setChannelState(newChannelState, moreInfo) {
    dmesg("Channel state being set to " + newChannelState);
    if (newChannelState != channelState) {
      channelState = newChannelState;
      callbacks.onChannelStateChange(channelState, moreInfo);
    }
  }

  function keys(obj) {
    var array = [];
    $.each(obj, function (k, v) { array.push(k); });
    return array;
  }
  function valuesArray(obj) {
    var array = [];
    $.each(obj, function (k, v) { array.push(v); });
    return array;
  }

  // We need to present a working interface even before the socket
  // is connected for the first time.
  var deferredActions = [];
  function defer(func, tag) {
    return function() {
      var that = this;
      var args = arguments;
      function action() {
        func.apply(that, args);
      }
      action.tag = tag;
      if (channelState == "CONNECTING") {
        deferredActions.push(action);
      }
      else {
        action();
      }
    }
  }
  function doDeferredActions(tag) {
    var newArray = [];
    for(var i=0;i<deferredActions.length;i++) {
      var a = deferredActions[i];
      if ((!tag) || (tag == a.tag)) {
        a();
      }
      else {
        newArray.push(a);
      }
    }
    deferredActions = newArray;
  }

  function sendClientMessage(msg) {
    sendMessage({ type: "CLIENT_MESSAGE", payload: msg });
  }

  function getCurrentRevisionNumber() {
    return rev;
  }

  function hasUncommittedChanges() {
    return state == 'COMMITTING' || state == 'WAITING' || handleUserChangesTimeout;
  }

  function getDiagnosticInfo() {
    var maxCaughtErrors = 3;
    var maxAceErrors = 3;
    var maxDebugMessages = 50;
    var longStringCutoff = 500;

    function trunc(str) {
      return String(str).substring(0, longStringCutoff);
    }

    var info = { errors: {length: 0} };
    function addError(e, catcher, time) {
      var error = {catcher:catcher};
      if (time) error.time = time;

      // a little over-cautious?
      try { if (e.description) error.description = e.description; } catch (x) {}
      try { if (e.fileName) error.fileName = e.fileName; } catch (x) {}
      try { if (e.lineNumber) error.lineNumber = e.lineNumber; } catch (x) {}
      try { if (e.message) error.message = e.message; } catch (x) {}
      try { if (e.name) error.name = e.name; } catch (x) {}
      try { if (e.number) error.number = e.number; } catch (x) {}
      try { if (e.stack) error.stack = trunc(e.stack); } catch (x) {}

      info.errors[info.errors.length] = error;
      info.errors.length++;
    }
    for(var i=0; ((i<caughtErrors.length) && (i<maxCaughtErrors)); i++) {
      addError(caughtErrors[i], caughtErrorCatchers[i], caughtErrorTimes[i]);
    }
    if (editor) {
      var aceErrors = editor.getUnhandledErrors();
      for(var i=0; ((i<aceErrors.length) && (i<maxAceErrors)) ;i++) {
        var errorRecord = aceErrors[i];
        addError(errorRecord.error, "ACE", errorRecord.time);
      }
    }

    info.time = +new Date();
    info.collabState = state;
    info.channelState = channelState;
    info.lastCommitTime = lastCommitTime;
    info.numSocketReconnects = reconnectTimes.length;
    info.userId = userId;
    info.currentRev = rev;
    info.participants = (function() {
      var pp = [];
      for(var u in userSet) {
        pp.push(u);
      }
      return pp.join(',');
    })();

    if (debugMessages.length > maxDebugMessages) {
      debugMessages = debugMessages.slice(debugMessages.length-maxDebugMessages,
                                          debugMessages.length);
    }

    info.debugMessages = {length: 0};
    for(var i=0;i<debugMessages.length;i++) {
      info.debugMessages[i] = trunc(debugMessages[i]);
      info.debugMessages.length++;
    }

    return info;
  }

  function getMissedChanges() {
    var obj = {};
    obj.userInfo = userSet[userId];
    obj.baseRev = rev;
    if (state == "COMMITTING" && stateMessage) {
      obj.committedChangeset = stateMessage.changeset;
      obj.committedChangesetAPool = stateMessage.apool;
      obj.committedChangesetSocketId = stateMessageSocketId;
    }
    var userChangesData = editor.userChangesetForWire();
    if (userChangesData.changeset) {
      obj.furtherChangeset = userChangesData.changeset;
      obj.furtherChangesetAPool = userChangesData.apool;
    }
    return obj;
  }

  function setStateIdle() {
    state = "IDLE";
    callbacks.onInternalAction("newlyIdle");
    schedulePerhapsCallIdleFuncs();
  }

  function callWhenNotCommitting(func) {
    idleFuncs.push(func);
    schedulePerhapsCallIdleFuncs();
  }

  var idleFuncs = [];
  function schedulePerhapsCallIdleFuncs() {
    setTimeout(function() {
      if (state == "IDLE") {
        while (idleFuncs.length > 0) {
          var f = idleFuncs.shift();
          f();
        }
      }
    }, 0);
  }

  function _generateFuzzyInterval(targetInterval, maxFuzz) {
    return targetInterval + Math.floor((Math.random() * (2*maxFuzz + 1)) - maxFuzz);
  }

  // Flush unconfirmed messages server side every ten minutes to keep the
  // streaming socket from growing unbounded.
  var flushInterval = _generateFuzzyInterval(1000*60*10, 1000*60*2);
  function flushUnconfirmedMessages(){
    var lastReceived = socket && socket.getLastReceivedSeqNumber() || 0;
    var now = +(new Date());
    // Allow a delta of 1 second to account for the interval between this timer firing and the previous
    // flush message actually being sent (where lastMsgSentTime is being set).
    if ((lastReceived > lastFlushedSeqNumber) &&
      ((now - lastMsgSentTime) > (flushInterval - 1000))) {
      callWhenNotCommitting(function(){
        sendMessage({type: 'FLUSH_MESSAGE'});
        lastFlushedSeqNumber = lastReceived;
      });
    }
    flushInterval = _generateFuzzyInterval(1000*60*10, 1000*60*2);
    window.setTimeout(flushUnconfirmedMessages, flushInterval);
  }

  window.setTimeout(flushUnconfirmedMessages, flushInterval);

  var self;
  return (self = {
    setOnUserJoin: function(cb) { callbacks.onUserJoin = cb; },
    setOnUserLeave: function(cb) { callbacks.onUserLeave = cb; },
    setOnUserKill: function(cb) { callbacks.onUserKill = cb; },
    setOnUpdateUserInfo: function(cb) { callbacks.onUpdateUserInfo = cb; },
    setOnUserSiteJoin: function(cb) { callbacks.onUserSiteJoin = cb; },
    setOnUserSiteLeave: function(cb) { callbacks.onUserSiteLeave = cb; },
    setOnUpdateUserSiteInfo: function(cb) { callbacks.onUpdateUserSiteInfo = cb; },
    setOnUserEdited: function(cb) { callbacks.onUserEdited = cb; },
    setOnGroupJoin: function(cb) { callbacks.onGroupJoin = cb; },
    setOnGroupRemove: function(cb) { callbacks.onGroupRemove = cb; },
    setOnUpdateGroupInfo: function(cb) { callbacks.onUpdateGroupInfo = cb; },
    setOnChannelStateChange: function(cb) { callbacks.onChannelStateChange = cb; },
    setOnClientMessage: function(cb) { callbacks.onClientMessage = cb; },
    setOnModeratedPadEdited: function(cb) { callbacks.onModeratedPadEdited = cb; },
    setOnInternalAction: function(cb) { callbacks.onInternalAction = cb; },
    setOnConnectionTrouble: function(cb) { callbacks.onConnectionTrouble = cb; },
    setOnServerMessage: function(cb) { callbacks.onServerMessage = cb; },
    setOnSiteToClientMessage: function(cb) { callbacks.onSiteToClientMessage = cb; },
    setOnSiteMessage: function(cb) { callbacks.onSiteMessage = cb; },
    updateUserInfo: defer(updateUserInfo),
    getConnectedUsers: getConnectedUsers,
    sendClientMessage: sendClientMessage,
    getCurrentRevisionNumber: getCurrentRevisionNumber,
    getDiagnosticInfo: getDiagnosticInfo,
    hasUncommittedChanges: hasUncommittedChanges,
    getMissedChanges: getMissedChanges,
    callWhenNotCommitting: callWhenNotCommitting,
    addHistoricalAuthors: tellAceAboutHistoricalAuthors,
    reconnect: reconnect,
    pause: function() {callbacks.onChannelStateChange = function(){}; abandonConnection("paused")},
    setPadId: setPadId
  });
}


function selectElementContents(elem) {
  if ($.browser.msie) {
    var range = document.body.createTextRange();
    range.moveToElementText(elem);
    range.select();
  }
  else {
    if (window.getSelection) {
      var browserSelection = window.getSelection();
      if (browserSelection) {
        var range = document.createRange();
        range.selectNodeContents(elem);
        browserSelection.removeAllRanges();
        browserSelection.addRange(range);
      }
    }
  }
}
