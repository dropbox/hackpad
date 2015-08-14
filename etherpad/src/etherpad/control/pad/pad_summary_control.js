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

import("etherpad.helpers");
import("etherpad.pad.model");
import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.exporthtml");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_padmeta");
import("etherpad.utils.*");
import("etherpad.pad.revisions");
import("stringutils.toHTML");
import("etherpad.collab.server_utils.*");
import("etherpad.collab.collab_server.buildHistoricalAuthorDataMapForPadHistory");
import("etherpad.collab.collab_server.getATextForWire");
import("etherpad.control.pad.pad_changeset_control.getChangesetInfo");
import("etherpad.control.pad.pad_render_control.renderPadWithTemplate");
import("etherpad.globals");
import("fastJSON");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.collab.ace.linestylefilter.linestylefilter");
import("etherpad.collab.ace.domline.domline");
import("etherpad.changes.changes.getDiffHTML");
import("etherpad.log");
//----------------------------------------------------------------
// view (viewing a static revision of a pad)
//
// goal: look at all revisions by date.  group tog
//
//
//
//----------------------------------------------------------------

function _getColorsForEditors(historicalAuthorData) {
  var colorIdForAuthor = {};
  for (var author in historicalAuthorData) {
    var accountId = padusers.getAccountIdForProAuthor(author);
    colorIdForAuthor[accountId] = historicalAuthorData[author].colorId;
  }
  return colorIdForAuthor;
}

function onRequest() {
  var parts = request.path.split('/');
  // TODO: create a mapping between padId and read-only id
  var readOnlyIdOrLocalPadId = parts[4];
  var parseResult = parseUrlId(readOnlyIdOrLocalPadId);
  var isReadOnly = parseResult.isReadOnly;
  var viewId = parseResult.viewId;
  var localPadId = parseResult.localPadId;
  var globalPadId = parseResult.globalPadId;
  var roPadId = parseResult.roPadId;

  var show = Number(request.params.show) || 20;

  var padDiffs = [];
  var totalRevs;
  var earliestRev;

  var historicalAuthorData = padutils.accessPadLocal(localPadId, function(pad) {
    return buildHistoricalAuthorDataMapForPadHistory(pad);
  }, 'r');
  var colorIdForAuthor = _getColorsForEditors(historicalAuthorData);

  padutils.accessPadLocal(localPadId, function(pad) {
    totalRevs = pad.getHeadRevisionNumber();

    // 1. get segments
    var segments = pad.getMostRecentEditSegments(show);

    var includeRevertLink = pro_accounts.getSessionProAccount().isAdmin;
    pro_padmeta.accessProPadLocal(localPadId, function(propad) {
      includeRevertLink = includeRevertLink || pro_accounts.getSessionProAccount().id == propad.getCreatorId();
    });

    // how do i collapse similar areas?  prolly just in the generator
    for (var i=0; i<segments.length; i++) {
      padDiffs.push(getDiffHTML(pad, segments[i][0], segments[i][1], segments[i][2], colorIdForAuthor, true/*timestamps*/, "Edited by ", true/*includeDeletes*/, segments[i][4], true/*optNoEmail*/, includeRevertLink));
      earliestRev = segments[i][0];
    }
  }, 'r');

  var proTitle = null;
  var initialPassword = null;
  if (isProDomainRequest()) {
    pro_padmeta.accessProPadLocal(localPadId, function(propad) {
      proTitle = propad.getDisplayTitle();
      initialPassword = propad.getPassword();
    });
  }
  var documentBarTitle = (proTitle || "Public Pad");

  helpers.addClientVars({
    viewId: viewId,
    colorPalette: globals.getPalette(),
    totalRevs: totalRevs,
    padIdForUrl: readOnlyIdOrLocalPadId,
    maxRev: totalRevs+1,
    minRev: earliestRev,
    show: show,
    historicalAuthorData: historicalAuthorData,
  });

  var userId = padusers.getUserId();
  var isPro = isProDomainRequest();
  var isProUser = (isPro && ! padusers.isGuest(userId));

  var bodyClass = ["limwidth", "sitebar", "pro-body"].join(" ");

  renderPadWithTemplate(readOnlyIdOrLocalPadId, "pad/padsummary_body.ejs", {
    bodyClass: bodyClass,
    isPro: isPro,
    isProAccountHolder: isProUser,
    account: pro_accounts.getSessionProAccount(),
    signinUrl: '/ep/account/sign-in?cont='+
      encodeURIComponent(request.url),
    padId: readOnlyIdOrLocalPadId,
    padTitle: documentBarTitle,
    padDiffs: padDiffs,
    toHTML: toHTML,
  });


  return true;
}

function getRevisionInfo(localPadId, revisionId) {
  var rev = padutils.accessPadLocal(localPadId, function(pad) {
    if (!pad.exists()) {
      return null;
    }
    var r;
    if (revisionId == "latest") {
      // a "fake" revision for HEAD
      var headRevNum = pad.getHeadRevisionNumber();

      r = {
        revNum: headRevNum,
        label: "Latest text of pad "+localPadId,
        savedBy: null,
        savedIp: null,
        timestamp: +pad.getRevisionDate(headRevNum)
      };
    } else if (revisionId == "autorecover") {
      var revNum = _findLastGoodRevisionInPad(pad);
      r = {
        revNum: revNum,
        label: "Auto-recovered text of pad "+localPadId,
        savedBy: null,
        savedIp: null,
        timestamp: +pad.getRevisionDate(revNum)
      };
    } else if(revisionId.indexOf("rev.") === 0) {
      var revNum = parseInt(revisionId.split(".")[1]);
      var latest = pad.getHeadRevisionNumber();
      if(revNum > latest)
        revNum = latest;
      r = {
        revNum: revNum,
        label: "Version " + revNum,
        savedBy: null,
        savedIp: null,
        timestamp: +pad.getRevisionDate(revNum)
      }

    } else {
      r = revisions.getStoredRevision(pad, revisionId);
    }
    if (!r) {
      return null;
    }
    return r;
  }, "r");
  return rev;
}

function _findLastGoodRevisionInPad(pad) {
  var revNum = pad.getHeadRevisionNumber();
  function valueOrNullOnError(f) {
    try { return f(); } catch (e) { return null; }
  }
  function isAcceptable(strOrNull) {
    return (strOrNull && strOrNull.length > 20);
  }
  while (revNum > 0 &&
         ! isAcceptable(valueOrNullOnError(function() { return pad.getRevisionText(revNum); }))) {
    revNum--;
  }
  return revNum;
}


