import("execution");
import("exceptionutils");
import("stringutils");
import("sqlbase.sqlobj");
import("varz");
import("jsutils.uniqueNumbers");
import("crypto");

import("email.sendEmail");

import("etherpad.changes.follow.FOLLOW");
import("etherpad.changes.follow.getUserFollowPrefsForPad");

import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.collab.ace.linestylefilter.linestylefilter");
import("etherpad.collab.ace.domline.domline");

import("etherpad.importexport.table.renderStaticTable");

import("etherpad.globals");
import("etherpad.log");
import("etherpad.pad.model");
import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.pad_security");
import("etherpad.pro.domains");
import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_accounts");
import("etherpad.statistics.email_tracking");


import("etherpad.utils");
import("etherpad.utils.renderTemplateAsString");
import("etherpad.collab.collab_server");

import("etherpad.helpers");
import("etherpad.debug.dmesg");

import("funhtml");
import("funhtml.*");


function _getFollowers(globalPadId) {
  var followers = sqlobj.selectMulti("PAD_FOLLOW", { 'id': globalPadId, 'followPref': FOLLOW.EVERY });
  return followers.map(function (r) { return r.userId; });
}

function _getColorsForEditors(historicalAuthorData) {
  var colorIdForAuthor = {};
  for (var author in historicalAuthorData) {
    var accountId = padusers.getAccountIdForProAuthor(author);
    colorIdForAuthor[accountId] = historicalAuthorData[author].colorId;
  }
  return colorIdForAuthor;
}

function accountIdsToNotifyTester (globalPadId, creatorId, guestPolicy) {
    return _accountIdsToNotify(globalPadId, creatorId, guestPolicy);
}

function _accountIdsToNotify(globalPadId, creatorId, guestPolicy) {
  var peopleWithAccess = [];

  if (guestPolicy == "link") {
    peopleWithAccess = pad_security.getInvitedUsers(globalPadId);
  } else {
    // people are only marked as having accessed if the pad is deny or friends
    // when they visit.  so it's *extremely* unreliable.
    // still it's unsafe to not check for it or we'll spam a ton of people -
    // especially in the "allow" case of public pads, but also for old school
    // "friends" pads.
    peopleWithAccess = pad_security.getInvitedUsersWhoAccessedPad(globalPadId);
  }

  peopleWithAccess.push(creatorId);

  // filter etherpad admin and/or null creator id
  peopleWithAccess = peopleWithAccess.filter(function(id) { return id; });

  // don't send mail to invitees who don't want mail by default
  var excludeList = {};
  pro_accounts.getAccountsByIds(peopleWithAccess).forEach(function(acct) {
    if (pro_accounts.getAccountDoesNotWantFollowEmail(acct)) {
      excludeList[acct.id] = true;
    }
  });
  peopleWithAccess = peopleWithAccess.filter(function(accountId){ return !excludeList[accountId] });

  var followerPrefs = getUserFollowPrefsForPad(globalPadId, peopleWithAccess);
  var authenticatedFollowers = peopleWithAccess.filter(function(accountId) {
    return (followerPrefs[accountId] == FOLLOW.DEFAULT ||
        followerPrefs[accountId] == FOLLOW.EVERY);
  });

  // add all the followers who have access because the pad isn't invite only
  if (guestPolicy != "deny") {
    authenticatedFollowers = authenticatedFollowers.concat(_getFollowers(globalPadId));
  }

  return uniqueNumbers(authenticatedFollowers);
}


