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


var padchat = (function(){

  var numToAuthorMap = [''];
  var authorColorArray = [null];
  var authorToNumMap = {};
  var chatLinesByDay = {}; // {room: {day:'2009-06-17', lines: [...]}}
  var oldestHistoricalLines = {};

  var loadingMoreHistory = false;
  var HISTORY_LINES_TO_LOAD_AT_A_TIME = 50;

  // Possible values: site, pad, <userId>
  var chatroom = 'site';

  function authorToNum(author, dontAddIfAbsent) {
    if ((typeof authorToNumMap[author]) == "number") {
      return authorToNumMap[author];
    }
    else if (dontAddIfAbsent) {
      return -1;
    }
    else {
      var n = numToAuthorMap.length;
      numToAuthorMap.push(author);
      authorToNumMap[author] = n;
      return n;
    }
  }
  function getChatRoom(opt_chatroom) {
    return '.chatlines[data-room="' + (opt_chatroom || chatroom) + '"] ';
  }
  function getDateNumCSSDayString(dateNum) {
    var d = new Date(+dateNum);
    var year = String(d.getFullYear());
    var month = ("0"+String(d.getMonth()+1)).slice(-2);
    var day = ("0"+String(d.getDate())).slice(-2);
    return year+"-"+month+"-"+day;
  }
  function getDateNumHumanDayString(dateNum) {
    var d = new Date(+dateNum);
    var monthName = (["January", "February", "March",
                      "April", "May", "June", "July", "August", "September",
                      "October", "November", "December"])[d.getMonth()];
    var dayOfMonth = d.getDate();
    var year = d.getFullYear();
    return monthName+" "+dayOfMonth+", "+year;
  }
  function ensureChatDay(time, opt_chatroom) {
    var toChatroom = opt_chatroom || chatroom;
    var day = getDateNumCSSDayString(time);
    var dayIndex = padutils.binarySearch(chatLinesByDay[toChatroom].length, function(n) {
      return chatLinesByDay[toChatroom][n].day >= day;
    });
    if (dayIndex >= chatLinesByDay[toChatroom].length ||
        chatLinesByDay[toChatroom][dayIndex].day != day) {
      // add new day to chat display!

      chatLinesByDay[toChatroom].splice(dayIndex, 0, {day: day, lines: []});
      var dayHtml = '<div class="chatday chatday'+day+'">'+
        '<h2 class="dayheader">'+getDateNumHumanDayString(time)+
        '</h2></div>';
      var dayDivs = $(getChatRoom(toChatroom) + ".chatday");
      if (dayIndex == dayDivs.length) {
        $(getChatRoom(toChatroom)).append(dayHtml);
      }
      else {
        dayDivs.eq(dayIndex).before(dayHtml);
      }
    }

    return dayIndex;
  }
  function addChatLine(userId, time, name, lineText, addBefore, toChatroom, opt_special) {
    var dayIndex = ensureChatDay(time, toChatroom);
    var dayDiv = $(getChatRoom(toChatroom) + ".chatday"+getDateNumCSSDayString(time));
    var d = new Date(+time);
    var hourmin = d.getHours()+":"+("0"+d.getMinutes()).slice(-2);
    var nameHtml;
    if (name) {
      nameHtml = padutils.escapeHtml(self.nameToInitials(name));
    }
    //else {
    //  nameHtml = "<i>unnamed</i>";
    //}
    var chatlineClass = "chatline";
    if (userId) {
      var authorNum = authorToNum(userId);
      chatlineClass += " chatauthor"+authorNum;
    }
    var textHtml = opt_special ? lineText :
        padutils.escapeHtmlWithClickableLinks(lineText, '_blank');
    var isIrcAction = textHtml.indexOf('/me ') == 0;
    if (isIrcAction) {
      textHtml = textHtml.substring('/me '.length);
    }
    textHtml = textHtml.
        replace(new RegExp('(^|\\s)(@' + escapeRegExp(self.nameToMention(clientVars.userName)) + ')(\\W|$)', 'gi'),
            '$1<span class="chat-at-tag-me">$2</span>$3').
        replace(/(^|\s)(@\S+)(\W|$)/g, '$1<span class="chat-at-tag">$2</span>$3');
    var lineNode = $('<div class="'+chatlineClass +
        (opt_special ? ' chatline-special  ' : '') +
        (isIrcAction ? ' chatline-irc-action ' : '') +
        '">'+
        '<span class="chatlinetime">'+hourmin+' </span>'+
        (nameHtml ? '<span class="chatlinename">'+nameHtml+'<span class="chatlinename-separator">:</span> </span>' : '') +
       '<span class="chatlinetext">'+textHtml+'</span></div>');
    var linesArray = chatLinesByDay[toChatroom][dayIndex].lines;
    var lineObj = {userId:userId, time:time, name:name, lineText:lineText};
    if (addBefore) {
      dayDiv.find("h2").after(lineNode);
      linesArray.splice(0, 0, lineObj);
    }
    else {
      dayDiv.append(lineNode);
      linesArray.push(lineObj);
    }
    if (userId) {
      var color = getAuthorCSSColor(userId);
      if (color) {
        lineNode.css('border-left', '5px solid ' + color);
      }
    }

    return {lineNode:lineNode};
  }
  function receiveChatHistoryBlock(block) {
    for(var a in block.historicalAuthorData) {
      var data = block.historicalAuthorData[a];
      var n = authorToNum(a);
      if (! authorColorArray[n]) {
        // no data about this author, use historical info
        authorColorArray[n] = { colorId: data.colorId, faded: true };
      }
    }

    oldestHistoricalLines[chatroom] = block.start;

    var lines = block.lines;
    for(var i=lines.length-1; i>=0; i--) {
      var line = lines[i];
      addChatLine(line.userId, line.time, line.name, line.lineText, true, chatroom);
    }

    if (oldestHistoricalLines[chatroom] > 0) {
      $(getChatRoom() + "a.chatloadmore").css('display', 'block');
    }
    else {
      $(getChatRoom() + "a.chatloadmore").css('display', 'none');
    }
  }
  function fadeColor(colorCSS) {
    var color = colorutils.css2triple(colorCSS);
    color = colorutils.blend(color, [1,1,1], 0.5);
    return colorutils.triple2css(color);
  }
  function getAuthorCSSColor(author) {
    var n = authorToNum(author, true);
    if (n < 0) {
      return '';
    }
    else {
      var cdata = authorColorArray[n];
      if (! cdata) {
        return '';
      }
      else {
        var c = pad.getColorPalette()[cdata.colorId % pad.getColorPalette().length];
        if (cdata.faded) {
          c = fadeColor(c);
        }
        return c;
      }
    }
  }
  function changeAuthorColorData(author, cdata) {
    var n = authorToNum(author);
    authorColorArray[n] = cdata;
    var cssColor = getAuthorCSSColor(author);
    if (cssColor) {
      $("#padchat .chatauthor"+n).css('border-left', '5px solid ' + cssColor);
    }
  }

  function sendChat() {
    var lineText = $("#chatentrybox").val().replace(/^\s+|\s+$/gm, '');
    if (lineText) {
      setTimeout(function() { $("#chatentrybox").val('').focus(); }, 0);
      var msg = {
        type: 'chat',
        userId: pad.getUserId(),
        chatroom: chatroom != 'site' && chatroom != 'pad' ? pad.getUserId() : chatroom,
        chatroom_to: chatroom,
        lineText: lineText,
        senderName: pad.getUserName(),
        authId: pad.getUserId()
      };
      pad.sendClientMessage(msg);
      msg.chatroom = chatroom;  // local chatroom
      if (chatroom != pad.getUserId()) {
        self.receiveChat(msg);
      }
      self.scrollToBottom();
    }
  }

  var chatLastTimeReceivedMessages = {};
  function updateAlreadyReadChatCounts() {
    if (caps.hasLocalStorage) {
      $('#padchat-users li').each(function (index, roomEl) {
        roomEl = $(roomEl);
        var room = roomEl.attr('data-room');
        var thisTabsLastTimeReceivedMessages = chatLastTimeReceivedMessages[room];
        var browserWideLastReadTime = localStorage['chatLastTimeReadMessages_' + room];
        if (browserWideLastReadTime && thisTabsLastTimeReceivedMessages && 
            parseInt(browserWideLastReadTime / 1000) >= parseInt(thisTabsLastTimeReceivedMessages / 1000)) {
          var currentCount = +(roomEl.attr('data-notification-count') || 0);
          roomEl.removeAttr('data-notification-count');
          self.totalUnreadChats -= currentCount;
          if (self.totalUnreadChats == 0) {
            $('#padchat').
                removeClass('chat-has-unread').
                removeAttr('data-notification-count');
          } else {
            $('#padchat').attr('data-notification-count', self.totalUnreadChats);
          }

          if ($('#padchat').hasClass('chat-open') && roomEl.hasClass('selected')) {
            localStorage['chatLastTimeReadMessages_' + room] = Date.now();
          }
        }
      });
    }
  }

  var lastTimeFocused = Date.now();
  function handleVisibilityChange() {
    if (!document[caps.hidden]) {
      lastTimeFocused = Date.now();
      if (caps.hasLocalStorage) {
        localStorage['chatLastTimeFocused'] = lastTimeFocused;
        updateAlreadyReadChatCounts();
      }
    }
  }

  if (typeof document.addEventListener !== "undefined" &&
    typeof caps.hidden !== "undefined") {
    // Handle page visibility change   
    document.addEventListener(caps.visibilityChange, handleVisibilityChange, false);
  }

  var belAudio = null;
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null;
  var audioTimeout;
  function playSound() {
    if (!window['AudioContext'] || allCookies.getItem('chat-sound') == 'F') {
      return;
    } else if (!audioCtx) {
      audioCtx = new AudioContext();
    }

    var oscillator = audioCtx.createOscillator();
    if (!oscillator.start) {
      return;
    }
    oscillator.type = 0; // sine wave
    oscillator.frequency.value = 400;
    var gainNode = audioCtx.createGainNode();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    var duration = 0.2;
    var fadeTime = 0.05;
    // Fade in.
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + fadeTime);
    // Then fade it out.
    gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + duration - fadeTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
  }

  function notifyChat(msg) {
    if (caps.hasLocalStorage) {
      // Only broadcast through one of the tabs that are open,
      // the latest that was opened, and only if it is hidden.
      // Window minimize detection is inconsistent (doesn't work in ubuntu/chrome 31)
      if (localStorage['chatLastTimeFocused'] == lastTimeFocused && document[caps.hidden]) {
        padnotify.userChat(msg);
        playSound();
      }
    }
  }

  var people = [];

  var self = {
    init: function(chatHistoryBlock, initialUserInfo) {
      self.setupChatRoom();

      lastTimeFocused = Date.now();
      if (caps.hasLocalStorage) {
        localStorage['chatLastTimeFocused'] = lastTimeFocused;
      }

      self.handleUserJoinOrUpdate(initialUserInfo);
      if (chatHistoryBlock) {
        receiveChatHistoryBlock(chatHistoryBlock);
      }

      $('#padchat-wrapper > header').click(function(event) {
        if ($(event.target).is('#chat-settings') ||
            $(event.target).parents('#chat-settings').length) {
          return;
        }

        $('#padchat').toggleClass('chat-open');
        if ($('#padchat').is(':visible')) {
          self.scrollToBottom();
          $('#chatentrybox').focus();

          if (caps.hasLocalStorage) {
            localStorage['chatLastTimeReadMessages_' + chatroom] = Date.now();
          }
          self.totalUnreadChats = 0;
          $('#padchat').
              removeClass('chat-has-unread').
              removeAttr('data-notification-count');
        }
      });

      $('#chat-settings-sound').click(function() {
        $('#chat-settings-sound').toggleClass('chat-sound-enabled');
        allCookies.setItem('chat-sound', $('#chat-settings-sound').hasClass('chat-sound-enabled') ? 'T' : 'F');
        return false;
      });
      $('#chat-settings-sound').toggleClass('chat-sound-enabled',
          allCookies.getItem('chat-sound') != 'F');

      $('#chatentrybox').textcomplete([{
        match: /\B@([\-+\w]*)$/,
        search: function (term, callback) {
          callback($.map(people, function (element) {
              return element.toLowerCase().indexOf(term.toLowerCase()) === 0 ? element : null;
          }));
        },
        replace: function (element) {
          return ['@' + element + ' ', ''];
        },
        index: 1,
        maxCount: 5
      }]);

      padutils.bindEnterAndEscape($("#chatentrybox"), function(evt) {
        // return/enter
        sendChat();
      }, null);

      self.handleUserSiteJoinOrUpdate(
          {userId: clientVars.userId, name: clientVars.userName,
              userPic: clientVars.userPic});

      $('#padchat-users').append(
        $('<li>').
            addClass('chat-site').
            addClass('selected').
            attr('title', clientVars.siteName).
            attr('data-room', 'site').
            append($('<img>').
                attr('src', 'https://hackpad.com/static/favicon.ico')).
            append($('<span>').text(clientVars.siteName))
      );

      // Per-pad chat currently disabled
      /*
      $('#padchat-users').append(
        $('<li>').
            addClass('chat-pad').
            attr('title', clientVars.padTitle).
            attr('data-room', 'pad').
            append($('<img>').
                attr('src', 'https://hackpad.com/static/favicon.ico')).
            append($('<span>').text(clientVars.padTitle))
      );
      */

      $(document).on('click', '#padchat-users li', function(e) {
        padchat.handleRoomClick($(e.currentTarget));
      });

      self.scrollToBottom();
    },
    setupChatRoom: function(newChatroom) {
      newChatroom = newChatroom || chatroom;
      if (!chatLinesByDay[newChatroom]) {
        chatLinesByDay[newChatroom] = [];
      }
      ensureChatDay(+new Date, newChatroom); // so that current date shows up right away

      $(getChatRoom(newChatroom) + "a.chatloadmore").click(self.loadMoreHistory);

      $(getChatRoom(newChatroom)).on('scroll', throttle(function() {
        if ($(getChatRoom(newChatroom)).scrollTop() < 100) {
          $(getChatRoom(newChatroom) + "a.chatloadmore").click();
        }
      }, 33));
    },
    handleNewTitle: function(newTitle) {
      $('#padchat-users .chat-pad').
          attr('title', newTitle).
          find('span').text(newTitle);
      padChatEl = $('#padchat-users .chat-pad.selected');
      if (padChatEl.length) {
        $('#chat-room-name').text(padChatEl.attr('title') + ' chat')
      }
    },
    handleRoomClick: function(roomEl) {
      if (loadingMoreHistory) {
        return;
      }

      $('#padchat-users li.selected').removeClass('selected');
      roomEl.addClass('selected').
          removeAttr('data-notification-count');

      roomEl.attr('data-author') ? $('#chat-room-name').text('Chat with ' + roomEl.attr('title')) :
          $('#chat-room-name').text(roomEl.attr('title') + ' chat');

      $(getChatRoom()).removeClass('selected');
      var newChatroom = roomEl.attr('data-room');
      chatroom = newChatroom;
      if (!$(getChatRoom()).length) {
        self.createChatRoom(newChatroom);
        self.loadMoreHistory();
      }
      $(getChatRoom()).addClass('selected');
      if (caps.hasLocalStorage) {
        localStorage['chatLastTimeReadMessages_' + chatroom] = Date.now();
      }

      self.scrollToBottom();
      $('#chatentrybox').focus();
    },
    createChatRoom: function(newChatroom) {
      $('#chat-body').append($('<div>').
          addClass('chatlines').
          attr('data-room', newChatroom).
          append($('<a class="chatloadmore" href="#load-more">load more</a>')).
          append($('<div class="chatloadingmore">loading...</div>')));
      self.setupChatRoom(newChatroom);
    },
    totalUnreadChats: 0,
    receiveChat: function(msg) {
      msg.chatroom = msg.chatroom;
      var $box = $(getChatRoom(msg.chatroom));
      if (!$box.length) {
        self.createChatRoom(msg.chatroom);
        $box = $(getChatRoom(msg.chatroom));
      }
      var box = $box.get(0);
      var wasAtBottom = (box.scrollTop -
                         (box.scrollHeight - $(box).height()) >= -5);
      addChatLine(msg.userId, +new Date, msg.senderName, msg.lineText, false,
          msg.chatroom, !!msg.special);
      if (wasAtBottom && $box.hasClass('selected')) {
        window.setTimeout(function() {
          self.scrollToBottom();
        }, 0);
      }

      if (msg.userId != clientVars.userId && !msg.dontNotify) {
        var currentTime = Date.now();
        if (!$('#padchat').hasClass('chat-open')) {
          self.totalUnreadChats++;
          $('#padchat').
              addClass('chat-has-unread').
              attr('data-notification-count', self.totalUnreadChats);
        } else {
          self.totalUnreadChats = 0;
          $('#padchat').
              removeClass('chat-has-unread').
              removeAttr('data-notification-count');
        }

        if (!$box.hasClass('selected')) {
          var sideRoomEl = $('#padchat-users li[data-room="' + msg.chatroom + '"]');
          var currentCount = +(sideRoomEl.attr('data-notification-count') || 0);
          sideRoomEl.attr('data-notification-count', currentCount + 1);
        }

        chatLastTimeReceivedMessages[msg.chatroom] = currentTime;
        if ($('#padchat').hasClass('chat-open') && $box.hasClass('selected')) {
          if (caps.hasLocalStorage) {
            localStorage['chatLastTimeReadMessages_' + msg.chatroom] = currentTime;
          }
        }

        notifyChat(msg);
      }
    },
    receiveMention: function(msg) {
      self.receiveChat(msg);
    },
    receiveInvite: function(msg) {
      msg.lineText = msg.inviter +
          ' invited you to <a href="' +
          window.location.protocol + '//' + window.location.host + '/' +
          msg.padId + '" target="_blank">' + padutils.escapeHtml(msg.title) + '</a>';
      msg.special = true;
      msg.chatroom = 'site';
      self.receiveChat(msg);
    },
    handleUserJoinOrUpdate: function(userInfo) {
      people.push(self.nameToMention(userInfo.name));
      changeAuthorColorData(userInfo.userId,
                            { colorId: userInfo.colorId, faded: false });
    },
    handleUserLeave: function(userInfo) {
      changeAuthorColorData(userInfo.userId,
                            { colorId: userInfo.colorId, faded: true });
    },
    updateUserCount: function() {
      var numOnline = $('#padchat-users li[data-author]').length;
      $('#chat-num-online').text(numOnline <= 1 ? '' : '(' + numOnline + ' online)');
    },
    nameToInitials: function(fullName) {
      var splitName = fullName.split(' ');
      return (splitName[0] || '') +
          (splitName.length >= 2 ? ' ' + (splitName[splitName.length - 1][0] || '') : '');
    },
    nameToMention: function(fullName) {
      return self.nameToInitials(fullName).replace(/\s/g, '');
    },
    handleUserSiteJoinOrUpdate: function(userInfo) {
      people.push(self.nameToMention(userInfo.name));
      var wasSelected = $('#padchat-users li[data-author="' + userInfo.userId + '"]').hasClass('selected');
      $('#padchat-users li[data-author="' + userInfo.userId + '"]').remove();
      $('#padchat-users').append(
        $('<li>').
            attr('data-author', userInfo.userId).
            attr('data-room', userInfo.userId).
            attr('title', userInfo.name).
            toggleClass('selected', wasSelected).
            append($('<img>').
                attr('src', userInfo.userPic)).
            append($('<span>').text(self.nameToInitials(userInfo.name)))
      );
      $('#padchat-users li[data-author]').tsort();
      self.updateUserCount();

      if (chatLinesByDay[userInfo.userId]) {
        var msg = {};
        msg.lineText = userInfo.name + ' is online.';
        msg.special = true;
        msg.dontNotify = true;
        msg.chatroom = userInfo.userId;
        self.receiveChat(msg);
      }
    },
    handleUserSiteLeave: function(userInfo) {
      $('#padchat-users li[data-author="' + userInfo.userId + '"]').addClass('offline');
      self.updateUserCount();
      var msg = {};
      msg.lineText = userInfo.name + ' is offline.';
      msg.special = true;
      msg.dontNotify = true;
      msg.chatroom = userInfo.userId;
      self.receiveChat(msg);
    },
    scrollToBottom: function() {
      var box = $(getChatRoom()).get(0);
      box.scrollTop = box.scrollHeight;
    },
    scrollToTop: function() {
      var box = $(getChatRoom()).get(0);
      box.scrollTop = 0;
    },
    loadMoreHistory: function() {
      if (loadingMoreHistory) {
        return false;
      }

      if (oldestHistoricalLines[chatroom] == 0) {
        return;
      }

      var firstHistoryLoad = oldestHistoricalLines[chatroom] == undefined;
      if (firstHistoryLoad) {
        oldestHistoricalLines[chatroom] = -1;
      }

      var end = oldestHistoricalLines[chatroom];
      var start = Math.max(0, end - HISTORY_LINES_TO_LOAD_AT_A_TIME);
      var padId = pad.getPadId();

      loadingMoreHistory = true;
      $(getChatRoom() + ".chatloadmore").css('display', 'none');
      $(getChatRoom() + ".chatloadingmore").css('display', 'block');

      $.ajax({
        type: 'get',
        url: '/ep/pad/chathistory',
        data: { padId: padId, start: start, end: end, chatroom: chatroom},
        success: success,
        error: error
      });

      function success(text) {
        notLoading();

        var result = JSON.parse(text);

        // try to keep scrolled to the same place...
        var scrollBox = $(getChatRoom()).get(0);
        var scrollDeterminer = function() { return 0; };
        var topLine = $(getChatRoom() + ".chatday:first .chatline:first").children().eq(0);
        if (topLine.length > 0) {
          var posTop = topLine.position().top;
          var scrollTop = scrollBox.scrollTop;
          scrollDeterminer = function() {
            var newPosTop = topLine.position().top;
            return newPosTop + (scrollTop - posTop);
          };
        }
        receiveChatHistoryBlock(result);

        if (firstHistoryLoad) {
          self.scrollToBottom();
        } else {
          scrollBox.scrollTop = Math.max(0, Math.min(scrollBox.scrollHeight, scrollDeterminer()));
        }
      }
      function error() {
        notLoading();
      }
      function notLoading() {
        loadingMoreHistory = false;
        $(getChatRoom() + ".chatloadmore").css('display', 'block');
        $(getChatRoom() + ".chatloadingmore").css('display', 'none');
      }

      return false;
    }
  };
  return self;
}());
