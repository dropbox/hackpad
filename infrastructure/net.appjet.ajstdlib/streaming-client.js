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

function EtherpadWebSocket(id, tag) {
  var self = this;
  var socket = this;
  var version = 2;

  var timeouts = {};
  this.connectLite = false;

  this.onopen = function() { }
  this.onclosed = function() { }
  this.onmessage = function() { }
  this.onhiccup = function() { }
  this.onlogmessage = function() { }
  this.CONNECTING = 0;
  this.OPEN = 1;
  this.CLOSED = 2;
  this.readyState = -1;
  this.getLastReceivedSeqNumber = function() {
    return lastReceivedSeqNumber;
  }

  var tagArg = "";
  if (tag) {
    tagArg = "&tag=" + tag;
  }

  var cometHostSuffix = window.location.host;
  // if this is a subdomain request, use a sibling comet domain to make SSL work
  if ((cometHostSuffix.split(":").length > 1 && cometHostSuffix.split(":")[0].split(".").length == 2) ||
      (cometHostSuffix.split(".").length == 2)) {
    cometHostSuffix = '.' + cometHostSuffix;
  }
  cometHostSuffix = 'comet' + cometHostSuffix;

  var hiccupsLastMinute = 0;
  var hiccupResetInterval = setInterval(function() {
    hiccupsLastMinute = 0;
    if (self.readyState == self.CLOSED)
      clearInterval(hiccupResetInterval);
  }, 60*1000);

  var isHiccuping = false;
  function hiccup(channel) {
    if (channel != officialChannel && channel != self) return;
    if (isHiccuping) return;
    log("hiccup: "+channel.name);
    if (hiccupsLastMinute++ > 10) {
      doDisconnect({reconnect: true, reason: "Too many hiccups!"});
      return;
    }
    closeAllChannels();
    var hiccupRequest;
    function clearHiccupRequest() {
      if (hiccupRequest) {
        hiccupRequest.onreadystatechange = function() {};
        hiccupRequest.abort();
        hiccupRequest = null;
      }
    }
    timeout(timeouts, "hiccup", 15000, function() {
      isHiccuping = false;
      timeouts.singleHiccup();
      clearHiccupRequest();
      doDisconnect({reconnect: false, reason: "Couldn't contact server to hiccup.", reconnectLite:true});
    });
    isHiccuping = true;
    function tryHiccup() {
      if (self.readyState == self.CLOSED) {
        return;
      }
      if (! isHiccuping) return;
      self.onhiccup({connected: false});
      log("trying hiccup");
      timeout(timeouts, "singleHiccup", 5000, function() {
        tryHiccup();
      });
      clearHiccupRequest();
      hiccupRequest = simpleXhr('post', postPath(), true, [{key: "oob", value: "hiccup"}], function(sc, msg) {
        if (! isHiccuping || !hiccupRequest) return;
        hiccupRequest = null;
        timeouts.singleHiccup();
        if (msg.substring(0, "restart-fail".length) == "restart-fail") {
          timeouts.hiccup();
          doDisconnect({reconnect: true, reason: "Server restarted or socket timed out on server."});
        } else if (sc != 200 || msg.substring(0, 2) != "ok") {
          log("Failed to hiccup with error: "+sc+" / "+msg);
          setTimeout(tryHiccup, 500);
        } else {
          isHiccuping = false;
          timeouts.hiccup();
          doConnect();
        }
      });
    }
    tryHiccup();
  }
  function closeAllChannels() {
    for (var i in activeChannels) {
      if (activeChannels.hasOwnProperty(i)) {
        activeChannels[i].disconnect();
      }
    }
    officialChannel = undefined;
  }

  function doDisconnect(obj, silent, sync) {
    log("disconnected: "+obj.reason+" / "+(obj.data !== undefined ? "data: "+obj.data : ""));
    logAll();
    closeAllChannels();
    if (longPollingIFrame && longPollingIFrame.div) {
      longPollingIFrame.div.innerHTML = "";
    }
    if (self.readyState != self.CLOSED) {
      self.readyState = self.CLOSED;
      if (! silent) {
        postSingleMessageNow(true, "kill:"+obj.reason, sync, true);
      }
      self.onclosed(obj);
    }
  }

  this.disconnect = function(sync) {
    doDisconnect({reason: "Closed by client."}, false, sync);
  }


  function doBasicConnect() {
    var type = getBasicChannel();
    log("basic connect on type: "+type);
    var channel = activeChannels[type] = new channelConstructors[type]();
    channel.connect(self.connectLite);
  }

  function doOtherConnect() {
    var channels = getOtherChannels();
    var channel; var type;
    for (var i = 0; i < channels.length; ++i) {
      type = channels[i];
      log("other connect on type: "+type);
      channel = activeChannels[type] = new channelConstructors[type]();
      channel.connect();
    }
  }
  function doConnect() {
    log("doing connect!");
    timeout(timeouts, "connect", 15000, function() {
      doDisconnect({reconnect: false, reason: "Timeout connecting to server: no channel type was able to connect.", reconnectLite:true});
    });
    doBasicConnect();
  }

  this.connect = function() {
    log("socket connecting: "+id);
    doConnect();
  }

  // util
  function nicetime() { return Math.floor((new Date()).valueOf() / 100) % 10000000; }
  function log(s) { self.onlogmessage("(comet @t: "+nicetime()+") "+s); }
  function logAll() {
    log(self.describe())
  }
  this.describe = function() {
    function describeChannels() {
      out = [];
      for (var i in activeChannels) {
        if (activeChannels.hasOwnProperty(i)) {
          out.push(i+": "+activeChannels[i].describe());
        }
      }
      return "[ "+out.join(", ")+" ]";
    }
    return ("socket state: { id: "+id+", readyState: "+self.readyState+", isHiccuping: "+isHiccuping+", timeouts: "+describeTimeouts(timeouts)+", officialChannel: "+(officialChannel?officialChannel.name:"none")+", channels: "+describeChannels()+", isPosting: "+isPosting+", lastReceivedSeqNumber: "+lastReceivedSeqNumber+", lastPost: "+lastPost+", postTimeouts: "+describeTimeouts(postTimeouts)+", channelSeq: "+channelSeq+" }");
  }

  function wrapMethod(obj, method) {
    return function() {
      var arr = [];
      for (var i=0; i < arguments.length; i++) {
	arr.push(arguments[i]);
      }
      method.apply(obj, arr);
    }
  }
  var _wm = wrapMethod;

  // cb should take statusCode, responseText, and optionally request
  function simpleXhr(method, uri, async, params, cb, makeXhr) {
//    log("making simple Xhr: "+[method, uri, async, params].join(", "));
    var request = (makeXhr || newRequestObject)();
    request.open(method, uri, async);
    if (async) {
      request.onreadystatechange = function() {
        if (request.readyState != 4) return;
        var status;
        var responseText;
        try {
          status = request.status;
          responseText = request.responseText;
        } catch (e) { /* absorb ff error accessing request properties */ }
        cb(status, responseText, request);
      }
    }
    var data = null;
    if (params) {
      data = [];
      for (var i = 0; i < params.length; ++i) {
        data.push(encodeURIComponent(params[i].key)+"="+encodeURIComponent(params[i].value));
      }
      data = data.join("&");
      request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
    }
    try {
      request.send(data);
    } catch (e) { request.abort(); cb(500, "Error sending data!", request); }
    if (! async) {
      var status;
      var responseText;
      try {
        status = request.status;
        responseText = request.responseText;
      } catch (e) { /* absorb ff error accessing request properties */ }
      cb(status, responseText, request);
    }
    return request;
  }

  var timeout_noop = function() { }
  function timeout(timeoutObject, timeoutName, millis, timeoutCallback) {
    function clearIt(timeoutObject, timeoutName) {
      if (timeoutObject[timeoutName]) {
        timeoutObject[timeoutName]();
        timeoutObject[timeoutName] = timeout_noop;
      }
    }
    var timeoutId = setTimeout(function() { clearIt(timeoutObject, timeoutName); timeoutCallback(); }, millis);
    var f = function() {
      clearTimeout(timeoutId);
    }
    clearIt(timeoutObject, timeoutName);
    timeoutObject[timeoutName] = f;
    return f;
  }

  // handling messages
  var lastReceivedSeqNumber = 0;

  function dataHandler(msg) {
    if (msg.seqNumber > lastReceivedSeqNumber+1) {
      log("bad sequence number. expecting: "+(lastReceivedSeqNumber+1)+", got: "+msg.seqNumber);
      hiccup(self);
      return false;
    }
    if (msg.seqNumber < lastReceivedSeqNumber+1) return true;
    lastReceivedSeqNumber = msg.seqNumber;
    if (! msg.isControl) {
      self.onmessage({ data: msg.content });
      return true;
    } else {
      if (msg.content == "kill") {
        doDisconnect({reconnect: false, reason: "Killed by server."});
        return false;
      }
    }
  }

  // client-server comm
  var postPath = function() {
    return "%contextPath%/post?r="+randomVar()+"&v="+version+"&id="+id+"&seq="+lastReceivedSeqNumber+tagArg;
  }

  function SimpleQueue() {
    var base = [];
    var head = 0;
    var tail = 0;
    this.offer = function(data) {
      base[tail++] = data;
    }
    this.poll = function() {
      if (this.length() > 0) {
        var n = base[head];
        delete base[head++];
        return n;
      }
    }
    this.clear = function() {
      head = 0;
      tail = 0;
      var oldBase = base;
      base = [];
      return oldBase;
    }
    this.length = function() {
      return tail - head;
    }
  }
  var outgoingMessageQueue = new SimpleQueue();
  var isPosting = false;
  var postTimeouts = {};
  var lastPost;

  function postSingleMessageNow(isControl, data, sync, force, cb) {
    doPostMessages([{oob: isControl, data: data, cb: cb}], sync, force)
  }

  function doPostMessages(messages, sync, force, cb) {
    if (! force && self.readyState == self.CLOSED) return;
    if (messages.length == 0) {
      if (cb) cb();
      return;
    }
    var data = [];
    var callbacks = [];
    for (var i = 0; i < messages.length; ++i) {
      data.push({key: (messages[i].oob ? "oob" : "m"),
                 value: messages[i].data});
      if (messages[i].cb)
        callbacks.push(messages[i].cb);
    }
    function postFailed(sc, msg, req, src) {
      var str = "";
      try {
        str = sc + ": "+req.statusText+" - "+msg+" ("+src+")";
      } catch (e) { /* absorb potential Firefox error accessing req */ }
      doDisconnect({reconnect: true, reason: "Posting message failed.", data: str});
      for (var i = 0; i < callbacks.length; ++i) {
        callbacks[i](false, str);
      }
    }
    function postCallback(sc, msg, request) {
      postTimeouts.post();
      if (sc != 200 || msg.substring(0, 2) != "ok") {
        postFailed(sc, msg, request, "1");
      } else {
        for (var i = 0; i < callbacks.length; ++i) {
          callbacks[i](true);
        }
        if (cb) cb();
      }
    }
    timeout(postTimeouts, "post", 15000, function() {
      doDisconnect({reconnect: true, reason: "Posting message timed out."});
    });
    simpleXhr('post', postPath(), ! sync, data, postCallback);
  }

  function postPendingMessages() {
    if (isPosting == true)
      return;
    var messages = outgoingMessageQueue.clear();
    if (messages.length == 0) {
      return;
    }
    isPosting = true;
    doPostMessages(messages, false, false, function() { isPosting = false; setTimeout(postPendingMessages, 0); });
    lastPost = nicetime();
  }
  this.postMessage = function(data, cb) {
    if (self.readyState != self.OPEN) {
      return;
    }
    outgoingMessageQueue.offer({data: data, cb: cb});
    setTimeout(function() { postPendingMessages() }, 0);
  }

  // transports
  function getValidChannels() {
    var channels = [];
    for (var i = 0; i < validChannels.length; ++i) {
      var type = validChannels[i];
      /*if (window.location.hash.length > 0) {
        if (window.location.hash != "#"+type) {
          continue;
        }
      }*/
      var ieBefore8 = ($ && $.browser.msie && parseInt($.browser.version)<9);
      var ieBefore9 = ($ && $.browser.msie && parseInt($.browser.version)<10);
      if ((ieBefore8 && type == 'longpolling') ||
          (ieBefore9 && type == 'streaming') ||
          ($ && $.browser.opera && type != 'shortpolling' && type != 'streaming')) {
        continue;
      }

      var isiPad = navigator.userAgent.match(/iPad/i) != null;
      var isiPhone = navigator.userAgent.match(/iPhone/i) != null;
      if ((isiPhone || isiPad) && type != "streaming") {
        continue;
      }

      channels.push(type);
    }
    return channels;
  }
  function getBasicChannel() {
    return getValidChannels()[0];
  }

  function getOtherChannels() {
    return getValidChannels().slice(1);
  }

  var officialChannel;
  this.getTransportType = function() {
    return (officialChannel ? officialChannel.name : "none");
  }
  var validChannels = "%acceptableChannelTypes%";
  var canUseSubdomains = "%canUseSubdomains%";
  var activeChannels = {};
  var channelConstructors = {
    shortpolling: ShortPollingChannel,
    longpolling: LongPollingChannel,
    streaming: StreamingChannel
  }

  function describeTimeouts(timeouts) {
    var out = [];
    for (var i in timeouts) {
      if (timeouts.hasOwnProperty(i)) {
        out.push(i+": "+(timeouts[i] == timeout_noop ? "unset" : "set"));
      }
    }
    return "{ "+out.join(", ")+" }";
  }

  var channelSeq = 1;
  function notifyConnect(channel) {
    timeouts.connect();
    if (! officialChannel || channel.weight > officialChannel.weight) {
      log("switching to use channel: "+channel.name);
      var oldChannel = officialChannel;
      officialChannel = channel;
      setTimeout(function() {
        postSingleMessageNow(true, "useChannel:"+(channelSeq++)+":"+channel.name, false, false, function(success, msg) {
          /*
           * If we've disconnected since we were originally called, but before
           * we've received a response to useChannel, we don't want to continue
           * as channel is no longer "official," and a new connection attempt
           * has been initiated.
           */
          if (officialChannel != channel) {
            log("ignoring useChannel response as officialChannel has changed from " + channel.name);
            return;
          }
          if (success) {
            if (oldChannel) {
              oldChannel.disconnect();
            }
            if (self.readyState != self.OPEN) {
              self.readyState = self.OPEN;
              self.onopen({});
            } else {
              self.onhiccup({connected: true});
            }
            if (!oldChannel) {
              // there was no old channel, so try connecting the other channels.
              doOtherConnect();
            }
          } else {
            doDisconnect({reconnect: true, reason: "Failed to select channel on server.", data: msg});
          }
        });
      }, 0);
      return true;
    } else {
      return false;
    }
  }

  function randomVar() {
    return String(Math.round(Math.random()*1e12));
  }

  function channelPath() {
    return "%contextPath%/channel?v="+version+"&r="+randomVar()+"&id="+id;
  }

  function newRequestObject() {
    var xmlhttp=false;
    var newIE = false;
    if ($.browser.msie && parseInt($.browser.version)>=9) {
      newIE = true;
    }
    if (!newIE) {
     try {
       xmlhttp = (window.ActiveXObject && new ActiveXObject("Msxml2.XMLHTTP"))
     } catch (e) {
      try {
       xmlhttp = (window.ActiveXObject && new ActiveXObject("Microsoft.XMLHTTP"));
      } catch (E) {
       xmlhttp = false;
      }
     }
   }
    if (!xmlhttp && typeof XMLHttpRequest!='undefined') {
      try {
        xmlhttp = new XMLHttpRequest();
      } catch (e) {
        xmlhttp=false;
      }
    }
    if (!xmlhttp && window.createRequest) {
      try {
        xmlhttp = window.createRequest();
      } catch (e) {
        xmlhttp=false;
      }
    }
    return xmlhttp
  }

  function DataFormatError(message) {
    this.message = message;
  }

  function readMessage(data, startIndex) {
    if (! startIndex) startIndex = 0;
    var sep = data.indexOf(":", startIndex);
    if (sep < 0) return; // don't have all the bytes for this yet.
    var chars = Number(data.substring(startIndex, sep));
    if (isNaN(chars))
      throw new DataFormatError("Bad length: "+data.substring(startIndex, sep));
    if (data.length < sep+1+chars) return; // don't have all the bytes for this yet.
    var msg = data.substr(sep+1, chars);
    return { message: msg, lastConsumedChar: sep+1+chars }
  }

  function iframeReader(data, startIndex) {
    if (startIndex == 0)
      return { message: data, lastConsumedChar: data.length }
  }

  function parseWireFormat(data, startIndex, reader) {
    if (! startIndex) startIndex = 0;
    var msgs = [];
    var readThroughIndex = startIndex;
    while (true) {
      var msgObj = (reader || readMessage)(data, readThroughIndex)
      if (! msgObj) break;
      readThroughIndex = msgObj.lastConsumedChar;
      var msg = msgObj.message;
      var split = msg.split(":");
      if (split[0] == 'oob') {
        msgs.push({oob: split.slice(1).join(":")});
        continue;
      }
      var seq = Number(split[0]);
      if (isNaN(seq))
        throw new DataFormatError("Bad sequence number: "+split[0]);
      var control = Number(split[1]);
      if (isNaN(control))
        throw new DataFormatError("Bad control: "+split[1]);
      var msgContent = split.slice(2).join(":");
      msgs.push({seqNumber: seq, isControl: (control == 1), content: msgContent});
    }
    return { messages: msgs, lastConsumedChar: readThroughIndex }
  }

  function handleMessages(data, cursor, channel, reader) {
    try {
      messages = parseWireFormat(data, cursor, reader);
    } catch (e) {
      if (e instanceof DataFormatError) {
        log("Data format error: "+e.message);
        hiccup(channel);
        return;
      } else {
        log(e.toString()+" on line: "+e.lineNumber);
      }
    }
    for (var i=0; i < messages.messages.length; i++) {
      var oob = messages.messages[i].oob;
      if (oob) {
        if (oob == "restart-fail") {
          doDisconnect({reconnect: true, reason: "Server restarted or socket timed out on server."});
          return;
        }
      } else {
        if (! dataHandler(messages.messages[i]))
          break;
      }
    }
    return messages.lastConsumedChar;
  }

  function ShortPollingChannel() {
    this.weight = 0;
    this.name = "shortpolling";

    this.isConnected = false;
    this.isClosed = false;
    this.request;
    this.clearRequest = function() {
      if (this.request) {
        this.request.onreadystatechange = function() { };
        this.request.abort();
        this.request = null;
      }
    }
    this.connectLite = false;
    this.timeouts = {};

    this.describe = function() {
      return "{ isConnected: "+this.isConnected+", isClosed: "+this.isClosed+", timeouts: "+describeTimeouts(this.timeouts)+", request: "+(this.request?"set":"not set")+" }"
    }

    this.pollDataHandler = function(sc, response, request) {

      if (request.readyState != 4) return;
      if (this.timeouts.poll) this.timeouts.poll();
      var messages;
      if (! this.isConnected) {
        this.timeouts.connectAttempt();
        if (sc != 200) {

          if (this.connectLite) {
            this.disconnect();
            return;
          }
          log(this.name+" connect failed: "+sc+" / "+response);
          setTimeout(_wm(this, this.attemptConnect), 500);
          return;
        }

        this.connectLite = false;

        var msg = (response ? readMessage(response) : undefined);
        if (msg && msg.message == "oob:ok") {
          this.timeouts.initialConnect();
          this.isConnected = true;
          log(this.name+" transport connected!");
          if (! notifyConnect(this)) {
            // there are better options connected.
            log(this.name+" transport not chosen for activation.");
            this.disconnect();
            return;
          }
          this.doPoll();
          return;
        } else {
          log(this.name+" connect didn't get ok: "+sc+" / "+response);
          setTimeout(_wm(this, this.attemptConnect), 500);
          return;
        }
      }
      var chars = handleMessages(request.responseText, 0, this);
      if (sc != 200 || ((! chars) && this.emptyResponseBad)) {
        hiccup(this);
      }
      setTimeout(_wm(this, this.doPoll), this.pollDelay);
      this.clearRequest();
    }

    this.keepRetryingConnection = true;
    this.cancelConnect = function() {
      this.clearRequest();
      this.keepRetryingConnection = false;
    }
    this.cancelPoll = function() {
      this.clearRequest();
      log("poll timed out.");
      hiccup(this);
    }

    this.doPoll = function() {
      if (this.isClosed) return;
      timeout(this.timeouts, "poll", this.pollTimeout, _wm(this, this.cancelPoll));
      this.request =
        simpleXhr('GET',
                  channelPath()+"&channel="+this.name+"&seq="+lastReceivedSeqNumber+this.pollParams()+tagArg,
                  true, undefined, _wm(this, this.pollDataHandler), this.xhrGenerator);
    }

    this.pollParams = function() {
      return "";
    }
    this.pollTimeout = 5000;
    this.pollDelay = 500;

    this.attemptConnect = function() {
      if (! this.keepRetryingConnection) return;
      log(this.name+" attempting connect");
      this.clearRequest();
      timeout(this.timeouts, "connectAttempt", 5000, _wm(this, this.attemptConnect));
      this.request = simpleXhr('GET', channelPath()+"&channel="+this.name+"&new=yes&create="+(socket.readyState == socket.OPEN ? "no" : "yes")+"&seq="+lastReceivedSeqNumber+tagArg,
                               true, undefined, _wm(this, this.pollDataHandler), this.xhrGenerator);
    }
    this.connect = function(connectLite) {
      this.connectLite = connectLite;
      this.attemptConnect();
      timeout(this.timeouts, "initialConnect", 15000, _wm(this, this.cancelConnect));
    }
    this.disconnect = function() {
      log(this.name+" disconnected");
      this.isClosed = true;
      this.clearRequest();
    }
  }

  function StreamingChannel() {
    this.weight = 2;
    this.name = "streaming";
    var self = this;

    var isConnected = false;
    var request;
    function clearRequest() {
      if (request) {
        request.onreadystatechange = function() {};
        request.abort();
        request = null;
        if (timeouts.data) timeouts.data();
        if (theStream) theStream = null;
        if (ifrDiv) {
          ifrDiv.innerHTML = "";
          ifrDiv = null;
        }
      }
    }
    var isClosed = false;
    var timeouts = {};
    var cursor = 0;

    this.describe = function() {
      return "{ isConnected: "+isConnected+", isClosed: "+isClosed+", timeouts: "+describeTimeouts(timeouts)+", request: "+(request?"set":"not set")+", cursor: "+cursor+" }";
    };

    function connectOk() {
      isConnected = true;
      timeouts.initialConnect();
      if (! notifyConnect(self)) {
        log("streaming transport not chosen for activation");
        self.disconnect();
        return;
      }
    }

    function streamDataHandler() {
      if (isClosed) return;
      try {
        if (!request.responseText) {
          if (request.readyState == 4) {
            self.disconnect();
            if (isConnected) {
              log("stream connection unexpectedly closed.");
              hiccup(self);
            }
          }
          return;
        }
      } catch (e) { return; }
      if (! isConnected) {
        var msg = readMessage(request.responseText, cursor);
        if (! msg) return;
        cursor = msg.lastReceivedSeqNumber;
        if (msg.message == "oob:ok") {
          connectOk();
        } else {
          log("stream: incorrect channel connect message:"+msg.message);
          self.disconnect();
          return;
        }
      } else {
        cursor = handleMessages(request.responseText, cursor, self);
      }
      if (! request || request.readyState == 4) {
        clearRequest();
        if (isConnected) {
          log("stream connection unexpectedly closed.");
          hiccup(self);
        }
      } else {
        timeout(timeouts, "data", 60*1000, function() { hiccup(self); });
      }
    }

    function iframeDataHandler(data) {
      if (isClosed) return;
      if (! isConnected) {
        if (data == "oob:ok") {
          connectOk();
        } else {
          log("iframe stream: unexpected data on connect - "+data);
        }
      } else {
        handleMessages(data, 0, self, iframeReader);
      }
    }

    function cancelConnect() {
      isClosed = true;
      clearRequest();
      log("stream: failed to connect.");
    }

    // IE Stuff.
    var theStream;
    var ifrDiv;
    var iframeTestCount = 0;
    function testIframe() {
      var state;
      try {
        state = ifrDiv.firstChild.readyState;
      } catch (e) {
        hiccup(self);
        return;
      }
      if (state == 'interactive' || iframeTestCount > 10) {
        try { var tmp = ifrDiv.firstChild.contentWindow.document.getElementById("thebody") }
        catch (e) { hiccup(self); }
      } else {
        iframeTestCount++;
        setTimeout(testIframe, 500);
      }
    }

    this.connect = function() {
      timeout(timeouts, "initialConnect", 15000, cancelConnect)

      if (canUseSubdomains) {
        var streamurl = "//"+randomVar()+cometHostSuffix+channelPath()+"&channel=streaming&type=iframe&new=yes&create="+(socket.readyState == socket.OPEN ? "no" : "yes")+"&seq="+lastReceivedSeqNumber+tagArg;
        log("stream to: "+streamurl);
        if ($ && $.browser.opera) {
          // set up the opera stream; requires jquery because, why not?
          ifrDiv = $('<div style="display: none;"></div>').get(0);
          $('body').append(ifrDiv);
          window.comet = {
            pass_data: iframeDataHandler,
            disconnect: function() { hiccup(self); }
          }
          $(ifrDiv).append($("<iframe src='"+streamurl+"'></iframe>"));
          iframeTestCount = 0;
          setTimeout(testIframe, 2000);
          // if event-source supported disconnect notifications, fuck yeah we'd use it.
//          theStream = $('<event-source>');
//          var streamurl = channelPath()+"&channel=streaming&type=opera&new=yes&create="+(socket.readyState == socket.OPEN ? "no" : "yes")+"&seq="+lastReceivedSeqNumber;
//          theStream.get(0).addEventListener('message', function(event) {
//            iframeDataHandler(event.data);
//          }, false);
//          theStream.attr('src', streamurl);
          log("stream connect sent!");
          return;
        }
        try { // TODO: remove reference to both theStream and ifrDiv on unload!
          var newIE = $.browser.msie && parseInt($.browser.version) >= 9;
          if (!newIE) {
            theStream = (window.ActiveXObject && new ActiveXObject("htmlfile"));
          }
          if (theStream) {
            theStream.open();
            theStream.write("<html><head><title>f<\/title><\/head><body>")
            theStream.write("<s"+"cript>document.domain='"+document.domain+"';<\/s"+"cript>")
            theStream.write("<\/body><\/html>")
            theStream.close();
            ifrDiv = theStream.createElement("div")
            theStream.body.appendChild(ifrDiv)
            theStream.parentWindow.comet = {
              pass_data: iframeDataHandler,
              disconnect: function() { hiccup(self); }
            }
            ifrDiv.innerHTML = "<iframe src='"+streamurl+"'></iframe>";
            iframeTestCount = 0;
            setTimeout(testIframe, 2000);
          }
        } catch (e) {
          theStream = false
        }
      } else if ($ && $.browser.opera) {
        // opera thinks it can do a normal stream, but it can't.
        log("opera - not trying xhr");
        return;
      }
      // End IE Stuff.
      if (! theStream) {

        request = newRequestObject();
        // we only use subdomains if requests support withCredential
        var prefix = canUseSubdomains && 'withCredentials' in request ? "//"+randomVar()+cometHostSuffix : "";
        request.open('get', prefix + channelPath()+"&channel=streaming&new=yes&create="+(socket.readyState == socket.OPEN ? "no" : "yes")+"&seq="+lastReceivedSeqNumber+tagArg);
        if ('withCredentials' in request) {
          request.withCredentials = true;
        }

        request.onreadystatechange = streamDataHandler;
        try {
          request.send(null);
        } catch (e) { }
      }
      log("stream connect sent!");
    }

    this.disconnect = function() {
      log("stream disconnected");
      isClosed = true;
      clearRequest();
    }
    log("new streamchannel");
  }

  // long-polling related stuff.
  function iframePath(key) {
    return "//" + key + cometHostSuffix + "%contextPath%/xhrXdFrame";
  }

  function createHiddenDiv() {
    if (! document.getElementById('newcomethidden')) {
      var d = document.createElement('div');
      d.setAttribute('id', 'newcomethidden');
      d.style.display = 'none';
      document.body.appendChild(d);
    }
    return document.getElementById('newcomethidden');
  }

  function ExtHostXHR(iframe) {
    this.open = function(method, uri, async) {
      this.method = method;
      this.uri = uri;
      this.async = async;
    }
    var headers = {};
    this.setRequestHeader = function(name, value) {
      headers[name] = value;
    }
    this.send = function(data) {
      var self = this;
      this.xhr = iframe.iframe.contentWindow.doAction(this.method, this.uri, this.async, headers, data || null, function(status, response) {
        self.readyState = 4;
        self.status = status;
        self.responseText = response;
        self.onreadystatechange();
      });
    }
    this.abort = function() {
      if (this.xhr)
        iframe.contentWindow.doAbort(this.xhr);
    }
  }

  function createRequestIframe(cb) {
    var randomKey = randomVar();
    try {
      var activeXControl = (window.ActiveXObject && new ActiveXObject("htmlfile"));
      var htmlfileDiv;
      if (activeXControl) {

        activeXControl.open();
        activeXControl.write('<html><head><title>f</title></head><body>');
        activeXControl.write('<scr'+'ipt>document.domain=\''+document.domain+'\';</scr'+'ipt>');
        activeXControl.write('</body></html>');
        activeXControl.close();
        htmlfileDiv = activeXControl.createElement('div');
        activeXControl.body.appendChild(htmlfileDiv);
        activeXControl.parentWindow["done_"+randomKey] = cb;
        htmlfileDiv.innerHTML = "<iframe src='"+iframePath(randomKey)+"'></iframe>";
        return {iframe: htmlfileDiv.firstChild /* should be an iframe */, axc: activeXControl, div: htmlfileDiv};
      }
    } catch (e) {
      activeXControl = false;
    }
    log("Not using IE setup.");
    var requestIframe = document.createElement('iframe');
    createHiddenDiv().appendChild(requestIframe);
    window["done_"+randomKey] = function() { try { delete window["done_"+randomKey]; } catch (e) { }; cb(); }
    requestIframe.src = iframePath(randomKey);
    return {iframe: requestIframe};
  }

  function createIframeRequestObject() {
    if (! longPollingIFrame) throw Error("WebSocket isn't properly set up!");
    return new ExtHostXHR(longPollingIFrame);
  }

  var longPollingIFrame;
  function LongPollingChannel() {
    ShortPollingChannel.apply(this); // sets up other state.
    this.weight = 1;
    this.name = "longpolling";

    this.pollDelay = 0;
    this.pollTimeout = 15000;
    this.pollParams = function() {
      return "&timeout="+(this.pollTimeout-5000);
    }
    var connect = this.connect;
    this.connect = function() {
      if (! longPollingIFrame) {
        longPollingIFrame =
          createRequestIframe(_wm(this, connect)); // specifically *not* this.connect. we want the old one!
      } else {
        connect.apply(this);
      }
    }
    this.xhrGenerator = createIframeRequestObject;
    this.emptyResponseBad = true;
  }
}
