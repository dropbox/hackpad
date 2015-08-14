
import("email.sendEmail");
import("execution");
import("sqlbase.sqlobj");
import("stringutils.{startsWith,endsWith,trim}");

import("etherpad.debug.dmesg");
import("etherpad.globals.isProduction");
import("etherpad.log");
import("etherpad.collab.collab_server");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.control.pad.pad_control");
import("etherpad.pad.pad_access");
import("etherpad.pad.padevents");
import("etherpad.pad.model.accessPadGlobal");
import("etherpad.pad.padutils.{makeGlobalId,globalToLocalId}");
import("etherpad.pad.padusers");
import("etherpad.pad.padusers.getUserIdForProUser");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_invite");

import("etherpad.pro.pro_padmeta.accessProPad");
import("etherpad.pro.pro_utils");
import("etherpad.utils.{randomUniquePadId,renderTemplateAsString}");

jimport('java.lang.System');
jimport("javax.mail.Session");
jimport("javax.mail.Folder");
jimport("javax.mail.Flags");
jimport("javax.mail.Flags.Flag");
jimport("javax.mail.search.FlagTerm");
jimport("javax.mail.FolderClosedException");

var IMAP_STORE = null;

function _insertResponseText(globalPadId, revNum, userId, userName, text, newParagraph) {
  log.custom("inbox", "Email append to globalPadId: " + globalPadId + " at revNum:" + revNum);
  dmesg("Appending email text:" + text);

  // Make the appended text a new paragraph
  if (newParagraph) {
    text = "\n\n" + text;
  }

  var success = accessPadGlobal(globalPadId, function(pad) {
    if (!pad.exists()) {
      log.custom("inbox", "Reply email globalPadId " + globalPadId + " does not exist. Skipping.");
      return false;
    }

    if (pad.getIsModerated()) {
      log.custom("inbox", "Reply email globalPadId " + globalPadId + " is moderated. Skipping.");
      return false;
    }

    userId = userId || userName;

    var authorData = null;
    var authorId = null;
    dmesg("User id " + userId );

    if (padusers.isGuest(userId)) {
      authorId = userId;
      authorData = pad.getAuthorData(authorId);
    } else if (userId) {
      authorId = getUserIdForProUser(userId);
      authorData = pad.getAuthorData(authorId);
    }

    dmesg("Author id " + authorId );

    if (!authorData) {
      authorData = { colorId: pad_control.assignColorId(pad, userId), name: userName };
      dmesg("Author data " + authorData );

      pad.setAuthorData(authorId, authorData);
    }

    // append to end of revNum
    revNum = revNum ||  pad.getHeadRevisionNumber();
    var oldText = pad.getInternalRevisionText(revNum);
    var changeset = Changeset.makeSplice(oldText, oldText.length, 0, text,
      [['author', authorId]], pad.pool());
    collab_server.applyUserChanges(pad, revNum, changeset, null, authorId);

    padevents.onEditPad(pad, authorId);

    return true;
  }, "rw", true);

  if (success && userId) {
    pad_access.updateUserIdLastAccessedDate(globalPadId, userId);
  }

  return success;
}

/*
Mail content type: multipart/MIXED; boundary=0016e6db29661b127504b777e454
info: 2012-01-26 16:54:42.018-0800  Multipart message #2289no text/plain part.
*/

function _getPlainText(msg, recursing) {
  // if this is called, the message is marked as read
  var content = msg.getContent();

  dmesg("Email content type: " + msg.getContentType());
  var text;

  if (startsWith(msg.getContentType().toLowerCase(), "text/plain")) {
    text = msg.getContent();
  } else {
    // Multipart multipart = (Multipart) msg[i].getContent();

    // multipart content
    if (content.getCount) {
      for (var i = 0; i < content.getCount(); i++) {
        var part = content.getBodyPart(i);
        text = _getPlainText(part, true);
        if (text) {
          break;
        }
      }
    }

    if (!text && !recursing) {
      log.custom("inbox", "Multipart message #" + msg.getMessageNumber() + " no text/plain part.");
      return "";
    }
  }

  return text;
}

function _parseResponseText(msg) {
  var text = _getPlainText(msg);

  // arbitrarily complex
  var newstuff = "";
  var lines = text.split("\n");
  for (var i in lines) {
    var line = trim(lines[i]);
    if (!line) {
      newstuff += "\n\n";
      continue;
    } else if (startsWith(line, ">") ||
               startsWith(line, "From: ") ||
               startsWith(line, "Subject: ") ||
               startsWith(line, "Date: ") ||
               startsWith(line, "Subject: ") ||
               startsWith(line, "To: ") ||
               startsWith(line, "Cc: ") ||
               line == "---------- Forwarded message ----------" ||
               (startsWith(line, "On ") && endsWith(line, "> wrote:"))) {
      continue;
    }

    newstuff += " " + line;
  }

  return trim(newstuff);
}

