
import ("crypto");
import("email.sendEmail");
import("fastJSON");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");
import("stringutils");
import("funhtml.*");
import("jsutils.*");
import("atomfeed");
import("dispatch.Dispatcher");

import("etherpad.changes.follow");
import("netutils");

import("etherpad.collab.collab_server");
import("etherpad.control.pro.account_control");

import("etherpad.log");
import("etherpad.helpers");
import("etherpad.pad.model");
import("etherpad.pad.padusers");
import("etherpad.pad.importhtml");
import("etherpad.pad.pad_access");
import("etherpad.pad.padutils");

import("etherpad.pad.pad_security");
import("etherpad.pad.pad_security.filterOutPadsCurrentUserCannotSee");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domain_migration");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_friends");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_padmeta");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.control.pad.pad_control.assignColorId");
import("etherpad.control.pro.pro_main_control.*");


import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_padlist");
import("etherpad.pro.pro_utils");
import("etherpad.sessions");
import("etherpad.utils");
import("etherpad.utils.{randomUniquePadId,renderTemplateAsString,requireParam,renderJSON,renderJSONError}");
import("etherpad.utils.render404");

jimport("java.sql");
jimport("java.sql.DriverManager");
jimport("java.sql.Statement}");

function onRequest() {
  var disp = new Dispatcher();
  disp.addLocations([
    [/^\/ep\/group\/([\w-]+)\/migrate\-to\/(\d+)$/, render_migrate_to_both],
  ]);
  return disp.dispatch();
}

function _borrowOrStealInvite(groupId, inviteToken) {
  return inTransaction(function() {
    var invite = sqlobj.selectSingle('pro_group_members', {groupId: groupId, token: inviteToken, isMember: true});
    if (!invite) {
      return false;
    }

    // remove the old member, but we've passed on the token to the actually-joining user, so it's transitive.
    // this keeps the invited list clean in case there was a login with a different email
    var invitedAcct = pro_accounts.getAccountById(invite.userId);
    if (!invitedAcct || invitedAcct.isDeleted) {
      return false;
    }

    if (!invitedAcct.lastLoginDate) {
      // keep the invite list small & steal this invite
      pro_groups.removeMember(groupId, invite.userId);
    }

    pro_groups.addMember(groupId, getSessionProAccount().id, invite.addedByUserId, null, inviteToken);

    // todo: send email recap users joining via this invite to the original inviting user

    return true;
  });
}

function render_migrate_to_both(encryptedGroupId, domainId) {
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);

  function _return_error(error) {
    utils.renderJSON({success:false, error: error});
    response.stop();
  }

  if (!pro_groups.currentUserHasAccess(groupId) &&
      !pro_accounts.isAdminSignedIn()) {
    // FIXME: return access request page that works for groups
    _return_error("Not a member of this collection");
  }

  if (isNaN(parseInt(domainId))){
      _return_error("Not a valid destination domain");
  }

  // load the domain
  var domainRecord = domains.getDomainRecord(domainId);
  if (!domainRecord) {
      _return_error("Not a valid destination domain");
  }

  var creatorId = null;
  var subdomainAccount = null;
  var host = null;

  if (request.params.creatorId && pro_accounts.isAdminSignedIn()) {
    creatorId = parseInt(request.params.creatorId);
    if (isNaN(creatorId)) {
      _return_error("Not a valid destination creator id");
    }
  } else {
    try {
      // keep in sync with pad_control.js:render_migrate_to
      var host = pro_utils.getFullSuperdomainHost();
      if (domains.getPrimaryDomainId() != domainRecord.id) {
        host = domainRecord.subDomain+"."+host;
      }
      var resp = netutils.urlGet(
        (appjet.config.useHttpsUrls ? "https://" : "http://") + host +
        "/ep/api/lookup-session", {},
        { Cookie: request.headers['Cookie']});
      subdomainAccount = fastJSON.parse(resp.content);
    } catch (ex) {
      log.logException(ex);
      _return_error("Must be logged into both sites");
    }

    if (!subdomainAccount || !subdomainAccount.proAccount || !subdomainAccount.proAccount.id) {
      _return_error("Must be logged into both sites");
    }
    creatorId = subdomainAccount.proAccount.id;
    if (creatorId == getSessionProAccount().id) {
      _return_error("Must be logged into both sites");
    }
  }

  if (!request.params.moveUsers) {
    utils.renderJSON({success:false, verify: true, error: "Need to Verify",
      numPads: pro_groups.getGroupPadIds(groupId).length,
      orgName: domainRecord.orgName,
      domainId: domainId,
      domainName: host,
      users: domain_migration.getGroupUserNamesToMigrate(groupId) });
    return true;
  }

  var newGroupId = domain_migration.migrateGroup(groupId, domainId, creatorId, getSessionProAccount().id);
  if (!newGroupId) {
    utils.renderJSON({success:false, error:"Unknown error migrating collection"});
    return true;
  }

  var newGroupURL =
    request.scheme + "://" + host +
    "/ep/group/" + pro_groups.getEncryptedGroupId(newGroupId);

  utils.renderJSON({success:true, url:newGroupURL});
  return true;
}

