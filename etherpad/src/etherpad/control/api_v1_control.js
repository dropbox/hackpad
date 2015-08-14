
import("dispatch.{Dispatcher,PrefixMatcher}");
import("stringutils.trim");
import("sqlbase.sqlobj");

import("etherpad.control.searchcontrol");
import("etherpad.collab.collab_server");
import("etherpad.importexport.importexport")
import("etherpad.pad.exporthtml");
import("etherpad.pad.importhtml");
import("etherpad.pad.model");
import("etherpad.pad.pad_access");
import("etherpad.pad.padevents");
import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.pad_security");
import("etherpad.pro.domains");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_groups_key_values");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_oauth");
import("etherpad.pro.pro_settings");
import("etherpad.changes.follow");
import("etherpad.changes.changes.getDiffHTML");
import("etherpad.control.apicontrol.emailToAPIEmail");
import("etherpad.control.invitecontrol.autocompleteContacts");
import("etherpad.control.pad.pad_view_control");
import("etherpad.control.pad.pad_control");
import("etherpad.globals.*");
import("etherpad.log");
import("etherpad.utils.*");

import("etherpad.importexport.Markdown.Markdown");
import("etherpad.importexport.toMarkdown.toMarkdown");


function onRequest() {
  var disp = new Dispatcher();
  disp.addLocations([
    [/^\/api\/1\.0\/edited\-since\/(\d+)$/, render_v1_edited_since_get],

    [/^\/api\/1\.0\/group\/([^\/]+)\/options$/, render_v1_group_options_both],

    ['/api/1.0/options', render_v1_options_get],

    ['/api/1.0/pad/create', render_v1_create_pad_post],

    [/^\/api\/1\.0\/pad\/([^\/]+)\/title$/, render_v1_get_title_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/permissions$/, render_v1_get_permissions_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/groups$/, render_v1_get_groups_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/content$/, render_v1_set_content_post],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/content\/(\d+|latest)\.(html|md|txt|native)$/, render_v1_get_content_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/content\.(html|md|txt|native)$/, render_v1_get_latest_content_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/invitees$/, render_v1_pad_invitees_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/options$/, render_v1_pad_options_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/metadata/, render_v1_pad_metadata_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/revert\-to\/(\d+)$/, render_v1_pad_revert_post],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/revisions$/, render_v1_pad_revisions_get],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/revoke-access\/(.+)$/, render_v1_pad_revoke_access_post],
    [/^\/api\/1\.0\/pad\/([^\/]+)\/export-info$/, render_v1_pad_export_info_get],


    [/^\/api\/1\.0\/am-i-an-admin$/, render_v1_am_i_workspace_admin_get],
    [/^\/api\/1\.0\/all-pads-in-domain$/, render_v1_get_all_pads_in_domain_get],
    [/^\/api\/1\.0\/all-users-in-domain$/, render_v1_get_all_users_in_domain_get],

    ['/api/1.0/pads/all', render_v1_list_all_pads_get],

    ['/api/1.0/search', render_v1_search_get],

    // Current user
    ['/api/1.0/user/contacts', render_v1_user_contacts_get],
    ['/api/1.0/user/create', render_v1_create_user_post],
    ['/api/1.0/user/sites', render_v1_user_sites_get],

    // By (encrypted) user id
    [/^\/api\/1\.0\/user\/([^\/]+)\/profile$/, render_v1_user_profile_get],

    // By email address
    [/^\/api\/1\.0\/user\/([^\/]+)\/remove$/, render_v1_remove_user_post],
    [/^\/api\/1\.0\/user\/([^\/]+)\/settings$/, render_v1_user_settings_get],

    // This one must be last, otherwise they get redirected to the sign-in page.
    [PrefixMatcher('/api/1.0/'), render_v1_default_get],
  ]);

  return disp.dispatch();
}

function render_v1_default_get() {
  renderJSONError(404, "Not Found");
}

