
import("sqlbase.sqlobj");
import("fastJSON");
import("jsutils");
import("netutils.{urlGet,urlPost}");
import("stringutils.{startsWith,trim}");
import("s3");

import("etherpad.changes.changes.getDiffHTML");
import("etherpad.collab.collab_server");
import("etherpad.globals.isProduction");
import("etherpad.helpers");
import("etherpad.log");
import("etherpad.pad.pad_access");
import("etherpad.pad.pad_security");
import("etherpad.pad.padutils");
import("etherpad.pad.padutils.globalToLocalId");
import("etherpad.pad.padutils.getGlobalPadId");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_oauth");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_tokens");
import("etherpad.control.pad.pad_render_control");
import("etherpad.control.pro.pro_main_control.decorateWithSegments");
import("etherpad.pad.padusers");

import("etherpad.sessions.{getSession,saveSession,destroySession}");
import("etherpad.utils.*");
import("jsutils.*");

jimport("org.apache.commons.fileupload");


function checkAuthentication() {
  if (!pro_accounts.getSessionProAccount()) {
    if (request.params.token) {
      // login via token
      var u = pro_oauth.getUserForToken(request.params.token);
      if (!u || u.id == 0 /*no super admin api access*/ || u.isDeleted) {
        render401("Invalid oAuth token sent");
      }
      if (u.domainId != domains.getRequestDomainId()) {
        var host = domains.getDomainRecord(u.domainId).subDomain +"."+ appjet.config['etherpad.canonicalDomain'];
        response.redirect((isProduction() ? "https://" : "http://") + host + request.path + "?" + request.query);
      }
      pro_accounts.signInSession(u, true/*skipLastLoginUpdate*/);
    } else {
      render401("No oAuth token sent");
    }
  }
}

function emailToAPIEmail(email) {
  return email + "|API";
}
function APIEmailToEmail(email) {
  return email.replace("|API", "");
}

/*
  Iff your are a subdomain admin, we will let you auto-create / switch to user.

  Otherwise the embed happens as the currently active browser sessions and may require login.
*/
function render_embed_pad_get() {
  response.allowFraming();

  var clientId;
  if (request.params.oauth_signature || request.params.email || request.params.name) {
    clientId = pro_oauth.clientIdFromSignature();
    if (!clientId) {
      render401("Invalid request signature.");
    }
  }

  var localPadId = requireParam("padId");
  var apiAccount;

  if (clientId) {
    var userId = pro_accounts.getUserIdByEncryptedId(clientId);
    apiAccount = pro_accounts.getAccountById(userId);
    if (!apiAccount) {
      render401("Invalid client id.")
    }

    if (apiAccount.domainId != domains.getRequestDomainId()) {
      render401("Domain id does not match request.");
    }
  }

  //var apiTokenInfo = pro_tokens.getToken(getSessionProAccount().id, pro_tokens.HACKPAD_API_TOKEN);

  // create the pad if not exist
  getSession().instantCreate = request.params.padId;
  saveSession();

  // switch accounts if needed
  // Note that request.params.email forces a signature check above.
  if (request.params.email) {
    if (!apiAccount || !apiAccount.isAdmin || domains.isPrimaryDomainRequest()) {
      render401("Domain Admin Required");
    }

    var account = pro_accounts.getAccountByEmail(emailToAPIEmail(requireEmailParam()), apiAccount.domainId);

    if (!account) {
      var accountId = pro_accounts.createNewAccount(null, request.params.name, emailToAPIEmail(requireEmailParam()), null, false, true, null, true/*isDomainGuest*/, false/*linked*/, true/*apiAccount*/);
      pro_accounts.setAccountDoesNotWantWhatsNew(accountId);
      pro_accounts.setAccountDoesNotWantFollowEmail(accountId);
      account = pro_accounts.getAccountById(accountId);
    }

    if (account.isAdmin) {
      // as a precaution, we'll forbid this - as this is probably not what
      // the user wants (letting anyone who embeds become an admin)
      render401("Woah there, you're requesting to impersonate and admin user. This is prohibited as a precaution.  Please contact support.");
    }

    // ensure user has access
    var globalPadId = getGlobalPadId(localPadId)
    pad_access.grantUserIdAccess(globalPadId, account.id, userId);

    pro_accounts.signInSession(account);
  }

  request.cache.isEmbed = true;

  pad_render_control.renderPadWithTemplate(localPadId, "pad/editor_embed.ejs",
    {cont:request.url, googleButtonTarget:"_blank"},
    {isEmbed: true}, true /*isEmbed*/);
}