function _renderPads(pads, selectedSection, groupInfos, limit, delayLoad) {
  if (limit) {
    pads = pads.slice(0, limit+20);
  }

  decorateWithCollectionNames(pads, groupInfos);
  var options = {
    showTaskCount: true,
    hideElipsis: true,
    showFirstNLines: 10,
    stopAtEmptyLine: true
  };
  if (selectedSection == "stream") {
    return pro_padlist.newRenderPadListStream(pads, limit, pads.length > limit, delayLoad, options);
  } else if (selectedSection == 'pinned_stream') {
    return pro_padlist.renderPinnedPadsListStream(pads, options);
  } else if (selectedSection == 'pinned_home') {
    return pro_padlist.renderPinnedPadsList(pads, ['dragHandle','title', 'taskCount', 'lastEditedDate', 'collection-actions']);
  } else {
    return pro_padlist.renderPadList(pads, ['title', 'taskCount', 'lastEditedDate', 'collection-actions'], 20);
  }
}

function render_ajax_list_get() {
  var selectedSection = request.cookies['padlistSection'] || "stream";
  var limit = utils.intParam('show', [0, 1000], 20);
  var excludePadIds = (request.params.excludePadIds || "").split(",");
  var encryptedGroupId = request.params.encryptedGroupId;

  if (!encryptedGroupId) {
    utils.renderJSONError(401, "An encryptedGroupId must be provided.");
  }

  // force stream view
  if (selectedSection != "stream" /* && selectedSection != "home" */) {
    selectedSection = "stream";
  }

  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  if (!pro_groups.currentUserHasAccess(groupId)) {
    pro_accounts.requireAccount("Guests are not allowed to view that collection.  Please sign in.");
  }

  var listOfPads = pro_groups.getGroupPadInfo(groupId);
  listOfPads = filterOutPadsCurrentUserCannotSee(listOfPads);

  var padIdsToExclude = {};

  excludePadIds.forEach(function(padId) {
    padIdsToExclude[padId] = true;
  });

  var listOfPinnedPads = pro_groups.listPinnedPadsInCollection(groupId);

  var pinnedPadsById = {};
  listOfPinnedPads.forEach(function(pad) {
    pinnedPadsById[pad.localPadId] = pad;
  });
    // Mark which pads are pinned in the list of all pads
  // This causes them be rendered as hidden in the stream
  listOfPads.forEach(function(pad) {
    if (pinnedPadsById[pad.localPadId]) {
      pad.isPinned = true;
    }
  });

  listOfPads = listOfPads.filter(function(pad) { return !padIdsToExclude[pad.localPadId] });

  var groupInfos = getSessionProAccount() ? loadGroupInfos().groupInfos : [];
  var padListHtml = _renderPads(listOfPads, selectedSection, groupInfos, limit, false /*delayLoad */);

  var clientVars = helpers.getClientVars();
  return utils.renderJSON({html:String(padListHtml), clientVars: clientVars});
}

