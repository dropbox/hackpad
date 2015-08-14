
import("dispatch.Dispatcher");

import("jsutils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padlist");
import("etherpad.pro.pro_tokens");

import("etherpad.control.pro.pro_main_control.{decorateWithCollectionNames,decorateWithSegments,loadGroupInfos}")
import("etherpad.utils.*");
import("etherpad.helpers");

function onRequest() {
  var disp = new Dispatcher();
  disp.addLocations([
    [/^\/ep\/profile\/ajax-list/, render_ajax_list_get],
    [/^\/ep\/profile\/([\w-]+)$/, render_profile_get],
    ['/ep/profile/', render_profile_get],
  ]);

  return disp.dispatch();
}

function _renderPads(pads, groupInfos, selectedSection, accountId, limit, delayLoad) {
  jsutils.sortBy(pads, 'lastEditedDate');
  pads = pads.slice(0, limit+20);
  decorateWithCollectionNames(pads, groupInfos);
  if (selectedSection == "stream") {
    var segmentFilter = function(s) {
      return s.authors && s.authors.indexOf("p." + accountId) > -1;
    };
    decorateWithSegments(pads, segmentFilter);
    return pro_padlist.newRenderPadListStream(pads, limit, pads.length > limit, delayLoad);
  } else {
    return pro_padlist.renderPadList(pads, ['title', 'taskCount', 'lastEditedDate'], 20);
  }
};

function render_ajax_list_get() {
  var selectedSection = request.cookies['padlistSection'] || "stream";
  var limit = intParam('show', [0, 1000], 20);
  var excludePadIds = (request.params.excludePadIds || "").split(",");
  var encryptedProfileId = request.params.encryptedProfileId;

  if (selectedSection != "stream" && selectedSection != "home") {
    selectedSection = "stream";
  }

  if (!domains.isPrimaryDomainRequest() && !getSessionProAccount() && !domains.isPublicDomain()) {
    pro_accounts.requireAccount();
  }

  if (!encryptedProfileId) {
    renderJSONError(401, "An encryptedProfileId must be provided.");
  }

  var profileAccountId = pro_accounts.getUserIdByEncryptedId(encryptedProfileId);
  if (!profileAccountId) {
    renderJSONError(401, "No account found for the provided encrypted id.");
  }

  var profilePads = pro_pad_db.listPadsEditedBy(profileAccountId);
  var padIdsToExclude = {};

  excludePadIds.forEach(function(padId) {
    padIdsToExclude[padId] = true;
  });

  profilePads = profilePads.filter(function(pad) { return !padIdsToExclude[pad.localPadId] });

  var groupInfos = getSessionProAccount() ? loadGroupInfos().groupInfos : [];
  var padListHtml = _renderPads(profilePads, groupInfos, selectedSection, profileAccountId, limit);

  var clientVars = helpers.getClientVars();
  renderJSON({html:String(padListHtml), clientVars: clientVars});

  return true;
}

function render_profile_get(encryptedProfileId) {
  if (!domains.isPrimaryDomainRequest() && !getSessionProAccount() && !domains.isPublicDomain()) {
    pro_accounts.requireAccount();
  }

  var isMyAccount = false;
  var encryptedProfileUserId = encryptedProfileId;
  var account;

  // Get the account of the profile's user
  if (encryptedProfileId) {
    var accountId = pro_accounts.getUserIdByEncryptedId(encryptedProfileId);
    if (!accountId) { return false; }

    // redirect back here but with the proper URL
    if (getSessionProAccount() && getSessionProAccount().id == accountId) {
      response.redirect('/ep/profile');
    }

    account = pro_accounts.getAccountById(accountId);
    if (!account) { return false; }

  } else if (getSessionProAccount()) {
    account = getSessionProAccount();
    isMyAccount = true;
    encryptedProfileUserId = pro_accounts.getEncryptedUserId(account.id);

    // if the user is looking at their own profile, force photo reload
    pro_accounts.clearPicById(account.id);
  } else {
    // a visit to /profile while not logged in
    pro_accounts.requireAccount();
  }

  if (account.isDeleted) {
    return render404();
  }

  // pad rendering
  var pads = pro_pad_db.listPadsEditedBy(account.id);
  var groupInfos = getSessionProAccount() ? loadGroupInfos().groupInfos : [];

  var selectedSection = request.params.section || request.cookies['padlistSection'] || 'stream';

  if (selectedSection != "stream" && selectedSection != "home") {
    selectedSection = "stream";
  }

  var padHtml = _renderPads(pads, groupInfos, selectedSection, account.id, 20 /* limit */, true /* delayLoad */);

  helpers.addClientVars({
    selectedSection: selectedSection,
    encryptedProfileId: encryptedProfileUserId,
    loadMoreUrl: 'ep/profile/ajax-list'
  });


  renderFramed('pro/account/profile.ejs', {
    displayUserPic: pro_accounts.getPicById(account.id, true),
    isMyAccount: isMyAccount,
    displayAccount: account,
    pads: pads,
    padHtml: padHtml,
    bodyClass: (!getSessionProAccount() && domains.isPrimaryDomainRequest() && !request.userAgent.isMobile()) ? "guestbanner" : "",
    showEmail: isMyAccount || (!domains.isPublicDomain() && !domains.isPrimaryDomainRequest())
  });

  return true;
}