function _sendEmailsAboutChanges(globalPadId, padTitle, htmlParts, accountIdsOfChangeAuthors, mentionedUserIds, accountIds, revNum, optNotifyEditors) {

  for (var i=0; i<accountIds.length; i++) {
    var accountId = accountIds[i];

    if (accountId == 0) {
      continue; // skip admin
    }
    var acct = pro_accounts.getAccountById(accountId, true/*opt_skipDeleted*/);
    if (!acct) { continue; } // account has been deleted?

    var isOwnChange = (accountIdsOfChangeAuthors.length==1 &&
        accountIdsOfChangeAuthors[0] == acct.id);
    if (isOwnChange && !optNotifyEditors) {
      continue;
    }

    // copy + generate unsubscribe link
    var htmlPartsForSending = htmlParts.slice(0);
    var localPadId = padutils.globalToLocalId(globalPadId);
    var sig = crypto.signRequest({accountId: pro_accounts.getEncryptedUserId(accountId), globalPadId: globalPadId});
    var unsubURL = utils.absoluteURL("/ep/pad/follow/" + localPadId, {accountId: pro_accounts.getEncryptedUserId(accountId), followPref: FOLLOW.NO_EMAIL, sig: sig}, _subdomainForPadId(globalPadId));
    var unsubText = "<p style=\"color:#888\">To stop receiving email about changes to this pad, <a href=\""+ unsubURL + "\">unsubscribe</a>.</p>";
    htmlPartsForSending.splice(htmlPartsForSending.length-1, 0, unsubText);

    var trackingId = email_tracking.trackEmailSent(acct.email, email_tracking.CHANGES, 1);

    // come up with email subject
    var subj = "hackpad: " + padTitle + " edited";
    _sendEmail(globalPadId, revNum, subj, acct, htmlPartsForSending, trackingId);
  }
}


function _sendEmailsAboutMentions(globalPadId, padTitle, htmlParts, changeAuthorIds, mentionedUserIds, revNum) {
  for (var i=0; i<mentionedUserIds.length; i++) {
    if (mentionedUserIds[i] == 0) { continue; }

    var acct = pro_accounts.getAccountById(mentionedUserIds[i], true/*opt_skipDeleted*/);
    if (!acct) { continue; } // account has been deleted?

    // todo: could imagine having the host actually be the person who mentioned you
    // as opposed to just a random change author
    pad_security.ensureUserHasAccessToPad(globalPadId, acct, changeAuthorIds[0]/*hostUserId*/);

    var trackingId = email_tracking.trackEmailSent(acct.email, email_tracking.MENTIONS, 1);

    var subject = "hackpad: you were mentioned in " + padTitle;
    _sendEmail(globalPadId, revNum, subject, acct, htmlParts, trackingId);

    var msg = "You were mentioned in " + padTitle;
    pro_apns.sendPushNotificationForPad(globalPadId, msg, mentionedUserIds[i], pro_apns.APNS_HP_T_MENTION);
  }
}

function _sendEmailsAboutMerge(globalPadId, subject, htmlParts, accountIds, revNum) {
  for (var i=0; i<accountIds.length; i++) {
    var acct = pro_accounts.getAccountById(accountIds[i], true/*opt_skipDeleted*/);
    if (!acct) { continue; } // account has been deleted?

    var htmlPartsForSending = htmlParts.slice(0); // copy

    var trackingId = email_tracking.trackEmailSent(acct.email, email_tracking.MERGE, 1);

    _sendEmail(globalPadId, revNum, subject, acct, htmlPartsForSending, trackingId);
  }
}

function _setLastSyndicatedRev (globalPadId, endRev) {
  sqlobj.update('PAD_SQLMETA', {id:globalPadId} ,{lastSyndicatedRev: endRev});
}