function authorForLine(content){
  var authorMatch = /On .*, ([^,]+)( <(.+@.+\..+)> )?\s?wrote:/.exec(content);
  if (!authorMatch) {
    authorMatch = /From: (.*) (<(.+@.+\..+)>)/.exec(content);
  }
  if (!authorMatch) {
    authorMatch = /From: \*(.*)\* (<(.+@.+\..+)>)/.exec(content);
  }
  if (!authorMatch) {
    authorMatch = /From: (.*) \[mailto:(.+@.+\..+)\]/.exec(content);
  }
  if (authorMatch) {
    dmesg(authorMatch[1] + "10");
    return {name: authorMatch[1], email: authorMatch[3], confidence:10};
  }

  authorMatch = /[\d\/] (.*) (<(.+@.+\..+)>)\s*$/.exec(content);
  if (authorMatch) {
    dmesg(authorMatch[1] + "5");
    return {name: authorMatch[1], email: authorMatch[3], confidence:5};
  }

  authorMatch = /(.*) wrote:\s*$/.exec(content);
  if (authorMatch) {
    dmesg(authorMatch[1] + "1");
    return {name: authorMatch[1], email: authorMatch[1], confidence: 1};
  }

  dmesg(content + "no match");
  return null;
}

function parseLine(line) {
  line = trim(line.replace(/\*/g, ""));
  var quotedMatch = /^([>\s]*)\s?(.*)/.exec(line);
  var level = quotedMatch[1].replace(/\s/g, "").length;
  var content = quotedMatch[2];
  return {text: content, level:level};
}


function _parseCreateText(msg, author) {
  var text = _getPlainText(msg);
  if (!text) {
    return [];
  }

  var segments = [];

  var currentSegmentAuthor = author;
  var currentSegmentLines = [];

  var lines = text.split("\n");
  var currentLevel = 0;
  var ignoreRestOfLevel = false;

  var lineInfo;
  var lastLineWasEmpty = false;
  for (var i=0; i<lines.length; i++) {
    // update what quote level we're at
    if (lineInfo) {
      currentLevel = lineInfo.level;
    }

    var lineInfo = parseLine(lines[i]);

    // merge empty lines
    if ((!lineInfo.text) || /^\s*$/.test(lineInfo.text)) {
      if (lastLineWasEmpty) {
        continue;
      } else {
        lastLineWasEmpty = true;
      }
    }


    // is there an author change?
    var author = authorForLine(lineInfo.text);
    if ((!author || author.confidence<10) && i < (lines.length-1)) {
      var nextLineInfo = parseLine(lines[i+1]);
      var altAuthor = authorForLine(lineInfo.text.replace(/\\n/, "") + " " + nextLineInfo.text);
//      throw Error (lineInfo.text.replace(/\\n/, "") + " " + nextLineInfo.text);
      if (altAuthor && altAuthor.confidence >  5) {
        // skip next line
        i++;
        author = altAuthor;
      }
    }

    // if so, end current segment, start next one
    if (author) {
      segments.push([currentSegmentAuthor, currentSegmentLines]);
      currentSegmentAuthor = author.name;
      currentSegmentLines = [];
      ignoreRestOfLevel = false;
      continue;
    }

    // skip all following lines on the same level
    if (ignoreRestOfLevel) {
      if (lineInfo.level == currentLevel) {
        continue;
      }
      ignoreRestOfLevel = false;
    }


    // ignore these lines:
    if (startsWith(lineInfo.text, "Subject: ") ||
               startsWith(lineInfo.text, "Date: ") ||
               startsWith(lineInfo.text, "Subject: ") ||
               startsWith(lineInfo.text, "To: ") ||
               startsWith(lineInfo.text, "Cc: ") ||
               lineInfo.text == "---------- Forwarded message ----------"){
      continue;
    }

    // now sure how general this is..
    if (lineInfo.text == "_______________________________________________" ||
        lineInfo.text == "--" ||
        lineInfo.text == "___") {
      ignoreRestOfLevel = true;
      continue;
    }

    // trim leading whitespace lines
    if (/^\s*$/.test(lineInfo.text) && !currentSegmentLines.length) {
      continue;
    }

    currentSegmentLines.push(lineInfo.text);
  }

  // add the final segment
  if (currentSegmentLines.length) {
    segments.push([currentSegmentAuthor, currentSegmentLines]);
  }

  segments = segments.reverse();

  // trim whitespace lines in the other direction
  for (var i=0; i<segments.length; i++) {
    var sawNonEmpty = false;
    /*segments[i][1] = segments[i][1].filter(function (line) {
      var isWhitespace = /^\s*$/.test(line);
      dmesg("filtering" + line.length);
      sawNonEmpty = sawNonEmpty || !isWhitespace;
      return sawNonEmpty;
    });*/
    segments[i][1] = segments[i][1].join("\n")+"\n\n";
  }

  return segments;
}



