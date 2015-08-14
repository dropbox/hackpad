import("oauth.OAuth");
import("sqlbase.sqlobj");
import("stringutils");

import("etherpad.log");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_oauth2");
import("etherpad.pro.pro_tokens");
import("etherpad.utils.*");

import("etherpad.control.apicontrol.emailToAPIEmail");

function generateToken() {
  var token = stringutils.randomString(20);
  sqlobj.insert('pro_oauth_tokens', {token:token, userId: pro_accounts.getSessionProAccount().id});
  return token;
}

function getUserForToken(token) {
  var row = sqlobj.selectSingle('pro_oauth_tokens', {token:token, valid:true});
  if (row) {
    return pro_accounts.getAccountById(row.userId);
  }
  return null;
}

function _parseAuthorizationOAuth2() {
  var authorization = request.headers['Authorization'];
  if (!authorization) {
    return null;
  }

  var parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  var accountId = pro_oauth2.authorizedAccountIdForAccessToken(parts[1]);
  return accountId;
}

/*
  Parse an Authorization: OAuth HTTP header. This is done one parameter at a
  time as the realm parameter is a quoted-string while the OAuth parameters are
  a little more strict about their content.

  http://oauth.net/core/1.0a/#auth_header

  This header looks something like (on one line):

  Authorization: OAuth realm="http://sp.example.com/",
  oauth_consumer_key="0685bd9184jfhq22",
  oauth_token="ad180jjd733klru7",
  oauth_signature_method="HMAC-SHA1",
  oauth_signature="wOJIO9A2W5mFwDgiDvZbTSMK%2FPY%3D",
  oauth_timestamp="137131200",
  oauth_nonce="4572616e48616d6d65724c61686176",
  oauth_version="1.0"
 */
function _parseAuthorization() {
  var authorization = request.headers['Authorization'];
  var ret = {};
  var m = authorization.match(/^oauth\s+/i);
  if (!m) {
    log.info("Invalid authentication scheme: " + authorization);
    return null;
  }
  var s = authorization.substring(m[0].length);
  do {
    var key;
    var val;
    // realm is an HTTP quoted-string, with \ escaping characters (such as ").
    m = s.match(/^realm="([^"\\]*(\\.[^"\\]*)*)"/);
    if (m) {
      key = 'realm';
      val = m[1].replace(/\\(.)/g, '$1');
      s = s.substr(m[0].length);
    } else {
      // Characters allowed in OAuth parameter encoding: ALPHA, DIGIT, '-', '.', '_', '~' (plus % as an escape character).
      m = s.match(/^oauth_(\w+)="([\w\-~%\.]*)"/);
      if (m) {
        key = 'oauth_' + m[1];
        val = decodeURIComponent(m[2]);
        s = s.substr(m[0].length);
      } else {
        log.info("Invalid Authorization: " + authorization);
        return null;
      }
    }
    if (ret[key]) {
      log.info("Duplicate key: " + key + " in " + authorization);
      return null;
    }
    ret[key] = val;
    if (s.length) {
      m = s.match(/^,\s*/);
      if (!m) {
        log.info("Invalid Authorization: " + authorization);
        return null;
      }
      s = s.substr(m[0].length);
    }
  } while (s.length);
  return ret;
}

/*
  Veryify the provided OAuth 1.0a signature.
 */
function clientIdFromSignature() {
  var message = {
    method: request.method,
    action: request.scheme + "://" + request.host + request.path,
    parameters: {},
  };
  if (request.headers['Authorization']) {
    message.parameters = _parseAuthorization();
    if (!message.parameters) {
      return null;
    }
    delete message.parameters.realm;
  } else {
    clientSignature = requireParam('oauth_signature');
  }
  for (var key in request.params) {
    if (message.parameters[key]) {
      log.info("Duplicate oauth parameter: " + key);
      return null;
    }
    message.parameters[key] = request.params[key];
  }
  var clientSignature = message.parameters.oauth_signature;
  delete message.parameters.oauth_signature;

  // Provided timestamp must be within 10 minutes of our system time.
  var timestamp = new Date(1000 * message.parameters.oauth_timestamp);
  if (isNaN(timestamp.getTime()) || Math.abs(Date.now() - timestamp.getTime()) > 10 * 60 * 1000) {
    log.info("Time skew detected for request: " + message.parameters.oauth_timestamp);
    return null;
  }

  var clientId = message.parameters.oauth_consumer_key;
  if (!clientId) {
    log.info("No consumer key provided");
    return null;
  }
  var userId = pro_accounts.getUserIdByEncryptedId(clientId);
  var apiTokenInfo = pro_tokens.getToken(userId, pro_tokens.HACKPAD_API_TOKEN);
  if (!apiTokenInfo) {
    log.info("No apiTokenInfo for user: " + userId);
    return null;
  }

  var accessor = {
    consumerKey: clientId,
    consumerSecret: apiTokenInfo.token,
    token: '',
    tokenSecret: ''
  };

  OAuth.SignatureMethod.sign(message, accessor);
  var signature = message.parameters.oauth_signature;
  return signature == clientSignature ? clientId : null;
}

function getFullOrApiAccountByEmail(email, domainId) {
  var acct = pro_accounts.getAccountByEmail(email, domainId);
  if (!acct) {
    acct = pro_accounts.getAccountByEmail(emailToAPIEmail(email), domainId);
  }
  return acct;
}

function getAuthorizedRequestApiAccount(requireDomainAdmin) {
  // Try oauth2 bearer token auth
  var userId = _parseAuthorizationOAuth2()

  // Fallback to oauth1
  if (!userId) {
    var clientId = clientIdFromSignature();
    if (!clientId) {
      renderJSONError(401, "Invalid request or signature.")
    }
    userId = pro_accounts.getUserIdByEncryptedId(clientId);
  }

  var apiAccount = pro_accounts.getAccountById(userId);
  if (!apiAccount) {
    renderJSONError(401, "Invalid client id.")
  }

  if (apiAccount.domainId != domains.getRequestDomainId()) {
    renderJSONError(401, "Domain id does not match request.");
  }

  if (requireDomainAdmin && (!apiAccount.isAdmin || domains.isPrimaryDomainRequest())) {
    renderJSONError(401, "A domain admin account is required.");
  }

  if (request.params.asUser) {
    if (!apiAccount.isAdmin || domains.isPrimaryDomainRequest()) {
      renderJSONError(401, "A domain admin account is required.");
    }
    var userAccount = getFullOrApiAccountByEmail(request.params.asUser.toLowerCase(), apiAccount.domainId);
    if (!userAccount) {
      renderJSONError(401, "The requested user does not exist.");
    }
    // Not possible, but always good to double check
    if (userAccount.domainId != apiAccount.domainId) {
      renderJSONError(401, "A domain admin account is required.");
    }

    pro_accounts.setApiProAccount(userAccount);
  } else {
    pro_accounts.setApiProAccount(apiAccount);
  }

  return apiAccount;
}