function _setPadContentFromRequest(pad) {
  switch (request.headers["Content-Type"]) {
    case "text/html":
      // let's wait for someone to ask before turning on authorship preservation
      // we need a better scheme for preventing blatant impersonation and datamining
      // this makes it the *tiniest* bit harder
      importhtml.setPadHTML(pad, request.content, false /*preserve authorship*/);
      break;
    case "text/x-web-markdown":
      var md = new Markdown.Converter();
      var html = md.makeHtml(request.content);
      importhtml.setPadHTML(pad, html);
      break;
    case "text/plain":
    default:
      collab_server.setPadText(pad, request.content);
      break;
  }
}

function render_v1_create_pad_post() {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var padId = randomUniquePadId();
  padutils.accessPadLocal(padId, function(pad) {
    if (pad.exists()){
      renderJSONError(401, "Create pad failed."); // XXX: just try another id
    }
    if (request.content && request.content.length) {
      try {
        pad.create(null, request.content.split("\n")[0]);
        _setPadContentFromRequest(pad);
      } catch (ex) {
        log.logException(ex);
        renderJSONError(400, "Invalid pad content");
      }
    } else {
      pad.create();
    }
  });

  var globalId = padutils.getGlobalPadId(padId);
  var userAccount = pro_accounts.getApiProAccount();
  pro_padmeta.accessProPad(globalId, function(ppad) {
      ppad.setCreatorId(userAccount.id);
      ppad.setLastEditor(userAccount.id);
      ppad.setLastEditedDate(new Date());
  });

  return renderJSON({padId:padId, globalPadId:globalId});
}

function render_v1_set_content_post(padId) {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var setCreatorId = false;
  padutils.accessPadLocal(padId, function(pad) {
    if (!pad.exists()){
      pad.create();
      setCreatorId = true;
    }
    _setPadContentFromRequest(pad);
  });

  var globalId = padutils.getGlobalPadId(padId);
  var userAccount = pro_accounts.getApiProAccount();
  pro_padmeta.accessProPad(globalId, function(ppad) {
    if (setCreatorId) {
      ppad.setCreatorId(userAccount.id);
    }
    ppad.setLastEditor(userAccount.id);
    ppad.setLastEditedDate(new Date());
  });
  return renderJSON({ success: true });
}


function _getColorsForEditors(historicalAuthorData) {
  var colorIdForAuthor = {};
  for (var author in historicalAuthorData) {
    var accountId = padusers.getAccountIdForProAuthor(author);
    colorIdForAuthor[accountId] = historicalAuthorData[author].colorId;
  }
  return colorIdForAuthor;
}

function render_v1_get_title_get(padId) {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var title;
  padutils.accessPadLocal(padId, function(pad) {
    title = pro_padmeta.accessProPadLocal(padId, function(propad) {
      return propad.getDisplayTitle();
    });
  });

  return renderJSON({title: title});
}