function _getInbox() {
  if (!IMAP_STORE || !IMAP_STORE.isConnected()) {
    /*if (IMAP_STORE) {
      IMAP_STORE.close();
    }*/
    var props = System.getProperties();
    props.setProperty("mail.store.protocol", "imaps");

    var session = Session.getDefaultInstance(props, null);
    var store = session.getStore("imaps");
    store.connect("imap.gmail.com", appjet.config.customEmailAddress, appjet.config.customEmailImapPassword);

    IMAP_STORE = store;
  }

  var inbox = IMAP_STORE.getFolder("Inbox");

  /* Opening READ_WRITE marks read messages as SEEN. READ_ONLY doesn't. */
  inbox.open(Folder.READ_WRITE);

  return inbox;
}

function _fetchUnreadMail(inbox) {
  //var msgs = inbox.getMessages();
  var ft = new FlagTerm(new Flags(Flag.SEEN), false);
  var msgs = inbox.search(ft);
  return msgs;
}

function _domainName(domainId) {
  var domainRecord = domains.getDomainRecord(domainId);
  if (domainRecord.orgName != null && domainRecord['subDomain']) {
    return domainRecord.subDomain + "." + appjet.config['etherpad.canonicalDomain'];
  }
  return appjet.config['etherpad.canonicalDomain'];
}

function _getAccount(msg, domainId) {
  var addr = msg.getFrom()[0].getAddress().toLowerCase();
  return pro_accounts.getAccountByEmail(addr, domainId);
}

function _getDomainIdFromRecipientAddress(msg) {
  var recipients = msg.getAllRecipients();
  if (!recipients) {
    return 1;
  }
  for (var i=0; i<recipients.length; i++) {
    var recipientAddress = recipients[i].getAddress();

    var m = recipientAddress.match(/(\w+)\+(\w+)@hackpad\.com/);
    if (m && m[2]) {
      var domain = domains.getDomainRecordFromSubdomain(m[2]);

      if (!domain) { return 1; }
      return domain.id;
    }
  }
  return 1;
}

function _getMessageContext(msg) {
  var referencesIds = msg.getHeader("References") || [];
  referencesIds = referencesIds.join(" ").split("\\s+");
  dmesg("Message #" + msg.getMessageNumber() + " References: " + referencesIds.join(","));

  var domainId = 1;

  for (var i in referencesIds) {
    // pad+revnum@subdomain.hackpad.com
    var m = referencesIds[i].match(/<(\w+)\+(\w+)@((\w+)\.)?hackpad\.com>/);
    if (m) {
      if (m[4]) {
        var domain = domains.getDomainRecordFromSubdomain(m[4]);
        if (!domain) { return null; }
        domainId = domain.id;
      }

      var acct = _getAccount(msg, domainId);
      if (!acct) { return null; }
      var globalPadId = makeGlobalId(domainId, m[1]);

      var revNum = (m[2] == "undefined" ? null : m[2]);
      return { padId: globalPadId, revNum: revNum, acct: acct, type: 'reply' };
    }
  }

  // creating a new pad
  var msgId = msg.getHeader("Message-ID") || [];
  var newMailReferences = msgId.join(" ") + " " + referencesIds.join(" ");

  domainId = _getDomainIdFromRecipientAddress(msg);

  var acct = _getAccount(msg, domainId);
  if (!acct) { return null; }

  log.custom("inbox", "Message #" + msg.getMessageNumber() + " not a change reply. Creating new pad.");
  return { acct: acct, type: 'create', references: newMailReferences };
}

