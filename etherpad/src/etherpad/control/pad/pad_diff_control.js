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
import("etherpad.globals");
import("fastJSON");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.collab.ace.linestylefilter.linestylefilter");
import("etherpad.collab.ace.domline.domline");

//----------------------------------------------------------------
// view (viewing a static revision of a pad)
//
//
//
//
//----------------------------------------------------------------

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
  var revisionId = parts[5];
  var revisionIdTo = parts[6];

  var padContents, totalRevs, atextForWire, savedRevisions;
  var supportsSlider;
  padutils.accessPadLocal(localPadId, function(pad) {
    padContents = [_getPadHTML(pad, parseInt(revisionId), parseInt(revisionIdTo))];
    totalRevs = pad.getHeadRevisionNumber();
    atextForWire = getATextForWire(pad, revisionId);
    savedRevisions = revisions.getRevisionList(pad);
    supportsSlider = pad.getSupportsTimeSlider();
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

  var padHTML = padContents[0];
  var padText = "";//padContents[1];

  helpers.addClientVars({
    viewId: viewId,
    initialPadContents: padText,
    revNum: revisionId,
    totalRevs: totalRevs,
    initialStyledContents: atextForWire,
    currentTime: "rev.timestamp",
    sliderEnabled: (!appjet.cache.killSlider) && request.params.slider != 0,
    supportsSlider: supportsSlider,
    colorPalette: globals.getPalette(),
    padIdForUrl: readOnlyIdOrLocalPadId,
    fullWidth: request.params.fullScreen == 1,
    disableRightBar: request.params.sidebar == 0,
    fromRev: revisionId,
    toRev: revisionIdTo,      
    maxRev: totalRevs+1,      
  });

  var userId = padusers.getUserId();
  var isPro = isProDomainRequest();
  var isProUser = (isPro && ! padusers.isGuest(userId));

  var bodyClass = ["limwidth",
                   (isPro ? "propad" : "nonpropad"),
                   (isProUser ? "prouser" : "nonprouser")].join(" ");

  renderHtml("pad/paddiff_body.ejs", {
    bodyClass: bodyClass,
    isPro: isPro,
    isProAccountHolder: isProUser,
    account: pro_accounts.getSessionProAccount(),
    signinUrl: '/ep/account/sign-in?cont='+
      encodeURIComponent(request.url),
    padId: readOnlyIdOrLocalPadId,
    padTitle: documentBarTitle,
    rlabel: "rev.label",
    padHTML: padHTML,
    padText: padText,
    savedBy: "rev.savedBy",
    savedIp: "rev.ip",
    savedWhen: "rev.timestamp",
    toHTML: toHTML,
    revisionId: revisionId,
    readOnly: isReadOnly,
    roPadId: roPadId,
    hasOffice: hasOffice()
  });


  return true;
}

function getRevisionInfo(localPadId, revisionId) {
  var rev = padutils.accessPadLocal(localPadId, function(pad) {
    if (!pad.exists()) {
      return null;
    }
    var r;
    if (revisionId == "latest" || true) {
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

function _getPadHTML(pad, revNum, revisionIdTo) {
//  var atext = pad.getInternalRevisionAText(revNum);

  var atextAndPool = pad.getDiffATextForChangeRange(revNum, revisionIdTo);
  var atext = atextAndPool[0];
  var apool = atextAndPool[1];
  var textlines = Changeset.splitTextLines(atext.text);
  var alines = Changeset.splitAttributionLines(atext.attribs,
                                               atext.text);

  var pieces = [];
  for(var i=0;i<textlines.length;i++) {
    var line = textlines[i];
    var aline = alines[i];
    var emptyLine = (line == '\n');
    var domInfo = domline.createDomLine(! emptyLine, true);
    linestylefilter.populateDomLine(line, aline, apool, domInfo);
    domInfo.prepareForAdd();
    var node = domInfo.node;
    pieces.push('<div class="', node.className, '">',
                node.innerHTML, '</div>\n');
  }
  return pieces.join('');
}
