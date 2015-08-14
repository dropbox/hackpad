
import("jsutils.{eachProperty,toISOString,extend,values}");
import("stringutils.{toHTML,trim}");
import("s3")

import("etherpad.collab.collab_server");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.log");
import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.statistics.mixpanel");
import("etherpad.statistics.email_tracking");
import("etherpad.utils.*");

import("etherpad.pad.revisions");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pad.pad_access");
import("etherpad.pro.pro_padmeta");
import("etherpad.pad.chatarchive");

import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_pad_tracking");
import("etherpad.pro.pro_pad_editors");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_oauth");

import("etherpad.control.pad.pad_control.{getUsersForUserList,isUserFollowingPad,assignColorId,getDefaultPadText,ensureIsAllowedToCreate}");
import("etherpad.pad.pad_security");

var DESKTOP_APP_COOKIE_NAME = "HD";
var MOBILE_APP_COOKIE_NAME = "HM";


function _getGroupsForUserList(pad) {
  var globalPadId = pad.getId();
  var groupIds;

  if (isProduction() && appjet.config['etherpad.fakeProduction'] != 'true' && globalPadId == '1$AWELCOMEPAD') {
    // only show the canonical welcome pads group
    groupIds = [pro_groups.WELCOME_PADS_GROUP_ID];
  } else {
    groupIds = pro_groups.getPadGroupIds(globalPadId);
  }
  return groupIds.filter(pro_groups.currentUserHasAccess).map(function(groupId) {
    var memberIds = pro_groups.getGroupMemberIds(groupId);
    return { groupId: pro_groups.getEncryptedGroupId(groupId),
             name: toHTML(pro_groups.getGroupName(groupId)),
             userCnt: memberIds.length };
  });
}


function _createIfNecessary(localPadId, pad) {
  if (pad.exists()) {
    delete getSession().instantCreate;
    delete getSession().instantTitle;
    delete getSession().instantCollectionId;
    delete getSession().instantTitleIsReadOnly;
    delete getSession().instantIsWikiText;
    delete getSession().instantContent;
    delete getSession().instantGuestPolicy;
    delete getSession().instantEmbeddedEditor;
    sessions.saveSession();
    return false;
  }


  if (getSession().instantCreate == localPadId) {
    var content = getSession().instantContent || trim(getDefaultPadText(getSession().instantTitle)) + "\n\n";
    pad.create(content, getSession().instantTitle);

    if (getSession().instantTitleIsReadOnly) {
      pad.setTitleIsReadOnly();
    }
    if (getSession().instantGuestPolicy) {
      pad.setGuestPolicy(getSession().instantGuestPolicy);
    }
    if (getSession().instantEmbeddedEditor) {
      pad.setIsEmbeddedEditor(true);
    }
    if (getSession().instantIsWikiText) {
      pad.setIsWikiText(true);
    }

    // add pad to group if requested
    var encryptedGroupId = getSession().instantCollectionId;
    if (encryptedGroupId) {
      var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
      if (!pro_groups.userMayEditGroup(getSessionProAccount(), groupId)) {
        log.logException("Unauthorized add pad to group");
        return false;
      }

      pro_groups.addPadToCollection(groupId, localPadId, getSessionProAccount().id, true/*quietly*/);
    }

    // apns: send create for userId
    pro_apns.sendPushNotificationForPad(pad.getId(), null, getSessionProAccount().id, pro_apns.APNS_HP_T_CREATE);

    delete getSession().instantCreate;
    delete getSession().instantTitle;
    delete getSession().instantCollectionId;
    delete getSession().instantContent;
    delete getSession().instantTitleIsReadOnly;
    delete getSession().instantGuestPolicy;
    delete getSession().instantEmbeddedEditor;
    delete getSession().instantIsWikiText;
    sessions.saveSession();

    return true;
  } else {

    ensureIsAllowedToCreate();

    var newPadId;
    if (domains.isPrimaryDomainRequest()) {
      newPadId = randomUniquePadId();
    } else {
      newPadId = localPadId.replace(/[^\w\-\.~]/g, function (s) { return escape(s); }).replace('*', '%2A');
    }

    getSession().instantCreate = newPadId;
    getSession().instantTitle = decodeURIComponent(localPadId).replace(/-/g, ' ');
    sessions.saveSession();

    response.redirect("/"+newPadId);
    return false;
  }
}