/* Returns the most recently changed pads for the current user */
function render_pad_list_get() {
  var origAccount = pro_accounts.getSessionProAccount();
  checkAuthentication();

  var myPads = pro_pad_db.listMyPads();
  var accessiblePads = pro_pad_db.listFollowedPads(myPads);

  if (!origAccount && request.params.token) {
    destroySession();
  }

  return renderJSON(accessiblePads.map(function(p) {
    return {
      localPadId: p.localPadId,
      title: p.title,
      createdDate: p.createdDate.getTime() / 1000,
      lastEditedDate: p.lastEditedDate ? p.lastEditedDate.getTime() / 1000 : 0,
    };
  }));
}


function _get_collection_info(padsOut) {
  // get a list of all the collections this user has access to
  var userCollectionIds = pro_groups.getUserAccessibleCollectionIds(getSessionProAccount());

  // get the ids of all the pads in each collection
  var collectionPadIdLists = pad_access.getPadIdsInCollections(userCollectionIds);

  // get the ids of all the unique pads
  var localPadIds = {};
  var globalPadIds = [];
  userCollectionIds = jsutils.keys(collectionPadIdLists); // should be the same, but just in case
  userCollectionIds.forEach(function(k) {
    collectionPadIdLists[k].forEach(function(globalPadId){
      var localPadId = padutils.globalToLocalId(globalPadId);
      if (localPadId in padsOut) {
        return;
      }
      localPadIds[localPadId] = true;
      globalPadIds[globalPadId] = true;
    });
  });
  localPadIds = jsutils.keys(localPadIds);
  globalPadIds = jsutils.keys(globalPadIds);

  // load the pad metas
  var pads = sqlobj.selectMulti('pro_padmeta', {domainId: domains.getRequestDomainId(), localPadId:['IN', localPadIds], isDeleted:false, isArchived:false});

  // pre-compute creatorIds for all the pads and make a pad lookup dict for later
  var creatorForPadId = {};
  var padsByGlobalPadIds = {};
  pads.forEach(function(p) {
    var globalPadId = padutils.getGlobalPadId(p.localPadId);
    creatorForPadId[globalPadId] = p.creatorId;
    padsByGlobalPadIds[globalPadId] = p;
  });

  // filter out any pads we don't have access to
  var padIds = pad_security.padIdsUserCanSee(getSessionProAccount().id, globalPadIds, creatorForPadId);
  var padIdsUserCanSee = jsutils.arrayToSet(padIds);

  // load full collection info
  var collectionInfos = pro_groups.getGroupInfos(userCollectionIds);
  collectionInfos.forEach(function(collectionInfo) {
    collectionInfo.pads = collectionPadIdLists[collectionInfo.groupId].filter(function(globalPadId){
      var localPadId = padutils.globalToLocalId(globalPadId);
      if (localPadId in padsOut) {
        return true;
      }
      if (globalPadId in padsByGlobalPadIds && globalPadId in padIdsUserCanSee) {
        padsOut[localPadId] = padsByGlobalPadIds[globalPadId];
        return true;
      }
      return false;
    }).map(padutils.globalToLocalId);
  });
  return collectionInfos;
}

