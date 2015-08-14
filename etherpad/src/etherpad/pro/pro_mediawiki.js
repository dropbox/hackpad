import("wiky")
import("etherpad.pad.padutils");
import("etherpad.utils.{randomUniquePadId}");
import("etherpad.pad.importhtml");
import("etherpad.pad.padusers");
import("diff_match_patch");
import("etherpad.control.pad.pad_control.assignColorId");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_groups");
import("etherpad.pad.importhtml");
import("jsutils.*");

import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.log");

import("etherpad.pro.pro_padmeta");
import("etherpad.pro.domains");
jimport("java.io.File");
jimport("javax.xml.parsers.DocumentBuilderFactory");
jimport("java.io.StringReader");
jimport("org.xml.sax.InputSource");
jimport("javax.xml.transform.TransformerFactory");
jimport("java.io.StringWriter");
jimport("javax.xml.transform.OutputKeys");
jimport("javax.xml.transform.dom.DOMSource");
jimport("javax.xml.transform.stream.StreamResult");

function _diff_lineMode(text1, text2) {
  var dmp = new diff_match_patch.diff_match_patch();

  var a = dmp.diff_linesToChars_(text1, text2);

  var lineText1 = a.chars1;
  var lineText2 = a.chars2;
  var lineArray = a.lineArray;

  var diffs = dmp.diff_main(lineText1, lineText2, false);

  dmp.diff_charsToLines_(diffs, lineArray);
  return diffs;
}

function appendRevision(pad, newText, map, author) {
  var revDiff = _diff_lineMode(pad.text(), newText);
  var builder = Changeset.builder(pad.text().length);

  var userId = padusers.foreignUserIdForMediaWikiUser(map, author);

  var authorData = { colorId: assignColorId(pad, userId), name: author};
  pad.setAuthorData(author, authorData)

  for (segment in revDiff) {
    segment = revDiff[segment];
    var op = segment[0];
    var text = segment[1];

    if (op == -1 && text.length) {
      builder.remove(text.length, text.split('\n').length-1);
    } else if (op == 0) {
      builder.keepText(text, [], pad.pool());
    } else if (op == 1 && text.length) {
      builder.insert(text, [["author", author]], pad.pool());
    }
  }

  var cs = builder.toString();
  pad.appendRevision(cs, author);
}

function processPage(page, userMap, ownerId, collectionId, debugInfo) {

  var title = page.getElementsByTagName("title").item(0).getFirstChild().getNodeValue();
  var revisions = page.getElementsByTagName("revision");
  if ((title.indexOf("File:")==0) || (title.indexOf("MediaWiki:")==0) ||
      (title.indexOf("Template:")==0)) {
    return null;
  }

  var articleId = parseInt(page.getElementsByTagName("id").item(0).getFirstChild().getNodeValue());
  log.info(page.getElementsByTagName("id").item(0).getFirstChild().getNodeValue());

  var hasTable = false;
  var newPadId = randomUniquePadId();
  var success = padutils.accessPadLocal(newPadId, function(pad) {

    if (!pad.exists()) {
      pad.create(title, title);
      pad.setImportedFrom("mediawiki:"+title);
      var globalId = padutils.getGlobalPadId(newPadId);

      var atext = null;
      var attribs = null;
      var html = null;
      var timestamp = null;
      for (var j=0; j<revisions.getLength(); j++){
        var revision = revisions.item(j);
        timestamp = revision.getElementsByTagName("timestamp").item(0).getFirstChild().getNodeValue();
        var contributor = revision.getElementsByTagName("contributor").item(0);
        var contributorIp = contributor.getElementsByTagName("ip");
        var contributorName = contributor.getElementsByTagName("username");
        var editor = contributorName.getLength() && contributorName.item(0).getFirstChild().getNodeValue();
        if (!editor) {
          editor = contributorIp.getLength() && contributorIp.item(0).getFirstChild().getNodeValue();
        }
        if (revision.getElementsByTagName("text").item(0).getFirstChild()) {
          var text = revision.getElementsByTagName("text").item(0).getFirstChild().getNodeValue();
          try {
            html = wiky.wiky.process(text);
          } catch (e) {
            response.write("Wiky failed to process article id " + articleId)
            html = "";
          }
          try {
            atext = importhtml.htmlToAText(title + "<br/>" + html, pad.pool());
            appendRevision(pad, atext.text, userMap, editor);
          } catch (e) {
            response.write("Wiky failed to process article id " + articleId);
          }
        }
        log.info("Revision is:" + j);
      }
      if (html.indexOf("<table>") != -1) {
        hasTable = true;
      }

      pro_padmeta.accessProPad(globalId, function(ppad) {
          ppad.setCreatorId(ownerId);
          ppad.setLastEditor(ownerId);
          var lastEditedDate =  timestamp ? new Date(parseDate(timestamp)) : new Date();
          ppad.setCreatedDate(lastEditedDate);
          ppad.setLastEditedDate(lastEditedDate);
      });

      if (atext) {
        // apply final attributes to the final text
        var cs = String("Z:"+Changeset.numToString(0)+">"+Changeset.numToString(pad.text().length)) + atext.attribs;
        cs = Changeset.convertToKeeps(cs);
        pad.appendRevision(cs, "");//revAuthorEmail);
      }

      var builder = Changeset.builder(pad.text().length);
      builder.keepText(pad.text());
      builder.insert("\n", [], pad.pool());
      var cs = builder.toString();
      pad.appendRevision(cs, "");//revAuthorEmail);

      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());

    }
  });

  if (collectionId) {
    pro_groups.addPadToCollection(collectionId, newPadId, ownerId||getSessionProAccount().id);
  }

  var newPadInfo = "<a href='/" + newPadId + "'>" + title + "</a>" + (hasTable? "(table)" : "") + "<br/>";

  log.info(newPadInfo);
  debugInfo.push(newPadInfo);

  return {'title': title, 'localPadId' : newPadId};
}