/*
Contexts in which we may want to send changes:
  EVERY change syndication context
    figures out all the followers who need an insta-email
    it also sends mention emails when this happens
  DAILY changes to a pad
    looks back on the last 24 hours of changes and sends
    them to those who are subscribed to the daily sigest
    ideally this should know on a per-user basis what
    the last change the use saw was
  DAILY changes to many pads
    probably just return the content and have the caller email
*/
function syndicateChangesToPad (row, optStartRev, optUpToDateCallback, optForceSyndicateToAll) {
  var startRev = optStartRev ||  row.lastSyndicatedRev + 1;
  var endRev = row.headRev;
  var globalPadId = row.id;
  var upToDateCallback = optUpToDateCallback || _setLastSyndicatedRev;

  // filled out with pad lock and used after to send emails
  var segments = [];
  var htmlParts = [];
  var padTitle = "";
  var accountIdsOfChangeAuthors = [];
  var mentionedUserIds = [];
  var accountIds = [];
  var sendEmails = false;
  var accountIdsToPushNotify = [];

  dmesg("Looking from:" + startRev + " to:" + endRev + " in " + globalPadId);

  log.custom("padevents", {type:"syndication", padId: globalPadId});

  model.accessPadGlobal(globalPadId, function(pad) {
    // hack: we don't syndicate wiki pads, so mark ourselves up to date
    if (pad.getIsWikiText()) {
      upToDateCallback(globalPadId, endRev);
      return;
    }

    // TODO: we don't syndicate forked pads, so mark ourselves up to date
    if (pad.getForkedFrom()) {
      upToDateCallback(globalPadId, endRev);
      return;
    }

    // load basic info about the pad
    var creatorId;
    var done = pro_padmeta.accessProPad(globalPadId, function(propad) {
      padTitle = propad.getDisplayTitle();
      creatorId = propad.getCreatorId();
      if (propad.isDeleted()) {
        upToDateCallback(globalPadId, endRev);
        return true;
      }
    });
    if (done) {
      return;
    }

    // figure out all the people we may want to notify
    accountIds = _accountIdsToNotify(globalPadId, creatorId, row.guestPolicy);
    accountIdsToPushNotify = accountIds;

    // a segment is [currentSegmentStartRev, currentSegmentEndRev,
    //                  currentSegmentAuthors, currentSegmentEndTime]
    segments = pad.getEditSegmentsForRange(startRev, endRev);
    if (!optForceSyndicateToAll) {
      segments = _filterTooRecentSegments(segments, accountIds.length);
    }

    if (segments.length) {
      // load historical authors
      var historicalAuthorData = collab_server.buildHistoricalAuthorDataMapFromAText(pad, pad.atext());
      var colorIdForAuthor = _getColorsForEditors(historicalAuthorData);

      try {
        htmlParts = _getHTMLForChanges(pad, padTitle, segments, colorIdForAuthor);
      } catch (ex) {
        // log and go on
        ex.message = "Exception thrown syndicating pad:" + globalPadId + " " + String(ex.message);
        log.logException(ex);
      }

      if (htmlParts && htmlParts.length) {
        // there will be -1's here for non-pro users
        var connectedUserInfos = collab_server.getConnectedUsers(pad);
        var connectedUserIds = connectedUserInfos.map(function(userInfo){
          return padusers.getAccountIdForProAuthor(userInfo.userId);
        });


        // we'll send a separate email to mentioned users
        mentionedUserIds = _getMentionedUsersForChanges(pad, segments);
        accountIdsToPushNotify = accountIds.filter(function (accountId) {
          // include only people who haven't been mentioned
          return mentionedUserIds.indexOf(accountId) < 0;
        });
        accountIds = accountIds.filter(function (accountId) {
          // include only people who haven't been mentioned
          // and are not connected
          return mentionedUserIds.indexOf(accountId) < 0 &&
              connectedUserIds.indexOf(accountId) < 0;
        });


        accountIdsOfChangeAuthors = _getProAuthorIdsForChanges(pad, segments);

        sendEmails = true;
      }
    }
  }, 'r');

  for (var i=0; i<accountIdsToPushNotify.length; i++) {
    // FIXME: Sends two apns edit notifications. One when this first runs but the segments are too new and one when the lastSyndicatedRev is actually updated.
    // Quiet edit notifications for now
    pro_apns.sendPushNotificationForPad(globalPadId, null, accountIdsToPushNotify[i], pro_apns.APNS_HP_T_EDIT);
  }

  if (sendEmails) {
    _sendEmailsAboutChanges(globalPadId, padTitle, htmlParts, accountIdsOfChangeAuthors, mentionedUserIds, accountIds, endRev, optForceSyndicateToAll);
    _sendEmailsAboutMentions(globalPadId, padTitle, htmlParts, accountIdsOfChangeAuthors, mentionedUserIds, endRev);
  }

  if (segments.length) {
    // the final endRev isn't the provided endRev, but the rev of the most recent segment
    // that we chose to syndicate (super recent segments may have gotten filtered)
    dmesg("syndicated to:" + segments[0][1]);
    upToDateCallback(globalPadId, + segments[0][1]);
  }
}

function _absoluteUrlByPadId(globalPadId, url) {
  var urlPrefix = appjet.config.useHttpsUrls ? "https://" : "http://";
  urlPrefix += _domainForPadId(globalPadId);
  return urlPrefix + (url ? url : "");
}

