/*
  Tell people about activity they may have missed in their workspace
*/

import("execution");
import("jsutils");
import("etherpad.log");
import("etherpad.changes.follow");
import("etherpad.pad.padutils");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_key_values");
import("etherpad.pro.domains");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_utils");
import("etherpad.utils.renderTemplateAsString");
import("etherpad.utils");
import("email.sendEmail");
import("etherpad.statistics.email_tracking");

function onStartup() {
  if (appjet.config['etherpad.sendDigest']) {
    execution.initTaskThreadPool("digest", 1);
    _scheduleNextDailyBatch('digest', 'dailyActivityDigestBatch', {hour:15, minute:15});
  } else {
    log.info("Not syndicating digest");
  }
}

function _scheduleNextDailyBatch(threadPool, jobName, when) {
  var now = +(new Date);
  var tomorrow = new Date(now + 1000*60*60*24);
  tomorrow.setHours(when.hour);
  tomorrow.setMinutes(when.minute);
  tomorrow.setMilliseconds(00);
  log.info("Scheduling next daily batch for: " + tomorrow.toString());
  var delay = +tomorrow - (+(new Date));
  execution.scheduleTask(threadPool, jobName, delay, []);
}

serverhandlers.tasks.dailyActivityDigestBatch = function() {
  try {
    sendDailyActivityDigestEmails();
  } catch (ex) {
    log.warn("digest.dailyActivityDigestBatch() failed: "+ex.toString());
  } finally {
    _scheduleNextDailyBatch('digest', 'dailyActivityDigestBatch', {hour:15, minute:15});
  }
}

function _dayDiff(firstDate, secondDate) {
  return (secondDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24.0);
}

function sendDailyActivityDigestEmails() {
  var batchInfo = {batchSize: 100};
  var allDomains = domains.getAllDomains();
  var digestUsers = {/* email : accounts */};
  var digestPads = {/* email : newPads */};

  for (var i=0; i<allDomains.length; i++) {
    // Skip digest for primary domain
    if (allDomains[i].id == domains.getPrimaryDomainId()) {
      continue;
    }

    var domainAccounts = pro_accounts.listAllDomainAccounts(allDomains[i].id);
    domainAccounts = domainAccounts.filter(
        function(acct){ return !pro_accounts.getIsDomainGuest(acct)});
    var now = +(new Date());
    var twoWeeksAgo = new Date(now - 1000*60*60*24*7);

    var newPads = pro_pad_db.listPadsCreatedSince(allDomains[i].id, twoWeeksAgo.getTime() / 1000);

    pro_key_values.decorateWithValues(domainAccounts, 'lastSentDigest');
    pro_key_values.decorateWithValues(domainAccounts, 'doesNotWantSitesDigest');
    pro_pad_db.decorateWithPadSqlMeta(newPads);
    pro_pad_db.decorateWithCreators(newPads);

    domainAccounts.forEach(function(user) {
      // skip those who have unsubscribed
      if (user['doesNotWantSitesDigest']) {
        return;
      }
      // for now, skip users who have never logged in & api accounts
      if (!user.lastLoginDate || user.email.indexOf("|") > -1) {
        return;
      }
      // at most once per week
      if (user.lastSentDigest && (_dayDiff(user.lastSentDigest, new Date()) < 6.5)){
        return;
      }

      // exclude the pad if i'm a creator or follower (or have unfollowed)
      followPrefs = follow.getUserIdsWithFollowPrefsForPads(newPads.map(function(row){return padutils.getGlobalPadId(row.localPadId, row.domainId) }));
      newPads.forEach(function(newPad) {
        var globalPadId = padutils.getGlobalPadId(newPad.localPadId, newPad.domainId);
        if ((!user.lastSentDigest || newPad.lastEditedDate > user.lastSentDigest) &&
            newPad.guestPolicy in {'allow':1, 'domain':1} &&
            newPad.creator != null &&
            newPad.creatorId != user.id &&
            newPad.title != "Untitled" &&
            newPad.title != "" &&
            newPad.title != "Welcome to hackpad - the collaborative notepad" &&
            newPad.title != null &&
            (!followPrefs[globalPadId] || followPrefs[globalPadId].indexOf(user.id) == -1)) {
          digestUsers[user.email] = digestUsers[user.email] || {};
          digestUsers[user.email][user.domainId] = user;
          digestPads[user.email] = digestPads[user.email] || [];
          digestPads[user.email].push(newPad);
        }
      });
    });
  }
  for (email in digestUsers) {
    sendDigestForUser(email, jsutils.values(digestUsers[email]), digestPads[email], dictByProperty(allDomains, 'id'));
  }
}
function dictByProperty(array, propertyName) {
  var dict = {}
  array.forEach(function(item) {
    dict[item[propertyName]] = item;
  });
  return dict;
}

function sendDigestForUser(email, accounts, pads, domainById) {
  var accountIds = accounts.map(function(acct){ return acct.id });

    pro_key_values.updateValueForAccounts(accountIds, 'lastSentDigest', new Date());

  var fromAddr = pro_utils.getEmailFromAddr();
  var padsByDomainId = {/*domainId: pads*/};
  pads.forEach(function(row) {
    padsByDomainId[row.domainId] = padsByDomainId[row.domainId] || [];
    padsByDomainId[row.domainId].push(row);
  });


  var domainNames = accounts.map(function(acct){
    return domainById[acct.domainId].subDomain;
  });

  var subject = "New pads added to " + domainNames.join(", ");

  var trackingId = email_tracking.trackEmailSent(email, email_tracking.NEW_PADS_DIGEST, 1);

  var unsubURL = utils.absoluteSignedURL("/ep/account/settings/unsub-new-pads", {accountId: pro_accounts.getEncryptedUserId(accounts[0].id)})

  for (domainId in padsByDomainId) {
    padsByDomainId[domainId] = padsByDomainId[domainId].reverse();
  }

  var body = renderTemplateAsString(
    'email/digest_new_pads.ejs', {
      domainById:domainById,
      accounts: accounts,
      padsByDomainId: padsByDomainId,
      fullName: accounts[0].fullName,
      timeAgo: utils.timeAgo,
      absolutePadURL: utils.absolutePadURL,
      absoluteProfileURL: utils.absoluteProfileURL,
      unsubURL: unsubURL,
      trackingId: trackingId
    }
  );

  log.custom("digest", {userIds: accountIds, fullName: accounts[0].fullName, email: email});

  // send the email
  try {
    sendEmail(email, fromAddr, subject, {}, body, "text/html; charset=utf-8");
  } catch(e) {
    log.logException("Failed to send email: " + email);
  }

}


