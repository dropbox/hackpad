import("fastJSON");
import("sqlbase.sqlobj");
import("cache_utils.syncedWithCache");
import("netutils.{urlGet,urlPost}");

import("etherpad.log");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_accounts.{getAccountById,signOut}");
import("etherpad.pro.pro_tokens");

function shouldRefreshFacebookToken() {
  if (getSessionProAccount() && getSessionProAccount().fbid != null) {
    // load the current token
    // if we're less than 30
    var tokenInfo = pro_tokens.getFacebookTokenForProUserId(getSessionProAccount().id);
    TWENTY_DAYS = 1000 * 60 * 60 * 24 * 20;
    if (!tokenInfo || ((tokenInfo.expiration - new Date()) < TWENTY_DAYS)) {
      return true;
    }
  }
  return false;
}

function _graphApi(api, accessToken, args, isPost) {
  args = args || {};
  args["access_token"] = accessToken;

  var resp;
  try {
    if (!isPost) {
      resp = urlGet("https://graph.facebook.com/" + api, args);
    } else {
      resp = urlPost("https://graph.facebook.com/" + api, args);
    }
    if (resp.status != 200) {
      throw Error("Graph API call '" + api + "' failed: " + resp.status + " " + String(resp.content));
    }
  } catch (ex) {
    //log.logException(ex);

    // eventually redirect to auth & get a new token
    // signOut();
    /*if (request.method=="GET") {
      response.redirect(request.url);
    } else {
      throw(ex);
    }*/
    return [];
  }

  log.custom("pro_facebook", { api: api, args: fastJSON.stringify(args), 'fbresponse': String(resp.content) });
  return fastJSON.parse(resp.content);

}

function _restApi(api, accessToken, args, isPost) {
  args = args || {};
  args["access_token"] = accessToken;

  var resp;
  try {
    if (!isPost) {
      resp = urlGet("https://api.facebook.com/method/" + api + "&format=json", args);
    } else {
      resp = urlPost("https://api.facebook.com/method/" + api + "&format=json", args);
    }
    if (resp.status != 200) {
      throw Error("REST API call '" + api + "' failed: " + resp.status + " " + String(resp.content));
    }
    var decoded = fastJSON.parse(resp.content);
    if ('error_code' in decoded) {
      if (decoded['error_code'] == 190 &&
          (decoded['error_msg'] || '').indexOf("has not authorized application") > -1) {
        log.custom("pro_facebook", "getAppUsers failed: user has not authorized application");
        return [];
      }
      throw Error("REST API call '" + api + "' failed: " + resp.status + " " + String(resp.content));
    }
  } catch (ex) {
    //log.logException(ex);

    // eventually redirect to /ep/pad/auth & get a new token
    /*signOut();
    if (request.method=="GET") {
      response.redirect(request.url);
    } else {
      throw(ex);
    }*/
    return [];
  }

  log.custom("pro_facebook", { api: api, args: fastJSON.stringify(args), 'fbresponse': String(resp.content) });
  return fastJSON.parse(resp.content);
}

function postToFeed(uid, accessToken, args) {
  return _graphApi((uid || "me") + "/feed", accessToken, args, true);
}

function getUserInfo(uid, accessToken) {
  return _graphApi((uid || "me"), accessToken);
}

// http://stackoverflow.com/questions/2785093/facebook-friends-getappusers-using-graph-api
function getFacebookFriends(fbId, accessToken) {
  if (!fbId) {
    return [];
  }

  // check the cache
  var friends = syncedWithCache("fb-user-data."+fbId, function(c) {
    return c['friends'];
  });

  if (!friends || !friends.length) {
    friends = _graphApi(fbId + "/friends", accessToken)['data'];
    syncedWithCache("fb-user-data."+fbId, function(c) {
      c['friends'] = friends;
    });
  }

  return friends;
}

function getFacebookFriendsWhoUseApp(fbId, accessToken) {
  if (!fbId) {
    return [];
  }
  // check the cache
  var friends = syncedWithCache("fb-user-data."+fbId, function(c) {
      return c['friends_who_use'];
  });

  if (!friends || !friends.length) {
    /* Convert result ids to strings, to avoid integer conversion errors in sqlobj */
    friends = _restApi("friends.getAppUsers", accessToken);
    // Facebook returns {} for no friends who use (?)
    if (friends.length > 0) {
      friends = friends.map(function(x) { return x.toString(); });
    } else {
      friends = [];
    }
    syncedWithCache("fb-user-data."+fbId, function(c) {
      c['friends_who_use'] = friends;
    });
  }

  return friends;
}

function getFacebookGroups(fbId, accessToken) {
  if (!fbId) {
    return [];
  }

  // check the cache
  var groups = syncedWithCache("fb-user-data."+fbId, function(c) {
    return c['groups'];
  });

  if (!groups) {
    groups = _graphApi(fbId + "/groups", accessToken)['data'];
    syncedWithCache("fb-user-data."+fbId, function(c) {
      c['groups'] = groups;
    });
  }

  return groups;
}

function isFriendOfId(fbId, friendId, accessToken) {
  if (!fbId || !friendId || !accessToken) {
    return false;
  }

  var friends = getFacebookFriends(fbId, accessToken);
  for (var i=0; i < friends.length; i++) {
    if (friends[i]['id'] == friendId) {
      return true;
    }
  }

  return false;
}

function isMemberOfGroup(fbId, groupId, accessToken) {
  if (!fbId) {
    return false;
  }

  var groups = getFacebookGroups(fbId, accessToken);
  for (var i=0; i < groups.length; i++) {
    if (groups[i]['id'] == groupId) {
      return true;
    }
  }

  return false;
}

// do not call me in a loop
function isFriendOfAccountId(fbId, accountId, accessToken) {
  if (!fbId) {
    return false;
  }

  var account = getAccountById(accountId);
  if (account && account.fbid) {
    return isFriendOfId(fbId, account.fbid, accessToken);
  }
  return false;
}

function getAccountByFacebookId(fbId, optDomainId) {
  var domainId = optDomainId || domains.getRequestDomainId();
  return sqlobj.selectSingle('pro_accounts', {fbid: fbId, isDeleted: false, domainId: domainId});
}

function getAccountsByFacebookIds(fbIds) {
  var domainId = domains.getRequestDomainId();
  return sqlobj.selectMulti('pro_accounts', {fbid: ["IN", fbIds], isDeleted: false, domainId: domainId});
}

function clearFriendCache(fbId) {
  syncedWithCache("fb-user-data."+fbId, function(c) {
    delete c['friends'];
    delete c['friends_who_use'];
  });
}