function sendMergeRequestEmail(pad, forkInfo, startRev, endRev) {
  // load basic info about the pad
  var padTitle;
  var creatorId;
  var globalPadId = padutils.getGlobalPadId(forkInfo.padId);
  //pad.getId();

  pro_padmeta.accessProPad(globalPadId, function(propad) {
    padTitle = propad.getDisplayTitle();
    creatorId = propad.getCreatorId();
  });

  // figure out all the people we may want to notify

  var accountIds = [creatorId];

  // a segment is [currentSegmentStartRev, currentSegmentEndRev,
  //                  currentSegmentAuthors, currentSegmentEndTime]
  var segments = pad.getEditSegmentsForRange(startRev, endRev);

  if (segments.length) {
    // load historical authors
    var historicalAuthorData = collab_server.buildHistoricalAuthorDataMapFromAText(pad, pad.atext());
    var colorIdForAuthor = _getColorsForEditors(historicalAuthorData);

    var localPadId = padutils.globalToLocalId(pad.getId());
    var approveUrl = _absoluteUrlByPadId(pad.getId(), "/ep/pad/merge?padId="+localPadId);
    var approveChangesHTML = "<a "+Math.random()+ " href='"+approveUrl+"'>Approve This Change</a><br/><br/>";
    var htmlParts = _getHTMLForChanges(pad, padTitle, segments, colorIdForAuthor, approveChangesHTML);
    if (htmlParts && htmlParts.length) {
      // come up with email subject
      var authors = [];
      for (var i=0; i<segments.length; i++) {
        var authorNums = segments[i][2];
        authors = authors.concat(authorNames(authorNums, colorIdForAuthor, false, _absoluteUrlByPadId(pad.getId())));
      }
      var byLine = authors.join(", ");
      var subject = "hackpad: " + padTitle + " change proposed by " + byLine;

      _sendEmailsAboutMerge(globalPadId, subject, htmlParts, accountIds, endRev);
    }
  }
}


function syndicateChanges() {
  var sql = "select id, lastSyndicatedRev, headRev, guestPolicy from PAD_SQLMETA where lastSyndicatedRev < headRev";
  var rows = sqlobj.executeRaw(sql, []);

  dmesg("Syndicating changes");
  for (var i=0; i<rows.length; i++) {

    var domainId = padutils.getDomainId(rows[i].id);
    if (!domains.domainIsOnThisServer(domainId) || !domains.getDomainRecord(domainId)) {
      continue;
    }

    try {
      syndicateChangesToPad(rows[i]);
    } catch (ex) {
      // log and go on
      ex.message = "Exception thrown syndicating pad:" + rows[i].id + " " + String(ex.message);
      log.logException(ex);
    }
  }
}

function _subdomainForPadId(padId) {
  var domainRecord = domains.getDomainRecord(padutils.getDomainId(padId));
  return domainRecord.orgName && domainRecord['subDomain'];
}

function _domainForPadId(padId) {
  var subdomain = _subdomainForPadId(padId);
  if (subdomain) {
    return subdomain + "." + appjet.config['etherpad.canonicalDomain'];
  }
  return appjet.config['etherpad.canonicalDomain'];
}

var TRACKING_ID_GUID = "290e79ef-7a5a-48d5-aa82-7ef0a8482112";
var TRACKING_ID_GUID_RE = new RegExp(TRACKING_ID_GUID, "g");

function _getHTMLForChanges(pad, padTitle, segments, colorIdForAuthor, opt_approveChangesHTML) {
  var htmlParts = [];
  var localPadId = padutils.globalToLocalId(pad.getId());
  var relativePadUrl = "/" + localPadId + '?eid=' + TRACKING_ID_GUID + "#" + encodeURIComponent(padTitle);
  var padUrl = _absoluteUrlByPadId(pad.getId(), relativePadUrl);
  var emailHeader;
  if (opt_approveChangesHTML) {
    htmlParts.push(opt_approveChangesHTML);
    emailHeader = "Change proposed to " + padTitle + " by ";
  } else {
    var configureNotificationsUrl = appjet.config.useHttpsUrls ? "https://" : "http://";
    configureNotificationsUrl += _domainForPadId(pad.getId());
    configureNotificationsUrl += "/ep/pad/follow/" + localPadId + "/";

    var padLinkHtml = "<a style=\"font-weight:bold; font-size: 18px;\" href=\"" + padUrl + "\">" + padTitle + "</a>";
    var padEmailSettingsHtml = "<a href='" + configureNotificationsUrl + "'>email settings</a>";
    emailHeader = padLinkHtml + " (" +padEmailSettingsHtml +") - edited by ";
  }

  var isTrivial = true;
  for (var i=0; i<segments.length; i++) {
    var diffHTML = getDiffHTML(pad, segments[i][0], segments[i][1], segments[i][2], colorIdForAuthor, false, emailHeader);
    if (diffHTML != '') {
      isTrivial = false;
      htmlParts.push(diffHTML);
    }
  }

  if (isTrivial) {
    // no nontrivial changes
    return null;
  }

  htmlParts.unshift("<html><body><style>.longkeep {display:none;}</style>");

  if (opt_approveChangesHTML) {
    htmlParts.push("<p style=\"color:#888\">To reject this change, just ignore this email</p>");
  } else {
    htmlParts.push("<p style=\"color:#888\">Reply to this email directly or edit it live on hackpad: <a href=\"" + padUrl + "\">" + padTitle + "</a></p>");
  }

  htmlParts.push("</body></html>");

  return htmlParts;

}