function render_group_get(encryptedGroupId) {
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);

  if (groupId == 0) {
    render404();
  }

  if (!pro_groups.currentUserHasAccess(groupId)) {
    pro_accounts.requireAccount("Guests are not allowed to view that collection.  Please sign in.");

    // FIXME: return access request page that works for groups
    if (!(request.params.token && _borrowOrStealInvite(groupId, request.params.token))) {
      render_guest_knock_get(encryptedGroupId);
      response.stop();
    }
  }

  var listOfPads = pro_groups.getGroupPadInfo(groupId);
  listOfPads = filterOutPadsCurrentUserCannotSee(listOfPads)

  var groupInfos = getSessionProAccount() ? loadGroupInfos().groupInfos : [];

  var selectedSection = request.params.section || request.cookies['padlistSection'] || 'stream';
  // force stream view
  if (selectedSection != "stream" /* && selectedSection != "home" */) {
    selectedSection = "stream";
  }
  var listOfPinnedPads = pro_groups.listPinnedPadsInCollection(groupId);
  listOfPinnedPads = filterOutPadsCurrentUserCannotSee(listOfPinnedPads);

  var pinnedPadsById = {};
  listOfPinnedPads.forEach(function(pad) {
    pad.isPinned = true;
    pinnedPadsById[pad.localPadId] = pad;
  });

  var pinnedPadsHtml;
  var showPinInCollectionTip = false;

  var pinnedSection = "pinned_" + selectedSection;
  pinnedPadsHtml = _renderPads(listOfPinnedPads, pinnedSection, groupInfos, 20);

  // Mark which pads are pinned in the list of all pads
  // This causes them be rendered as hidden in the stream
  listOfPads.forEach(function(pad) {
    if (pinnedPadsById[pad.localPadId]) {
      pad.isPinned = true;
    }
  });

    // Let the user know t!hat he can pin pads in collections if there are many pads
  if (!listOfPinnedPads.length && listOfPads.length >= 5 &&
      !padusers.isGuest(padusers.getUserId())) {
    if (!request.cookies['showPinInCollectionTip']) {
      response.setCookie({
        name: "showPinInCollectionTip",
        value: "T",
        path: "/ep/group",
        expires: new Date(32503708800000), // year 3000
      });
    }
    showPinInCollectionTip = true;
  }

  var pads = _renderPads(listOfPads, selectedSection, groupInfos, 20 /* limit */, true /* delayLoad */);

  var invitedUsers = pro_groups.getGroupMemberIds(groupId).map(pro_accounts.getAccountById);
  var invitedUserInfos = [];
  for (var i=0; i<invitedUsers.length; i++) {
    if (!invitedUsers[i] || invitedUsers[i].isDeleted) { continue; }
    var fbid = invitedUsers[i].fbid;
    var userInfo = {name: invitedUsers[i].fullName,
        userId: padusers.getUserIdForProUser(invitedUsers[i].id),
        userLink: pro_accounts.getUserLinkById(invitedUsers[i].id),
        userPic: pro_accounts.getPicById(invitedUsers[i].id),
        status: "invited",
        colorId: 1};
    invitedUserInfos.push(userInfo);
  }

  var isMember = getSessionProAccount() && pro_groups.userIsMember(groupId, getSessionProAccount().id);
  var isGroupOwner = getSessionProAccount() && (pro_groups.getGroupCreatorId(groupId) == getSessionProAccount().id);
  var isPublic = pro_groups.getGroupIsPublic(groupId);

  helpers.addClientVars({
    loadMoreUrl: '/ep/group/ajax-list',
    selectedSection: selectedSection,
    groupId: encryptedGroupId,
    canPin: !padusers.isGuest(padusers.getUserId()),
    groupName: pro_groups.getGroupName(groupId),
    invitedUserInfos: invitedUserInfos,
    invitedGroupInfos: [],
    userAgent: request.headers["User-Agent"],
    debugEnabled: request.params.djs,
    clientIp: request.clientAddr,
    serverTimestamp: +(new Date),
    //numConnectedUsers: collab_server.getNumConnections(pad),
    userIsGuest: padusers.isGuest(padusers.getUserId()),
    userId: padusers.getUserId(),
    userName: getSessionProAccount() ? getSessionProAccount().fullName : "Guest",
    userLink: getSessionProAccount() ? pro_accounts.getUserLinkById(getSessionProAccount().id) : "",
    userPic: getSessionProAccount() ? pro_accounts.getPicById(getSessionProAccount().id) : '',
    facebookClientId: appjet.config.facebookClientId,
    facebookId: pro_accounts.getLoggedInUserFacebookId(),
    friendUserIds: getSessionProAccount() ? pro_friends.getFriendUserIds(getSessionProAccount().id) : [],
    isMember: isMember,
    isPublic: isPublic,
  });

  var bodyClass = ["collection-page", (request.userAgent.isIPad() ? "ipad" : ""),
    (!getSessionProAccount() && domains.isPrimaryDomainRequest() && !request.userAgent.isMobile()) ? "guestbanner" : "",
  ].join(" ");

  var groupDescription = [];
  listOfPads.slice(0, 3).forEach(function(pad) {
    groupDescription.push(pad.title);
  });
  groupDescription = groupDescription.join(", ");

  utils.renderFramed("group/group_home.ejs", {
    hasPinnedPads: listOfPinnedPads.length,
    selectedSection: selectedSection,
    showPinInCollectionTip: showPinInCollectionTip,
    groupId: encryptedGroupId,
    groupName: pro_groups.getGroupName(groupId),
    groupDescription: groupDescription,
    groupPads: pads,
    pinnedPadListHtml: pinnedPadsHtml,
    //groups: groupInfo(),
    //friendGroups: friendGroupInfo(),
    following: getSessionProAccount() ? pro_groups.userIsMember(groupId, getSessionProAccount().id) : false,
    bodyClass: bodyClass,
    isSubDomain: !domains.isPrimaryDomainRequest(),
    isPublicDomain: domains.isPublicDomain(),
    linkToAdmin: pro_accounts.isAdminSignedIn(),
    isGroupOwner: isGroupOwner || pro_accounts.isAdminSignedIn(),
    orgName: domains.getRequestDomainRecord().orgName,
    isPublic: isPublic,
    isEmpty: !Boolean(listOfPads.length),
    listOfPads: listOfPads.filter(function(p){return p.title != null}).sort(function(a,b) { return a.title.toLowerCase().localeCompare(b.title.toLowerCase()); })
  });

  return true;
}


