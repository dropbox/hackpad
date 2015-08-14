import("execution");
import("fastJSON");

import("jsutils.{eachProperty,keys}");
import("netutils.{urlGet,urlPut}");
import("stringutils.{toHTML,md5}");
import("sqlbase.sqlobj");

import("etherpad.globals.isProduction");
import("etherpad.log");

import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_tokens");


import("etherpad.utils.renderTemplateAsString");

import("etherpad.globals");
import("etherpad.pad.model");
import("etherpad.collab.collab_server");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.collab.ace.linestylefilter.linestylefilter");
import("etherpad.collab.ace.domline.domline");
jimport("net.sf.json.JSONException");
jimport("java.net.SocketTimeoutException")

var BASE_URL = "https://api.dropbox.com/1/";
var BASE_CONTENT_URL = "https://api-content.dropbox.com/1/";
var nonce = 1;

function generateOauthData (key, secret) {
  return {
    oauth_consumer_key: appjet.config.DROPBOX_KEY,
    oauth_token: key,
    oauth_signature_method: 'PLAINTEXT',
    oauth_signature: appjet.config.DROPBOX_SECRET + '&' + secret,
    oauth_nonce: nonce++,
    oauth_timestamp: Date.now()
  }
}

function _handleApiErrors(result, userId, url) {
  if (result.status >= 400) {
    // reset their token
    if (result.status == 401) {
      log.custom('dropbox', "Resetting dropbox token for user " + userId);
      pro_tokens.removeDropboxTokenAndSecretForProUserId(userId || getSessionProAccount().id);
    } else if ([404, 500, 507, 502, 503].indexOf(result.status) > -1) {
      // don't log these errors
    } else {
      log.logException("Failing dropbox api request to url " + url + " with response code " + result.status);
    }
    result.content = result.content || "";
  }
}

function _makeApiCall (method, params, key, secret, userId) {
  var data = generateOauthData(key, secret);
  params = params || {};
  for (key in params) {
      if (params.hasOwnProperty(key)) {
          data[key] = params[key];
      }
  }

  var url = BASE_URL + method;
  var result = urlGet(url, data, {}, null, true/*acceptErrorCodes*/);
  _handleApiErrors(result, userId, url);

  return result;
}

function putFile (fileName, fileData, key, secret, accountId) {
  var path = "files_put/dropbox/" + fileName;
  var data = generateOauthData(key, secret);
  var url = BASE_CONTENT_URL + path;
  try {

    var result;
    result = urlPut(url, fileData, data, {}, null, true/*acceptErrorCodes*/);
    log.custom('dropbox', "put file response code:" + result.status + " at path " + path);
    _handleApiErrors(result, accountId, url);
    return result.status;
  } catch (e) {
    if (e instanceof JavaException && e.javaException instanceof java.net.SocketTimeoutException) {
      log.custom('dropbox', "Socket timeout exception uploading: " + url);
      return 504; /*simulate a timeout http response*/
    }
    throw e;
  }
}

function getFileContents (path, key, secret, accountId, optRev) {
  var path = "files/dropbox/" + path;
  var data = generateOauthData(key, secret);
  if (optRev) {
    data['rev'] = optRev;
  }
  var url = BASE_CONTENT_URL + path;
  var result = urlGet(url, data, {}, null, true/*acceptErrorCodes*/);
  _handleApiErrors(result, accountId, url);

  // no contents
  if (result.status >= 400) {
    return null;
  }

  return result.content;
}


function _getRoot() {
  return 'dropbox';
}

function _getPath(params) {
    if (!params || !params.path) {
        throw new Error("Must provide a path to get metadata from");
    }
    var path = params.path;
    delete params.path;
    return path;
}

function _getFileUrl(prefix, params) {
    var root = _getRoot();
    var path = _getPath(params).split("/").map(function(c) {return encodeURIComponent(c);}).join("/");
    return [prefix, root, path].join('/');
}


function getUrlForDropboxPath(path, userId) {
  var token = pro_tokens.getDropboxKeyAndSecretForProUserId(userId);
  if (!token) {
    return null;
  }
  var params =  {path: path};
  var url = _getFileUrl('shares', params);

  try {
    var result =  _makeApiCall (url, params, token.key, token.secret);
    if (result.status == 200 && result.content && result.content.length) {
      return JSON.parse(result.content).url;
    } else {
      return null;
    }
  } catch (e) {
    if (! (e instanceof JavaException)) {
      throw e;
    }
  }
  return null;
}

