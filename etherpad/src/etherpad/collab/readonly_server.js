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

import("comet");
import("ejs");
import("etherpad.collab.ace.easysync2.{AttribPool,Changeset}");
import("etherpad.log");
import("etherpad.pad.activepads");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padevents");
import("etherpad.pro.pro_padmeta");
import("fastJSON");
import("fileutils.readFile");
import("jsutils.eachProperty");
import("etherpad.collab.server_utils.*");
import("etherpad.collab.collabroom_server");

jimport("java.lang.System.out.println");

var PADVIEW_ROOMTYPE = 'padview';

var _serverDebug = println;//function(x) {};

// "view id" is either a padId or an ro.id
function _viewIdToRoom(padId) {
  return "padview/"+padId;
}

function _roomToViewId(roomName) {
  return roomName.substring(roomName.indexOf("/")+1);
}

function getRoomCallbacks(roomName, emptyCallbacks) {
  var callbacks = emptyCallbacks;

  var viewId = _roomToViewId(roomName);

  callbacks.handleConnect = function(data) {
    if (data.userInfo && data.userInfo.userId) {
      return data.userInfo;
    }
    return null;
  };
  callbacks.clientReady =
    function(newConnection, data) {
      newConnection.data.lastRev = data.lastRev;
      collabroom_server.updateRoomConnectionData(newConnection.connectionId,
                                                 newConnection.data);
    };

  return callbacks;
}

function updatePadClients(pad) {
  var padId = pad.getId();
  var roId = padIdToReadonly(padId);

  function update(connection) {
    updateClient(pad, connection.connectionId);
  }

  collabroom_server.getRoomConnections(_viewIdToRoom(padId)).forEach(update);
  collabroom_server.getRoomConnections(_viewIdToRoom(roId)).forEach(update);
}

// Get arrays of text lines and attribute lines for a revision
// of a pad.
function _getPadLines(pad, revNum) {
  var atext;
  if (revNum >= 0) {
    atext = pad.getInternalRevisionAText(revNum);
  } else {
    atext = Changeset.makeAText("\n");
  }

  var result = {};
  result.textlines = Changeset.splitTextLines(atext.text);
  result.alines = Changeset.splitAttributionLines(atext.attribs,
                                                  atext.text);
  return result;
}

function updateClient(pad, connectionId) {
  var conn = collabroom_server.getConnection(connectionId);
  if (! conn) {
    return;
  }
  var lastRev = conn.data.lastRev;
  while (lastRev < pad.getHeadRevisionNumber()) {
    var r = ++lastRev;
    var author = pad.getRevisionAuthor(r);
    var lines = _getPadLines(pad, r-1);
    var wirePool = new AttribPool();
    var forwards = pad.getRevisionChangeset(r);
    var backwards = Changeset.inverse(forwards, lines.textlines,
                                      lines.alines, pad.pool());
    var forwards2 = Changeset.moveOpsToNewPool(forwards, pad.pool(),
                                               wirePool);
    var backwards2 = Changeset.moveOpsToNewPool(backwards, pad.pool(),
                                                wirePool);

    function revTime(r) {
      var date = pad.getRevisionDate(r);
      var s = Math.floor((+date)/1000);
      //java.lang.System.out.println("time "+r+": "+s);
      return s;
    }

    var msg = {type:"NEW_CHANGES", newRev:r,
               changeset: forwards2,
               changesetBack: backwards2,
               apool: wirePool.toJsonable(),
               author: author,
               timeDelta: revTime(r) - revTime(r-1) };
    collabroom_server.sendMessage(connectionId, msg);
  }
  conn.data.lastRev = pad.getHeadRevisionNumber();
  collabroom_server.updateRoomConnectionData(connectionId, conn.data);
}

function sendMessageToPadConnections(pad, msg) {
  var padId = pad.getId();
  var roId = padIdToReadonly(padId);

  function update(connection) {
    collabroom_server.sendMessage(connection.connectionId, msg);
  }

  collabroom_server.getRoomConnections(_viewIdToRoom(padId)).forEach(update);
  collabroom_server.getRoomConnections(_viewIdToRoom(roId)).forEach(update);
}

function updateUserInfo(pad, userInfo) {
  var msg = { type:"NEW_AUTHORDATA",
              author: userInfo.userId,
              data: {} };
  var hasData = false;
  if ((typeof (userInfo.colorId)) == "number") {
    msg.data.colorId = userInfo.colorId;
    hasData = true;
  }
  if (userInfo.name) {
    msg.data.name = userInfo.name;
    hasData = true;
  }
  if (hasData) {
    sendMessageToPadConnections(pad, msg);
  }
}

function broadcastNewRevision(pad, revObj) {
  var msg = { type:"NEW_SAVEDREV",
              savedRev: revObj };

  delete revObj.ip; // we try not to share info like IP addresses on slider

  sendMessageToPadConnections(pad, msg);
}
