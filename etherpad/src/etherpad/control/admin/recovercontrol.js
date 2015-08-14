import("fastJSON");
import("dispatch.{Dispatcher,PrefixMatcher,DirMatcher,forward}");
import("sqlbase.sqlobj");

import("etherpad.control.pad.pad_control");
import("etherpad.collab.ace.easysync2.{Changeset,AttribPool}");
import("etherpad.collab.collab_server");
import("etherpad.changes.changes");
import("etherpad.helpers");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pad.model");
import("etherpad.pad.dbwriter");
import("etherpad.utils")
import("etherpad.utils.randomUniquePadId");
import("etherpad.log")
import("netutils.urlGet")
import("funhtml");
import("funhtml.*");

function render_analyze_get() {
  return analyzeAndMaybeRecover(request.params.globalPadId, false/*recover*/);
}

function render_recover_post() {
  return analyzeAndMaybeRecover(request.params.globalPadId, true/*recover*/);
}

function analyzeAndMaybeRecover(globalPadId, apply) {

  var content = "";
  var assem = Changeset.smartOpAssembler();
  var atext = null;
  var title = "";
  model.accessPadGlobal(globalPadId, function(pad) {
    // traverse the attribs.  when finding something that doesn't add up
    try {
      atext = pad.atext();
    } catch(e) {
      content += ("Using recovered atext.<br/>");
      atext = pad.getRecoveredAText();
    }
    var newText = "";

    var iter = Changeset.opIterator(atext.attribs);
    var charIter = Changeset.stringIterator(atext.text);
    while (iter.hasNext()) {
      var op = iter.next();
      var newOp = Changeset.newOp();
      Changeset.copyOp(op, newOp);

      var chars = "";
      if (charIter.remaining() >= op.chars) {
        chars = charIter.take(op.chars);
      } else {
        chars = charIter.take(charIter.remaining());
        for (var i=chars.length; i<op.chars; i++) {
          chars += "?";
        }
      }
      var newlines = chars.split("\n").length-1;
      newOp.lines = newlines;
      if (op.lines != newlines) {
        content += ("fixed newline count<br/>");
      }

      if ((newOp.lines || newlines ) && (chars.charAt(chars.length-1) != "\n")) {
        chars = chars + "\n";
        newOp.chars++;
        newOp.lines++;
        content += ("fixed op terminal newline<br/>");
      }
      newOp.opcode = "+";
      newText += chars;
      assem.append(newOp);
    }

    // Rescue any final text if our attribs are mis-aligned
    if (charIter.remaining()) {
      var newOp = Changeset.newOp();
      chars = charIter.take(charIter.remaining());
      if (chars.charAt(chars.length-1) != "\n") {
        chars = chars + "\n";
      }
      newOp.opcode = "+";
      newOp.lines = chars.split("\n").length-1;
      newOp.chars = chars.length;
      newText += chars;
      assem.append(newOp);
    }


    assem.endDocument();
    var newAttribs = assem.toString();
    atext.attribs = newAttribs;
    atext.text = newText;

    content += ("<br/>");
    content += (helpers.escapeHtml(atext.text).replace(/\n/g,"<br\/>"));
    content += (helpers.escapeHtml(atext.attribs));

    if (apply) {
      content += "<br/><br/>Recovered!";
      //atext = pad.getRecoveredAText();
      model.rollbackToRevNum(globalPadId, 0);
      // flush the model cache
      model.flushModelCacheForPad(globalPadId, 10000);

    }
  });

  if (apply) {
    var headRev = null;
    var refresh = false;
    model.accessPadGlobal(globalPadId, function(pad) {
      collab_server.setPadAText(pad, atext, pad.pool());
      headRev = pad.getHeadRevisionNumber();
      refresh = collab_server.getConnectedUsers(pad).length;
    });

    var title = "";
    pro_padmeta.accessProPad(globalPadId, function(propad) {
      title = propad.getDisplayTitle();
    });
    var domainId = padutils.getDomainId(globalPadId);
    var domainRecord = domains.getDomainRecord(domainId);
    var subDomain = domainRecord.orgName != null ? domainRecord.subDomain : "";
    sqlobj.update('PAD_SQLMETA', {id:globalPadId}, {lastSyndicatedRev: headRev});

    var padUrl = utils.absolutePadURL(padutils.globalToLocalId(globalPadId),
        {}, subDomain, title);

    if (refresh) {
      collab_server.broadcastServerMessage({
        type: 'RELOAD',
        padUrl: padUrl
      }, globalPadId);
    }
  }

  content += BR();
  content += BR();

  content += funhtml.FORM({action: '/ep/admin/recover/recover', method: 'POST'},
      helpers.xsrfTokenElement(),
      funhtml.INPUT({type: 'hidden', name:'globalPadId', value:globalPadId}),
      funhtml.INPUT({type: 'submit', name:'submit', value:'Recover'}));


  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Analyze',
    content: content
   });

  return true;
}
import("execution");
import("funhtml.*");
import("etherpad.utils.renderHtml");

