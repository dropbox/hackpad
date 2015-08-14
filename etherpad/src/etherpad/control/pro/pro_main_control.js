/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import("stringutils");
import("dispatch.{Dispatcher,DirMatcher,forward}");
import("fastJSON");
import("funhtml.*");
import("jsutils");
import("cache_utils.syncedWithCache");
import("crypto");

import("etherpad.helpers");
import("etherpad.utils.*");
import("etherpad.sessions.getSession");
import("etherpad.sessions");
import("etherpad.log");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_padlist");
import("etherpad.pro.pro_public");

import("etherpad.globals.{alert,isProduction,isDogfood}");

import("etherpad.control.pro.admin.account_manager_control");
import("etherpad.control.searchcontrol");

import("etherpad.pad.padusers");
import("etherpad.pad.pad_security");
import("etherpad.pad.padutils");
import("etherpad.statistics.mixpanel");

// decorate with group info
function decorateWithCollectionNames(pads, groupInfos) {
  pads = pads.filter(function(p){return Boolean(p)});

  // look up group ids for all pads
  var globalPadIds = pads.map(function(pad){
    return padutils.makeGlobalId(pad.domainId, pad.localPadId) });
  var globalPadIdsToGroupIds = pro_groups.getPadsGroupIds(globalPadIds);

  // make a name lookup map
  var infoById = {};
  groupInfos.forEach(function(groupInfo){
    infoById[groupInfo.groupId] = groupInfo;
  });

  // for each pad, find the list of groupIds, and look up the corresponding names
  for (var i=0; i<pads.length; i++) {
    var globalPadId = padutils.makeGlobalId(pads[i].domainId, pads[i].localPadId)
    var groupIds = globalPadIdsToGroupIds[globalPadId] || [];

    // look up names; some may not be available if they're not groups we have access to
    pads[i].groupInfos = groupIds.map(function(groupId) {
      return infoById[groupId];
    }).filter(function(gi){return gi});
  }
}

function decorateWithSegments(pads, segmentFilter, segmentCnt) {
  segmentCnt = segmentCnt || 3;
  var startTime = new Date().getTime();
  pads.filter(function(p) { return Boolean(p) })
    .forEach(function(padInfo) {
      request.profile.tick('before decorateWithSegments pad');
      padutils.accessPadLocal(padInfo.localPadId, function(pad) {
        try {
          var segments = pad.getMostRecentEditSegments(segmentCnt, segmentFilter, 200);
          if (!segments.length) {
            log.warn("No segments were found for pad ["+padInfo.localPadId+"]");
          }
          padInfo.segments = segments;
        } catch (ex) {
          log.logException(ex);
          padInfo.segments = [];
        }
      }, 'r', true);
    });
  var endTime = new Date().getTime();
  var limit = 400;
  if (endTime - startTime > limit) {
    log.warn("decorateWithSegments took " + ( endTime - startTime ) + " ms.");
  }
}

function _getRecentPadIds(userId) {
  var accountId = getSessionProAccount().id;
  var mruCookieName = "mru" + padusers.getUserIdForProUser(accountId);

  var mruPads = [];
  if (request.cookies[mruCookieName]) {
    mruPads = request.cookies[mruCookieName].split("|");
  }

  // decode localPadId:timestampSeconds
  for (var padIndex in mruPads) {
    mruPads[padIndex] = mruPads[padIndex].split(":");
  }

  return mruPads.reverse();
}

var SECTION = {
  home: 0,
  created: 1,
  shared: 2,
  all: 3,
  public: 4,
  stream: 5,
  public_stream: 6,
  hidden_stream: 7,
};

function loadGroupInfos() {
  var allGroupIds;
  var userGroupIds = [];

  if (getSessionProAccount()) {
    userGroupIds = pro_groups.getUserGroupIds(getSessionProAccount().id);
  }

  // add domain group ids if we're on a domain
  var domainGroupIds = [];
  if (domains.isPrimaryDomainRequest()) {
    domainGroupIds = [ 1130, 950, 2530 ];
  } else if (domains.isPublicDomain() ||
             (getSessionProAccount() &&
              !pro_accounts.getIsDomainGuest(getSessionProAccount()))) {
    domainGroupIds = pro_groups.getDomainPublicGroupIds(domains.getRequestDomainId());
  }
  allGroupIds = jsutils.uniqueNumbers(userGroupIds.concat(domainGroupIds));

  // db lookup
  var groupInfos = pro_groups.getGroupInfos(allGroupIds);

  // filter for access
  /* -- not needed, slow
  groupInfos.filter(function (gi) {
    return pro_groups.userHasAccessToGroupWithInfo(getSessionProAccount() ? getSessionProAccount().id : undefined, gi, getSessionProAccount())
  })
  */
  pro_groups.decorateWithEncryptedIds(groupInfos);


  // return as three separate lists
  function _isUserGroupInfo(gi){ return userGroupIds.indexOf(gi.groupId)>-1 };
  function _isDomainGroupInfo(gi){ return domainGroupIds.indexOf(gi.groupId)>-1 };
  function _not(filter){ return function(gi) { return !filter(gi); }};
  return {groupInfos: groupInfos,
    userGroupInfos: groupInfos.filter(_isUserGroupInfo),
    domainGroupInfos: groupInfos.filter(_isDomainGroupInfo).filter(_not(_isUserGroupInfo))};
}

