import ("etherpad.control.pro.account_control");
import ("cache_utils");
import ("dateutils");
import("execution");

import ("fileutils");
import ("etherpad.globals");
import ("etherpad.helpers");
import ("etherpad.log");
import ("etherpad.pad.pad_security");
import ("netutils");
import ("etherpad.pro.pro_accounts");
import ("etherpad.pro.pro_tokens");
import ("etherpad.pro.domains");
import ("etherpad.sessions");
import ("etherpad.utils");
import ("s3");
import ("stringutils");
import ("sync");
import ("underscore._");
jimport("java.util.concurrent.ConcurrentHashMap");


//----------------------------------------------------------------
// links a user's google account via OAuth2
//----------------------------------------------------------------

// The default set of permissions to ask the user for.
var DEFAULT_SCOPES = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/contacts.readonly",
];

var CLIENT_DETAILS;
var API_BASE = "https://www.googleapis.com";



//----------------------------------------------------------------
// callbacks (Google sends the user here if they approve linkage)
//----------------------------------------------------------------

// Sign in (set the session account)
function handleLoginCallback() {
  var userInfo;

  var state = JSON.parse(request.params['state']);
  if (state && state.nonce) {
    // Since only the primary domain is registered with Google we'll send
    // the user to the subdomain they are trying to reach
    if (state.subDomain &&
        domains.getRequestDomainRecord().subDomain != state.subDomain) {
      response.redirect(
        utils.absoluteURL('/ep/account/openid', request.params, state.subDomain)
      );
    }

    // We don't validate the state before the redirect as we don't have the
    // nonce available to us!
    validateReceivedState(state);
  }

  // Clear the nonce
  deleteOAuthSessionVars();

  if (request.params.code) {
    try {
      var authorization = acquireAuthorizationToken(request.params.code);
      if (authorization) {
        userInfo = currentUserInfo(authorization.access_token);
      }
    } catch (e) {
      log.logException(e);
      setSigninNotice("Failed to connect to Google.  Please try again.");
      response.redirect(state.shortContUrl || "/ep/account/sign-in");
    }
  }

  if (userInfo) {
    var accountEmail = userInfo.emails.filter(function(em) {
      return em.type == "account";
    });

    if (accountEmail) {
      var emailAddress = accountEmail[0].value;
      log.custom("google-oauth2", "Trying to sign in as " + emailAddress + " " +accountEmail.length);
      var signedInAccount = account_control.completeGoogleSignIn(emailAddress, userInfo.displayName, "/ep/account/sign-in?cont=" + state.shortContUrl);

      if (!signedInAccount) {
        response.redirect("/");
      }

      saveAuthorization(authorization, signedInAccount.id);
      sessions.getSession().isGoogleConnected = true;

      reloadGoogleContactsAsync(signedInAccount);
      if (userInfo.image) {
        reloadGooglePhotoAsync(signedInAccount, userInfo.image.url);
      }

      response.redirect(state.shortContUrl || "/");

    }
  }

  response.redirect("/");
}



//----------------------------------------------------------------
// api
//----------------------------------------------------------------

function currentUserInfo(optOverrideToken) {
  var token = optOverrideToken || pro_tokens.getFreshToken(pro_tokens.GOOGLE_OAUTH2_TOKEN).token;

  return JSON.parse(netutils.urlGet(API_BASE + "/plus/v1/people/me", {}/*params*/, {
    'Authorization': "Bearer " + token,
  }).content);
}

function fetchContactsAndStore(account) {
  var email = account.email;
  var token = pro_tokens.getFreshToken(pro_tokens.GOOGLE_OAUTH2_TOKEN, account.id).token;
  var url = API_BASE + "/m8/feeds/contacts/" + email + "/full";

  var result = netutils.urlGet(url,
    {alt: "json", "max-results": 10000},
    {"Authorization" : "Bearer " + token});

  if (result) {
    var googleContacts = JSON.parse(result.content).feed.entry;

    var contacts = _.filter(googleContacts.map(function(contact) {
      return [_.isEmpty(contact.gd$email) ? undefined : contact.gd$email[0].address,
        contact.title.$t];
    }), function(tuple) {return tuple[0] /*non-null email*/;});


    _getCache("goog-user-data2").put(account.email.replace(/\./g, "@"), contacts);
  }
}