function _updateMRUCookie(userId, localPadId) {
  var mruCookieName = "mru" + userId;

  // no MRU cookie anymore
  response.deleteCookie(mruCookieName, request.domain, "/");

  return;

  // load the mru list
  var mruPads = [];
  if (request.cookies[mruCookieName]) {
    mruPads = request.cookies[mruCookieName].split("|");
  }

  // the list is [least recent, more recent, most recent]
  // remove current pad from the MRU list
  var idsOfMruPads = mruPads.map(function(padAndTimestamp) {
    return padAndTimestamp.split(":")[0];
  });
  var currentIndex = idsOfMruPads.indexOf(localPadId);
  if (currentIndex != -1) {
    mruPads.splice(currentIndex, 1);
  }
  // add most recent id to end of list
  var secondsTimestamp = Math.floor((new Date()).getTime() / 1000);
  mruPads.push(localPadId + ":" + secondsTimestamp);

  // make sure we're not too long
  var MAX_MRU_LENGTH = 20;
  if (mruPads.length > MAX_MRU_LENGTH) {
    mruPads = mruPads.slice(mruPads.length - MAX_MRU_LENGTH);
  }

  var expires = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 7); // 1 week in the future

  // set the new cookie
  if (mruPads.length) {
    response.setCookie({
      name: mruCookieName,
      value: mruPads.join("|"),
      path: "/",
      domain: request.domain,
      expires: expires
    });
  }
}

function _assignName(pad, userId) {
  if (padusers.isGuest(userId)) {
    // use pad-specific name if possible
    var userData = pad.getAuthorData(userId);
    var nm = (userData && userData.name) || padusers.getUserName() || null;

    // don't let name guest typed in last once we've assigned a name
    // for this pad, so the user can change it
    delete getSession().guestDisplayName;
    sessions.saveSession();

    return nm;
  }
  else {
    return padusers.getUserName();
  }
}