/*
  Return a list of user collections and their contained pads
*/
function render_collection_info_get() {
  var origAccount = pro_accounts.getSessionProAccount();
  checkAuthentication();

  var pads = {};
  var collectionInfos = _get_collection_info(pads);

  if (!origAccount && request.params.token) {
    destroySession();
  }

  // render response
  return renderJSON(collectionInfos.map(function(collectionInfo) {
    return {
      groupId: pro_groups.getEncryptedGroupId(collectionInfo.groupId),
      title: collectionInfo.name,
      pads: collectionInfo.pads.map(function(localPadId) {
        var p = pads[localPadId];
        return {
          localPadId: p.localPadId,
          title: p.title,
          lastEditedDate: p.lastEditedDate ? p.lastEditedDate.getTime() / 1000 : 0,
        };
      }),
    };
  }));
}

function render_pads_get() {
  checkAuthentication();

  var pads = {};
  pro_pad_db.listFollowedPads(pro_pad_db.listMyPads()).forEach(function(p) {
    p.followed = true;
    pads[p.localPadId] = p;
  });

  var collections = _get_collection_info(pads);
  var editorNames = [];
  var editorPics = [];
  var editors = {};

  return renderJSON({
    success: true,
    pads: jsutils.values(pads).map(function(pad) {
      if (pad.lastEditorId && !(pad.lastEditorId in editors)) {
        editors[pad.lastEditorId] = editorNames.length;
        editorNames.push(pro_accounts.getFullNameById(pad.lastEditorId));
        editorPics.push(pro_accounts.getPicById(pad.lastEditorId));
      }
      return {
        localPadId: pad.localPadId,
        title: pad.title,
        lastEditedDate: pad.lastEditedDate ? pad.lastEditedDate.getTime() / 1000 : 0,
        editor: editors[pad.lastEditorId],
        followed: pad.followed,
      };
    }),
    collections: collections.map(function (collection) {
      return {
        groupId: pro_groups.getEncryptedGroupId(collection.groupId),
        title: collection.name,
        localPadIds: collection.pads,
      };
    }),
    editorNames: editorNames,
    editorPics: editorPics,
  });
}

function render_edited_pads_get() {
  checkAuthentication();

  var myAuthorID = getSessionProAccount().id;

  var lastCheckTimestamp = getParamIfExists("lastCheckTimestamp") || "0";

  var myPads = pro_pad_db.listMyPads();
  var followedPads = pro_pad_db.listFollowedPads(myPads,0,null,null,lastCheckTimestamp);

  // Filter out all pads where I am the last editor
  followedPads = followedPads.filter(function(pad) {
    return pad.lastEditorId != myAuthorID;
  });

  // Get all the segments associated with the pads we are checking. These segments are the
  //  individual changes to the pad.
  decorateWithSegments(followedPads);

  //Build an array of pad, segment
  var segmentList = [];
  followedPads.forEach(function(p) {
    p.segments.forEach(function(s) {
      segmentList.push([p, s]);
    })
  });

  // Filter the segments array in each pad to contain only segments newer than the timestamp argument
  //  and to contain only segments not edited by me
  segmentList = segmentList.filter(function(segment) {
      return (segment[1][3] > lastCheckTimestamp) && (padusers.getAccountIdForProAuthor(segment[1][2]) != myAuthorID);
  });

  // Iterate through each segment and create the response object

  var changes = segmentList.map(function(s) {
      var pad = s[0];
      var segment = s[1];
      var segmentAuthors = segment[2];

      return { 'localPadId' : pad.localPadId, 'title' : pad.title, 'editors' : segmentAuthors.map(function(author) {
        return padusers.getNameForUserId(author);
      })};

    });

  var editedPads = { 'timestamp' : new Date().getTime(), 'changes' : changes };



  return renderJSON(editedPads);
}


function _embedUrlCache() {
  if (!appjet.cache.embedUrlCache) {
    appjet.cache.embedUrlCache = {};
  }
  return appjet.cache.embedUrlCache;
}