//----------------------------------------------------------------
// functions
//----------------------------------------------------------------

/** Ensures we inject the nonce into state */
function googleOAuth2URLForLogin(optIdentity) {
  return googleOAuth2URL(DEFAULT_SCOPES, optIdentity, generateStateDict());
}

// `optForceApproval` forces Google's approval dialog to be shown; this is useful if you lose the refresh token.
function googleOAuth2URL(scopes, optIdentity, optState) {
  scopes = scopes || DEFAULT_SCOPES;
  var params = {
    client_id: clientId(),
    redirect_uri: callbackUri(),
    response_type: "code",
    access_type: "offline", // Required for refresh token.
    scope: scopes.join(" "),
    state: JSON.stringify(optState),
  };



  if (optIdentity) {
    params = _.extend(params, {
      login_hint: optIdentity,
      prompt: 'none',
    })
  } else {
    // Ideally we should only force approval if our refresh token stops working
    // if (optForceApprovalPrompt) {
    params = _.extend(params, {
      approval_prompt: "force",
    })
    // }

  }

  return clientDetails().auth_uri + "?" + utils.encodeUrlParams(params);
}


function acquireAuthorizationToken(code) {

  var result = netutils.urlPost(clientDetails().token_uri, {
      code: String(code),
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: callbackUri(),
      grant_type: "authorization_code",
    }, null/*options*/, true /*acceptErrorCodes*/);

  if (result) {
    return JSON.parse(result.content);
  }
}

function authorizeViaRefreshToken(refreshToken) {
  var result = netutils.urlPost(clientDetails().token_uri, {
      refresh_token: String(refreshToken),
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: callbackUri(),
      grant_type: "refresh_token",
    }, null, true);

  if (result) {
    return JSON.parse(result.content);
  }
}

function refreshToken(token, accountId) {
  if (token.tokenExtra) {
    var newAuthorization = authorizeViaRefreshToken(token.tokenExtra);
    if (newAuthorization) {
      saveAuthorization(newAuthorization, accountId);
      token.token = newAuthorization.access_token;
      token.tokenExtra = newAuthorization.tokenExtra;
      token.expirationDate = dateutils.addSecondsToDate(new Date(), newAuthorization.expires_in);
      log.custom("google-oauth2", "Refreshed token for user " + accountId);
    }
  } else {
    throw Error("Can't refresh token; it doesn't have an associated refreshToken.");
  }
}

function saveAuthorization(authorization, accountId) {
  pro_tokens.setToken(
      accountId,
      pro_tokens.GOOGLE_OAUTH2_TOKEN,
      authorization.access_token,
      authorization.refresh_token,
      dateutils.addSecondsToDate(new Date(), authorization.expires_in)
  );
}

function callbackUri() {
  // Address of `render_callback()`
  // N.B.: This must be the same between /auth and /token calls or Google won't allow it.
  return utils.absoluteURL("/ep/account/openid", {}, "" /*force superdomain*/);
}

function clientId() {
  return clientDetails().client_id;
}

function clientSecret() {
  return clientDetails().client_secret;
}

function clientDetails() {
  return {token_uri :  "https://accounts.google.com/o/oauth2/token",
          auth_uri : "https://accounts.google.com/o/oauth2/auth",
          client_secret: appjet.config.googleClientSecret,
          client_id: appjet.config.googleClientId};
}

var TWO_DAYS = 1000*60*60*24*2;