function processInbox() {
  if (!isProduction()) {
    return;
  }

  var inbox = _getInbox();
  try {
    var msgs = _fetchUnreadMail(inbox);

    for (var i in msgs) {
      var msg = msgs[i];

      var ctx = _getMessageContext(msg);
      if (!ctx) { continue; }

      if (ctx.acct && !domains.domainIsOnThisServer(ctx.acct.domainId)) {
          log.custom("inbox", "Skipping an email for a different domain.");
          // let the appropriate server handler it
//          msg.setFlags(new Flags(Flag.SEEN), false);
//          msg.saveChanges();
          continue;
      }

      var txt = "";
      var segments = [];
      if (ctx.type == "create") {
        //(ctx.acct && ctx.acct.fullName) || "")
        segments = _parseCreateText(msg, ctx.acct.fullName);
      } else {
        txt =_parseResponseText(msg);
      }

      if (ctx.type == "reply") {
        if (!txt) {
          log.custom("inbox", "Skipping empty change reply email.");
          continue;
        }
        var cleanSubject = msg.getSubject() || "";
        if (cleanSubject.indexOf("[Auto-Reply]") == 0 ||
          cleanSubject.indexOf("Automatic reply") == 0) {

          log.custom("inbox", "Skipping auto-reply change reply email.");
          continue;
        }

        _insertResponseText(ctx.padId, ctx.revNum, ctx.acct.id, ctx.acct.fullName, txt, true);

      } else if (ctx.type == "create") {
        var newLocalPadId = randomUniquePadId(ctx.acct.domainId);
        var newPadId = makeGlobalId(ctx.acct.domainId, newLocalPadId);
        var cleanSubject = msg.getSubject() || "";
        if (startsWith(cleanSubject.toLowerCase(), "re: ")) {
          cleanSubject = cleanSubject.substr(4);
        } else if (startsWith(cleanSubject.toLowerCase(), "fwd: ")) {
          cleanSubject = cleanSubject.substr(5);
        }

        // future: if the cleanSubject start with ">", try to find a pad with that name to
        // append to

        accessPadGlobal(newPadId, function(pad) {
          pad.create(cleanSubject, cleanSubject);
          accessProPad(newPadId, function(ppad) {
            ppad.setCreatorId(ctx.acct.id);
            ppad.setLastEditor(ctx.acct.id);
            ppad.setLastEditedDate(new Date());
          });
          _insertResponseText(newPadId, pad.getHeadRevisionNumber(), ctx.acct.id, ctx.acct.fullName, "\n", false);
          var guestAuthors = {};
          for (var j=0; j<segments.length; j++) {
            var name = segments[j][0];
            var userId = padusers.foreignUserIdForMediaWikiUser(guestAuthors, name);
            var content = segments[j][1];
            _insertResponseText(newPadId, pad.getHeadRevisionNumber(), userId, name, content, false);
          }

          pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
        });

        // invite any additional recipients to this hackpad
        var recipients = msg.getAllRecipients();
        var fromEmail = msg.getFrom()[0].getAddress();
        for (var i=0; i<recipients.length; i++) {
            if (fromEmail != recipients[i].getAddress() &&
                recipients[i].getAddress().split("@")[1] != appjet.config.customEmailAddress.split("@")[1]) {
              pro_invite.inviteUserToPadByEmail(newPadId /*globalPadId*/,
                  recipients[i].getAddress().toLowerCase(),
                  (appjet.config.useHttpsUrls ? "https" : "http"),
                  _domainName(ctx.acct.domainId),
                  ctx.acct);
            }
        }

        var subject = "Re: " + cleanSubject;
        var body = renderTemplateAsString('email/padcreate.ejs',
                                          { host: _domainName(ctx.acct.domainId),
                                            localPadId: globalToLocalId(newPadId) });
        var headers = {'References': ctx.references };
        sendEmail(ctx.acct.email, pro_utils.getEmailFromAddr(), subject, headers, body);
      }

      /* Unneeded if folder opened READ_WRITE */
      //msg.setFlags(new Flags(Flag.SEEN), true);
      //msg.saveChanges();
    }
  } finally {
    inbox.close(false /* don't expunge */);
    IMAP_STORE.close();
  }
}

serverhandlers.tasks.processInbox = function() {
  try {
    processInbox();
  } catch (e if e.javaException instanceof javax.mail.FolderClosedException) {
    // retry if the folder is stale and closed
    try {
      processInbox();
    } catch (ex) {
      log.logException(ex);
    }
  } catch (e if e.javaException instanceof javax.mail.MessagingException) {
    if (e.toString().indexOf("BYE") > -1) {
      // rate limited, try again later
    } else {
      log.logException(e);
    }
  } catch (e) {
    log.logException(e);
  } finally {
    execution.scheduleTask('email', "processInbox", 10*1000, []);
  }
}

function onStartup() {
  if (appjet.config['etherpad.processInbox'] == "true") {
    execution.initTaskThreadPool("email", 1);
    execution.scheduleTask('email', "processInbox", 60*1000, []);
  } else {
    dmesg("Not processing email inbox.");
  }
}