function render_pad_checker_get() {
  var status = DIV(SPAN("Pads checked: "), SPAN(appjet.cache.padsChecked));
  var start = A({'href': '/admin/recover/start-checker', 'style': 'padding:10px;'}, 'start');
  var stop = A({'href': '/admin/recover/stop-checker', 'style': 'padding:10px;'}, 'stop');
  var body = DIV({'style': 'padding-left:148px'}, status, start, stop);

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Send Email',
    content: body
   });

  return true;
}

function onStartup() {
  appjet.cache.padsChecked = 0;
  execution.initTaskThreadPool("recoverer", 1);
}

function render_start_checker_both () {
  appjet.cache.padsChecked = 0;
  execution.scheduleTask('recoverer', 'checkNextBatch', 0,
    [parseInt(request.params.start || 0), parseInt(request.params.count || 100)]);
  response.redirect('/admin/recover/pad-checker');
}

function render_stop_checker_both () {
  appjet.cache.padsChecked = -1;
  response.redirect('/admin/recover/pad-checker');
}

serverhandlers.tasks.checkNextBatch = function (firstPadId, count) {
  if (appjet.cache.padsChecked == -1) {
    return;
  }

  _check_pads(firstPadId, count);

  // Have we been asked to stop?
  if (appjet.cache.padsChecked == -1) {
    return;
  }

  appjet.cache.padsChecked += count;
  execution.scheduleTask('recoverer', 'checkNextBatch', 1000, [firstPadId+count, count]);
}

function _check_pads(firstPadId, count) {
  // re-index count pads and schedule the next batch
  var rows = sqlobj.selectMulti('pro_padmeta', {id: ['between', [firstPadId, firstPadId+count-1]], isDeleted: false, isArchived: false});

  if (!rows.length) {
    return;
  }

  for (var i=0; i<rows.length; i++) {
    if (!domains.domainIsOnThisServer(rows[i].domainId)) {
      continue;
    }

    var globalPadId = padutils.makeGlobalId(rows[i].domainId, rows[i].localPadId);
    var result = _check_pad(globalPadId);
    if ((typeof result) === "string") {
      log.custom('recover', globalPadId + ": " +result);
    }
  }

}

function render_fix_authors_post(domainId, localPadId) {
  model.accessPadGlobal(padutils.getGlobalPadId(localPadId, domainId), function(pad) {
    var missingAuthorsList = [];
    pad.eachATextAuthor(pad.atext(), function (author) {
      if (!pad.getAuthorData(author)) {
        missingAuthorsList.push(author);
      }
    });
    response.write("Fixing author info for authors: " + JSON.stringify(missingAuthorsList));
    pad_control.setMissingAuthorDatas(pad, missingAuthorsList);
  });

  return true;
}

function _check_pad(globalPadId) {
  var head = -1;

  return model.accessPadGlobal(globalPadId, function(pad) {
    if (collab_server.getNumConnections(pad) > 0) {
      // don't mess with active pads.
      return null;
    }

    if (!pad._meta) {
      return "no meta";
    }

    head = pad._meta.head;

    // traverse the attribs.  when finding something that doesn't match the reality
    try {
      atext = pad.atext();
    } catch(e) {
      return "no atext";
    }

    try {
      var replayAText = pad.getReconstructedAText();
      if (replayAText) {
        if (replayAText.text != atext.text ||
            replayAText.attribs != atext.attribs) {
          return "atext doesn't match up";
        }
      }
    } catch(e) {
      return "atext replaying failed";
    }

    // look for invalid sequences in the atext

    var atextCheckResult = _check_atext(pad.atext());
    if (atextCheckResult) {
      return atextCheckResult;
    }

    // check the segment cache against the head rev
    try {
      var segments = pad.getMostRecentEditSegments(1);
    } catch (e) {
      return "failure getting segments";
    }
    if (segments && segments.length) {
      var segment = segments[0];
      var endRev = segment[1];
      if (endRev > head) {
        return "segment exists ahead of head rev"
      }
    }

    // flush the pad if it's freshly loaded
    if (!pad._meta.status.lastAccess) {
      try {
        dbwriter.writePadNow(pad, true/*and flush*/);
        model.flushModelCacheForPad(globalPadId, pad.getHeadRevisionNumber());
      } catch(e) {
        return "write failed";
      }
    }

    return null;
  }, 'r');

}

function _check_atext(atext) {
  var logMessage = null;

  var iter = Changeset.opIterator(atext.attribs);
  var charIter = Changeset.stringIterator(atext.text);

  while (iter.hasNext()) {
    var op = iter.next();
    var newOp = Changeset.newOp();
    Changeset.copyOp(op, newOp);

    var chars = "";
    if (charIter.remaining() >= op.chars) {
      chars = charIter.take(op.chars);
    } else {
      chars = charIter.take(charIter.remaining());
      for (var i=chars.length; i<op.chars; i++) {
        chars += "?";
      }
    }
    var newlines = chars.split("\n").length-1;
    newOp.lines = newlines;
    if (op.lines != newlines) {
      logMessage = (logMessage || "") + "bad newline count<br/>";
    }

    if ((newOp.lines || newlines ) && (chars.charAt(chars.length-1) != "\n")) {
      chars = chars + "\n";
      newOp.chars++;
      newOp.lines++;
      logMessage = (logMessage || "") + "missing terminal newline<br/>";
    }
    newOp.opcode = "+";
  }

  return logMessage;
}