function render_v1_pad_revisions_get(padId) {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var padDiffs = [];
  var limit = Math.min(request.params.limit || 100);

  var historicalAuthorData = padutils.accessPadLocal(padId, function(pad) {
    return collab_server.buildHistoricalAuthorDataMapForPadHistory(pad);
  }, 'r', true /*skip access control!*/);
  var colorIdForAuthor = _getColorsForEditors(historicalAuthorData);
  var emailByAcctId = {};

  padutils.accessPadLocal(padId, function(pad) {
    if (!pad.exists()) {
      renderJSONError(404, "Pad not found");
    }
    var segments = pad.getMostRecentEditSegments(limit);
    for (var i=0; i<segments.length; i++) {
      var authorPics = [];
      var authors = segments[i][2].map(function(authorId) {
        authorPics.push(pro_accounts.getPicById(padusers.getAccountIdForProAuthor(authorId)));
        if (historicalAuthorData[authorId]) {
          return historicalAuthorData[authorId].name
        } else {
          return "";
        }
      });

      // for admins include author emails
      var emails = [];
      if (apiAccount.isAdmin) {
        var newAcctIds = [];
        segments[i][2].map(padusers.getAccountIdForProAuthor).forEach(function(acctId) {
          if (acctId > 0 && !emailByAcctId[acctId]) {
            newAcctIds.push(acctId);
          }
        });

        pro_accounts.getAccountsByIds(newAcctIds).forEach(function(acct) {
          emailByAcctId[acct.id] = acct.email;
        });

        segments[i][2].map(padusers.getAccountIdForProAuthor).forEach(function(acctId) {
          if (acctId>0) {
            emails.push(emailByAcctId[acctId]);
          }
        });
      }

      if (!authors.length) {
        pro_padmeta.accessProPadLocal(padId, function (propad) {
          if (!propad.exists()) {
            return;
          }
          var creatorId = propad.getCreatorId();
          authorPics.push(pro_accounts.getPicById(creatorId));
          authors.push(pro_accounts.getFullNameById(creatorId));
        });
      }

      padDiffs.push({
        htmlDiff:
          getDiffHTML(pad, segments[i][0], segments[i][1], segments[i][2], colorIdForAuthor, true/*timestamps*/, "Edited by ", true/*includeDeletes*/, segments[i][4]),
        snippet: padutils.truncatedPadText(pad),
        timestamp:segments[i][3] / 1000,
        startRev: segments[i][0],
        endRev:segments[i][1],
        authors: authors,
        emails: emails,
        authorPics: authorPics,
      });
    }
  }, 'r');

  return renderJSON(padDiffs);
}

/*
  revert
  POST /api/v1/pad/padId/content/revert-to/revisionId
*/

function render_v1_pad_revert_post(padId, revisionId) {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  if (revisionId < 0) {
    renderJSONError(403, "Invalid revision");
  }

  padutils.accessPadLocal(padId, function(pad) {
    if (revisionId > pad.getHeadRevisionNumber()) {
      renderJSONError(403, "Invalid revision");
    }

    var atext = pad.getInternalRevisionAText(revisionId);
    collab_server.setPadAText(pad, atext);
  });

  return renderJSON({ success: true });
}


/*
  get-content
  GET /api/v1/pad/padId/content/revisionId.{format}

  revisionId: "latest" or numeric revision id
  format: "html", "markdown", "text"
*/

function render_v1_get_latest_content_get(localPadId, format) {
  return render_v1_get_content(localPadId, null, format)
}

function render_v1_get_all_users_in_domain_get() {
  if (!request.isGet) {
    return false;
  }

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  if (!apiAccount || !apiAccount.isAdmin) {
    return false;
  }

  var userIdToProfile = {};
  pro_accounts.listAllDomainAccounts(apiAccount.domainId).map(function (r) {
    userIdToProfile[pro_accounts.getEncryptedUserId(r.id)] = {
      email:    r.email,
      fullName: r.fullName,
      isGuest:  Boolean(pro_accounts.getIsDomainGuest(r)),
    };
  });

  return renderJSON({userIdToProfile: userIdToProfile});
}

function render_v1_get_all_pads_in_domain_get() {
  if (!request.isGet) {
    return false;
  }

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  if (!apiAccount || !apiAccount.isAdmin) {
    return false;
  }

  var localPadIds = sqlobj.selectMulti('pro_padmeta', {domainId: apiAccount.domainId, isDeleted:false, isArchived:false, lastEditorId: ["IS NOT", null]}).map(function (row) {
    return row.localPadId;
  });
  return renderJSON({pads: localPadIds});
}

function render_v1_pad_metadata_get(localPadId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  if (!apiAccount || !apiAccount.isAdmin) {
    return false;
  }

  return renderJSON(sqlobj.selectSingle('pro_padmeta', {localPadId: localPadId}));
}

function render_v1_get_groups_get(localPadId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var globalPadId = padutils.getGlobalPadId(localPadId);

  return renderJSON({groups: pro_groups.getGroupInfos(pro_groups.getPadGroupIds(globalPadId))})
}

function render_v1_get_permissions_get(localPadId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var out;

  // Must have access to the pad
  padutils.accessPadLocal(localPadId, function(pad) {
    out = _getPadPermissions(localPadId);
  });

  return renderJSON(out);
}