function _convertSubdomainIdsToGlobal(ids) {
  return ids.map(function(id) {
    var parts = id.split("$");
    var subDomain;
    var localPadId;
    if (parts.length == 1) {
      localPadId = parts[0];
    } else {
      subDomain = parts[0];
      localPadId = parts[1];
    }

    var subDomainRecord = subDomain ? domains.getDomainRecordFromSubdomain(subDomain) : undefined;
    var domainId = subDomainRecord ? subDomainRecord.id : domains.getPrimaryDomainId();
    return padutils.makeGlobalId(domainId, localPadId);
  });
}

function _loadPads(selectedSection, groupInfos, limit, excludePadIds) {
  var getAllPads = function () {
    if (domains.isPrimaryDomainRequest() || pro_config.getConfig().showHome) {
      return pro_pad_db.listFollowedPads([], limit+20, undefined, undefined, undefined, excludePadIds);
    } else {
      request.profile.tick('before listMyPads');
      var _myPads = pro_pad_db.listMyPads(undefined, undefined, excludePadIds);
      request.profile.tick('before listAccessiblePads');
      var _accessiblePads = pro_pad_db.listAccessiblePads(excludePadIds, limit+20);
      return jsutils.uniqueBy(_myPads.concat(_accessiblePads), 'localPadId');
    }
  };
  var pads = {
    created: function() {
      return pro_pad_db.listMyPads();
    },
    shared: function() {
      return pro_pad_db.listAccessiblePads([], limit+20);
    },
    home: getAllPads,
    all: getAllPads,
    hidden: function() {
      excludePadIds = _convertSubdomainIdsToGlobal(excludePadIds);
      return pro_public.listHiddenPads(limit+20, excludePadIds);
    },
    global: function() {
      excludePadIds = _convertSubdomainIdsToGlobal(excludePadIds);
      return pro_public.listGlobalPublicPads(limit+20, excludePadIds);
    },
    public: function() {
      return pro_public.listPublicPads(limit+20, excludePadIds);
    },
    stream: function() {
      var streamPads;
      if (domains.isPrimaryDomainRequest() || pro_config.getConfig().showHome) {
        streamPads = pro_pad_db.listFollowedPads([], limit+20, undefined, undefined, undefined, excludePadIds);
      } else {
        request.profile.tick('before listMyPads');
        var _myPads = pro_pad_db.listMyPads(undefined, undefined, excludePadIds);
        request.profile.tick('before listAccessiblePads');
        var _accessiblePads = [];
        if (!isProduction() || (domains.getRequestDomainRecord().subDomain == "team")) {
          _accessiblePads = pro_pad_db.listAccessiblePads(excludePadIds, limit+20);
        } else {
          _accessiblePads = pro_pad_db.listAccessiblePads(excludePadIds, limit+20);
        }
        streamPads = jsutils.uniqueBy(_myPads.concat(_accessiblePads), 'localPadId');
      }

      jsutils.sortBy(streamPads, 'lastEditedDate');
      streamPads = streamPads.slice(0, limit+20);

      decorateWithCollectionNames(streamPads, groupInfos);

      return streamPads;
    },
    pinned: function() {
      return pro_pad_db.listPinnedPads();
    }
  }[selectedSection]();

  // not displayed currently
  //decorateWithCollectionNames(pads, groupInfos);

  return pads;
}