function render_connection_count_get() {
  var padId = requireParam("padId");
  var callback = requireParam("callback");
  if (!callback.match(/^[\w\d_]+$/)) {
    render400("callback must match [\w\d_]+");
  }

  response.setContentType('application/javascript; charset=utf-8');

  var connections = collab_server.getNumConnectionsByPadId(getGlobalPadId(padId, 1));
  response.write(callback + "(" + connections + ");" );
  return true;
}

function render_errors_get() {
  var context = getParamIfExists("context") || '';
  var message = getParamIfExists("message") || '';
  var file = getParamIfExists("file") || '';
  var line = getParamIfExists("line") || '';
  var column = getParamIfExists("column") || '';
  var url = getParamIfExists("url") || '';
  var errorObj = getParamIfExists("errorObj") || '';

  log.custom('clientside-errors', JSON.stringify({
    context: context,
    message: message,
    file: file,
    line: line,
    column: column,
    url: url,
    errorObj: errorObj
  }));

  response.setStatusCode(204);
  return true;
}

function render_tweet_get() {
  var url = requireParam("url");
  renderTemplate('pad/tweet.ejs', { url: url });
  return true;
}

function render_oembed_script_get() {
  render_embed_get(true /* rendered with iframe */);
  return true;
}

function render_embed_get(opt_iframeOuter) {
  var url = requireParam("url");
  var maxwidth = requireParam("maxwidth");
  var cachekey = url + ":" + maxwidth;

  var scriptRe = new RegExp("http(s)?://gist\\.github\\.com");
  var scriptMatch = url.match(scriptRe);

  if (scriptMatch && !opt_iframeOuter) {
    response.setContentType('application/json; charset=utf-8');
    // Generate an iframe first around the script.
    response.write('{"html": ' +
        JSON.stringify(renderTemplateAsString('pad/oembed_script_outer.ejs',
            { url: url, maxwidth: maxwidth })) +
        '}');
    return true;
  }

  var linkRe = new RegExp("(.*)(https?://(\\w+\\.)?twitter.com/.*/status[\\w/]+)(.*)");
  var linkMatch = url.match(linkRe);
  if (linkMatch) {
    response.setContentType('application/json; charset=utf-8');
    response.write('{"html": ' +
        JSON.stringify(renderTemplateAsString('pad/tweet_outer.ejs',
            { url: url }).replace(/\n/g, '').replace(/\W$/, '')) +
        ', "provider_name": "twitter"}');
    return true;
  }

  var embedJson = _embedUrlCache()[cachekey];
  if (!embedJson) {
    var args = {
      'url': url,
      'maxwidth': maxwidth,
      'key': 'fbf31da098f011e0928c4040d3dc5c07',
      'secure': 'true',
      'frame': 'true'
    }
    if (url.indexOf("speakerdeck.com") > -1 || scriptMatch) {
      // embedly bug when using frame=true
      delete args['frame'];
    }
    var res = urlGet('https://api.embed.ly/1/oembed', args, {}, 30, true /*acceptErrorCodes*/);

    //log.info("embedly", { 'embedlyContent': res.content, 'embedlyStatus': res.status });

    if (res.status == 200) {
      _embedUrlCache()[cachekey] = embedJson = String(res.content);
    } else {
      log.custom("embedly", { 'target': url, 'embedlyStatus': res.status });
    }
  }

  if (opt_iframeOuter) {
    response.write(helpers.documentDomain() + '\n');
    response.write(JSON.parse(embedJson).html);
    return true;
  }

  response.setContentType('application/json; charset=utf-8');
  response.write(embedJson || "{}");
  return true;
}