function _getPadPermissions(localPadId) {
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var accessIds = pad_access.getUserIdsWithAccess(globalPadId).map(function (uid) { return pro_accounts.getEncryptedUserId(uid)});

  var rawFollowerMap = follow.getUserIdsAndFollowPrefsForPad(globalPadId);
  var encryptedFollowerMap = {};
  Object.keys(rawFollowerMap).map(function (uid) {
    encryptedFollowerMap[pro_accounts.getEncryptedUserId(uid)] = rawFollowerMap[uid];
  });

  var creatorId;
  pro_padmeta.accessProPad(globalPadId, function(ppad) {
    creatorId = pro_accounts.getEncryptedUserId(ppad.getCreatorId());
  });

  return {permissioned: accessIds, followers: encryptedFollowerMap, creatorId: creatorId};
}

function render_v1_get_content_get(localPadId, revisionId, format) {
  var out;

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  padutils.accessPadLocal(localPadId, function(pad) {
    if (!revisionId || revisionId == 'latest') {
      revisionId = pad.getHeadRevisionNumber();
    }
    response.addHeader('X-Hackpad-Revision', revisionId);

    if (!(format in importexport.formats)) {
      renderJSONError(400, "missing or unknown format");
    }

    out = importexport.exportPadContent(pad, revisionId, format);
    response.setContentType(importexport.contentTypeForFormat(format));

  }, 'r');

  response.write(out);
  return true;
}

function render_v1_edited_since_get(timestamp) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount(true);
  var pads = pro_pad_db.listPadsEditedSince(timestamp, 1000);
  pads = pads.map(function (pad) { return pad.localPadId });
  return renderJSON(pads);
}

function render_v1_pad_revoke_access_post(localPadId, email) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var account = pro_oauth.getFullOrApiAccountByEmail(email.toLowerCase(), apiAccount.domainId);
  if (!account) {
    renderJSONError(400, "Not Allowed");
  }

  var userId = pro_accounts.getEncryptedUserId(account.id);

  var err = pad_control.revokePadUserAccess(localPadId, userId);
  if (err) {
    renderJSONError(403, err);
  }
  return renderJSON({ success: true });
}

function render_v1_create_user_post() {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  if (!apiAccount || !apiAccount.isAdmin || domains.isPrimaryDomainRequest()) {
    render401("Domain Admin Required");
  }

  var isDomainGuest = !(request.params.isFullMember == "1");

  var account = pro_oauth.getFullOrApiAccountByEmail(emailToAPIEmail(requireEmailParam()), apiAccount.domainId);
  if (!account) {
    var accountId = pro_accounts.createNewAccount(apiAccount.domainId, request.params.name, emailToAPIEmail(requireEmailParam()), null, false, true, null, isDomainGuest/*isDomainGuest*/, false/*linked*/);
    pro_accounts.setAccountDoesNotWantWhatsNew(accountId);
    pro_accounts.setAccountDoesNotWantFollowEmail(accountId);
    account = pro_accounts.getAccountById(accountId);
  } else {
    renderJSONError(403, "Account already exists");
  }

  return renderJSON({ success: true });
}


function render_v1_remove_user_post(email) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount(true);

  var userAccount = pro_oauth.getFullOrApiAccountByEmail(email.toLowerCase());
  if (!userAccount) {
    renderJSONError(403, "User does not exist");
  }

  pro_accounts.setDeleted(userAccount);
  return renderJSON({ success: true });
}

function render_v1_user_settings_get(email) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var userAccount;
  email = email.toLowerCase();

  if (apiAccount.isAdmin) {
    userAccount = pro_oauth.getFullOrApiAccountByEmail(email);
    if (!userAccount) {
      renderJSONError(403, "User does not exist");
    }
  } else {
    userAccount = pro_accounts.getSessionProAccount();
    if (userAccount.email != email) {
      renderJSONError(403, "Domain admin required");
    }
  }

  if (request.isPost) {
    for (var key in request.params) {
      switch (key) {
      case 'send-email':
        pro_settings.setAccountGetsFollowEmails(userAccount.id, request.params[key].toLowerCase() == 'true');
        break;
      }
    }
    return renderJSON({ success: true });
  } else {
    var currentEmailSetting = pro_settings.getAccountGetsFollowEmails(userAccount);
    return renderJSON({ success: true, 'send-email': currentEmailSetting});
  }
}

