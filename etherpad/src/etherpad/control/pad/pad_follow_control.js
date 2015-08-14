import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");

import("crypto");

import("etherpad.changes.follow");
import("etherpad.log");
import("etherpad.pad.padutils");
import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getUserIdByEncryptedId");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padmeta");
import("etherpad.utils.*");

function onRequest() {
  var parts = request.path.split('/');
  var globalPadId = padutils.getGlobalPadId(parts[4]); // todo: xsrf protection
  var padUrl = "/" + padutils.globalToLocalId(globalPadId);

  var currentAccountId;

  // if there's a signature, we're following an unsubscribe link and we don't need
  // the user to log in
  // Note: |accountId| is an encrypted ID.
  if (request.params.sig && request.params.accountId) {
    if (!crypto.isValidSignedRequest({accountId: request.params.accountId, globalPadId: globalPadId}, request.params.sig)) {
      log.logException("Pad unsubscribe failed: signature does not match!");
      return render401("Invalid Request.");
    }

    currentAccountId = getUserIdByEncryptedId(request.params.accountId);
  } else {
    // require an account but handle AJAX requests gracefully
    if (!getSessionProAccount()) {
      if (request.isPost && request.params.ajax) {
        var html = renderTemplateAsString("pro/account/signed_out_modal.ejs", {});
        renderJSON({success:false, html:html});
        response.stop();
      } else {
        pro_accounts.requireAccount();
      }
    }

    currentAccountId = getSessionProAccount().id;
  }

  var targetUrl = "/ep/pad/follow/" + padutils.globalToLocalId(globalPadId) + "/";
  var padTitle;
  pro_padmeta.accessProPad(globalPadId, function(propad) {
    padTitle = propad.getDisplayTitle();
  });

  // support legacy email unsubscribe urls
  var newFollowPref = null;
  if (parts.length == 7) {
    newFollowPref = parts[5];
  } else if (request.params.followPref) {
    newFollowPref = request.params.followPref;
  }

  var followPref;
  if (newFollowPref == null) {
    // load the follow pref
    followPref = follow.getUserFollowPrefForPad(globalPadId, currentAccountId);
  } else {
    // update the follow Pref
    var ret = inTransaction(function() {
      var existing = sqlobj.selectSingle('PAD_FOLLOW',  {id: globalPadId, userId: currentAccountId});
      if (existing) {
        sqlobj.update('PAD_FOLLOW', {id: globalPadId, userId: currentAccountId}, {followPref : newFollowPref});
      } else {
        sqlobj.insert('PAD_FOLLOW', {id: globalPadId, userId: currentAccountId, followPref : newFollowPref});
      }
    });
    followPref = newFollowPref;

    // apns: send follow/unfollow for userId
    pro_apns.sendPushNotificationForPad(globalPadId, null, currentAccountId,
      followPref == follow.FOLLOW.IGNORE ? pro_apns.APNS_HP_T_UNFOLLOW : pro_apns.APNS_HP_T_FOLLOW);
  }

  // render the dialog
  if (request.params.ajax) {
    renderJSON({success: true});
  } else {
    var encryptedAccountId = pro_accounts.getEncryptedUserId(currentAccountId);
    var sig = crypto.signRequest({accountId: encryptedAccountId, globalPadId: globalPadId});

    renderHtml('pro/settings/notification_settings.ejs',
      {followPref: followPref, padTitle: padTitle, encryptedAccountId: encryptedAccountId, sig: sig,
        targetUrl: targetUrl, padUrl:padUrl, saved: newFollowPref != null});
  }

  return true;
}
