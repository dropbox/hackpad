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

import("sqlbase.sqlobj");
import("fastJSON");
import("stringutils");
import("jsutils.eachProperty");
import("sync");
import("etherpad.sessions");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("stringutils.randomHash");




function getUserId() {
  if (pro_accounts.isAccountSignedIn()) {
    return "p."+(getSessionProAccount().id);
  }
  else {
    return getGuestUserId();
  }
}

function getUserName() {
  var uid = getUserId();
  if (isGuest(uid)) {
    return null;
  }
  else {
    return getSessionProAccount().fullName;
  }
}

function getUserIdForProUser(uid) {
  return "p." + uid;
}

function getAccountIdForProAuthor(uid) {
  if (uid.indexOf("p.") == 0) {
    return Number(uid.substring(2)) || -1;
  }
  else {
    return -1;
  }
}

function getNameForUserId(uid) {
  if (isGuest(uid)) {
    return null;
  }
  var accountNum = getAccountIdForProAuthor(uid);
  if (accountNum <= 0) {
    return null;
  }
  var account = pro_accounts.getAccountById(accountNum);
  return account ? account.fullName : null
}

function getLinkForUserId(uid) {
  if (isGuest(uid)) {
    return null;
  }
  else {
    var accountNum = getAccountIdForProAuthor(uid);
    if (accountNum < 0) {
      return null;
    }
    else {
      return pro_accounts.getUserLinkById(accountNum);
    }
  }
}

function isGuest(userId) {
  return /^g/.test(userId);
}

function getGuestUserId() {
  // cache the userId in the requestCache,
  // for efficiency and consistency
  var c = appjet.requestCache;
  if (c.padGuestUserId === undefined) {
    c.padGuestUserId = _computeGuestUserId();
  }
  return c.padGuestUserId;
}

function _computeGuestUserId() {
  // always returns some userId

  var s = sessions.getSession();

  if (s && s.padGuestUserId) {
    return s.padGuestUserId;
  }

  var padGuestUserId = "g." + randomHash(16);

  if (s) {
    s.padGuestUserId = padGuestUserId;
  }
  return padGuestUserId;
}

function foreignUserIdForMediaWikiUser(map, username) {
  if (username in map) {
    return map[username].userId;
  } else {
    // generate userId
    var userId = "g." + (username ? username.replace(/ /g, '') : _randomString(16));

    var guest = {userId:userId, privateKey:randomHash(16)};
    var data = {name: username};
    guest.data = data;

    map[username] = guest;

    return userId;
  }
}

function _randomString(len) {
  return stringutils.randomString(len).toLowerCase();
}

