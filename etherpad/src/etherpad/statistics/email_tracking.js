import("sqlbase.sqlobj");
import("etherpad.log");
import("crypto");
import("etherpad.statistics.mixpanel")

// types
var NEW_PADS_DIGEST = 1;
var CHANGES = 3;
var MENTIONS = 4;
var MERGE = 5;
var PAD_INVITE_NEW = 6;
var PAD_INVITE_EXISTING = 7;
var PAD_INVITE_FACEBOOK_EXISTING = 8;
var PAD_INVITE_FACEBOOK_XMPP = 9;
var DOMAIN_WELCOME = 10;
var EMAIL_VERIFICATION = 11;
var PRODUCT_UPDATE = 12;

function trackEmailSent(emailAddress, emailType, emailVersion, optGlobalPadId, optCampaignId){
  var id = sqlobj.insert('email_tracking', {
    emailAddress: emailAddress,
    timeSent: new Date(),
    emailType: emailType,
    emailVersion: emailVersion || 0,
    timeOpened: null,
    timeClicked: null,
    globalPadId: optGlobalPadId||"",
    campaignId: optCampaignId || "",
    clicks: 0});
  return crypto.encryptedId(id);
}

function trackEmailClick(obfuscatedEmailId) {
  try {
    var id = parseInt(crypto.decryptedId(obfuscatedEmailId));
    sqlobj.executeRaw('UPDATE email_tracking SET timeClicked = if(timeClicked is NULL, NOW(), timeClicked), clicks = clicks+1 where id = ?;', [id], true/*isUpdate*/)
    var row = sqlobj.selectSingle('email_tracking', {id:id});
    if (row && row.campaignId) {
      mixpanel.track('email-open', {campaignId: row.campaignId});
    }
    return true;
  } catch (e) {
    return false;
  }
}

function trackEmailOpen(obfuscatedEmailId) {
  try {
    var id = parseInt(crypto.decryptedId(obfuscatedEmailId));
    sqlobj.executeRaw('UPDATE email_tracking SET timeOpened = if(timeOpened is NULL, NOW(), timeClicked) where id = ?;', [id], true/*isUpdate*/);
    var row = sqlobj.selectSingle('email_tracking', {id:id});
    if (row && row.campaignId) {
      mixpanel.track('email-open', {campaignId: row.campaignId});
    }
    return true;
  } catch (e) {
    return false;
  }
}

function emailAddressesWhoWereSentCampaign(emailsToCheck, campaignId) {
  return sqlobj.selectMulti('email_tracking', {emailAddress: ['IN', emailsToCheck], campaignId: campaignId}).map(function(row){
    return row.emailAddress;
  });
}