function _getProAuthorIdsForChange(pad, segment) {
  var proAuthorIds = [];
  if (!segment[2]) {
    return [];
  }
  for (var i=0; i<segment[2].length; i++) {
    var uid = segment[2][i];
    if (!uid || padusers.isGuest(uid)) {
      continue;
    }
    var accountNum = padusers.getAccountIdForProAuthor(uid);
    if (accountNum <= 0) {
      continue;
    }
    proAuthorIds.push(accountNum);
  }
  return proAuthorIds;
}

function _getProAuthorIdsForChanges(pad, segments) {
    var proAccountIdsOfChangeAuthorsDict = {};
  var proAccountIdsOfChangeAuthors = [];
  for (var i=0; i<segments.length; i++) {
    var authorIds = _getProAuthorIdsForChange(pad, segments[i]);
    for (var j=0; j<authorIds.length; j++) {
      proAccountIdsOfChangeAuthorsDict[authorIds[j]] = 1;
    }
  }
  for (var proAccountId in proAccountIdsOfChangeAuthorsDict) {
    proAccountIdsOfChangeAuthors.push(parseInt(proAccountId));
  }
  return proAccountIdsOfChangeAuthors;
}


function _getMentionedUsersForChanges(pad, segments) {
  var mentionedUserIds = [];

  for (var i=0; i<segments.length; i++) {
    var mentions = pad.getUsersNewlyMentionInRevisions(segments[i][0],  segments[i][1]);
    if (mentions) {
      mentionedUserIds = mentionedUserIds.concat(mentions);
    }
  }

  mentionedUserIds = mentionedUserIds.map(function(id) {
    try {
      return pro_accounts.getUserIdByEncryptedId(id);
    } catch (ex) {
      ex.message = "Failed to decrypt user id: " + id + " " + String(ex.message);
      log.logException(ex);
      return null;
    }
  }).filter(function(id) { return id != null; });

  return mentionedUserIds;
}


function _filterTooRecentSegments(segments, audienceSize) {
  // calculate the notification delay
  var MINUTES = 1000 * 60;
  var delayMinutes = Math.max(2, 2 * (audienceSize - 1));
  if (audienceSize > 20) {
    delayMinutes = 60;
  }
  dmesg("syndication delay is: " + delayMinutes);

  var now = new Date();
  var segmentsForSyndication = [];
  for (var j=0; j<segments.length; j++) {
    dmesg("looking at segment(" + segments[j][0] + "," + segments[j][1] +")");

    var segmentDate = new Date(segments[j][3]);
    // 10 minutes delay before we trigger a mail; kind of wierd since usually we consider segments to be 30 mins apart
    if ((now.getTime() - segmentDate.getTime()) > delayMinutes * MINUTES) {
      dmesg("segment is " + String(now.getTime() - segmentDate.getTime()) +"old");
      segmentsForSyndication = segments.slice(j);
      break;
    }
  }
  return segmentsForSyndication;
}

