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

import("stringutils");
import("etherpad.helpers");
import("etherpad.log");
import("etherpad.pad.padutils");

jimport("java.lang.System.out.println");

function getSitewideChatPad() {
  return padutils.accessPadLocal('_____chat__', function(pad) {
    if(!pad.exists()) {
      pad.create();
    }
    return pad;
  });
}


function getUserToUserChatPad(chatArchiveRoom) {
  return padutils.accessPadLocal('_____chat_' + chatArchiveRoom.replace(/\W/g, '_') + '__', function(pad) {
    if(!pad.exists()) {
      pad.create();
    }
    return pad;
  });
}

function onChatMessage(pad, senderUserInfo, msg) {
  if (msg.chatroom == 'site') {
    pad = getSitewideChatPad();
  } else if (msg.chatroom != 'pad') {
    var chatArchiveRoom = msg.chatroom_to < senderUserInfo.userId ? msg.chatroom_to + '_' + senderUserInfo.userId :
            senderUserInfo.userId + '_' + msg.chatroom_to;
    pad = getUserToUserChatPad(chatArchiveRoom);
  }

  pad.appendChatMessage({
    name: senderUserInfo.name,
    userId: senderUserInfo.userId,
    time: +(new Date),
    lineText: msg.lineText
  });
}

function getRecentChatBlock(pad, howMany) {
  // no padchat for domain guests
  if (!helpers.isChatEnabled()) {
    return;
  }

  pad = getSitewideChatPad();
  var numMessages = pad.getNumChatMessages();
  var firstToGet = Math.max(0, numMessages - howMany);
  return getChatBlock(pad, firstToGet, numMessages, 'site');
}

function getChatBlock(pad, start, end, chatArchiveRoom) {
  if (chatArchiveRoom == 'site') {
    pad = getSitewideChatPad();
  } else if (chatArchiveRoom != 'pad') {
    pad = getUserToUserChatPad(chatArchiveRoom);
  }

  if (end == -1) {
    end = pad.getNumChatMessages();
    start = Math.max(0, end - 30);
  }

  if (start < 0) {
    start = 0;
  }
  if (end > pad.getNumChatMessages()) {
    end = pad.getNumChatMessages();
  }

  var historicalAuthorData = {};
  var lines = [];
  var block = {start: start, end: end,
               historicalAuthorData: historicalAuthorData,
               lines: lines};

  for(var i=start; i<end; i++) {
    var x = pad.getChatMessage(i);
    var userId = x.userId;
    if (! historicalAuthorData[userId]) {
      historicalAuthorData[userId] = (pad.getAuthorData(userId) || {});
    }
    lines.push({
      name: x.name,
      time: x.time,
      userId: x.userId,
      lineText: x.lineText
    });
  }

  return block;
}
