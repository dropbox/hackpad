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
import("etherpad.importexport.table.renderStaticTable");

//----------------------------------------------------------------
// view (viewing a static revision of a pad)
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

  var rev = getRevisionInfo(localPadId, revisionId);
  if (! rev) {
    return false;
  }

  if (request.params.pt == 1) {
    var padText = padutils.accessPadLocal(localPadId, function(pad) {
      return pad.getRevisionText(rev.revNum);
    }, 'r');

    response.setContentType('text/plain; charset=utf-8');
    response.write(padText);
  } else {
    var padContents, totalRevs, atextForWire, savedRevisions;
    var supportsSlider;
    padutils.accessPadLocal(localPadId, function(pad) {
      padContents = [_getPadHTML(pad, rev.revNum),
                     pad.getRevisionText(rev.revNum)];
      totalRevs = pad.getHeadRevisionNumber();
      atextForWire = getATextForWire(pad, rev.revNum);
      savedRevisions = revisions.getRevisionList(pad);
      supportsSlider = pad.getSupportsTimeSlider();
    }, 'r');

    var _add = function(dict, anotherdict) {
      for(var key in anotherdict) {
        dict[key] = anotherdict[key];
      }
      return dict;
    }

    var getAdaptiveChangesetsArray = function(array, start, granularity) {
      array = array || [];
      start = start || 0;
      granularity = granularity || 1000;
      var changeset = _add(getChangesetInfo(localPadId, start, totalRevs+1, granularity), {
        start: start,
        granularity: Math.floor(granularity)
      });
      array.push(changeset);
      if(changeset.actualEndNum != totalRevs+1 && granularity > 1)
        getAdaptiveChangesetsArray(array, changeset.actualEndNum, Math.floor(granularity / 10));
      return array;
    }
    var initialChangesets = [];
    if (supportsSlider) {
      initialChangesets = getAdaptiveChangesetsArray(
        [
          _add(getChangesetInfo(localPadId, Math.floor(rev.revNum / 1000)*1000, Math.floor(rev.revNum / 1000)*1000+1000, 100), {
            start: Math.floor(rev.revNum / 1000)*1000,
            granularity: 100
          }),
          _add(getChangesetInfo(localPadId, Math.floor(rev.revNum / 100)*100, Math.floor(rev.revNum / 100)*100+100, 10), {
            start: Math.floor(rev.revNum / 100)*100,
            granularity: 10
          }),
          _add(getChangesetInfo(localPadId, Math.floor(rev.revNum / 10)*10, Math.floor(rev.revNum / 10)*10+10, 1), {
            start: Math.floor(rev.revNum / 10)*10,
            granularity: 1
          })]
      );
    }

    var zpad = function(str, length) {
      str = str+"";
      while(str.length < length)
        str = '0'+str;
      return str;
    };
    var dateFormat = function(savedWhen) {
      var date = new Date(savedWhen);
      var month = zpad(date.getMonth()+1,2);
      var day = zpad(date.getDate(),2);
      var year = (date.getFullYear());
      var hours = zpad(date.getHours(),2);
      var minutes = zpad(date.getMinutes(),2);
      var seconds = zpad(date.getSeconds(),2);
      return ([month,'/',day,'/',year,' ',hours,':',minutes,':',seconds].join(""));
    };

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
    var padText = padContents[1];

    var historicalAuthorData = padutils.accessPadLocal(localPadId, function(pad) {
      return buildHistoricalAuthorDataMapForPadHistory(pad);
    }, 'r');

    helpers.addClientVars({
      viewId: viewId,
      initialPadContents: padText,
      revNum: rev.revNum,
      totalRevs: totalRevs,
      initialChangesets: initialChangesets,
      initialStyledContents: atextForWire,
      savedRevisions: savedRevisions,
      currentTime: rev.timestamp,
      sliderEnabled: (!appjet.cache.killSlider) && request.params.slider != 0,
      supportsSlider: supportsSlider,
      historicalAuthorData: historicalAuthorData,
      colorPalette: globals.getPalette(),
      padIdForUrl: readOnlyIdOrLocalPadId,
      fullWidth: request.params.fullScreen == 1,
      disableRightBar: request.params.sidebar == 0,
    });

    var userId = padusers.getUserId();
    var isPro = isProDomainRequest();
    var isProUser = (isPro && ! padusers.isGuest(userId));

    var bodyClass = ["limwidth",
                     (isPro ? "propad" : "nonpropad"),
                     (isProUser ? "prouser" : "nonprouser")].join(" ");

    renderHtml("pad/padview_body.ejs", {
      bodyClass: bodyClass,
      isPro: isPro,
      isProAccountHolder: isProUser,
      account: pro_accounts.getSessionProAccount(),
      signinUrl: '/ep/account/sign-in?cont='+
        encodeURIComponent(request.url),
      padId: readOnlyIdOrLocalPadId,
      padTitle: documentBarTitle,
      rlabel: rev.label,
      padHTML: padHTML,
      padText: padText,
      savedBy: rev.savedBy,
      savedIp: rev.ip,
      savedWhen: rev.timestamp,
      toHTML: toHTML,
      revisionId: revisionId,
      dateFormat: dateFormat(rev.timestamp),
      readOnly: isReadOnly,
      roPadId: roPadId,
      hasOffice: hasOffice()
    });
  }

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
import ("etherpad.changes.changes");

function _getPadHTML(pad, revNum, optStopAtFirstEmptyLine, optSkipTitleLine, maxNumLines) {
  var atext = pad.getInternalRevisionAText(revNum);
  var textlines = Changeset.splitTextLines(atext.text);
  var alines = Changeset.splitAttributionLines(atext.attribs,
                                               atext.text);

  var pieces = [];
  var apool = pad.pool();
  for(var i=0;i<textlines.length;i++) {
    var line = textlines[i];
    var aline = alines[i];
    var emptyLine = (line == '\n');
    var node = null;

    if (optSkipTitleLine && i == 0) {
      continue;
    }
    if(maxNumLines && pieces.length >= maxNumLines) {
      break;
    }

    if (optStopAtFirstEmptyLine && emptyLine) {
      if (pieces.length) {
        break;
      } else {
        continue;
      }
    }

    if (line == "*\n") {
      node = renderStaticTable(aline, apool);
    }
    if (!node) {
      var domInfo = domline.createDomLine(! emptyLine, true);
      linestylefilter.populateDomLine(line, aline, apool, domInfo);
      domInfo.prepareForAdd();
      node = domInfo.node;
    }
    pieces.push('<div class="'+node.className+'">'+node.innerHTML+ '</div>\n');
  }
  return pieces.join('');
}

function getPadHTML(pad, revNum) {
  return _getPadHTML(pad, revNum);
}

function getPadSummaryHTML(pad) {
  return _getPadHTML(pad, pad.getHeadRevisionNumber(), true, true);
}

function getPadFirstNLinesHTML(pad, nLines, optStopAtFirstEmptyLine) {
  if (typeof(optStopAtFirstEmptyLine) == "undefined") {
    optStopAtFirstEmptyLine = true;
  }
  return _getPadHTML(pad, pad.getHeadRevisionNumber(), optStopAtFirstEmptyLine, true, nLines);
}