function _renderPadList(pads, selectedSection, limit, delayLoad, opts) {

  opts = jsutils.extend({
    stopAtEmptyLine: false,
    showTaskCount: true
  }, opts);

  if (['stream','public_stream','hidden_stream'].indexOf(selectedSection) > -1) {
    return pro_padlist.newRenderPadListStream(pads, limit, pads.length > limit, delayLoad, opts);
  } else if (selectedSection == 'pinned_stream') {
    opts.showFirstNLines = 10;
    opts.stopAtEmptyLine = true;
    return pro_padlist.newRenderPadListStream(pads, limit, false /* areMorePadsAvailable */, delayLoad, opts);
  } else {
    var cols = ['title', 'taskCount', 'lastEditedDate', 'actions'];
    if (['shared', 'public'].indexOf(selectedSection) > -1) {
      cols = ['title', 'taskCount', 'lastEditedDate'];
    }

    return pro_padlist.renderPadList(pads, cols, limit);
  }
}

function _loadMemberInfo() {
  if (domains.isPrimaryDomainRequest()) { return []; }

  var accts = pro_accounts.listNewestDomainAccounts(20);

  var infos = accts.map(function(a) {
    return {
      lastLoginDate: a.lastLoginDate,
      isGuest: pro_accounts.getIsDomainGuest(a),
      encryptedId: pro_accounts.getEncryptedUserId(a.id),
      name: a.fullName,
      userLink: pro_accounts.getUserLinkById(a.id),
      userPic: pro_accounts.getPicById(a.id),
      online: false
    };
  });

  // put the accounts the haven't logged in at the end
  infos = infos.sort(function(a, b) {
    return b.lastLoginDate - a.lastLoginDate;
  });

  return infos;
}

function render_main_get() {
  var trackingPosition = request.params.r;
  var cookieSection = request.cookies['padlistSection'];
  cookieSection = cookieSection in SECTION ? cookieSection : 'stream';
  var selectedSection = enumParam ('section', SECTION, cookieSection)

  if (typeof (trackingPosition) != "undefined") {
    mixpanel.track("recent-site-clicked", {position:trackingPosition});
  }

  var padSection = selectedSection;
  if ( domains.isPrimaryDomainRequest() && request.path.indexOf("/hidden") == 0 ) {
    pro_accounts.requireAdminAccount();
    padSection = 'hidden';
  } else if  (request.path.indexOf("/public") == 0 && domains.isPrimaryDomainRequest()) {
    padSection = 'global';
    // force stream view for /public
    selectedSection = 'stream';
  } else if (!getSessionProAccount() && domains.isPublicDomain() ) {
    padSection = 'public';
  } else {
    // we do this here because the main control (homepage) may redirect here and it
    // doesn't require an account!
    pro_accounts.requireAccount();

    // keep the top site list organized by last-accessed
    pro_accounts.updateLastLoginDate(getSessionProAccount());
  }

  var limit = intParam('show', [0, 1000], selectedSection == "home" ? 40: 20);
  var excludePadIds = (request.params.excludePadIds || "").split(",");

  request.profile.tick('before db access');

  request.profile.tick('before loadGroupInfos');
  var groupInfosSet = loadGroupInfos();

  request.profile.tick('before loadMemberInfo');
  var memberInfo = _loadMemberInfo();

  request.profile.tick('before loadPads');
  var pads = _loadPads(padSection, groupInfosSet.groupInfos, limit, excludePadIds);

  request.profile.tick('after db access');

  var pinnedPads = [];
  var pinnedPadListHtml = "";

  if (selectedSection === 'stream' || selectedSection == 'all'){
    // Separately load pinned pads since they might not be included in the stream
    // due to to date sorting and pagination limit.

    request.profile.tick('before pinned pad db access');
    pinnedPads = _loadPads('pinned', groupInfosSet.groupInfos, limit, excludePadIds);
    pinnedPads = pad_security.filterOutPadsCurrentUserCannotSee(pinnedPads);
    request.profile.tick('after pinned pad db access');

    // render the pinned pads
    if (pinnedPads.length){
      var pinnedSection = 'pinned_' + selectedSection;
      pinnedPadListHtml = _renderPadList(pinnedPads,  pinnedSection , limit, true);
      request.profile.tick('after renderPinnedPadList');
    }
  }

  var opts = {};
  if (['hidden', 'global'].indexOf(padSection) > -1) {
    opts.showFirstNLines = 10;
    opts.isGlobal = true;
  };

  // render the pad list
  var padListHtml = _renderPadList(pads, selectedSection, limit, true/*delayLoad*/, opts);

  request.profile.tick('after renderPadList');

  jsutils.sortBy(groupInfosSet.userGroupInfos, 'name', true /*ignoreCase*/);
  jsutils.sortBy(groupInfosSet.domainGroupInfos, 'name', true /*ignoreCase*/);

  // info for the list of spaces
  var r = domains.getRequestDomainRecord();

  function selectedIfSection (sectionName) {
    return sectionName==selectedSection ? 'selected' : "";
  }

  var bodyClasses = [padSection];
  if (request.userAgent.isIPad()) {
    bodyClasses.push('ipad');
  }
  if (isDogfood() && !request.userAgent.isMobile()){
    //bodyClasses.push('hasBanner');
  }
  var bodyClass = bodyClasses.join(" ");

  request.profile.tick('before data');

  var trendingHashtags = jsutils.keys(searchcontrol.getHashtags()).slice(0, 10);

  var isPublicHackpad = padSection == 'global' && request.path.indexOf("/public") == 0;
  var recentDomainsList;
  if (isPublicHackpad) {
    request.profile.tick("before fetching recent public domains");
    var recentDomains = pro_public.listRecentPublicDomains();
    recentDomainsList = domains.getDomainRecordsForIds(recentDomains.map(function(d){ return d.domainId}));
    request.profile.tick("after fetching recent public domains");
  }

  var data = {
    absoluteURL: absoluteURL,
    isPublicHackpad: isPublicHackpad,
    recentDomains: recentDomainsList,
    trendingHashtags: trendingHashtags,
    bodyClass: bodyClass,
    orgName: r.orgName,
    account: getSessionProAccount(),
    groups: groupInfosSet.userGroupInfos,
    domainGroups: groupInfosSet.domainGroupInfos,
    domainGuests: memberInfo.filter(function(i) { return i.isGuest; }),
    selectedIfSection: selectedIfSection,
    isSubDomain: !domains.isPrimaryDomainRequest(),
    linkToAdmin: pro_accounts.isAdminSignedIn(),
    pinnedPadListHtml: pinnedPadListHtml,
    padListHtml: padListHtml,
    isNewSite: !pads.length,
    signedInAccounts: getSessionProAccount()? [] : pro_accounts.accountsForSignInAsPicker(),
    streamListSwitcher: true,
  };
  _addDomainMemberInfo(data, memberInfo);

  request.profile.tick('after data');

  helpers.addClientVars({
    isAdmin: pro_accounts.isAdminSignedIn(),
    loadMoreUrl: '/ep/ajax-list',
    canUnFollow: (selectedSection == "all" || selectedSection == "home" || selectedSection == "stream" ),
    canPin: getSessionProAccount() && !domains.isPrimaryDomainRequest() && !pro_accounts.getIsDomainGuest(getSessionProAccount()) && (selectedSection == "all" || selectedSection == "stream" ),
    canHide: padSection == 'global' && pro_accounts.isAdminSignedIn(),
    canUnhide: padSection == 'hidden' && pro_accounts.isAdminSignedIn(),
    userId: getSessionProAccount() ? getSessionProAccount().id : null,
    disableFB: !(domains.isPrimaryDomainRequest() || domains.supportsFacebookSignin()),
    userName: getSessionProAccount() ? getSessionProAccount().fullName : "",
    userLink: getSessionProAccount() ? pro_accounts.getUserLinkById(getSessionProAccount().id) : "",
    userPic: getSessionProAccount() ? pro_accounts.getPicById(getSessionProAccount().id) : "",
    profile: request.profile.asString(),
    selectedSection: selectedSection,
  });

  renderFramed('pro/pro_home.ejs', data);

  return true;
}