function _sendEmail(globalPadId, revNum, subj, acct, html, trackingId) {
    var localPadId = padutils.globalToLocalId(globalPadId);
    var fromAddr = pro_utils.getEmailFromAddr();
    var body = html.join("\n");

    // render the email with tracking ids filled out
    body = body.replace(TRACKING_ID_GUID_RE, trackingId || "")

    var inReplyToId = "<" + localPadId + "@" + _domainForPadId(globalPadId) + ">";
    var referencesId = "<" + localPadId + '+' + revNum + "@" + _domainForPadId(globalPadId) + ">";
    var headers = { "In-Reply-To": inReplyToId, "References": referencesId,
      "Content-Transfer-Encoding": "quoted-printable",
      "Content-Type": "text/plain; charset=\"utf-8\"" };

    try {
        dmesg("SENDING EMAIL TO" + acct.id);
        log.custom("changesemail", {userId: padusers.getUserIdForProUser(acct.id), toEmails: acct.email, padId: globalPadId});
        sendEmail(acct.email, fromAddr, subj, headers, body, "text/html; charset=utf-8");
        varz.incrementMetric("changes-mail-send-succeeded");
    } catch (ex) {
      varz.incrementMetric("changes-mail-send-failed");
      log.logException("Failed to send email to: " + acct.email + "(" + ex + ")");
    }
}


function authorNames(authorNums, colorIdForAuthor, asHTML, relativeUrlPrefix, pad) {
  var authors = [];
  for (var i=0; i<authorNums.length; i++) {
    if (authorNums[i]  && authorNums[i] != "") {

      var accountId = parseInt(authorNums[i].split(".")[1]);
      if (String(accountId) != String(authorNums[i]).split(".")[1]) {
        continue;
      }

      var authorName = getAuthorName(authorNums[i], pad);
      var userId = padusers.getAccountIdForProAuthor(authorNums[i]);
      // look up author color
      var colorId = colorIdForAuthor[userId];
      var color = globals.getPalette()[colorId % globals.getPalette().length];
      if (asHTML) {
        if (color) {
          authors.push("<span style='border-bottom: 2px dotted " + color + ";'><a href='"+ relativeUrlPrefix + pro_accounts.getUserLinkById(userId) + "' style='text-decoration: none;'>" + SPAN(authorName) + "</a></span>");
        } else {
          authors.push("<a href='"+ relativeUrlPrefix + pro_accounts.getUserLinkById(userId) + "'>" + SPAN(authorName) + "</a>");
        }
      } else {
        authors.push(authorName);
      }
    }
  }

  return authors;
}

function getDiffHTML(pad, revNum, revisionIdTo, authorNums, colorIdForAuthor, includeTimestamps, byLineHeader, includeDeletes, optDiffCs, optNotEmail, optIncludeRevertLink) {

  var diffAndAuthors = getDiffAndAuthorsHTML(pad, revNum, revisionIdTo, authorNums, colorIdForAuthor, includeDeletes, optDiffCs, optNotEmail);

  var authorHTMLParts = [];
  authorHTMLParts.push('<div class="author-diff-header">');
  var byLine = byLineHeader + diffAndAuthors.authorsHTML;
  if (includeTimestamps) {
    var revDate = helpers.prettyDate(pad.getRevisionDate(revNum));
    byLine += (" - " + revDate);
  }
  authorHTMLParts.push(byLine);
  if (optIncludeRevertLink) {
    var localPadId = padutils.globalToLocalId(pad.getId());
    authorHTMLParts.push(SPAN(" - "));

   if (optNotEmail) {
    // web
    authorHTMLParts.push(funhtml.FORM({action: '/ep/pad/'+localPadId+'/revert-to/'+revNum, method: 'POST',
        style: 'display: inline'},
                      helpers.xsrfTokenElement(),
                      funhtml.INPUT({type: 'submit', name:'submit', value:'Revert this' })));
   } else {
    // no revert links in email
    authorHTMLParts.push(A({ href:'/ep/pad/summary/' + encodeURIComponent(localPadId)}, 'View history'));
   }

  }
  authorHTMLParts.push('</div>\n');

  if (diffAndAuthors.diffHTML && diffAndAuthors.authorsHTML) {
    return authorHTMLParts.join('') + diffAndAuthors.diffHTML;
  } else {
    return '';
  }
}