function search(params, token) {
  var url = _getFileUrl('search', params);
  return (_makeApiCall (url, params, token.key, token.secret)).content;
}

function delta(params, token) {

  var path = _getPath(params).split("/").map(function(c) {return encodeURIComponent(c);}).join( "/");
  url =['delta', path].join('/');
  return (_makeApiCall (url, params, token.key, token.secret)).content;
}

function _domainForDomainId(domainId) {
  var domainRecord = domains.getDomainRecord(domainId);
  if (domainRecord.orgName != null && domainRecord['subDomain']) {
    return domainRecord.subDomain + "." + appjet.config['etherpad.canonicalDomain'];
  }
  return appjet.config['etherpad.canonicalDomain'];
}

function _computeCheckPoint(accessiblePads) {
  accessiblePads = accessiblePads.filter(function(row) {return row});
  var padIds = accessiblePads.map(function(row){return row.localPadId});
  var mostRecentTimeStamp = 0;
  for (var i=0; i<accessiblePads.length; i++) {
    var timestamp = accessiblePads[i].lastEditedDate ? (+accessiblePads[i].lastEditedDate) : 0;
    if (timestamp > mostRecentTimeStamp) {
      mostRecentTimeStamp = timestamp;
    }
  }

  padIds.sort().push(mostRecentTimeStamp);

  return md5(padIds.join(""));
}

// Background sync task
    // todo:
    // make it so that other events can trigger instant re-sync
    //  title change
    //  being personally invited to a new pad
    //  following a new pad
    // show collections as folders

function requestSyncForUser(userId) {
  var account = pro_accounts.getAccountById(userId);

  if (pro_accounts.isDropboxSyncEnabled(account)) {
    var accountById = {};
    accountById[userId] = account;
    execution.scheduleTask("dropbox-sync", "syncUser", 0, [userId, accountById]);
  }
}

function requestSyncForCurrentUser() {
  if (! appjet.cache.dropboxSync) {
    appjet.cache.dropboxSync = {};
    appjet.cache.dropboxSync.checkpoints = {};
  }

  if (request.isDefined) {
    var account = getSessionProAccount();
    if (account &&  pro_accounts.isDropboxSyncEnabled(account)) {
      var userId = getSessionProAccount().id;
      var accountById = {};
      accountById[userId] = account;
      execution.scheduleTask("dropbox-sync", "syncUser",10*1000, [userId, accountById]);
    }
  }
}

function _getPadHTML(pad, revNum) {
  var atext = pad.getInternalRevisionAText(revNum);
  var textlines = Changeset.splitTextLines(atext.text);
  var alines = Changeset.splitAttributionLines(atext.attribs,
    atext.text);

  var pieces = [];
  var apool = pad.pool();
  for(var i=0;i<textlines.length;i++) {
    var line = textlines[i];
    var aline = alines[i];
    var emptyLine = (line == '\n');
    var domInfo = domline.createDomLine(! emptyLine, true);
    linestylefilter.populateDomLine(line, aline, apool, domInfo);
    domInfo.prepareForAdd();
    var node = domInfo.node;
    pieces.push('<div class="', node.className, '">',
      node.innerHTML, '</div>\n');
  }
  return pieces.join('');
}

function syncDropbox() {

  log.custom('dropbox', "Starting dropbox sync");

  if (! appjet.cache.dropboxSync) {
    appjet.cache.dropboxSync = {};
    appjet.cache.dropboxSync.checkpoints = {};
  }

  // select a list of all dropbox users
  var tokens = pro_tokens.getAllIdsOfDropboxUsers();
  var userIds = tokens.map(function(t){return t.userId});
  var accounts = pro_accounts.getAccountsByIds(userIds, true /*skip deleted*/);
  var accountById = {};
  accounts.forEach(function(acct) { accountById[acct.id] = acct });

  // for each user
  for (var i=0; i<userIds.length; i++) {
    var uid = userIds[i];
    if (!accountById[uid]) {
      // deleted user
      continue;
    }
    if (!domains.domainIsOnThisServer(accountById[uid].domainId)) {
      continue;
    }

    // check for deleted domains
    if (!domains.getDomainRecord(accountById[uid].domainId)){
      continue;
    }

    _syncUser(uid, accountById);
  }
  log.custom('dropbox', "Done with dropbox sync");
}