function renderPadWithTemplate(localPadId, templateName, templateVars, extraClientVars, isEmbed) {
  request.profile.tick('start');

  if (!getSessionProAccount()) {
    pro_account_auto_signin.checkAutoSignin(request.url);
  }

  if (localPadId == 'AWELCOMEPAD' && getSessionProAccount()
      && !getSessionProAccount().isAdmin && getSessionProAccount().id != 502) {
    // XXX: find user's welcome pad
    response.redirect('/');
  }

  var description;
  var isPro = isProDomainRequest();
  var userId = padusers.getUserId();
  var disableRichText = false;
  var lastSaveAuthor = null;
  var lastSaveTimestamp = null;
  var headerTimestamp = null;

  var opts = {};
  var embeddedEditor = false;
  var isFork;
  var padHTML = "";
  var following = false;
  var guestPolicy;
  var guestPolicies = [];
  var acctId = getSessionProAccount() ? getSessionProAccount().id : null;
  helpers.addClientVars({ proTitle: '' });
  if (localPadId) {
    if (request.params.inviteTo) {
      getSession().nameGuess = request.params.inviteTo;
      response.redirect('/'+localPadId);
    }

    padutils.accessPadLocal(localPadId, function(pad) {
      request.profile.tick('accessPadLocal');

      if (_createIfNecessary(localPadId, pad)) {
        helpers.addClientVars({ newPad: true });
      }

      pro_pad_tracking.addPadView(localPadId, acctId);
      if (isPro) {
        pro_padmeta.accessProPadLocal(localPadId, function(propad) {
          // check for deleted pads
          if (propad.exists() && propad.isDeleted()) {

            var body = "<div style='margin-top:30px; text-align:center;'>This pad has been deleted :/</div>";

            if (pad_security.checkIsPadAdmin(propad)) {
              var url = "/ep/padlist/undelete?padIdToDelete=" + localPadId + " &returnPath=/" + localPadId;
              body += "<div style='font-size:20px; margin-top:40px; margin-bottom: 20px; text-align:center;'>Since you're the creator, you can restore it:</div>";
              body += "<div style='text-align:center; margin-bottom: 80px'><form method='post' action=\"" + url + "\">" +
                "<input type=\"submit\" class=\"white-button\" value=\"Restore\">" + helpers.xsrfTokenElement() + "</form></div>";
            } else {
              body += "<div style='font-size:20px; margin-top:40px; margin-bottom:80px; text-align:center;'>But have no fear - <a href='/'> there are plenty more here</a>!</div>";
            }

            renderNoticeString(body);
            response.stop();
          }

          // check for moved pads
          if (propad.isArchived()) {
            var movedToPadId = propad.getPadIdMovedTo();
            if (movedToPadId) {
              response.redirect(padutils.urlForGlobalPadId(movedToPadId));
            }
          }

          var lastEditedDate = propad.getLastEditedDate();
          lastSaveTimestamp = toISOString(lastEditedDate || new Date());
          _setLastEditedDateHeader(propad);

          helpers.addClientVars(_getProPadClientVars(propad));
        });
      }

      helpers.addClientVars(_getPadClientVars(pad, helpers.getClientVar('creatorId')));
      _setRevisionIdHeader(pad);
      request.cache.globalPadId = pad.getId();

      embeddedEditor = pad.getIsEmbeddedEditor();
      disableRichText = pad.getIsWikiText();
      following = isUserFollowingPad(request.cache.globalPadId, helpers.getClientVar('creatorId'), helpers.getClientVar('invitedUserInfos'));

      //padHTML = pad_view_control.getPadHTML(pad, pad.getHeadRevisionNumber());

      isFork = Boolean(pad.getForkedFrom());
      guestPolicy = pad.getGuestPolicy();
      guestPolicies = pad.getGuestPolicies();
      description = padutils.truncatedPadText(pad).replace("\n", " ").replace("*","");
    }, 'r');

    // don't notifyEdit inside of the accessPad which may be creating the pad to avoid a race condition
    if (helpers.getClientVar('newPad') && getSessionProAccount()) {
      pro_pad_editors.notifyEdit(domains.getRequestDomainId(), localPadId, getSessionProAccount().id, new Date());
    }

  } else if (!padusers.isGuest(userId)) {
    helpers.addClientVars({userName: padusers.getUserName(userId).replace(/%20/g, " ")});
  }
  helpers.addClientVars(_getRequestClientVars());
  helpers.addClientVars(_getUserClientVars());
  helpers.addClientVars(extraClientVars);
  helpers.addClientVars({ initialSpaces: pro_accounts.getSessionSpaces() });

  request.profile.tick('after addClientVars')

  var isProUser = (isPro && ! padusers.isGuest(userId));
  var signedInAccounts = getSessionProAccount() ? [] : pro_accounts.accountsForSignInAsPicker();

  padutils.setOptsAndCookiePrefs(request);
  var showGuestBanner = (!isProUser && !domains.isPrivateDomainRequest() && !request.userAgent.isMobile() && (guestPolicies.indexOf('anon') == -1) && !isEmbed && !signedInAccounts.length);

  var bodyClass = [
    (isPro ? "propad" : "nonpropad"),
    (isProUser ? "prouser" : "nonprouser"),
    (isDogfood() ? "dogfood" : ""),
    (showGuestBanner ? "guestbanner" : ""),
    (request.cache.isMobileApp ? "mobile-app" : ""),
    (request.cache.isDesktopApp ? "desktop-app" : "")].join(" ");

  _updateMRUCookie(userId, localPadId);

  request.profile.tick('before data');

  var data = {localPadId:localPadId,
              pageTitle:toHTML(helpers.getClientVar('padTitle') + " - " + request.host),
              initialTitle:helpers.getClientVar('initialTitle'),
              description:description,
              bodyClass: bodyClass,
              hasOffice: hasOffice(),
              isPro: isPro,
              lastSaveAuthor: lastSaveAuthor,
              lastSaveTimestamp: lastSaveTimestamp,
              isProAccountHolder: isProUser,
              account: getSessionProAccount(), // may be falsy
              userPic: getSessionProAccount() ? pro_accounts.getPicById(getSessionProAccount().id) : "",
              isMultiAccount: pro_accounts.isMultiAccount(),
              toHTML: toHTML,
              signinUrl: '/ep/account/sign-in?cont='+
                encodeURIComponent(request.url),
              fullSuperdomain: pro_utils.getFullSuperdomainHost(),
              facebookId: pro_accounts.getLoggedInUserFacebookId(),
              embeddedEditor: embeddedEditor,
              disableRichText: disableRichText,
              isSubDomain: !domains.isPrimaryDomainRequest(),
              isPublicDomain: domains.isPublicDomain(),
              isCreator: !!helpers.getClientVar('isCreator'),
              isAdmin: (getSessionProAccount() && getSessionProAccount().isAdmin),
              orgName: domains.getRequestDomainRecord().orgName,
              guestPolicies: guestPolicies,
              isFork: isFork,
              padHTML: padHTML,
              isMac : request.userAgent.isMac(),
              following: following,
              robotsNoindex: domains.isPrimaryDomainRequest() && guestPolicy == "link",
              signedInAccounts: signedInAccounts,
             };
  eachProperty(templateVars || {}, function(k, v) {
    data[k] = v;
  });
  request.profile.tick('before html generation');
  var bodyHtml = renderTemplateAsString(templateName, data);

  request.profile.tick('done');
  response.write(renderTemplateAsString("html.ejs", {bodyHtml: bodyHtml}));
  if (request.acceptsGzip) {
    response.setGzip(true);
  }
  return true;
}