function render_v1_user_profile_get(encryptedUserId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var userId = pro_accounts.getUserIdByEncryptedId(encryptedUserId);
  if (!userId) {
    renderJSONError(404, "User does not exist");
  }

  var userAccount = pro_accounts.getAccountById(userId, true);
  if (!userAccount) {
    renderJSONError(404, "User does not exist");
  }

  var outputDict = {
    success: true,
    profile: {
      fullName: userAccount.fullName,
      photoUrl: pro_accounts.getPicById(userId),
      largePhotoUrl: pro_accounts.getPicById(userId, true)
    }
  };

  if (request.params.showEmail && apiAccount.isAdmin) {
    outputDict.profile.email = userAccount.email;
  }

  return renderJSON(outputDict);
}

function render_v1_search_get() {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var data = [];
  if (request.params.q && trim(request.params.q)) {
    data = searchcontrol.searchPads(request.params.q, request.params.start, request.params.limit).list;
  }
  return renderJSON(data);
}

function render_v1_list_all_pads_get() {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();

  var pads = pro_pad_db.listAccessiblePads();
  pads = pads.map(function (pad) { return pad.localPadId });

  return renderJSON(pads)
}

function render_v1_pad_invitees_get(padId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var userInfos;
  var creatorId;

  pro_padmeta.accessProPadLocal(padId, function(propad) {
    if (propad.exists()) {
      creatorId = propad.getCreatorId();
    }
  });

  if (!creatorId) {
    renderJSONError(404, "Pad not found");
  }

  padutils.accessPadLocal(padId, function(pad) {
    userInfos = pad_control.getUsersForUserList(pad, creatorId);
  });

  for (var i = 0; i < userInfos.length; i++) {
    userInfos[i].userId = pro_accounts.getEncryptedUserId(userInfos[i].userId);
  }

  return renderJSON({ success: true, invitees: userInfos });
}

function render_v1_options_get() {
  if (!domains.getRequestDomainRecord()) {
    renderJSONError(404, 'Domain not found');
  }
  var methods = [ 'password', 'google' ];
  if (domains.supportsFacebookSignin()) {
    methods.push('facebook');
  }
  return renderJSON({ success: true, options: {
    siteName: pro_config.getConfig().siteName,
    signInMethods: methods,
  }});
}

function render_v1_pad_options_get(encryptedPadId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var retval = false;
  padutils.accessPadLocal(encryptedPadId, function(pad) {
    if (request.isGet) {
      var padOptions = pad.getPadOptionsObj();
      var siteOptions = { guestPolicies: pad.getGuestPolicies(),
                          isSubdomain: !domains.isPrimaryDomainRequest() };
      if (siteOptions.isSubdomain) {
        siteOptions.isPublic = domains.isPublicDomain();
      }
      retval = renderJSON({ success: true, options: padOptions,
                            siteOptions: siteOptions });
    } else if (request.isPost) {
      var msg = {
        type: 'padoptions',
        options: {},
        changedBy: padusers.getUserName()
      };
      for (var key in request.params) {
        var val = request.params[key];
        switch (key) {
        case 'guestPolicy':
          if (pad.getGuestPolicies().indexOf(val) == -1) {
            renderJSONError(403, 'Invalid guestPolicy specified.');
          }
          msg.options[key] = val;
          break;
        case 'isModerated':
          msg.options[key] = (/^true$/i).test(val);
          break;
        default:
          renderJSONError(403, 'Invalid pad option specified.');
          return;
        }
      }
      padevents.onClientMessage(pad, { userId: padusers.getUserId() }, msg);
      // This sends correct values regardless of whether the above succeeds.
      msg.options = pad.getPadOptionsObj();
      collab_server.broadcastClientMessage(pad, msg);
      // Unfortunately we don't actually know if this is true!
      retval = renderJSON({ success: true });
    }
  });
  return retval;
}

