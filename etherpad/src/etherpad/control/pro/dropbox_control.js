import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_tokens");
import("jsutils.eachProperty");
import("etherpad.log");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.utils.renderNoticeString");
import("etherpad.importexport.dropbox");
import("stringutils");
import("netutils.{urlGet,urlPut}");
import("funhtml.*");
import("etherpad.utils");



function render_files_get() {
  // query must not have leading spaces
  var query = request.params.q;

  // dropbox api can't handle queries starting with whitespace..
  if (query != query.replace(/(^[\s]+)/g, '')) {
    return;
  }

  // IMPORTANT: change MAX_DROPBOX_RESULTS if changing file_limit!
  var params =  {path: '/', query:query, file_limit:5};
  var token = pro_tokens.getDropboxKeyAndSecretForProUserId(getSessionProAccount().id);

  if (token) {
    response.write(dropbox.search(params, token));
  } else {
    // the token was good when they loaded the page but is bad now
    response.write("");
  }
}

function _render_dropbox_404 () {
  renderNoticeString(
    DIV({id:"error-dialog", className:"modaldialog", style:"display:block"},
      DIV({className:"modaldialog-inner"},
      P("Oops, we couldn't find that file on dropbox - perhaps it moved?"))));
}

function render_redirect_get() {
  var uid = getSessionProAccount().id;
  var url = dropbox.getUrlForDropboxPath(request.params.path, uid);

  if (!url) {
    // fallback
    url = dropbox.getUrlForDropboxPath("/Apps/HackPad Limited"+request.params.path, uid)
  }
  if (!url) {
    _render_dropbox_404();
    return;
  }

  response.redirect(url);
}

function render_redirect2_get() {
  var uid = pro_accounts.getUserIdByEncryptedId(request.params.uid);

  var url = dropbox.getUrlForDropboxPath(request.params.path, uid);
  if (!url) {
    _render_dropbox_404();
    return;
  }
  response.redirect (url);
}

function render_disconnect_both() {
  pro_tokens.removeDropboxTokenAndSecretForProUserId(getSessionProAccount().id);
  response.redirect('/ep/account/settings');
}

function render_enable_sync_both() {
  pro_accounts.setDropboxSyncEnabled(getSessionProAccount().id);
  dropbox.requestSyncForUser(getSessionProAccount().id);
  response.redirect('/ep/account/settings');
}
function render_disable_sync_both() {
  pro_accounts.setDropboxSyncDisabled(getSessionProAccount().id);
  response.redirect('/ep/account/settings');
}


function render_get_dropbox_auth_url_get() {
  var url = dropbox.BASE_URL + 'oauth/request_token';
  var data = dropbox.generateOauthData("", "");

  var result = urlGet (url, data);

  if (result.status != 200) {
    return null;
  }

  var resp = result.content;

  var parts = resp.split('&');
  var secret = parts[0].split('=')[1];
  var key = parts[1].split('=')[1];

  getSession().dropboxAuthKey = key;
  getSession().dropboxAuthSecret = secret;
  getSession().dropboxNonce = stringutils.randomString(10);
  saveSession();

  var callbackUrl = (appjet.config.useHttpsUrls ? "https://" : "http://") +
     request.host + "/ep/dropbox/auth_callback?" + utils.encodeUrlParams({nonce: getSession().dropboxNonce});
  var params = {
    oauth_token: key,
    oauth_callback: callbackUrl,
  };

  var authUrl = 'https://www.dropbox.com/1/oauth/authorize?' + utils.encodeUrlParams(params) ;

  response.redirect(authUrl);
}

function render_auth_callback_get() {
  // Check nonces
  var nonce = utils.requireParam('nonce');
  if (!nonce || (nonce != getSession().dropboxNonce)) {
    utils.render400("Invalid request");
  }
  delete getSession().dropboxNonce;

  var url = dropbox.BASE_URL + 'oauth/access_token';
  var data = dropbox.generateOauthData(getSession().dropboxAuthKey,
      getSession().dropboxAuthSecret);
  var result = urlGet (url, data);

  if (result.status != 200) {
    return null;
  }

  var resp = String(result.content);

  var parts = resp.split('&');
  var secret = parts[0].split('=')[1];
  var key = parts[1].split('=')[1];

  pro_tokens.setDropboxTokenAndSecretForProUserId(getSessionProAccount().id, key, secret);
  getSession().dropboxTokenInfo = pro_tokens.getDropboxKeyAndSecretForProUserId(getSessionProAccount().id);

  pro_accounts.setDropboxSyncEnabled(getSessionProAccount().id);

  saveSession();

  response.redirect("/ep/account/settings");
}
