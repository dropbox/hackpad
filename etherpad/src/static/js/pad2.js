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

var pad = {
  // don't access these directly from outside this file, except
  // for debugging
  collabClient: null,
  myUserInfo: null,
  diagnosticInfo: {},
  initTime: 0,
  clientTimeOffset: (+new Date()) - clientVars.serverTimestamp,
  padOptions: {},
  title: clientVars.initialTitle,
  monospace: false,
  unsavedPromptDisabled: false,
  welcomePadId: "AWELCOMEPAD",

  // these don't require init; clientVars should all go through here
  getPadId: function() { return clientVars.padId; },
  getClientIp: function() { return clientVars.clientIp; },
  getIsProPad: function() { return clientVars.isProPad; },
  getColorPalette: function() { return clientVars.colorPalette; },
  getDisplayUserAgent: function() {
    return padutils.uaDisplay(clientVars.userAgent);
  },
  getIsDebugEnabled: function() { return clientVars.debugEnabled; },
  getPrivilege: function(name) { return clientVars.accountPrivs[name]; },
  getUserIsGuest: function() { return clientVars.userIsGuest; },
  getTitleIsReadOnly: function() {return clientVars.titleIsReadOnly;},
  getTitle: function() { return pad.title; },

  getUserId: function() { return pad.myUserInfo.userId; },
  getUserName: function() { return pad.myUserInfo.name; },
  sendClientMessage: function(msg) {
    pad.collabClient.sendClientMessage(msg);
  },

  init: function() {
    pad.diagnosticInfo.uniqueId = padutils.uniqueId();
    pad.initTime = +(new Date());
    pad.padOptions = clientVars.initialOptions || {};
    clientVars.siteUserInfos = {};

    // for IE
    if ($.browser.msie) {
      try {
        doc.execCommand("BackgroundImageCache", false, true);
      } catch (e) {}
    }

    // see if we're being asked to go to a particular line
    var lineNumber = null; // null means don't go to line & don't focus
    var hashFragment = document.location.toString().split('#')[1];
    if (hashFragment && hashFragment.split(":").length > 1) {
      var lineNumberStr = hashFragment.split(":")[hashFragment.split(":").length - 1];
      // protect against the case where the title is "My title:3" or similar
      if (lineNumberStr != clientVars.padTitle.split(":")[clientVars.padTitle.split(":").length-1]) {
        lineNumber = lineNumberStr; // don't parseInt as we now support h=XXX style links as well
      }
    }

    padeditor.init(postAceInit, pad.padOptions.view || {});

    padconnectionstatus.init();
    padmodals.init();
    padguestpolicy.init();

    pad.addClientVars({});

    if (clientVars.chatEnabled && window['padchat']) {
      padchat.init(clientVars.chatHistory, pad.myUserInfo);
    }

    $('input[placeholder]').placeholder();
    pad.initInviteControl();
    pad.initFollowControl();
    pad.initModerationModeControl();

    $(window).bind("message", pad.receiveMessage, false);

    function postAceInit() {
      padeditbar.init();
      padautolink.init();
      padnotify.init();

      $(".hide-before-pad-load").removeClass("hide-before-pad-load");

      // Demo mode.
      clientVars.demoMode = clientVars.padId == pad.welcomePadId && clientVars.userIsGuest;
      if (clientVars.newPad || lineNumber) {
        setTimeout(function() { padeditor.ace.focus(lineNumber); }, 0);
      }

      if (clientVars.userIsGuest && !pad.isPadPublic() && !pad.isEmbed() && (clientVars.padId != pad.welcomePadId) && !clientVars.isMobile) {
        if (allCookies.getItem("inhibitLoginDialog") != "T" && clientVars.padId != pad.welcomePadId) {
          modals.showModal('#page-login-box', 0, true);
          // don't show login dialog again for 5 minutes
          allCookies.setItem("inhibitLoginDialog", "T", new Date(new Date().getTime() + (1000*60*5)));
        }
      }

      if (clientVars.demoMode && window['paddemo']) {
        // no demo for now
        setTimeout(paddemo.start, 0);
      }
    }

    $("#last-saved-timestamp").prettyDate();
    setInterval(function(){ $("#last-saved-timestamp").prettyDate(); }, 5000);

    // Init the padaccess control
    pad.handleOptionsChange(pad.padOptions);
    $('.padaccess').customStyle();

    // Enable tooltips on the sidebar
    padutils.tooltip("#padsidebar [data-tooltip]");

    // Moderation mode
    $("#submit-changes").click(function(){
      var url = "/ep/pad/request-merge?padId="+ clientVars.padId;
      var oldValue = $("#submit-changes").attr('value');
      $("#submit-changes").attr('value', "Submitting...").attr(
          'disabled', true);
      $.post(url, {}, function(data) {
        if (data && data.success) {
          alert('Your changes have been sent for review');
          document.location = data.padURL;
          return;
        } else {
          alert("Oops, an error has occured.  Please try again.");
        }
        $("#submit-changes").attr('value', oldValue).removeAttr('disabled');
      });
    })

    if (!clientVars.isMobile) {
      var teachableMoments =
        [["#friend-picker", "Invite a collaborator!"],
        ["#padaccess-menu", "Change privacy settings"]];
      for (var i=0; i<teachableMoments.length; i++) {
        if (allCookies.getItem("teach") == i) {
          allCookies.setItem("teach", i+1);
          hints.showHint($(teachableMoments[i][0]), teachableMoments[i][1]);
          break;
        }
      }
    }

    // catch command(ctrl)-a and have ace select all
    // catch command(ctrl)-/ to do search
    $(window).keydown(function(e) {

      if ((e.metaKey ? !e.ctrlKey :e.ctrlKey) && e.keyCode == 65 /* a */ &&
        document.activeElement.nodeName == "BODY") {
        e.preventDefault();
        padeditor.ace.focus();
        padeditor.ace.callWithAce(function(ace) {
          var rep = ace.getRep();
          var lines = rep.lines.length();
          var lastChar = rep.lines.atIndex(lines-1).text.length;
          ace.performSelectionChange([0,0], [lines-1,lastChar], false);
        }, true, true);
        return false;
      }

      if ((e.metaKey ? !e.ctrlKey :e.ctrlKey) && e.keyCode == 191 /* / */ &&
        document.activeElement.nodeName == "BODY") {
        e.preventDefault();
        $("#createpadentry").focus();
        return false;
      }

    });

    trackEvent("pad-visit", null, null, { padId: clientVars.isPublicPad ? clientVars.padId : "private", userIsGuest: clientVars.userIsGuest, isEmbed: pad.isEmbed() });
  },
  addClientVars: function (newClientVars) {
    $.extend(true /* deep */, clientVars, newClientVars);
    $.extend(true /* deep */, pad.padOptions, newClientVars.initialOptions);

    pad.myUserInfo = {
      userId: clientVars.userId,
      name: clientVars.userName,
      ip: pad.getClientIp(),
      colorId: clientVars.userColor || 0,
      userAgent: pad.getDisplayUserAgent(),
      status: "connected",
      userLink: clientVars.userLink,
      userPic: clientVars.userPic
    };

    /*
     * If we don't have collab_client_vars, we can't start the collab client.
     *
     * If pad.init() hasn't been called, it will handle the new clientVars when it is called.
     */
    if (!pad.initTime || !clientVars.collab_client_vars) {
      return;
    } else if (pad.collabClient) {
      if (newClientVars.padId) {
        padrelated.init();
        pad.collabClient.setPadId(clientVars.padId, clientVars.globalPadId);
        $('#follow-container').attr('src', '/ep/pad/pad-follow-button?' + $.param({padId: clientVars.padId}));
      }
      if (newClientVars.padTitle) {
        pad.handleNewTitle(clientVars.padTitle);
      }
      return;
    }

    if (clientVars.specialKey) {
      pad.myUserInfo.specialKey = clientVars.specialKey;
      if (clientVars.specialKeyTranslation) {
        $("#specialkeyarea").text("mode: "+
                                  String(clientVars.specialKeyTranslation).toUpperCase());
      }
    }

    window['paduserlist'] && paduserlist.init(pad.myUserInfo, clientVars.invitedUserInfos || [], /* clientVars.invitedGroupInfos */ []);
    padcollections.init();
    padcollections.renderPadCollections();
    if (pad.getPadId()) {
      padrelated.init();
      if (typeof(padinvitelog) != "undefined") {
        padinvitelog.init();
      }

      // Needed especially on native desktop where we start with a blank
      // editor and we get an id later on.
      $('[name=padId]').val(pad.getPadId());
    }

    var keepStatic = ((clientVars.padId == pad.welcomePadId || clientVars.padId == pad.newWelcomePadId || clientVars.padId == "m1Fne5A6Lzn" || clientVars.padId == "clJetHSqs4T") && clientVars.userIsGuest) || clientVars.padId == "m1Fne5A6Lzn";
    pad.collabClient =
      getCollabClient(padeditor.ace,
                      clientVars.collab_client_vars,
                      pad.myUserInfo,
                      { colorPalette: pad.getColorPalette() },
                      keepStatic);
    pad.collabClient.setOnUserJoin(pad.handleUserJoin);
    pad.collabClient.setOnUpdateUserInfo(pad.handleUserUpdate);
    pad.collabClient.setOnUserLeave(pad.handleUserLeave);
    pad.collabClient.setOnUserKill(pad.handleUserKill);
    pad.collabClient.setOnUpdateUserSiteInfo(pad.handleUserSiteUpdate);
    pad.collabClient.setOnUserSiteJoin(pad.handleUserSiteJoin);
    pad.collabClient.setOnUserSiteLeave(pad.handleUserSiteLeave);
    pad.collabClient.setOnUserEdited(pad.handleUserEdited);
    pad.collabClient.setOnGroupJoin(pad.handleGroupJoin);
    pad.collabClient.setOnGroupRemove(pad.handleGroupRemove);
    pad.collabClient.setOnUpdateGroupInfo(pad.handleGroupUpdate);
    pad.collabClient.setOnClientMessage(pad.handleClientMessage);
    pad.collabClient.setOnModeratedPadEdited(pad.handleModeratedPadEdited);
    pad.collabClient.setOnServerMessage(pad.handleServerMessage);
    pad.collabClient.setOnSiteToClientMessage(pad.handleSiteToClientMessage);
    pad.collabClient.setOnSiteMessage(pad.handleSiteMessage);
    pad.collabClient.setOnChannelStateChange(pad.handleChannelStateChange);
    pad.collabClient.setOnInternalAction(pad.handleCollabAction);

    pad.handleNewTitle(clientVars.padTitle || '');

    // collab client debug
    $("#pause-collab").on('click', function() {
      if (!$("#pause-collab").hasClass("paused")) {
        pad.collabClient.pause();
        $("#pause-collab").text("Resume collab").addClass("paused");
      } else {
        pad.collabClient.reconnect();
        $("#pause-collab").text("Pause collab").removeClass("paused");
      }
    });


  },
  toggleFollow: function(that) {
    $('#tooltip').remove();
    var args = {followPref: $(that).hasClass("padfollow") ? "2" : "1", ajax: true};
    $.post("/ep/pad/follow/" + clientVars.padId + "/", args,
      function(data) {
        if (data && !data.success) {
          modals.showHTMLModal(data.html);
          return;
        }
        $("#follow-container").refresh(function () {
          if ($("#follow-container .padunfollow").is(':visible')) {
            if (pad.isPadPublic()) {
              padfacebook.postGraphFollowPad();
            }
          }
          padutils.tooltip("#follow-container [data-tooltip]");
        });

        trackEvent("toggleFollow", null, null, { followPref: args.followPref });
      });
  },
  dispose: function() {
    padeditor.dispose();
  },
  onbeforeunload: function() {
    if (pad.collabClient && pad.collabClient.hasUncommittedChanges() && !pad.unsavedPromptDisabled) {
      return 'This pad has unsaved changes.  Do you want to leave and discard your changes?'
    }
    this.unloading = true;
  },
  disableUnsavedPrompt: function() {
    pad.unsavedPromptDisabled = true;
  },
  initModerationModeControl: function() {
    if (clientVars.isPadAdmin) {
      var dataKey = pad.padOptions.isModerated ? "closed" : "open";

      var button = $("#toggle-readonly-button");
      button.attr('class', button.data('src' + dataKey));
      button.attr('title', button.data('title' + dataKey));

      var link = $("#toggle-readonly-link");
      link.text(pad.padOptions.isModerated ? 'Unmoderate' : 'Moderate');

      $([link[0]]).unbind("click").click(function(){
        if (pad.padOptions.isModerated) {
          pad.changePadOption('isModerated', false);
        } else {
          pad.changePadOption('isModerated', true);
        }
        return false;
      });
    } else {
      if (pad.padOptions.isModerated) {
        for (var i in clientVars.invitedUserInfos) {
          var x = clientVars.invitedUserInfos[i];
          if (x.userId == "p."+ clientVars.creatorId) {
            $("#pad-moderator-link").attr('href', x.userLink).text(
                'Moderated by ' + x.name);
            $("#pad-moderator").show();
            $('#pad-moderator-link').css('display', 'inline-block');
            break;
          }
        }
      }
    }
  },
  initInviteControl: function() {
    var friendPicker = $("#friend-picker");
    var inviteItemHandlers = {
      'fb': {callback: function(item) {}},
      'hp':   {url: "/ep/pad/hackpadinvite",
                argsCallback: function(item) {
                  return { padId: pad.getPadId(), userId: item[2]
                  };
                }
      },
      'email': {url:"/ep/pad/emailinvite",
                argsCallback: function(item) {
                  return {padId: pad.getPadId(), toAddress: item[2]};
                }
      },
      'typedemail': {
        callback: function(item) {
          var url = "/ep/pad/emailinvite";
          var args = {
            padId: pad.getPadId(), toAddress: item[1]
          };
          // The preparse regex matched no valid email addresses in the input
          if(!args.toAddress) {
            alert("This does not look like a valid email address.");
            return;
          }
          friendPicker.addClass("ac_loading");
          $.post(url, args, function(data) {
            friendPicker.removeClass("ac_loading");
          });
        }
      }
    };
    friendPicker.invite({
      target: 'Pad',
      inviteItemHandlers: inviteItemHandlers
    });

  },
  initFollowControl: function() {
    $('#mainbar').on('click','#follow-container .padfollow, #follow-container .padunfollow', function(){ pad.toggleFollow(this); });
  },
  receiveMessage: function(event) {
    if (event.data == "wpSave") {
      var byLine = padeditor.ace.getAuthorNames().join(", ");
      var message = {
          comment: 'Edited collaboratively by ' + byLine + ' using http://hackpad.com',
          content: padeditor.ace.exportText()
      };
      window.parent.postMessage(JSON.stringify(message), "*");
    }
  },
  notifyUserCaretUpdate: function(caret) {
    pad.collabClient && pad.collabClient.sendClientMessage({
      type: 'caret',
      caret: caret,
      changedBy: pad.myUserInfo.userId
    });
  },
  changePadOption: function(key, value) {
    var options = {};
    options[key] = value;
    pad.handleOptionsChange(options);
    pad.collabClient.sendClientMessage({
      type: 'padoptions',
      options: options,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  changeViewOption: function(key, value) {
    var options = {view: {}};
    options.view[key] = value;
    pad.handleOptionsChange(options);
    pad.collabClient.sendClientMessage({
      type: 'padoptions',
      options: options,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  handleOptionsChange: function(opts) {
    // opts object is a full set of options or just
    // some options to change
    if (opts.view) {
      if (! pad.padOptions.view) {
        pad.padOptions.view = {};
      }
      for(var k in opts.view) {
        pad.padOptions.view[k] = opts.view[k];
      }
      padeditor.setViewOptions(pad.padOptions.view);
    }
    if (opts.guestPolicy) {
      // order important here
      pad.padOptions.guestPolicy = opts.guestPolicy;
      delete pad.padOptions.groupId;
      //paddocbar.setGuestPolicy(opts.guestPolicy);
      padguestpolicy.setGuestPolicy(opts.guestPolicy);
    }
    if (opts.groupId) {
      // order important here
      pad.padOptions.guestPolicy = "deny";
      pad.padOptions.groupId = opts.groupId;
      padguestpolicy.setGroupId(opts.groupId);
    }

    if ('isModerated' in opts) {
      pad.padOptions.isModerated = opts.isModerated;
      pad.initModerationModeControl();
    }
  },
  getPadOptions: function() {
    // caller shouldn't mutate the object
    return pad.padOptions;
  },
  isPadPublic: function() {
    return (! pad.getIsProPad()) || (pad.getPadOptions().guestPolicy == 'allow');
  },
  isEmbed: function() {
    return clientVars.isEmbed;
  },
  isDesktopApp: function () {
    return clientVars.isDesktopApp;
  },
  isMobileApp: function () {
    return clientVars.isMobileApp;
  },
  handleUserJoin: function(userInfo) {
    clientVars.invitedUserInfos.push(userInfo);
    window['paduserlist'] && paduserlist.userJoinOrUpdate(userInfo);
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserJoinOrUpdate(userInfo);
    }
  },
  handleUserUpdate: function(userInfo) {
    window['paduserlist'] && paduserlist.userJoinOrUpdate(userInfo);
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserJoinOrUpdate(userInfo);
    }
  },
  handleUserSiteJoin: function(userInfo) {
    if (clientVars.chatEnabled && window['padchat']) {
      clientVars.siteUserInfos[userInfo.userId] = userInfo;
      padchat.handleUserSiteJoinOrUpdate(userInfo);
    }
  },
  handleUserSiteUpdate: function(userInfo) {
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserSiteJoinOrUpdate(userInfo);
    }
  },
  handleUserLeave: function(userInfo) {
    window['paduserlist'] && paduserlist.userLeave(userInfo);
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserLeave(userInfo);
    }
    padeditor.aceObserver.trigger('remove-user-caret', [userInfo]);
  },
  handleUserSiteLeave: function(userInfo) {
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserSiteLeave(userInfo);
    }
  },
  handleUserKill: function(userInfo) {
    window['paduserlist'] && paduserlist.userKill(userInfo);
    padeditor.aceObserver.trigger('remove-user-caret', [userInfo]);
  },
  handleUserEdited: function(userInfo, changeset) {
    window['paduserlist'] && paduserlist.userEdited(userInfo.userId);
    padnotify.userEdited(userInfo, changeset);
  },
  handleGroupJoin: function(userInfo) {
    clientVars.invitedGroupInfos.push(userInfo);
    padcollections.renderPadCollections();
    //window['paduserlist'] && paduserlist.groupJoinOrUpdate(userInfo);
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserJoinOrUpdate(userInfo);
    }
  },
  handleGroupRemove: function(userInfo) {
    var groupIdToRemove = userInfo.groupId;
    clientVars.invitedGroupInfos = clientVars.invitedGroupInfos.filter(function(groupInfo) {
      return groupIdToRemove != groupInfo.groupId;
    });
    padcollections.renderPadCollections();
    // Need to reload the collections to which the pad can be added
    padcollections.loadCandidateCollections();
  },
  handleGroupUpdate: function(userInfo) {
    //window['paduserlist'] && paduserlist.groupJoinOrUpdate(userInfo);
    if (clientVars.chatEnabled && window['padchat']) {
      padchat.handleUserJoinOrUpdate(userInfo);
    }
  },
  handleNewTitle: function(newTitle) {
    pad.title = newTitle;

    var CODE_EXTENSIONS = ['js', 'c', 'cpp', 'cxx', 'h', 'hpp', 'cs', 'vb',
        'm', 'java', 'py', 'rb', 'css', 'html', 'htm', 'php', 'coffee', 'lua',
        'pl', 'pm', 'r', 'sh', 'tcl', 'xml', 'sql', 'go', 'scala', 'textile',
        'md', 'markdown', 'tex', 'json', 'txt' ];

    if (newTitle && newTitle.indexOf(".") > -1 &&
        CODE_EXTENSIONS.indexOf($.trim(newTitle).split(".").pop().toLowerCase()) > -1) {
      pad.monospace = true;
      padeditor.setViewOptions({ 'useMonospaceFont': pad.monospace });

      // Delay loaded code highlight
      $.ajax({
          url: "/static/js/tok/require_all.js",
          dataType: "script",
          cache: true,
          success: function() {
            require(["helper"], function(helper) {
              padeditor.ace.setProperty("tokenizer", helper(pad.title));
            });
          }
      });
    } else if (pad.monospace) {
      pad.monospace = false;
      padeditor.setViewOptions({ 'useMonospaceFont': pad.monospace });
      padeditor.ace.setProperty("tokenizer", null);
    }

    // update window title (might be be slow on ios < 6)
    document.title = newTitle + " - " + location.host;

    // update url with encoded title
    var urlTitle = newTitle.replace(/[^\w\s-\.]/g, '').replace(/[\s-]+/g, '-');
    if (pad.getPadId().length == 11 && window.history && window.history.replaceState && !pad.isEmbed() && (document.location.toString().indexOf("/ep/pad/summary/") == -1)) {
      // maintain any line heading url hash so it can be copy pasted
      var urlHash = "#" + document.location.toString().split('#')[1];
      if (urlHash.indexOf("#:h") != 0) {
        urlHash = "";
      }
      window.history.replaceState({}, document.title, (urlTitle ? urlTitle + '-' + pad.getPadId() : pad.getPadId()) + urlHash);
    } else {
      document.location.replace(document.location.toString().split('#')[0] + '#' + urlTitle);
    }

    window['padchat'] && padchat.handleNewTitle(newTitle);
  },
  handleModeratedPadEdited: function() {
    modals.showHTMLModal($("#moderated-modal"), 0, true /* not cancellable */);
  },
  handleClientMessage: function(msg) {
    if (msg.type == 'caret') {
      padeditor.aceObserver.trigger('update-user-caret', [msg]);
    } else if (msg.type == 'chat') {
      if (!clientVars.chatEnabled || !window['padchat']) {
        return;
      }
      padchat.receiveChat(msg);
    } else if (msg.type == 'padtitle') {
      pad.handleNewTitle(msg.title);
    }
    else if (msg.type == 'padoptions') {
      var opts = msg.options;
      pad.handleOptionsChange(opts);
    }
    else if (msg.type == 'guestanswer') {
      // someone answered a prompt, remove it
      padguestprompt.removeGuestPrompt(msg.guestId);
    }
  },
  editbarClick: function(cmd) {
    if (padeditbar) {
      padeditbar.toolbarClick(cmd);
    }
  },
  dmesg: function(m) {
    if (pad.getIsDebugEnabled()) {
      var djs = $('#djs').get(0);
      var wasAtBottom = (djs.scrollTop - (djs.scrollHeight - $(djs).height())
                         >= -20);
      $('#djs').append('<p>'+m+'</p>');
      if (wasAtBottom) {
        djs.scrollTop = djs.scrollHeight;
      }
    }
  },
  handleServerMessage: function(m) {
    if (m.type === 'HANDLE_DELETE') {
      this.handleDelete();
    } else if (m.type === 'RELOAD') {
      if (m.padUrl && document.location == m.padUrl) {
        document.location.reload(true);
      }
    } else if (m.type == 'NOTICE') {
      if (m.text) {
        alertBar.displayMessage(function (abar) {
          abar.find("#servermsgdate").text(" ("+padutils.simpleDateTime(new Date)+")");
          abar.find("#servermsgtext").text(m.text);
        });
      }
    }
    else if (m.type == 'GUEST_PROMPT') {
      padguestprompt.showGuestPrompt(m.userId, m.displayName);
    }
  },
  handleSiteToClientMessage: function(m) {
    if (!clientVars.chatEnabled || !window['padchat']) {
      return;
    }
    if (m.type == 'mention') {
      padchat.receiveMention(m);
    } else if (m.type == 'invite') {
      padchat.receiveInvite(m);
    }
  },
  handleSiteMessage: function(m) {
    if (!clientVars.chatEnabled) {
      return;
    }
    // Same as client message.
    pad.handleClientMessage(m);
  },
  handleChannelStateChange: function(newState, message) {
    var oldFullyConnected = !! padconnectionstatus.isFullyConnected();
    var wasConnecting = (padconnectionstatus.getStatus().what == 'connecting');
    if (newState == "CONNECTED") {
      padconnectionstatus.connected();
    }
    else if (newState == "RECONNECTING") {
      if (this.unloading) {
        return;
      }
      padconnectionstatus.reconnecting();
    }
    else if (newState == "DISCONNECTED") {
      pad.diagnosticInfo.disconnectedMessage = message;
      pad.diagnosticInfo.padInitTime = pad.initTime;
      pad.asyncSendDiagnosticInfo();
      if (typeof window.ajlog == "string") { window.ajlog += ("Disconnected: "+message+'\n'); }
      padeditor.disable();
      padeditbar.disable();
      // paddocbar.disable();
      /* padimpexp.disable(); */

      padconnectionstatus.disconnected(message);
    }
    var newFullyConnected = !! padconnectionstatus.isFullyConnected();
    if (newFullyConnected != oldFullyConnected) {
      pad.handleIsFullyConnected(newFullyConnected, wasConnecting);
    }
  },
  handleIsFullyConnected: function(isConnected, isInitialConnect) {
    //padsavedrevs.handleIsFullyConnected(isConnected);
  },
  handleCollabAction: function(action) {
    if (action == "commitPerformed") {
      padeditbar.setSyncStatus("syncing");
      if (pad.isPadPublic()) {
        padfacebook.postGraphEdit();
      }

      etherpad.doOnce('trackeditstarted', function() {
        trackEvent('editstarted', clientVars.padId, null, {})
      });
    }
    else if (action == "commitAcceptedByServer") {
      etherpad.doOnce('trackedited', function() {
        trackEvent('edited', clientVars.padId, null, {})
        setTimeout(function() {
          $("#follow-container").refresh();
        }, 1000);
      });
    }
    else if (action == "newlyIdle") {
      padeditbar.setSyncStatus("done");
    }
  },
  hideServerMessage: function() {
    alertBar.hideMessage();
  },
  asyncSendDiagnosticInfo: function() {
    pad.diagnosticInfo.collabDiagnosticInfo = pad.collabClient.getDiagnosticInfo();
    window.setTimeout(function() {
      $.ajax({
        type: 'post',
        url: '/ep/pad/connection-diagnostic-info',
        data: {padId: pad.getPadId(), diagnosticInfo: JSON.stringify(pad.diagnosticInfo)},
        success: function() {},
        error: function() {}
      });
    }, 0);
  },
  forceReconnect: function() {
    // prepare the reconnect form
    if (!$('form#reconnectform input.padId').val()) {
      $('form#reconnectform input.padId').val(pad.getPadId());
      pad.diagnosticInfo.collabDiagnosticInfo = pad.collabClient.getDiagnosticInfo();
      $('form#reconnectform input.diagnosticInfo').val(JSON.stringify(pad.diagnosticInfo));
      $('form#reconnectform input.missedChanges').val(JSON.stringify(pad.collabClient.getMissedChanges()));
    }

    $("#reconnect_form .loading-indicator").show();
    $("#reconnect_form .failed-indicator").hide();

    var data = $("form#reconnectform").serialize();

    $.post($("form#reconnectform").attr('action'),
        data, function(data, textStatus) {
          $(window).unbind('beforeunload');
          document.location.reload(true);
    }).error(function() {
      $("#reconnect_form .loading-indicator").fadeOut(1000);
      $("#reconnect_form .failed-indicator").show(1000).delay(2000).fadeOut(1000);
    });

    return false;
  },
  // this is called from code put into a frame from the server:
  handleImportExportFrameCall: function(callName, varargs) {
    /*
    padimpexp.handleFrameCall.call(padimpexp, callName,
                                   Array.prototype.slice.call(arguments, 1));
    */
  },
  callWhenNotCommitting: function(f) {
    pad.collabClient.callWhenNotCommitting(f);
  },
  getCollabRevisionNumber: function() {
    return pad.collabClient.getCurrentRevisionNumber();
  },
  isFullyConnected: function() {
    return padconnectionstatus.isFullyConnected();
  },
  addHistoricalAuthors: function(data) {
    if (! pad.collabClient) {
      window.setTimeout(function() { pad.addHistoricalAuthors(data); },
                        1000);
    }
    else {
      pad.collabClient.addHistoricalAuthors(data);
    }
  },

  deletePad: function() {
    if (!confirm("Are you sure you want to delete the pad \""+pad.getTitle()+"\"?")) {
      return;
    }

    // Ignore server messages so we don't get the "deleted" message
    pad.collabClient.setOnServerMessage(function(){});

    $.post("/ep/padlist/delete", { padIdToDelete: pad.getPadId(), returnPath: "/" }, function() {
      if (history && history.length > 1) {
        history.back();
      } else {
        location.href = "/";
      }
    });
  },
  handleDelete: function () {
    window.location = window.location;
  },
  updateEmbedCode: function() {
    var url = location.protocol + '//' + location.host + '/' + encodeURIComponent(pad.getPadId());
    var jsUrl = url + ".js";
    if ($("#embedpad-type").val()) {
      jsUrl += "?format=" + $("#embedpad-type").val();
    }
    var code = '<scr'+'ipt src="' + jsUrl +'"></scr'+'ipt>' +
      '<noscript><div>View <a href="' + url + '">' + this.getTitle() + '</a> on Hackpad.</div></noscript>';
    $("#embedpad-code").val(code).select();
  },
  showEmbedDialog: function() {
    padmodals.showModal('#embedpaddialog', 0);
    pad.updateEmbedCode();
  }
};

var alertBar = (function() {

  var animator = padutils.makeShowHideAnimator(arriveAtAnimationState, false, 25, 400);

  function arriveAtAnimationState(state) {
    if (state == -1) {
      $("#alertbar").css('opacity', 0).css('display', 'block');
    }
    else if (state == 0) {
      $("#alertbar").css('opacity', 1);
    }
    else if (state == 1) {
      $("#alertbar").css('opacity', 0).css('display', 'none');
    }
    else if (state < 0) {
      $("#alertbar").css('opacity', state+1);
    }
    else if (state > 0) {
      $("#alertbar").css('opacity', 1 - state);
    }
  }

  var self = {
    displayMessage: function(setupFunc) {
      animator.show();
      setupFunc($("#alertbar"));
    },
    hideMessage: function() {
      animator.hide();
    }
  };
  return self;
}());

$(document).ready(function() {
  setTimeout(pad.init, 0);
});

$(window).unload(function() {
  pad.dispose();
});

$(window).bind('beforeunload', function() {
  return pad.onbeforeunload();
});