function _getCache(cacheName) {
  // this function is normally fast, only slow when cache
  // needs to be created for the first time
  var cache = appjet.cache[cacheName];
  if (cache) {
    return cache;
  }
  else {
    // initialize in a synchronized block (double-checked locking);
    // uses same lock as cache_utils.syncedWithCache would use.
    sync.doWithStringLock("cache/"+cacheName, function() {
      if (! appjet.cache[cacheName]) {
        // values expire after 2 days
        appjet.cache[cacheName] =
          new net.appjet.common.util.ExpiringMapping(TWO_DAYS);
      }
    });
    return appjet.cache[cacheName];
  }
}


serverhandlers.tasks.loadContacts = function(account) {
  var loader = _googleContactLoader();
  var contacts = [];
  try {
    contacts = fetchContactsAndStore(account);
  } catch (ex) {
    log.custom("google-contacts", { success: false, error: String(ex.message), accountEmail: account.email, accountId: account.id });
  } finally {
    loader.pendingLoads.remove(account.id);
  }
}

serverhandlers.tasks.loadPhoto = function(account, imageUrl) {
  var photo = netutils.urlGet(imageUrl);
  if (photo) {
    s3.put("hackpad-profile-photos", account.email, photo.content, true, photo.contentType);
    pro_accounts.setAccountHasPhotoByEmail(account.id);
  }
}

function reloadGooglePhotoAsync(account, imageUrl) {
   execution.scheduleTask("googlePhotoLoader", "loadPhoto", 0, [account, imageUrl]);
}

function contactsForAccount(account) {
  return _getCache("goog-user-data2").get(account.email.replace(/\./g, "@"));
}

function _googleContactLoader() {
  return appjet.cache.googleContactLoader;
}

function onStartup() {
  appjet.cache.googleContactLoader = {};
  var loader = _googleContactLoader();
  loader.pendingLoads = new ConcurrentHashMap();
  execution.initTaskThreadPool("googleContactLoader", 1);
  execution.initTaskThreadPool("googlePhotoLoader", 1);
}

function reloadGoogleContactsAsync(account) {
  var loader = _googleContactLoader();
  if (!loader.pendingLoads.containsKey(account.id)) {
    loader.pendingLoads.put(account.id, "pending");
    execution.scheduleTask("googleContactLoader", "loadContacts", 0, [account]);
  }
}

/// oauth utils
function setOAuthSessionVars() {
  var session = sessions.getSession();
  // A nonce is set for verification.
  session.oAuth2Nonce = session.oAuth2Nonce || stringutils.randomString(10);
}

function deleteOAuthSessionVars() {
  delete sessions.getSession().oAuth2Nonce;
}

/** Generates a new state dict for auth. */
function generateStateDict() {
  setOAuthSessionVars();

  var state = {
    nonce: sessions.getSession().oAuth2Nonce,
    shortContUrl: shortContinuationURL(),
  };

  if (!domains.isPrimaryDomainRequest()) {
    state['subDomain'] = domains.getRequestDomainRecord().subDomain;
  }

  return state;
}

/** Validates the state the server set us */
function validateReceivedState(state) {
  if (state.nonce != sessions.getSession().oAuth2Nonce) {
    log.warn("Nonce mis-match");
    if (state.shortContUrl && state.shortContUrl[0] == '/') {
      // try again if we have a short relative url we're trying to reach
      // who makes refreshing work when being granted access to a team / validating email
      response.redirect(state.shortContUrl);
    }
    response.redirect('/')
  }
}


/**
 * Generate a short pad url from the optional cont if provided and is a pad url.
 *
 * This make refreshing the auth page work reliably, but avoids us having a state in the URL
 * that's too long.
 */
function shortContinuationURL() {
  var cont = request.params.cont || request.url || "/";
  cont = pad_security.sanitizeContUrl(cont);

  // Shorten pad urls for the redirect
  var longPadUrlMatch = cont.match(/(https?\:\/\/[^\/]+\/)[^\/]+-([a-zA-Z0-9]{11})(\?.*token=([^&]+))?/);
  if (longPadUrlMatch) {
    cont = longPadUrlMatch[1] + longPadUrlMatch[2];
    if (longPadUrlMatch.length == 5) {
      cont += "?token=" + longPadUrlMatch[4];
    }
  }
  return cont;

}