function _getGroupsCurrentUserCanAccess() {
  var groupIds = pro_groups.getUserGroupIds(getSessionProAccount().id);
  if (!domains.isPrimaryDomainRequest()) {
    groupIds = groupIds.concat(
      pro_groups.getDomainPublicGroupIds(domains.getRequestDomainId())
        .filter(function(gid) { return groupIds.indexOf(gid) == -1; })
        .filter(pro_groups.currentUserHasAccess));
  }
  return groupIds;
}

function _isGroupNameDuplicate(name) {
  var groupIds = _getGroupsCurrentUserCanAccess();
  return !groupIds.every(function(groupId) {
    return pro_groups.getGroupName(groupId) != name;
  });
}

function render_create_post() {
  var name = utils.requireParam("name");
  var permission = request.params.permission;
  var isPublic = (permission == "public") || !domains.isPrimaryDomainRequest();

  if (!getSessionProAccount() || (pro_accounts.getIsDomainGuest(getSessionProAccount()) && !domains.isPublicDomain())) {
    return false;
  }

  var creatorId = getSessionProAccount().id;
  var groupIds = pro_groups.getUserGroupIds(creatorId);

  if (_isGroupNameDuplicate(name)) {
    utils.renderJSON({success:false, error: "A collection named " + name + " already exists."});
    return true;
  }

  var groupId = pro_groups.createGroup(creatorId, name, isPublic, domains.getRequestDomainId());

  // create initial group pad
/*  var welcomePadId = utils.randomUniquePadId();
  var welcomePadTitle = "Welcome to " + name + "!";
  padutils.accessPadLocal(welcomePadId, function(pad) {
    pad.create(welcomePadTitle + "\n\nThis is the first pad for your collection!", welcomePadTitle);
  });

  // add pad to group
  pro_groups.addPadToCollection(groupId, welcomePadId, getSessionProAccount().id);
*/
  utils.renderJSON({success:true, cont:"/"});//ep/group/" + pro_groups.getEncryptedGroupId(groupId)});
  return true;
}