function _addDomainMemberInfo(data, memberInfo) {
  var fullMembers = memberInfo.filter(function(i) { return !i.isGuest; })
  jsutils.extend(data, {
    domainMemberCount: domains.isPrimaryDomainRequest() ? 0 : pro_accounts.getActiveCount(domains.getRequestDomainId()),
    domainMembers: fullMembers,
    allowInvites: domains.isPublicDomain() || (getSessionProAccount() && !pro_accounts.getIsDomainGuest(getSessionProAccount())),
  });
}
function render_domain_members_list_get() {
  if (!domains.isPrimaryDomainRequest() && !domains.isPublicDomain()) {
    pro_accounts.requireAccount();
  }

  var memberInfo = _loadMemberInfo();

  var data = {};
  _addDomainMemberInfo(data, memberInfo);

  renderPartial('pro/_domain_members.ejs', 'domainMembersList', data);
  return true;
}


// returns just the padrows part of the padlist, so you can load more stuff inline
function render_ajax_list_get() {

  var cookieSection = request.cookies['padlistSection'];
  cookieSection = cookieSection in SECTION ? cookieSection : 'stream';
  var selectedSection = enumParam ('section', SECTION, cookieSection);

  var limit = intParam('show', [0, 1000], selectedSection == "home" ? 40: 20);
  var excludePadIds = (request.params.excludePadIds || "").split(",");
  var padSection = selectedSection;
  if (selectedSection.indexOf("hidden") > -1) {
    padSection = 'hidden';
  } else if (selectedSection.indexOf("public") == 0 && domains.isPrimaryDomainRequest()) {
    padSection = 'global';
    // force stream view for /public
    selectedSection = 'stream';
  } else if ((!getSessionProAccount() && domains.isPublicDomain())) {
    padSection = 'public';
  } else {
    // we do this here because the main control (homepage) may redirect here and it
    // doesn't require an account!
    pro_accounts.requireAccount();
  }

  request.profile.tick('before load pads');

  var groupInfosSet = loadGroupInfos();

  var pads = _loadPads(padSection, groupInfosSet.groupInfos, limit, excludePadIds);

  request.profile.tick('after load pads');

  var opts = {};
  if (['hidden', 'global'].indexOf(padSection) > -1) {
    opts.showFirstNLines = 10;
    opts.isGlobal = true;
  };
  // render the pad list
  var padListHtml = _renderPadList(pads, selectedSection, limit, false /*delayLoad*/, opts);

  // Can delete is automatically updated inside _renderPadList
  var clientVars = helpers.getClientVars();
  renderJSON({html:String(padListHtml), clientVars: clientVars, profile: request.profile.asString()});

  return true;
}