function render_latex_post() {
  var formula = requireParam("formula");

  formula = formula.replace(/%/g,"%25");
  formula = formula.replace(/&/g,"%26");

  var preamble = "\\usepackage{amsmath} \\usepackage{amsfonts} \\usepackage{amssymb}";
  preamble = preamble.replace(/%/g,"%25");
  preamble = preamble.replace(/&/g,"%26");

  var body = 'formula=' +formula;
  body = body + '&fsize='  +'14px';
  body = body + '&fcolor=' +'000000';
  body = body + '&mode=0';
  body = body + '&out=1';
  body = body + '&preamble='+preamble;

  var res = urlPost("http://quicklatex.com/latex3.f", body);
  if (res.status == 200) {
    response.setContentType('text/plain; charset=utf-8');
    response.write(String(new java.lang.String(res.content)));
  }

  return true;
}


function render_attach_post() {
  var tag = requireParam("tag");

  if (!getSessionProAccount()) {
    response.sendError(403, "Please sign in");
    return true;
  }

  var itemFactory = new fileupload.disk.DiskFileItemFactory();
  var handler = new fileupload.servlet.ServletFileUpload(itemFactory);
  var items = handler.parseRequest(request.underlying).toArray();
  for (var i = 0; i < items.length; i++) {
    if (items[i].isFormField()) {
      continue;
    }

    var file = items[i];
    var key = domains.getRequestDomainId() + "$" + tag + "_" + getSessionProAccount().id + "_" + (+new Date()) + "_" + file.name;
    var uploadedStream = file.getInputStream();

    s3.put(appjet.config.s3Bucket, key, uploadedStream, true, file.getContentType());
    uploadedStream.close();

    return renderJSON({
      url: s3.getURL(appjet.config.s3Bucket, key),
      key: key,
      size: file.getSize() });
  }
}


function render_spaces_info_get() {
  var domainInfos = pro_accounts.getSessionSpaces();
  return renderJSON(domainInfos);
}


function render_lookup_session_get() {
  return renderJSON(getSession());
}

function render_pad_invite_info_get() {
  var padId = requireParam("padId");

  function _getUserInfo(id) {
    var acct = pro_accounts.getAccountById(id, true /* skipDeleted */);
    if (!acct) { return null; }
    return {
      name: acct.fullName,
      userLink: pro_accounts.getUserLinkById(acct.id),
      userPic: pro_accounts.getPicById(acct.id)
    };
  }

  function _getGroupInfo(groupId) {
    if (!pro_groups.currentUserHasAccess(groupId)) {
      return null;
    }
    return {
      groupId: pro_groups.getEncryptedGroupId(groupId),
      name: pro_groups.getGroupName(groupId)
    };
  }

  var globalPadId = getGlobalPadId(padId);
  var rows = pad_access.getAccessRowsRaw({ globalPadId: globalPadId }).sort(function(a, b) {
    return (b.lastAccessedDate || b.createdDate) - (a.lastAccessedDate || a.createdDate);
  }).map(function(r) {
    var row = {
      host: _getUserInfo(r.hostUserId),
      timestamp: toISOString(r.createdDate)
    };
    if (r.userId) {
      row.user = _getUserInfo(r.userId);
      if (r.lastAccessedDate) {
        row.lastAccessedTimestamp = toISOString(r.lastAccessedDate);
      }
    }
    if (r.groupId) {
      row.group = _getGroupInfo(r.groupId);
    }
    return row.host && (row.user || row.group) && row;
  }).filter(function(r) { return r; });

  // created by
  pro_padmeta.accessProPad(globalPadId, function(propad) {
    rows.push({
      host: _getUserInfo(propad.getCreatorId()),
      timestamp: toISOString(propad.getCreatedDate())
    });
  });

  return renderJSON(rows);
}


function render_subdomain_check_get() {
  var subdomain = requireParam("subdomain");
  return renderJSON({ exists: domains.doesSubdomainExist(subdomain) });
}


function render_device_notify_both() {
  checkAuthentication();

  var deviceToken = requireParam("iosDeviceToken");
  var appId = requireParam('iosAppId');
  if (!pro_tokens.addIOSDeviceToken(getSessionProAccount().id, deviceToken, appId)) {
    log.info('Possible invalid app id: ' + appId);
  }

  return renderJSON({success: true});
}