function render_add_post() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  if (!groupId) {
    utils.renderJSON({success:false, error: "Unknown group"});
    response.stop();
  }

  if (!getSessionProAccount() || !pro_groups.currentUserHasAccess(groupId)) {
    utils.renderJSON({success:false, error: "Access Denied"});
    response.stop();
  }

  var toAddress = request.params.toAddress ? request.params.toAddress.toLowerCase() : null;
  var toAddresses = [];
  if (toAddress) {
    toAddresses = toAddress.split(",");
  }

  for (var i=0; i<(toAddresses.length || 1); i++) {
    toAddress = toAddresses[i] || null;

    var userId = request.params.userId;
//    var toAddress = request.params.toAddress ? request.params.toAddress.toLowerCase() : null;
    var friend_id = request.params.friend_id;
    var friendName = request.params.friendName;
    var facebookPostId = request.params.facebookPostId;

    var acct = null;
    var sendInviteEmail = true;

    if (userId) {
      acct = pro_accounts.getAccountById(userId);
    } else if (toAddress) {
      // create/lookup email account
      acct = pro_accounts.getAccountByEmail(toAddress);
      if (!acct) {
        var uid = pro_accounts.createNewAccount(null, toAddress, toAddress, null, false, true, null /* fbid */);
        acct = pro_accounts.getAccountById(uid);
        if (!acct) {
          response.setStatusCode(400);
          response.write("Failed to invite user");
          response.stop();
        }
      }
      userId = acct.id;
    } else if (friend_id && friendName && facebookPostId) {
      // create/lookup fb account
      acct = pro_facebook.getAccountByFacebookId(friend_id);
      if (!acct) {
          pro_accounts.createNewAccount(null, friendName, friend_id+"@virtual.facebook.com", null, false, true, friend_id);
          acct = pro_facebook.getAccountByFacebookId(friend_id);
          if (!acct) {
            response.setStatusCode(400);
            response.write("Failed to invite user");
            response.stop();
          }
      }
      // don't email facebook users with virtual addresses
      sendInviteEmail = acct.lastLoginDate != null;
      userId = acct.id;
    } else {
      utils.renderJSON({success:false, error: "Unknown Error 1"});
      response.stop();
    }

    if (!userId || !acct) {
      utils.renderJSON({success:false, error: "Unknown Error 2"});
      response.stop();
    }

    if (pro_groups.userIsMember(groupId, userId)) {
      utils.renderJSON({success:false, error: "Already a member"});
      response.stop();
    }

    var inviteToken = stringutils.randomString(20);
    pro_groups.addMember(groupId, userId, getSessionProAccount().id, facebookPostId, inviteToken);

    // FIXME: send xmpp invite if not facebookPostId

    // send invite email
    if (sendInviteEmail) {
      var editlink = request.scheme+'://'+request.host+ "/ep/group/" + encryptedGroupId + "?token=" + inviteToken;

      var groupName = pro_groups.getGroupName(groupId);

      var fromAddr = pro_utils.getEmailFromAddr();
      var subj = getSessionProAccount().fullName + ' invited you to the \'' + groupName + '\' collection!';
      var body = utils.renderTemplateAsString('email/collection_invite.ejs',
                                              {body: "Come hack with me: " + editlink, host: request.host});
      try {
        sendEmail(acct.email, fromAddr, subj, null, body);
      } catch (ex) {
        log.logException(ex);
      }
    }

    utils.renderJSON({ userInfo: {
        userId: ""+userId, // code elsewhere wants this to be a string
        name: acct.fullName,
        userLink: pro_accounts.getUserLinkById(acct.id),
        userPic: pro_accounts.getPicById(acct.id),
        status: "invited",
        colorId: 1 }
      });
  }
  return true;
}

function render_remove_both() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  var userId = utils.requireParam("userId");
  userId = padusers.getAccountIdForProAuthor(userId);

  var creatorId = pro_groups.getGroupCreatorId(groupId);

  if (!getSessionProAccount() || !pro_groups.currentUserHasAccess(groupId)) {
    utils.renderJSON({success:false, error: "Access Denied"});
    response.stop();
  }

  /*
  if (getSessionProAccount().id != userId && getSessionProAccount().id != creatorId) {
    // only self removes allowed
    return false;
  }
  */

  if (userId == creatorId && getSessionProAccount().id != creatorId) {
    // olny creator can remove creator
    utils.renderJSON({success:false, error: "Cannot remove the owner."});
    response.stop();
  }

  pro_groups.removeMember(groupId, userId);
  utils.renderJSON({success:true});
  return true;
}