function render_client_vars_get() {
  if (request.params.oauth_signature || request.headers.Authorization) {
    pro_oauth.getAuthorizedRequestApiAccount();
  }
  var padId = requireParam('padId');
  var clientVars = {};
  padutils.accessPadLocal(padId, function (pad) {
    if (!pad.exists()) {
      renderJSONError(404, "Pad not found");
    }
    if (isProDomainRequest()) {
      pro_padmeta.accessProPad(pad.getId(), function (propad) {
        if (!propad.exists()) {
          return;
        }
        // check for deleted or moved pads
        if (propad.isDeleted() || propad.isArchived()) {
          renderJSONError(404, "Pad not found");
        }
        clientVars = _getProPadClientVars(propad);
        _setLastEditedDateHeader(propad);
      });
    }
    extend(clientVars, _getPadClientVars(pad, clientVars.creatorId));
    _setRevisionIdHeader(pad);
  }, 'r');
  return renderJSON({
    success: true,
    clientVars: clientVars
  });
}

function _setRevisionIdHeader(pad) {
  response.addHeader('X-Hackpad-Revision', pad.getHeadRevisionNumber());
}

function _setLastEditedDateHeader(propad) {
  var lastEditedDate = propad.getLastEditedDate();
  if (lastEditedDate) {
    response.addHeader('X-Hackpad-LastEditedDate', Math.floor(lastEditedDate.getTime() / 1000));
  }
}

function _getPadClientVars(pad, creatorId) {
  var userId = padusers.getUserId();
  var globalPadId = pad.getId();
  var localPadId = padutils.globalToLocalId(globalPadId);
  var specialKey = request.params.specialKey ||
    (sessions.isAnEtherpadAdmin() ? collab_server.getSpecialKey('invisible') : null);
  var collabClientVars = collab_server.getCollabClientVars(pad);
  var assignedColors = values(collabClientVars.historicalAuthorData).map(
      function(info){return info.colorId}
    );

  var s3PolicyAndSig = s3.getS3PolicyAndSig(request.domain, localPadId, userId);

  return {
    collab_client_vars: collabClientVars,
    friendUserIds: [],
    globalPadId: globalPadId,
    initialOptions: pad.getPadOptionsObj(),
    initialRevisionList: revisions.getRevisionList(pad),
    invitedGroupInfos: _getGroupsForUserList(pad),
    invitedUserInfos: getUsersForUserList(pad, creatorId),
    chatHistory: helpers.isChatEnabled() ? chatarchive.getRecentChatBlock(pad, 30) : null,
    isCreator: getSessionProAccount() && getSessionProAccount().id == creatorId,
    isProPad: isProDomainRequest(),
    isPublicPad: pad.getGuestPolicy() == "allow",
    padId: localPadId,
    siteName: helpers.siteName(),
    specialKey: specialKey,
    specialKeyTranslation: collab_server.translateSpecialKey(specialKey),
    titleIsReadOnly: pad.getTitleIsReadOnly(),
    userColor: assignColorId(pad, userId, assignedColors),
    userName: ((request.params.displayName ? String(request.params.displayName)
                                           : _assignName(pad, userId)) || "Guest").replace(/%20/g, " "),
    titleIsReadOnly: pad.getTitleIsReadOnly(),
    attachmentsBucket: s3.getBucketName(appjet.config.s3Bucket),
    s3BucketRoot: appjet.config.s3BucketRoot || "s3.amazonaws.com",
    s3PolicyAndSig: s3PolicyAndSig
  };



  //request.profile.tick('before userGroupIds')
  // note: unused and expensively implemented: disabling
  //var userGroupIds = (getSessionProAccount() ? pro_groups.getUserGroupInfos(getSessionProAccount().id).map(function(g) { return g.groupId; }) : []);

  //request.profile.tick('before userRecentlyInvited')
  //var userRecentlyInvited = (getSessionProAccount() ? pro_friends.getRecentlyInvitedUserInfos(getSessionProAccount().id) : []);
  //var userRecentlyInvited = [];

  //request.profile.tick('before friendUserIds')
  // the friend ids are only used to sort invitees but are really expensive to compute
  // so we'll pretend you have no friends until we can make it fast
  //getSessionProAccount() ? pro_friends.getFriendUserIds(getSessionProAccount().id) : [];
}

