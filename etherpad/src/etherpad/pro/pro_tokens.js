import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");

import("etherpad.log");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_apns.{APP_STORE_APP_ID,BETA_APP_ID,DEBUG_APP_ID}");
import("etherpad.pro.pro_pad_editors");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.google_account");

var GOOGLE_OAUTH1_TOKEN = 1; // obsolete
var DROPBOX_OAUTH1_TOKEN = 2;
var FACEBOOK_OAUTH2_TOKEN = 3;
var HACKPAD_API_TOKEN = 4;
var IOS_DEVICE_TOKEN = 5;
var GOOGLE_OAUTH2_TOKEN = 6;

function removeFacebookTokenForProUserId(uid) {
  sqlobj.deleteRows('pro_tokens', {userId: uid, tokenType: FACEBOOK_OAUTH2_TOKEN});
}

function setToken(userId, tokenType, token, optTokenExtra, optExpirationDate) {
  var data = {
    userId: userId,
    tokenType: tokenType,
    token: token,
    tokenExtra: optTokenExtra !== undefined ? optTokenExtra : null,
    expirationDate: optExpirationDate !== undefined ? optExpirationDate : null,
  };

  inTransaction(function() {
    var existing = getToken(userId, tokenType);
    if (existing) {
      sqlobj.update('pro_tokens', {userId: userId, tokenType:tokenType}, data);
    } else {
      sqlobj.insert('pro_tokens', data);
    }
  });
}

function getToken(userId, tokenType) {
  return sqlobj.selectSingle('pro_tokens', {userId: userId, tokenType: tokenType});
}

function getFreshToken(tokenType, optAccountId) {
  var accountId = optAccountId || pro_accounts.getSessionProAccount().id;
  var token = getToken(accountId, tokenType);
  if (!token) {
    return token;
  }
  refreshTokenIfNeeded(token, accountId);
  return token;
}

function refreshTokenIfNeeded(token, accountId) {
  if (new Date() >= 0 /*token.expirationDate*/) {
    switch (token.tokenType) {
      case GOOGLE_OAUTH2_TOKEN:
        return google_account.refreshToken(token, accountId);
    }

    throw Error("Don't know how to refresh token of type " + token.tokenType + " and we need to.");
  }
}

function setFacebookTokenForProUserId(userId, token, expirationDate){
  setToken(userId, FACEBOOK_OAUTH2_TOKEN, token, null, expirationDate);
}
function getFacebookTokenForProUserId(uid) {
  var tokenInfo = getToken(uid, FACEBOOK_OAUTH2_TOKEN);
  if (tokenInfo) {
    return {token: tokenInfo['token'],
            expiration: tokenInfo['expirationDate']};
  }
}


function setDropboxTokenAndSecretForProUserId(uid, oauth_token, oauth_token_secret){
  var data = {
    userId: uid,
    tokenType: DROPBOX_OAUTH1_TOKEN,
    expirationDate: null, //never expires
    token: oauth_token,
    tokenExtra: oauth_token_secret,
  };
  var ret = inTransaction(function() {
    var existing = getDropboxKeyAndSecretForProUserId(uid);
    if (existing) {
      sqlobj.update('pro_tokens', {userId:uid, tokenType:DROPBOX_OAUTH1_TOKEN}, data);
    } else {
      sqlobj.insert('pro_tokens', data);
    }
  });
}


function getDropboxKeyAndSecretForProUserId(uid) {
  var tokenInfo = sqlobj.selectSingle('pro_tokens', {userId: uid, tokenType: DROPBOX_OAUTH1_TOKEN})
  if (tokenInfo) {
    return {key: tokenInfo['token'],
            secret: tokenInfo['tokenExtra']};
  }
  return null;
}

function getAllIdsOfDropboxUsers() {
  return sqlobj.selectMulti('pro_tokens', {tokenType: DROPBOX_OAUTH1_TOKEN});
}


function removeDropboxTokenAndSecretForProUserId(uid) {
  sqlobj.deleteRows('pro_tokens', {userId: uid, tokenType: DROPBOX_OAUTH1_TOKEN});
}

function addIOSDeviceToken(account, token, appId) {
  switch (appId) {
  case APP_STORE_APP_ID:
    if (appjet.config.devMode) {
      return false;
    }
    break;
  case BETA_APP_ID:
  case DEBUG_APP_ID:
    break;
  default:
    return false;
  }
  token = token.toUpperCase();
  inTransaction(function() {
    var data = {
      userId: account.id,
      tokenType: IOS_DEVICE_TOKEN,
      token: token,
      tokenExtra: appId,
      expirationDate: new Date(),
    };
    // Make sure the token is only associated with one account per domain.
    var tokens = sqlobj.selectMulti('pro_tokens', {tokenType: IOS_DEVICE_TOKEN, token: token});
    for (var i = 0; i < tokens.length; i++) {
      var existingAccount = pro_accounts.getAccountById(tokens[i].userId);
      if (!existingAccount || existingAccount.domainId != account.domainId) {
        continue;
      }
      log.info('Updating token for domain ' + account.domainId + ' from user ' + existingAccount.id + ' to ' + account.id);
      sqlobj.updateSingle('pro_tokens', { userId: existingAccount.id, tokenType: IOS_DEVICE_TOKEN, token: token }, data);
      return;
    }
    sqlobj.insert('pro_tokens', data);
  });
  return true;
}

function getIOSDeviceTokensForUser(userId) {
  var tokens = { };
  tokens[APP_STORE_APP_ID] = [];
  tokens[BETA_APP_ID] = [];
  tokens[DEBUG_APP_ID] = [];
  sqlobj.selectMulti('pro_tokens', {userId:userId, tokenType: IOS_DEVICE_TOKEN}).forEach(function(r) {
    tokens[r.tokenExtra].push(r.token);
  });
  return tokens;
}

function getIOSDeviceTokensForAppId(appId, tokens) {
  return sqlobj.selectMulti('pro_tokens', {tokenExtra: appId, tokenType: IOS_DEVICE_TOKEN, token: [ 'in', tokens ]});
}

function removeIOSDeviceTokenForUser(userId, token) {
  sqlobj.deleteRows('pro_tokens', {tokenType: IOS_DEVICE_TOKEN, userId: userId, token: token.toUpperCase()});
}

function removeIOSDeviceTokensForAppId(appId, tokens) {
  sqlobj.deleteRows('pro_tokens', {tokenType: IOS_DEVICE_TOKEN, tokenExtra: appId, token: [ 'in', tokens ]});
}