function render_join_both() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  var userId = utils.requireParam("userId");
  userId = padusers.getAccountIdForProAuthor(userId);

  if (!getSessionProAccount()) {
    var html = renderTemplateAsString("pro/account/signed_out_modal.ejs", {});
    utils.renderJSON({success:false, html:html});
    response.stop();
  }

  if (!pro_groups.currentUserHasAccess(groupId)) {
    utils.renderJSON({success:false, error: "Access Denied"});
    response.stop();
  }

  if (getSessionProAccount().id != userId) {
    // only self joins allowed
    return false;
  }

  if (pro_groups.userIsMember(groupId, userId)) {
    utils.renderJSON({success:false, error: "Already a member"});
    response.stop();
  }

  pro_groups.addMember(groupId, userId, getSessionProAccount().id);
  utils.renderJSON({success:true});
  return true;
}

function _modalDialog(title, content) {
  return "" + DIV({className:"modaldialog", id:stringutils.randomString(6)}, DIV({className:"modaldialog-inner"}, H1({}, title), DIV({}, content)));
}


function render_guest_request_access_both() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);

  var groupName = pro_groups.getGroupName(groupId);
  var groupCreatorId = pro_groups.getGroupCreatorId(groupId);
  var groupCreator = pro_accounts.getAccountById(groupCreatorId);

  var signature = crypto.signRequest({userId: getSessionProAccount().id,
    groupId: encryptedGroupId});
  var allowUrl = [
    appjet.config.useHttpsUrls ? "https://" : "http://",
    utils.httpHost(pro_utils.getFullProDomain()), '/ep/group/grant-access?',
    'userId=', getSessionProAccount().id,
    '&groupId=', encryptedGroupId,
    '&sig=', signature
  ].join('');

  var displayName = getSessionProAccount().fullName + " ("+getSessionProAccount().email + ")";
  var subj = "Access Request: " + groupName;
  var body = displayName + " has requested access to your collection: " +  groupName +
      ".<br/><br/>  <a href='"+allowUrl+"'>Give this person access</a>.<br/><br/>  If you don't want to give them access, just ignore this email.";
  var fromAddr = pro_utils.getEmailFromAddr();
  sendEmail(groupCreator.email, fromAddr, subj, {}, body, "text/html; charset=utf-8");

  utils.renderJSON({success:false, html:
    _modalDialog("Cool", "We've sent the owner of the group an email requesting access for you.") });
}

function render_grant_access_get() { // isValidSignedRequest
  if (!crypto.isValidSignedRequest(request.params, request.params.sig)) {
    throw Error("Invalid Request.");
  }
  pro_accounts.requireAccount();
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  var userId = utils.requireParam("userId");

  var creatorId = pro_groups.getGroupCreatorId(groupId);

  if (creatorId == getSessionProAccount().id) {
    // todo: this load shouldn't be needed
    var requestingUser = pro_accounts.getAccountById(userId);

    // if so, grant access
    var inviteToken = stringutils.randomString(20);
    pro_groups.addMember(groupId, userId, getSessionProAccount().id, null /* fb post id */, inviteToken);

    // send invite email
    var editlink = request.scheme+'://'+request.host+ "/ep/group/" + encryptedGroupId + "?token=" + inviteToken;

    var groupName = pro_groups.getGroupName(groupId);

    var fromAddr = pro_utils.getEmailFromAddr();
    var subj = getSessionProAccount().fullName + ' added you to the \'' + groupName + '\' collection!';
    var body = utils.renderTemplateAsString('email/collection_invite.ejs',
                                            {body: "Come hack with me: " + editlink, host: request.host});
    try {
      sendEmail(requestingUser.email, fromAddr, subj, null, body);
    } catch (ex) {
      log.logException(ex);
    }

    var groupLink = request.scheme+'://'+request.host+ "/ep/group/" + encryptedGroupId;

    utils.renderHtml('pro/account/access_granted.ejs', {
      fullName: requestingUser.fullName,
      proTitle: groupName,
      padUrl: groupLink
    });

    return;
  }
}

function render_guest_knock_get(groupId) {
  response.setStatusCode(401);

  utils.renderFramed("group/guest-knock.ejs", {
    groupId: groupId
  });

  return true;
}

