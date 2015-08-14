import("sqlbase.sqlobj");
import("dateutils");
import("stringutils");
import("etherpad.pro.pro_accounts");
import("etherpad.utils");

/**
 * Creates an oAuth2 client for the current user and returns the clientId and secret
 *
 * TODO: Add a way to invalidate a client in a way that also invalides all their tokens
 *
 * @return {object}  {clientId: clientId, clientSecret: secret}
 */
function createClient(clientName, redirectUri, autoApprove) {
  var o = {
    clientId: stringutils.randomString(20),
    clientSecret: stringutils.randomString(40),
    accountId: pro_accounts.getSessionProAccount().id,
    redirectUri: redirectUri,
    clientName: clientName,
    autoApprove: autoApprove,
  };

  sqlobj.insert('oauth_clients', o);

  return {clientId: o.clientId, clientSecret: o.clientSecret};
}

function clientForClientId(clientId) {
  return sqlobj.selectSingle('oauth_clients', clientId);
}

/**
 * Look up an access token and return the associated accountId if this
 * is a valid token.
 *
 * @param  {String} token Access token, usually via the Authrization header.
 * @return {Number}       Account id.
 */
function authorizedAccountIdForAccessToken(token) {
  var accessTokenRow = sqlobj.selectSingle('oauth_access_tokens', {accessToken: token})
  if (!accessTokenRow) {
    return null;
  }

  var now = new Date();
  if (accessTokenRow.expires < now) {
    return null;
  }

  return accessTokenRow.accountId;
}

/**
 * When a user is directed to an authorization flow by an oAuth2 client, this is
 * the authorization code we generate upon approval of the request by the user.
 * o.redirectUri is where we will send the user to next.
 *
 * scope and accessType are currently not supported.
 *
 * @returns {string}  the redirectUri to send the user to
 *          (which will communicate the authorization code to the client app)
 */
function generateAuthorizationRedirectUri(clientId, redirectUri, responseType, accessType, scope, state) {

  var client = sqlobj.selectSingle('oauth_clients', {clientId: clientId});
  if (!(client && client.redirectUri === redirectUri)) {
    return null;
  }
  if (responseType !== "code") {
    return null;
  }

  // create a single-use authorization code
  var o = {
    authorizationCode: stringutils.randomString(40),
    clientId: clientId,
    accountId: pro_accounts.getSessionProAccount().id,
    expires: dateutils.addSecondsToDate(new Date(), 30), /* 30 seconds in the future */
    scope: "", // scope is currently unsupported
  }

  o.redirectUri = client.redirectUri + '?' + utils.encodeUrlParams({code: o.authorizationCode, state: state});

  sqlobj.insert('oauth_authorization_codes', o);

  return o.redirectUri;
}



/**
 * Convert a valid authorizationCode to an oAuth2 accessToken
 *
 * @return {string}          The access token object to return to the client app
 */
function generateAccessToken(clientId, clientSecret, redirectUri, grantType, authorizationCode) {
  var client = sqlobj.selectSingle('oauth_clients', {clientId: clientId});
  if (!client) {
    return null;
  }
  if (grantType !== "authorization_code") {
    return null;
  }
  if (client.clientSecret !== clientSecret) {
    return null;
  }
  if (client.redirectUri !== redirectUri) {
    return null;
  }

  var authorization = sqlobj.selectSingle('oauth_authorization_codes',
      {authorizationCode: authorizationCode, clientId: clientId});
  if (!authorization) {
    return null;
  }

  var now = new Date();
  if (authorization.expires < now) {
    return null;
  }

  var o = {
    accessToken: stringutils.randomString(40),
    clientId: clientId,
    accountId: authorization.accountId,
    expires: dateutils.addSecondsToDate(now, 30 * 24 * 60 * 60), /* 1 month */
    scope: authorization.scope
  };

  sqlobj.insert('oauth_access_tokens', o);

  return {
    access_token: o.accessToken,
    expires_in: o.expires.getTime()/1000 - now.getTime()/1000,
  // refresh_token: not-yet-implemented
  };
}