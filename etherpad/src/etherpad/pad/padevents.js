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

// src/etherpad/events.js

import("sqlbase.sqlobj");

import("etherpad.importexport.dropbox");
import("etherpad.log");
import("etherpad.pad.chatarchive");
import("etherpad.pad.activepads");
import("etherpad.pad.padutils");
import("etherpad.sessions");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pad.padusers");
import("etherpad.pad.pad_security");
import("etherpad.collab.collab_server");
jimport("java.lang.System.out.println");

function onNewPad(pad, optTitle) {
  var eventInfo = {type: "newpad",
    padId: pad.getId(),
  };

  if (request.isDefined && getSessionProAccount()) {
    eventInfo['username'] = getSessionProAccount().fullName;
    eventInfo['userId'] = padusers.getUserIdForProUser(getSessionProAccount().id);
  }

  log.custom("padevents", eventInfo);
  pro_pad_db.onCreatePad(pad, optTitle);
  dropbox.requestSyncForCurrentUser();
  if (request.isDefined && getSessionProAccount()) {
    pro_accounts.clearPadsCreatedByAcct(getSessionProAccount());
  }
}

function onNewAutoPad(pad) {
  log.custom("padevents", {
    type: "newautopad",
    padId: pad.getId()
  });
}

function onDestroyPad(pad) {
  log.custom("padevents", {
    type: "destroypad",
    padId: pad.getId()
  });
  pro_pad_db.onDestroyPad(pad);
}

function onUserJoin(pad, userInfo) {
  log.callCatchingExceptions(function() {

    var name = userInfo.name || "unnamed";
    log.custom("padevents", {
      type: "userjoin",
      padId: pad.getId(),
      username: name,
      ip: userInfo.ip,
      userId: userInfo.userId
    });
    activepads.touch(pad.getId());

  });
}

function onUserLeave(pad, userInfo) {
  log.callCatchingExceptions(function() {

    var name = userInfo.name || "unnamed";
    log.custom("padevents", {
      type: "userleave",
      padId: pad.getId(),
      username: name,
      ip: userInfo.ip,
      userId: userInfo.userId
    });
    activepads.touch(pad.getId());

  });
}

function onUserInfoChange(pad, userInfo) {
  log.callCatchingExceptions(function() {

    activepads.touch(pad.getId());

  });
}

function onClientMessage(pad, senderUserInfo, msg) {
  var padId = pad.getId();
  activepads.touch(padId);
  var clientIsPadAdmin = false;
  pro_padmeta.accessProPad(padId, function(propad) {
        if (pad_security.checkIsPadAdmin(propad)) {
          clientIsPadAdmin = true;
        }
  });
  var clientCanEdit = getSessionProAccount() &&
    (!pad.getIsModerated() || clientIsPadAdmin); // refactor into pad_security

  if (msg.type == "chat") {
    chatarchive.onChatMessage(pad, senderUserInfo, msg);

    /*var name = "unnamed";
    if (senderUserInfo.name) {
      name = senderUserInfo.name;
    }

    log.custom("chat", {
      padId: padId,
      userId: senderUserInfo.userId,
      username: name,
      text: msg.lineText
    });
    */
  }
  else if (msg.type == "padoptions" && clientIsPadAdmin) {
    // options object is a full set of options or just
    // some options to change
    var opts = msg.options;
    var padOptions = pad.getPadOptionsObj();

    if (opts.view) {
      if (! padOptions.view) {
        padOptions.view = {};
      }
      for(var k in opts.view) {
        padOptions.view[k] = opts.view[k];
      }
    }

    if (opts.guestPolicy) {
      pad.setGuestPolicy(opts.guestPolicy);
      // boot anyone without an explicit pad access
      if (!(opts.guestPolicy == "link" ||
            opts.guestPolicy == "allow" ||
            opts.guestPolicy == "anon")) {
        collab_server.bootUsersFromPad(pad, "unauth", function(userInfo) {
          if (padusers.isGuest(userInfo.userId)) {
            return true;
          }
          if (userInfo.userId == senderUserInfo.userId) {
            return false;
          }
          return !pad_security.doesUserHaveAccessToPad(padId,
            padusers.getAccountIdForProAuthor(userInfo.userId));
        });
      }
    }
    if ('isModerated' in opts) {
      pad.setIsModerated(opts.isModerated);
    }
  }
  else if (msg.type == "guestanswer") {
    if ((! msg.authId) || padusers.isGuest(msg.authId)) {
      // not a pro user, forbid.
    }
    else {
      pad_security.answerKnock(msg.guestId, padId, msg.answer, msg.authId);
    }
  }
}

function onEditPad(pad, authorId, optNewTitle) {
  log.callCatchingExceptions(function() {

    pro_pad_db.onEditPad(pad, authorId, optNewTitle);

  });
}