function render_guest_knock_post() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  if (!groupId || !getSessionProAccount()) { return false; }

  if (pro_groups.userIsMember(groupId, getSessionProAccount().id)) {
    response.write("approved");
  } else {
    var userId = padusers.getUserId();
    var displayName = padusers.getUserName();

    collab_server.guestKnockGroup(encryptedGroupId, userId, displayName);
    response.write("wait");
  }
}

function render_destroy_post() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  var reallySure = request.params.reallySure;

  if (!pro_accounts.isAdminSignedIn()) {
    var creatorId = pro_groups.getGroupCreatorId(groupId);
    if (creatorId != getSessionProAccount().id) {
      utils.renderJSON({success:false, error: "Only " + pro_accounts.getFullNameById(creatorId) + " can delete this group."});
      // todo: allow request deletion from creator
      response.stop();
    }
  }

  if (!reallySure) {
    utils.renderJSON({success:false, error: "Are you super sure you want to delete this group?"});
    return true; // what's right here?
  }

  pro_groups.destroyGroup(groupId);
  utils.renderJSON({success:true, cont:"/"});
}

function render_removepad_post() {
  pro_accounts.requireAccount();
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  var padId = utils.requireParam("padId");
  var uid = getSessionProAccount().id;

  if (!uid || !pro_groups.userMayEditGroup(pro_accounts.getSessionProAccount(), groupId)) {
    utils.renderJSON({success: false, error: "This collection is moderated, only the collection owner may remove pads."});
    return true;
  }

  pro_groups.removePadFromCollection(groupId, padId, uid);

  // Unpin this pad from the collection, if not pinned, this is a noop.
  pro_groups.unpinPadInCollection(groupId, padId);

  utils.renderJSON({success:true, cont:"/ep/group/" + encryptedGroupId});
  return true;
}

function render_set_access_post() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);

  var isPublic = request.params.isPublic == "true";

  if (!pro_accounts.isAdminSignedIn()) {
    var creatorId = pro_groups.getGroupCreatorId(groupId);
    if (creatorId != getSessionProAccount().id) {
      utils.renderJSON({success:false, error: "Only " + pro_accounts.getFullNameById(creatorId) + " can change the group access."});
      response.stop();
    }
  }

  pro_groups.setGroupIsPublic(groupId, getSessionProAccount().id, isPublic);
  utils.renderJSON({success:true});
}

function render_update_name_post() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);
  var name = utils.requireParam("name");

  if (!pro_accounts.isAdminSignedIn()) {
    var creatorId = pro_groups.getGroupCreatorId(groupId);
    if (creatorId != getSessionProAccount().id) {
      utils.renderJSON({success:false, error: "Only " + pro_accounts.getFullNameById(creatorId) + " can change the group name."});
      response.stop();
    }
  }

  pro_groups.setGroupName(groupId, name);
  utils.renderJSON({success:true});
}

function render_feed_get() {
  var encryptedGroupId = utils.requireParam("groupId");
  var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);

  if (!pro_groups.getGroupIsPublic(groupId)) {
    response.setStatusCode(400);
    response.write("Syndication feed only available for public collections.");
    response.stop();
  }

  var listOfPads = pro_groups.getGroupPadInfo(groupId);
  var lastModified = new Date(-1);

  response.setContentType("application/atom+xml; charset=utf-8");
  var entries = [];

  listOfPads.forEach(function(padInfo) {
    if (!padInfo) { return; }

    var desc = '';
    padutils.accessPadLocal(padInfo.localPadId, function(pad) {
      if (pad.getGuestPolicy() != "allow" && pad.getGuestPolicy() != "link") {
        return;
      }

      var desc = padutils.truncatedPadText(pad);
    }, 'r', true);

    var editors = [];
    padInfo.proAttrs.editors.forEach(function(editorId) {
      var name = pro_accounts.getFullNameById(editorId);
      if (name) {
        editors.push(name);
      }
    });

    entries.push({
      title: padInfo.title,
      author: editors.join(", "), // author names?
      published: padInfo.createdDate, // fixme: date added to collection
      updated: padInfo.lastEditedDate || padInfo.createdDate,
      href: request.scheme+"://"+request.host+"/"+encodeURIComponent(padInfo.localPadId),
      content: desc
    });
    if (padInfo.createdDate && padInfo.createdDate > lastModified) {
      lastModified = padInfo.createdDate;
    }
    if (padInfo.lastEditedDate && padInfo.lastEditedDate > lastModified) {
      lastModified = padInfo.lastEditedDate;
    }
  });

  entries.sort(function(a, b) { return a.updated < b.updated; });

  response.write(atomfeed.renderFeed(
    pro_groups.getGroupName(groupId), lastModified, entries,
    request.scheme+"://"+request.host+"/ep/group/" + encryptedGroupId));

  return true;
}