/*
@returns {diffHTML:.., authorsHTML:}
*/
function getDiffAndAuthorsHTML(pad, revNum, revisionIdTo, authorNums, colorIdForAuthor,  includeDeletes, optDiffCs, optNotEmail, maxLines, optHideElipsis) {

  var relativeUrlPrefix = (appjet.config.useHttpsUrls ? "https://" : "http://") + _domainForPadId(pad.getId());

  // authors html
  var authorsHTMLParts = authorNames(authorNums, colorIdForAuthor, true/*asHTML*/, relativeUrlPrefix, pad);
  var authorsHTML = authorsHTMLParts.join(", ");

  // diff html
  var pieces = [];
  var atextAndPool = null;
  if (optDiffCs) {
    atextAndPool = pad.getDiffATextForChangeset(optDiffCs, revNum, includeDeletes);
  } else {
    atextAndPool = pad.getDiffATextForChangeRange(revNum, revisionIdTo, includeDeletes);
  }

  if (atextAndPool == null) {
    // There are no changes in this range
    return '';
  }
  var atext = atextAndPool[0];
  var apool = atextAndPool[1];

  var textlines = Changeset.splitTextLines(atext.text);
  var alines = Changeset.splitAttributionLines(atext.attribs,
                                               atext.text);

  function classToStyle (classes) {
    var classes = classes.split(" ");
    var styles = [];

    if (classes.indexOf("added") > -1) {
      // fa-author-p-1 / author-p-1 -> 1
      // if it's fa-author, don't add color
      if (classes[0].slice(0,2) == "fa") {
        //
      } else {
        var userId = linestylefilter.className2Author(classes[0]);
        if (!userId) {
          // No author for added line
          styles.push("color:#999"); // ignore for now
        } else {
          userId = padusers.getAccountIdForProAuthor(userId);
          // look up author color
          var colorId = colorIdForAuthor[userId];
          var color = globals.getPalette()[colorId % globals.getPalette().length];
          styles.push("border-bottom: 2px dotted " + color);
        }
      }
    } else if (classes.indexOf("removed") >= 0) {
      styles.push("color: #999");
      styles.push("text-decoration:line-through");
    } else {
      styles.push("color: #999");
    }

    //log.info("Classes are " + classes.join(" "));
    //log.info("Styles are " + styles.join(";"));

    return styles.length ? styles.join(";") : "";
  }

  var browser = optNotEmail ? "stream" : "email";
  var atStart = true;
  var i = 0;
  var lastSeenShortName = '';
  var lastSeenCommentShortName = '';
  for(;i<textlines.length && !(i==maxLines);i++) {
    var line = textlines[i];
    var aline = alines[i];
    var emptyLine = (line == '\n');
    var node = null;

    // handle tables in a special way for now
    var wholeLineStyle = "";
    if (line == "*\n") {
      node = renderStaticTable(aline, apool);
      if (node) {
        wholeLineStyle = _wholeLineStyleForNode(node, colorIdForAuthor);
      }
    }
    if (!node) {
      var domInfo = domline.createDomLine(! emptyLine, true, browser, null, relativeUrlPrefix, _convertEmbedToAnchor, null/*optMath*/, true/*for email*/);
      linestylefilter.populateDomLine(line, aline, apool, domInfo, colorIdForAuthor ? classToStyle : null);
      domInfo.prepareForAdd();
      wholeLineStyle = _wholeLineStyleForNode(domInfo.node, colorIdForAuthor);

      // hack: go back in and strip authorship colors that are overrulled by the line author color
      var color = _getLineAuthorColor(domInfo.node, colorIdForAuthor);
      if (color) {
        domInfo.node.innerHTML = domInfo.node.innerHTML.replace(new RegExp(color,"g"), "transparent");
      }

      node = domInfo.node;
    }

    if (browser == "email") {
      wholeLineStyle += "border-left-style: solid; border-left-width: 6px; padding-left: 20px; max-width:640px"
    }

    var isWhitespace = /^(&nbsp;)*$/.test(node.innerHTML);
    if (!isWhitespace || !atStart) {
      atStart = false;
      var style = wholeLineStyle ? " style='"+wholeLineStyle+"' " : "";

      // heuristically strip what we assume is a line-marker
      // todo: actually parse the aline/apool and check
      var lineForHash;
      if (line[0] == "*") {
        lineForHash = line.slice(1);
      } else {
        lineForHash = line;
      }
      var lineHash = (new java.lang.String(stringutils.trim(lineForHash))).hashCode();
      var localPadId = padutils.globalToLocalId(pad.getId());
      var lineUrl;
      if (browser == "email") {
        lineUrl = _absoluteUrlByPadId(pad.getId(), "/"+localPadId +'?src=email-line&eid='+ TRACKING_ID_GUID +"#:" + lineHash);
      } else {
        lineUrl = _absoluteUrlByPadId(pad.getId(), "/"+localPadId);
      }

      var authorName = _getLineAuthorName(pad, node) || '';
      var shortName = getShortNameFromFullName(authorName);
      var nameToShow = '';


      if (node.className.indexOf("allAdd") > -1) {
        if (shortName && shortName != lastSeenShortName) {
          nameToShow = shortName;
          lastSeenShortName = shortName;
        }
      }

      if (node.className.indexOf('line-list-type-comment') > -1) {
        if (shortName && shortName != lastSeenCommentShortName) {
          nameToShow = shortName;
          lastSeenCommentShortName = shortName;
        }
      }

      pieces.push('<div '+ style + ' class="', node.className, '">');
      var userId = _getLineUserId(pad, node);
      if (userId && browser != 'email' && nameToShow) {
        accountId = padusers.getAccountIdForProAuthor(userId);
        var color = _getLineAuthorColor(domInfo.node, colorIdForAuthor);
        var colorStyle = color ? 'color:' + color : '';
        pieces.push('<a style="' + colorStyle + '" href="' + pro_accounts.getUserLinkById(accountId) +
            '" class="ace-line-author" style="display: none;">' + SPAN(nameToShow) + '</a>');
      }
      if (browser == "email") {
        pieces.push('<a style="border-bottom:none; color: #000001; text-decoration:none;" href="'+lineUrl+'">',
          node.innerHTML, '</a>');
      } else {
        pieces.push(node.innerHTML);
      }
      pieces.push('</div>\n');
    }
  }

  if (i == maxLines && !optHideElipsis) {
    pieces.push('<div class="ace-line gutter-noauthor">...</div>');
  }

  return {diffHTML: pieces.join(''), authorsHTML:authorsHTML};
}