function _htmlFileContentForPad(proPadRow) {
  var relativePadUrl = "/" + proPadRow.localPadId + "#" + encodeURIComponent(proPadRow.title);
  var padUrl = appjet.config.useHttpsUrls ? "https://" : "http://";
  padUrl += _domainForDomainId(proPadRow.domainId) + relativePadUrl;

  var atextAuthors, padHTML;
  var globalPadId = proPadRow.domainId + '$' + proPadRow.localPadId;
  model.accessPadGlobal(globalPadId, function(pad) {
    //collab_client_vars = collab_server.getCollabClientVars(pad);
    try {
      atextAuthors = collab_server.buildHistoricalAuthorDataMapFromAText(pad, pad.atext());
      padHTML = _getPadHTML(pad, pad.getHeadRevisionNumber());
    } catch (e) {
      log.logException("Failed to get html for " + globalPadId);
      log.logException(e);
    }
  }, 'r', true);

  var authorCss = '';
  eachProperty(atextAuthors, function(k, v) {
    var authorKey = k.replace('.', '-');
    var authorColor = globals.getPalette()[v.colorId % globals.getPalette().length];
    authorCss += ".gutter-author-" + authorKey +" { border-left: 5px solid " + authorColor + "; padding-left: 10px; } ";
    authorCss += ".author-" + authorKey +" { border-bottom: 2px dotted " + authorColor + "; } ";
  });

  return renderTemplateAsString('dropbox-file.ejs', {
    url:toHTML(padUrl.replace("'", "\\'")),
    padHTML: padHTML,
    collab_client_vars: '',
    authorCss: authorCss
  });
}

function _dropboxPathForPad(proPadRow, state) {
  var usedFilenames = state;

  // escape slashes and dots (to prevent path manipulation)
  var filename = proPadRow.title.replace(/[\/\.\$\\]/g, ' ');
  var baseFilename = filename;
  var availableFilenameIndex = 0;
  while (filename in usedFilenames) {
    availableFilenameIndex++;
    filename = baseFilename + "(" + availableFilenameIndex + ")";
  }
  usedFilenames[filename] = 1;
  return encodeURIComponent('hackpad/'+ filename + ".html");
}