function _getProPadClientVars(propad) {
  var title = propad.getDisplayTitle();
  return {
    creatorId: propad.getCreatorId(),
    initialPassword: propad.getPassword(),
    initialTitle: title,
    padTitle: title,
    isPadAdmin: pad_security.checkIsPadAdmin(propad)
  };
}

function _getRequestClientVars() {
  return {
    clientIp: request.clientAddr,
    colorPalette: getPalette(),
    debugEnabled: request.params.djs,
    disableFB: !domains.supportsFacebookSignin() || request.cache.isMobileApp,
    facebookClientId: appjet.config.facebookClientId,
    facebookId: pro_accounts.getLoggedInUserFacebookId(),
    isDesktopApp: request.cache.isDesktopApp,
    isMobileApp: request.cache.isMobileApp,
    isMobile: request.userAgent.isMobile(),
    serverTimestamp: +(new Date),
    userAgent: request.headers["User-Agent"]
  };
}

function _getPrivs() {
  return {
    maxRevisions: 100000000
  };
}

function _getUserClientVars() {
  var userId = padusers.getUserId();
  return {
    accountPrivs: _getPrivs(),
    chatEnabled: helpers.isChatEnabled(),
    dropboxConnected: Boolean(getSession().dropboxTokenInfo),
    encryptedUserId: getSessionProAccount() ? pro_accounts.getEncryptedUserId(getSessionProAccount().id): "",
    nameGuess: getSession().nameGuess || null,
    // only refresh the facebook token if the user has an fbid
    shouldGetFbLoginStatus: pro_facebook.shouldRefreshFacebookToken(),
    useFbChat: appjet.config['etherpad.inviteFacebookChat'] == 'true',
    userId: userId,
    userIsGuest: padusers.isGuest(userId),
    userLink: getSessionProAccount() ? pro_accounts.getUserLinkById(getSessionProAccount().id) : "",
    userPic: getSessionProAccount() ? pro_accounts.getPicById(getSessionProAccount().id) : ""
  };
}

function render_pad_get(localPadId) {
  response.allowFraming();

  // varz.incrementMetric("pad-render");
  var globalPadId = padutils.getGlobalPadId(localPadId);
  if (request.params.token && request.params.invitingId && getSessionProAccount()) {
    // Person was invited by email on some account. Give this account access if the
    // invite token is valid.
    var hostUserId = request.params.invitingId;
    var inviteToken = request.params.token;
    pad_security.maybeGrantUserAccessToPad(globalPadId, hostUserId, getSessionProAccount(), inviteToken);
  }

  // track search result clicks
  if (request.params.r && request.headers["Referer"]) {
    mixpanel.track("search-result", {position: request.params.r});
  }
  if (request.params.eid) {
    email_tracking.trackEmailClick(request.params.eid);
  }
  if (pro_accounts.isAccountSignedIn()) {
    pad_access.updateUserIdLastAccessedDate(globalPadId,
      getSessionProAccount().id);
  }

  request.cache.isMobileApp = !!request.cookies[MOBILE_APP_COOKIE_NAME] ||
    (!localPadId && (request.userAgent.isIPhone() || request.userAgent.isIPad()));
  request.cache.isDesktopApp = !!request.cookies[DESKTOP_APP_COOKIE_NAME];
  var templateFile;
  if (request.cache.isDesktopApp) {
    templateFile = 'pad/editor_desktop.ejs';
  } else {
    templateFile = request.cache.isMobileApp || !localPadId ?
        "pad/editor_ios.ejs" : "pad/editor_full.ejs";
  }
  return renderPadWithTemplate(localPadId, templateFile, {});
}

function render_editor_get() {
  return render_pad_get();
}