/** payment / activation code **/

function render_finish_activation_get() {
  if (!isActivationAllowed()) {
    response.redirect('/');
  }
  pro_config.getConfig();

  var accountList = pro_accounts.listAllDomainAccounts();
  if (accountList.length > 1) {
    response.redirect('/');
  }
  if (accountList.length == 0) {
    throw Error("accountList.length should never be 0.");
  }

  var acct = accountList[0];
  var tempPass = stringutils.randomString(10);
  pro_accounts.setTempPassword(acct, tempPass);
  account_manager_control.sendWelcomeEmail(acct, tempPass);

  var domainId = domains.getRequestDomainId();

  syncedWithCache('pro-activations', function(c) {
    delete c[domainId];
  });

  getSession().accountSigninNotice = "We've sent your verification email.  Click on the link in that email to activate your account.";
  response.redirect('/ep/account/sign-in');
/*  renderNoticeString(
    DIV({style: "font-size: 16pt; border: 1px solid green; background: #eeffee; margin: 2em 4em; padding: 1em;"},
      P("Success!  You will receive an email shortly with instructions."),
      DIV({style: "display: none;", id: "reference"}, acct.id, ":", tempPass)));*/

  return true;
}

function isActivationAllowed() {
  if (request.path != '/ep/finish-activation') {
    return false;
  }

  return true;
}

import ("etherpad.statistics.email_tracking");
function render_clck_get() { //isValidSignedRequest
  if (!crypto.isValidSignedRequest(request.params, request.params.sig)){
    log.warn("Invalid signature on request: "+request.url);
    return render401("Invalid request signature");
  }
  email_tracking.trackEmailClick(request.params.eid);
  response.redirect(request.params.cont);
}

function render_pin_pad_post(){
  var acct = getSessionProAccount();
  if (!acct || pro_accounts.getIsDomainGuest(acct)){
    return renderJSONError(403, "Only full members are allowed to pin pads in sites");
  }
  if (domains.isPrimaryDomainRequest()) {
    return renderJSONError(403, "No pad pinning is allowed on hackpad.com");
  }
  var pinnedURL = "";
  var localPadId = request.params.localPadId;
  var pinToggle = request.params.pinToggle === 'true';
  if (localPadId) {
    if (pinToggle){
      pinnedURL = padutils.urlForLocalPadId(localPadId, "" /* title */);
    }
  }
  pro_config.setConfigVal('homePadURL', pinnedURL);
  return renderJSON({success: true});
}

function render_hide_pad_post(){
  var acct = getSessionProAccount();
  if (!acct || !acct.isAdmin){
    return renderJSONError(403, "Only admins are allowed to hide pads from the stream");
  }
  var localPadId = request.params.localPadId;
  var subDomain = request.params.subdomain;
  var hidePad = request.params.hide == 'true';

  var subDomainRecord = subDomain ? domains.getDomainRecordFromSubdomain(subDomain) : undefined;
  var domainId = subDomainRecord ? subDomainRecord.id : domains.getPrimaryDomainId();

  var globalPadId = padutils.makeGlobalId(domainId, localPadId);

  if (hidePad) {
    pro_public.hidePublicPad(globalPadId);
  } else {
    pro_public.unhidePublicPad(globalPadId);
  }
  return renderJSON({success: true});
}