function _syncUser(uid, accountById) {
  log.custom('dropbox', "syncing user:" + uid + " at domain " + accountById[uid].domainId);
  if (!pro_accounts.isDropboxSyncEnabled(accountById[uid])) {
    return;
  }

  var domainId = accountById[uid].domainId;
  var myPads = pro_pad_db.listMyPads(domainId, uid);
  var accessiblePads = pro_pad_db.listFollowedPads(myPads, 400, domainId, uid);
  var tokenInfo = pro_tokens.getDropboxKeyAndSecretForProUserId(uid);
  if (!tokenInfo) {
    // the user is not longer connected to dropbox, abort syncing
    return;
  }

  // a sync checkpoint is a combinations of "set of padIds, lastEditedDate of most recent pad"
  var checkpoint = _computeCheckPoint(accessiblePads);
  var existingCheckpoint = appjet.cache.dropboxSync.checkpoints[uid];
  if (!existingCheckpoint) {
    var dropBoxSyncInfo = sqlobj.selectSingle('pro_dropbox_sync',{userId: uid});

    if (dropBoxSyncInfo) {
      existingCheckpoint = dropBoxSyncInfo.checkpoint
      appjet.cache.dropboxSync.checkpoints[uid] = dropBoxSyncInfo.checkpoint;
    }
  }
  // abort if up to date
  if (existingCheckpoint && checkpoint == existingCheckpoint) {
    // log.info("existing checkpoint matches new: " + checkpoint);
    return;
  }

  // load the in memory list of pads we've ever synced for this user
  appjet.cache.dropboxSync.pads = appjet.cache.dropboxSync.pads || {};
  var syncedPadIds = appjet.cache.dropboxSync.pads[uid];
  var timestampForSyncedPad = {};
  if (syncedPadIds) {
    syncedPadIds = syncedPadIds.split(",").map(function (padAndTimestamp) { return padAndTimestamp.split("|")});
    syncedPadIds.forEach(function(padAndTimestamp) {timestampForSyncedPad[padAndTimestamp[0]] = padAndTimestamp[1]});
  }

  var usedFilenames = {}; // must be outside the loop
  for (var j=0; j<accessiblePads.length; j++) {
    if (!accessiblePads[j] || !accessiblePads[j].title || !accessiblePads[j].lastEditedDate) {
      continue;
    }

    // skip up to date pads
    if (timestampForSyncedPad[accessiblePads[j].localPadId] &&
        timestampForSyncedPad[accessiblePads[j].localPadId] == accessiblePads[j].lastEditedDate.getTime()/1000) {
      continue;
    }

    log.custom('dropbox', "syncing pad:" + accessiblePads[j].title);

    var path = _dropboxPathForPad(accessiblePads[j], usedFilenames);
    var fileContent = _htmlFileContentForPad(accessiblePads[j]);

    var responseCode = putFile(path, fileContent, tokenInfo.key, tokenInfo.secret, uid);
    if (responseCode == 507) {
      //pro_accounts.setDropboxSyncDisabled(uid);
      return;
    }
  }

  // in memory, track the set of pads we're syncing for this user
  // they are serialized as localPadId|timestampSeconds,localPadId|timestampSeconds,...
  appjet.cache.dropboxSync.pads[uid] = accessiblePads.map(
    function(p){return p.localPadId + "|" + (p.lastEditedDate && p.lastEditedDate.getTime() || 0)}).join(",");

  // clean up renamed/deleted pads
  var url = _getFileUrl('metadata', {path:'hackpad/'});
  var folderListingResponse = _makeApiCall (url, {list:true}, tokenInfo.key, tokenInfo.secret, uid);
  if (folderListingResponse.status == 404) {
    // the folder is gone!
    //pro_accounts.setDropboxSyncDisabled(uid);
    return;
  }

  var folderListing = folderListingResponse.content;


  var oldFolderListing = getFileContents ('/hackpad/.'+uid, tokenInfo.key, tokenInfo.secret, uid);
  var filesToConsiderDeleting = {};
  if (oldFolderListing) {
    try {
      oldFolderListing = fastJSON.parse(oldFolderListing);
    } catch (e) {
      if (e instanceof JavaException && e.javaException instanceof JSONException) {
        log.logException("Failed to parse dropbox listing for p." + String(uid) + " Instead found: " + oldFolderListing);
      } else {
        throw e;
      }
    }
    for (var i=0; i<oldFolderListing.length; i++) {
      filesToConsiderDeleting[oldFolderListing[i]] = 1;
    }
  }

  var filesToDelete = {};
  folderListing = fastJSON.parse(folderListing);
  for (var i=0; i<folderListing.contents.length; i++) {
    var filePath = folderListing.contents[i].path;
    // strip "/hackpad/"
    filePath = filePath.substring("/hackpad/".length);
    if (filePath.lastIndexOf(".html") == filePath.length-(".html".length)) {
      filePath = filePath.substring(0, filePath.length-(".html".length));
      if (filePath in usedFilenames) {
        continue;
      }
      if (filePath in filesToConsiderDeleting) {
        filesToDelete[filePath] = 1;
      }
    }
  }

  for (filePath in filesToDelete) {
    if (filePath.indexOf('.') > -1 ) {
      log.logException("Someone is trying to abuse hackpad sync to delete files!");
      break;
    }
    log.custom('dropbox', "Deleting: " + filePath);
    _makeApiCall ('/fileops/delete', {path:'hackpad/'+filePath+".html", root:"dropbox"}, tokenInfo.key, tokenInfo.secret);
  }

  var fileContent = fastJSON.stringify(keys(usedFilenames));
  putFile('/hackpad/.'+uid, fileContent, tokenInfo.key, tokenInfo.secret, uid);

  sqlobj.insertOrUpdate('pro_dropbox_sync', {userId:uid, checkpoint:checkpoint});
  appjet.cache.dropboxSync.checkpoints[uid] = checkpoint;


}

serverhandlers.tasks.syncUser = function(userId, accountById) {
  try {
    _syncUser(userId, accountById);
  } catch (ex) {
    log.logException(ex);
  }
}

serverhandlers.tasks.syncDropbox = function() {
  try {
    syncDropbox();
  } catch (ex) {
    log.logException(ex);
  } finally {
    var taskTimer = isProduction() ? 5*60*1000 : 60*1000;
    execution.scheduleTask('dropbox-sync', "syncDropbox", taskTimer, []);
  }
}

function onStartup() {
  execution.initTaskThreadPool("dropbox-sync", 1);
  var initialDelay = isProduction() ? 5*60*1000 : 5*1000;
  execution.scheduleTask('dropbox-sync', "syncDropbox", initialDelay, []);
}