/**
 * A quick way to get all the things needed to export a pad
 */
function render_v1_pad_export_info_get(localPadId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  if (!apiAccount || !apiAccount.isAdmin) {
    return false;
  }

  var info = {};
  var globalPadId = padutils.getGlobalPadId(localPadId);

  // Include other-domain accounts attributed in this document to avoid "unknown editor"s.
  var nonDomainAccounts = [];

  try {
    nonDomainAccounts = collab_server.getAllAuthorsFromAText(globalPadId)
      .filter(function (account) {
        return account.domainId != padutils.getDomainId(globalPadId);
      })
      .map(function (account) {
        return {
          id: pro_accounts.getEncryptedUserId(account.id),
          domainId: account.domainId,
          fullName: account.fullName,
          email: account.email,
          isDeleted: account.isDeleted,
          isGuest: Boolean(pro_accounts.getIsDomainGuest(account)),
          isForeignUser: true,
        }
      });
  } catch (e) {
    log.warn({
      message: "Exception during /export_info collab_server.getAllAuthorsFromAText",
      e: e
    })
  }

  var groupInfos = pro_groups.getGroupInfos(pro_groups.getPadGroupIds(globalPadId));
  pro_groups_key_values.decorateWithValues(groupInfos, 'pinnedPads');

  padutils.accessPadLocal(localPadId, function(pad) {
    var rev = pad.getHeadRevisionNumber();
    info['metadata'] = sqlobj.selectSingle('pro_padmeta', {localPadId: localPadId});
    info['options'] = pad.getPadOptionsObj();
    info['permissions'] = _getPadPermissions(localPadId);
    info['contents'] = importexport.exportPadContent(pad, rev, "native");
    info['groups'] = groupInfos;
    info['rev'] = rev;
    info['nonDomainAccounts'] = nonDomainAccounts;
  });

  renderJSON({ success: true, info: info });
  return true;
}

function render_v1_am_i_workspace_admin_get() {

  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  if (!apiAccount) {
    return false;
  }

  return renderJSON({ result: apiAccount.isAdmin });
}

function render_v1_group_options_both(encryptedGroupId) {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var retval = false;
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  if (request.isGet) {
    var siteOptions = { guestPolicies: [ 'deny', 'allow' ],
                        isSubdomain: !domains.isPrimaryDomainRequest() };
    if (siteOptions.isSubdomain) {
      siteOptions.isPublic = domains.isPublicDomain();
    }
    retval = renderJSON({ success: true, options: { guestPolicy: pro_groups.getGroupIsPublic(groupId) ? "allow" : "deny" }, siteOptions: siteOptions });
  } else if (request.isPost) {
    var isPublic = requireParam('guestPolicy') == 'allow';
    if (!pro_accounts.isAdminSignedIn()) {
      var creatorId = pro_groups.getGroupCreatorId(groupId);
      if (creatorId != apiAccount.id) {
        renderJSONError(403, "Only " + pro_accounts.getFullNameById(creatorId) + " can change the group access.");
      }
    }
    pro_groups.setGroupIsPublic(groupId, apiAccount.id, isPublic);
    retval = renderJSON({success:true});
  }
  return retval;
}

function render_v1_user_sites_get() {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  return renderJSON({
    success: true,
    sites: pro_accounts.getSessionSpaces().map(function(site) {
      return {
        siteName: site.orgName,
        url: site.url
      };
    })
  });
}

function render_v1_user_contacts_get() {
  var apiAccount = pro_oauth.getAuthorizedRequestApiAccount();
  var contacts = autocompleteContacts(request.params.q);
  return renderJSON({
    success:true,
    contacts:contacts.list.map(function(contact) {
      return {
        name:contact.name,
        userId:contact.hackpadUserId ? pro_accounts.getEncryptedUserId(contact.hackpadUserId) : null,
        email:contact.visibleEmail,
        fbid:contact.fbid
      };
    })
  });
}