function _getLineAuthorColor(node, colorIdForAuthor) {
  var classes = node.className.split(" ");
  for (var i=0; i<classes.length; i++) {
    // fa-author-p-1 / author-p-1 -> p.1
    var userId = linestylefilter.className2Author(classes[i]);
    if (userId) {
      var accountId = padusers.getAccountIdForProAuthor(userId);
      var colorId = colorIdForAuthor[accountId];
      var color = globals.getPalette()[colorId % globals.getPalette().length];
      if (color) {
        return color;
      }
      return null;
    }
  }
  return null;
}

function _getLineUserId(pad, node) {
  var classes = node.className.split(" ");
  for (var i = 0; i < classes.length; i++) {
    // fa-author-p-1 / author-p-1 -> p.1
    var userId = linestylefilter.className2Author(classes[i]);
    if (userId) {
      return userId;
    }
  }
  return null;
}

function _getLineAuthorName(pad, node) {
  var userId = _getLineUserId(pad, node);
  if (userId) {
    return getAuthorName(userId, pad);
  }
  return null;
}

function getAuthorName(authorNum, pad) {
  var authorName;
  if (pad) {
    var authorInfo = pad.getAuthorData(authorNum);
    if (authorInfo) {
      authorName = authorInfo.name;
    } else {
      log.warn("Cannot find author data for author " + authorNum + " in pad " + pad.getId());
      authorName = null;
    }
  }
  if (!authorName) {
    authorName = padusers.getNameForUserId(authorNum);
  }
  return authorName || "";
}

function getShortNameFromFullName(fullName) {
  if (fullName) {
    var authorInitials = fullName.split(' ');
    return authorInitials.length == 1 ? authorInitials[0] :
        authorInitials[0] + ' ' + authorInitials[authorInitials.length - 1][0];
  }

  return '';
}

function _wholeLineStyleForNode(node, colorIdForAuthor) {
  var color = _getLineAuthorColor(node, colorIdForAuthor);

  if (color && node.className.indexOf("allAdd") > -1) {
    return "border-left-color:" + color + ";";
  } else {
    return "border-left-color: white;";
  }
}


function _convertEmbedToAnchor(src) {
  return '<a href="' + src + '" class="embed">' + src + '</a>';
}

serverhandlers.tasks.changeSyndicationTask = function() {
  try {
    syndicateChanges();
  } finally {
    execution.scheduleTask('changes', "changeSyndicationTask", 2*60*1000, []);
  }
}

function onStartup() {
  if (appjet.config['etherpad.syndicateChanges'] == "true") {
    execution.initTaskThreadPool("changes", 1);
    execution.scheduleTask('changes', "changeSyndicationTask", 60*1000, []);
  } else {
    dmesg("Not syndicating pad changes.");
  }
}