// collection_control
function render_add_pad_both() {
  var padId = requireParam("padId")
  var collectionId = pro_groups.decryptedGroupId(requireParam("groupId"));

  if (!pro_groups.currentUserHasAccess(collectionId)) {
    utils.render401("Access Denied");
  }

  // check this person is allowed to add things to this group!
  if (pro_groups.isModerated(collectionId) &&
      !pro_groups.isOwner(collectionId, getSessionProAccount().id)) {

    pro_groups.sendAddPadRequest(collectionId, padId, getSessionProAccount());

    return renderJSON ({success:false, message: "This collection is moderated, but we've sent your request to the collection owner."});
  }

  var globalPadId = padutils.getGlobalPadId(padId);
  if (pro_groups.isPadInGroup(collectionId, globalPadId)) {
    return renderJSON({success: false, message: "This pad is already present in the collection."});
  }

  pro_groups.addPadToCollection(collectionId, padId, getSessionProAccount().id);
  return renderJSON ({success: true});
}

function render_create_with_pad_post() {
  var padId = requireParam("padId");
  var groupName = requireParam("groupName");
  var permission = request.params.permission;
  var isPublic = (permission == "public") || !domains.isPrimaryDomainRequest();

  var creatorId = getSessionProAccount().id;

  if (_isGroupNameDuplicate(groupName)) {
    utils.renderJSON({success:false, error: "A collection named " + groupName + " already exists."});
    return true;
  }

  var collectionId = pro_groups.createGroup(creatorId, groupName, isPublic, domains.getRequestDomainId());

  pro_groups.addPadToCollection(collectionId, padId, creatorId);
  return renderJSON ({success: true, groupId: pro_groups.getEncryptedGroupId(collectionId) });
}

function render_pin_pad_post(){
  if (!getSessionProAccount()) {
    renderJSONError(403);
  }

  var selectedSection = request.cookies['padlistSection'] || "stream";
  // force stream view
  if (selectedSection != "stream" /* && selectedSection != "home" */) {
    selectedSection = "stream";
  }

  var padId = requireParam("padId")
  var afterPadId = request.params.afterPadId;
  var beforePadId = request.params.beforePadId;
  var remove = request.params.remove == "1";
  var collectionId = pro_groups.decryptedGroupId(requireParam("groupId"));
  var renderPad = request.params.renderPad;

  if (!pro_groups.userMayEditGroup(getSessionProAccount(), collectionId)) {
    return renderJSON({success:false, message: "This collection is moderated, only the collection owner is allowed to pin pads."});
  }

  var globalPadId = padutils.getGlobalPadId(padId);
  if (!pro_groups.isPadInGroup(collectionId, globalPadId)) {
    return renderJSON({success: false, message: "Unable to pin, this pad is not in the collection."});
  }

  var userId = getSessionProAccount().id;
  var creatorForPadId = {};
  creatorForPadId[globalPadId] = userId;

  var padIdsUserCanSee = pad_security.padIdsUserCanSee(userId, [globalPadId], creatorForPadId);
  var hasAccess = (padIdsUserCanSee.length && padIdsUserCanSee[0] == globalPadId);
  if(!hasAccess) {
    return renderJSON({success: false, message: "Unable to pin, the current user does not have access to this pad."})
  }

  var padHTML;
  if (renderPad && !remove) {
    var groupInfos = loadGroupInfos().groupInfos;
    var pinnedPad = pro_pad_db.getSingleRecord(domains.getRequestDomainId(), padId);
    pinnedPad.isPinned = true;
    padHTML = stringutils.toHTML(_renderPads([pinnedPad], "pinned_"+selectedSection, groupInfos));
  }
  if (remove) {
    pro_groups.unpinPadInCollection(collectionId, padId);
  } else {
    pro_groups.pinPadInCollection(collectionId, padId, afterPadId, beforePadId);
  }
  return renderJSON({success: true, padHTML:padHTML});
}