function importWiki(fileNames, optOwnerId, optCollectionName) {
  var fileNames = ["../Jtvcommunity-20130621214904.xml"];
  var collectionId = null;

  var urlMap = {};
  var userMap = {};
  var debugInfo = [];

  var ownerId = parseInt(optOwnerId || getSessionProAccount().id);

  if (optCollectionName) {
    collectionId = pro_groups.createGroup(ownerId||getSessionProAccount().id, optCollectionName, true /*isPublic*/, domains.getRequestDomainId());
  }

  for (var i=0; i<fileNames.length; i++) {
    if (fileNames[i].indexOf(".xml") != fileNames[i].length - 4) {
      return;
    }

    var file = new java.io.File(fileNames[i]);

    var dbf = DocumentBuilderFactory.newInstance();
    var db = dbf.newDocumentBuilder();
    var doc = db.parse(file);
    var root = doc.getDocumentElement();
    var pages = root.getElementsByTagName("page");
    var mwRoot = root.getElementsByTagName("base").item(0).getFirstChild().getNodeValue().replace("Main_Page", "");
    pro_config.setConfigVal("mwRoot", mwRoot)

    for (var j=0; j<pages.getLength(); j++) {
      log.info("Processed page:" + i);

      var pageInfo = processPage(pages.item(j), userMap, ownerId, collectionId, debugInfo);
      if (pageInfo) {
        urlMap[pageInfo.title] = pageInfo.localPadId;
      }
    }
  }

  // Rewrite links
  var localPadIds = values(urlMap);
  var padsToCreate = [];
  var newPadIds = {};
  localPadIds.forEach(function(localPadId) {
    log.info("Processing:" + localPadId);
    padutils.accessPadLocal(localPadId, function(pad) {
      // for proper back-dating of auto-created pads
      var createdDate = null;
      var globalId = padutils.getGlobalPadId(localPadId);
      pro_padmeta.accessProPad(globalId, function(ppad) {
        createdDate = ppad.getCreatedDate();
      });

      // rewrite the links in the apool
      pad.pool().modifyAttribs(function(k,v) {
        log.info("Key:" + k + " Value:" + v);

        if (k == "link" && v) {
          var relativePadLinkRE = /^MEDIAWIKILINK:(.*)$/;
          var padMatch = v.match(relativePadLinkRE);
          if (padMatch) {
            if (padMatch[1] in urlMap) {
              log.info("Existing: Rewrote " + v + "to " + urlMap[padMatch[1]]);
              v = "/" + urlMap[padMatch[1]];
            } else {
              var success = false;

              while (!success) {
                var newPadId = randomUniquePadId();
                success = padutils.accessPadLocal(newPadId, function(pad) {
                  if (!pad.exists() && !newPadIds[newPadId]) {
                    padsToCreate.push({localPadId: newPadId, title: padMatch[1].substring(0, 40), importedFrom: padMatch[1], creatorId:ownerId, createdDate: createdDate});
                    newPadIds[newPadId] = true;
                    return true;
                  }
                  return false;
                });
              }

              urlMap[padMatch[1]] = newPadId;
              v = "/" + urlMap[padMatch[1]];
              log.info("New: Rewrote " + v + "to " + urlMap[padMatch[1]]);
            }
          }
        }
        return v;
      });

      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
      pad.writeToDB();
    }, 'rw', true);

    log.info(JSON.stringify(padsToCreate));
  });



  padsToCreate.forEach(function(createInfo) {
    padutils.accessPadLocal(createInfo.localPadId, function(pad) {
      var title = createInfo.title;
      log.info("Creating pad: " + title);

      pad.create(title, title);

      pad.setImportedFrom("mediawiki:"+createInfo.importedFrom);
      var globalId = padutils.getGlobalPadId(createInfo.localPadId);
      pro_padmeta.accessProPad(globalId, function(ppad) {
          ppad.setCreatorId(createInfo.creatorId);
          ppad.setLastEditor(createInfo.creatorId);
      });
      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
    });

    if (collectionId) {
      pro_groups.addPadToCollection(collectionId, createInfo.localPadId, ownerId||getSessionProAccount().id);
    }

  });

  response.write(debugInfo.join(""));

}