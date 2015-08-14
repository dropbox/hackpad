/*
  Support for knocking and being let it to a pad
*/
import ("crypto");
import("email.sendEmail");

import("etherpad.helpers");

import("etherpad.collab.collab_server");

import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.pad_security");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_utils");

import("etherpad.utils.*");
import("etherpad.helpers.modalDialog");


function render_guest_request_access_both() {

  var localPadId = request.params.padId;

  // Load pad metadata
  var proTitle;
  var creatorId;
  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    proTitle = propad.getDisplayTitle();
    creatorId = propad.getCreatorId();
  });

  // Generate a URL for granting access
  var params = {userId: getSessionProAccount().id, padId: localPadId};
  var allowUrl = absoluteSignedURL('/ep/account/guest/grant-access', params)

  // Send email to pad creator
  var padCreator = pro_accounts.getAccountById(creatorId);
  var displayName = getSessionProAccount().fullName + " ("+getSessionProAccount().email + ")";
  var subj = "Access Request: " + proTitle;
  var body = displayName + " has requested access to your pad: " +  proTitle +
      ".<br/><br/>  <a href='"+allowUrl+"'>Give this person access</a>.<br/><br/>  If you don't want to give them access, just ignore this email.";
  var fromAddr = pro_utils.getEmailFromAddr();
  sendEmail(padCreator.email, fromAddr, subj, {}, body, "text/html; charset=utf-8");

  var msg = "We've sent the owner of the pad an email requesting access for you.";
  renderJSON({success:false, error: msg, html: modalDialog("Cool", msg) });
}


function render_grant_access_get() {  // isValidSignedRequest
  var userId = request.params.userId;
  var localPadId = request.params.padId

  if (!crypto.isValidSignedRequest(request.params, request.params.sig)) {
    throw Error("Invalid Request.");
  }

  var creatorId;
  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    proTitle = propad.getDisplayTitle();
    creatorId = propad.getCreatorId();
  });


  if (creatorId == getSessionProAccount().id) {
    var requestingUser = pro_accounts.getAccountById(userId);

    // if so, grant access
    pad_security.grantUserIdAccessToPad(padutils.getGlobalPadId(localPadId),
        getSessionProAccount().id/*host*/, requestingUser);
    // todo: make sure we're not trusting a null token!

    var padUrl = absolutePadURL(localPadId);

    // send email to the original user
    var subj = "Access to " + proTitle;
    var body = "You've been invited to edit <a href='" + padUrl + "'>"+  proTitle +"</a>.";
    var fromAddr = pro_utils.getEmailFromAddr();
    sendEmail(requestingUser.email, fromAddr, subj, {}, body, "text/html; charset=utf-8");

    renderHtml('pro/account/access_granted.ejs', {
      fullName: requestingUser.fullName,
      proTitle: proTitle,
      padUrl:padUrl
    });
  }
}

function render_guest_knock_get(padId) {
  response.setStatusCode(getSessionProAccount() ? 404 : 401);

  var localPadId = padId || request.params.padId;
  helpers.addClientVars({
    localPadId: localPadId,
    guestDisplayName: request.params.guestDisplayName,
    padUrl: "http://"+httpHost(request.host)+"/"+localPadId
  });
  renderFramed('pro/account/guest-knock.ejs', {localPadId: localPadId});

  return true;
}


function render_guest_knock_post() {

  var globalPadId = padutils.getGlobalPadId(request.params.padId);
  var userId = padusers.getUserId();
  var displayName = padusers.getUserName();

  response.setContentType("text/plain; charset=utf-8");

  // has the knock already been answsered?
  var currentAnswer = pad_security.getKnockAnswer(userId, globalPadId);
  if (currentAnswer) {
    response.write(currentAnswer);
  } else {
    collab_server.guestKnock(globalPadId, userId, displayName);
    response.write("wait");
  }
  return true;
}
