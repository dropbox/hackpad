import("etherpad.log");
import("jsutils.*");
import("etherpad.sessions.getSession");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("oauth.OAuth")


import("etherpad.collab.collab_server");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.pad.padutils");
import("etherpad.pro.google_account");
import("etherpad.pad.padutils");
import("etherpad.pad.model");
import("cache_utils.syncedWithCache");
import("netutils.{urlGet,urlPost}");
import("etherpad.utils.{randomUniquePadId}");
import("etherpad.pad.importhtml");
import("diff_match_patch");
import("etherpad.control.pad.pad_control.assignColorId");

jimport("javax.xml.parsers.DocumentBuilderFactory");
jimport("java.io.StringReader");
jimport("org.xml.sax.InputSource");
jimport("javax.xml.transform.TransformerFactory");
jimport("java.io.StringWriter");
jimport("javax.xml.transform.OutputKeys");
jimport("javax.xml.transform.dom.DOMSource");
jimport("javax.xml.transform.stream.StreamResult");

function _logImportMessage(msg) {
  log.custom('sitesimport', msg);
}

// text -> xml dom converter
function _domForString(str) {
  var reader = new StringReader( str );
  var inputSource = new InputSource( reader );

  var dbf = DocumentBuilderFactory.newInstance();
  var db = dbf.newDocumentBuilder();
  var xml = db.parse(inputSource);
  reader.close();
  return xml.getDocumentElement();
}

function makeOAuthRequest(url, params, sitesGoogleTokenInfo) {
  //session = getSession();

  var paramsInUrl = url.split('?')[1];
  if (paramsInUrl) {
    paramsInUrl.split("&").forEach(function(nameValue) {
      params[nameValue.split('=')[0]] = nameValue.split('=')[1] || "1";
    });
  }

  url = url.split('?')[0];

  var origParams = {};
  eachProperty(params, function(k, v) {origParams[k]=v;});

  var accessor = {
    token: sitesGoogleTokenInfo['oauth_token'],
    tokenSecret: sitesGoogleTokenInfo['oauth_token_secret'],
    consumerKey : appjet.config["etherpad.googleConsumerKey"],
    consumerSecret: appjet.config["etherpad.googleConsumerSecret"]
  };

  var message = {
    action: url,
    method: "GET",
    parameters: params
  };
  OAuth.completeRequest(message, accessor);

  // check the cache
/*  var content = syncedWithCache("goog-sites-data."+url, function(d) {
    return d['data'];
  });

  if (content) {
    return _domForString(content);
  }*/

  // do the request
  var headers = {'Authorization':
      OAuth.getAuthorizationHeader("com.google", message.parameters)};
  if (keys(origParams).length) {
    url = url + '?' + OAuth.formEncode(origParams);
  }
  var result = urlGet(url, {}, headers, 120/*timeout seconds*/, true);
  if (result.status != 200) {
    //throw headers['Authorization'];// url;//JSON.stringify(origParams);

    //throw result.content;
  }

  // cache the response
/*  if (result) {
    syncedWithCache("goog-sites-data."+url, function(d) {
      d['data'] = result.content;
    });
  }*/

  return _domForString(result.content);
}

// dom helpers
function _matchesName(child, name) {
  return (child.getNodeName &&
      (name == child.getNodeName() ||
       name == child.getNodeName().split(":")[1]));
}
function getChildren(parent, name) {
  var children = [];
  for (var child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
    if (_matchesName(child, name)) {
      children.push(child);
    }
  }
  return children;
}
function getChild(parent, name) {
  if (!parent) {
    return null;
  }
  for (var child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
    if (_matchesName(child, name)) {
      return child;
    }
  }
  return null;
}
function getElementText(element) {
  if (element && element.getFirstChild() && element.getFirstChild().getNodeValue()) {
    return element.getFirstChild().getNodeValue();
  } else {
    return "";
  }
}
// end dom helpers

function importStatus(userId, importId) {
  appjet.cache.sitesImportStatus = appjet.cache.sitesImportStatus || {};
  appjet.cache.sitesImportStatus[userId] = appjet.cache.sitesImportStatus[userId] || {};
  var userImports = appjet.cache.sitesImportStatus[userId];
  userImports[importId] = userImports[importId] || {};
  return userImports[importId];
}

function recentImports(userId) {
  appjet.cache.sitesImportStatus = appjet.cache.sitesImportStatus || {};
  appjet.cache.sitesImportStatus[userId] = appjet.cache.sitesImportStatus[userId] || {};
  var userImports = appjet.cache.sitesImportStatus[userId];
  var imports = [];
  for (importId in userImports) {
    imports.push(userImports[importId]);
  }
  return imports.reverse();
}

function importGoogleSite(importId, domainName, siteName, maxCount, sitesGoogleTokenInfo, domainId, ownerId, importedFrom) {
  //request.profile.tick('start import');

  domainName = domainName || "site";
  var url = "https://sites.google.com/feeds/content/" + domainName + "/" + siteName;

  var startIndex = 1;
  var pageSize = 20;
  var urlMap = {};
  var pathIndex = 0;
  var emptyEntries = 0;

  importStatus(ownerId, importId).state = "active";

  while (true) {
    //request.profile.tick('load entries ');
    var xmlResponse;

    if ((maxCount && startIndex > (maxCount+1)) || emptyEntries > 100) {
      break;
    }


    try {
      xmlResponse = makeOAuthRequest(url, {'start-index': startIndex, 'max-results':pageSize}, sitesGoogleTokenInfo);
    } catch(e) {
      _logImportMessage(e.toString());
      _logImportMessage("Caught an ise; start-index is "+ startIndex);
      return;
    }

    //request.profile.tick('done load enties ');
    if (!xmlResponse) {
      break;
    }

    var entries = getChildren(xmlResponse, "entry");
    if (!entries.length) {
      emptyEntries = emptyEntries + pageSize;
    } else {
      emptyEntries = 0;
    }

    importStatus(ownerId, importId).pagesProcessed += entries.length;

    for (var i=0; i<entries.length; i++) {
      var entry = entries[i];

      var localPadId = null;
      // supported: webpage, attachment, webattachment, filecabinet, listitem, listpage
      // un-supported: announcement, announcementspage, comment, template.
      var category = getChild(entry, "category");
      var label = category.getAttribute("label");
      if (label == "listpage") {
        localPadId = importList(entry, domainName, siteName, sitesGoogleTokenInfo, domainId, ownerId, importedFrom);
      } else if (label == "webpage") {
        localPadId = importWebPage(entry, domainName, siteName, sitesGoogleTokenInfo, domainId, ownerId, importedFrom);
      } else if (label == "filecabinet") {
        localPadId = importWebPage(entry, domainName, siteName, sitesGoogleTokenInfo, domainId, ownerId, importedFrom);
      } else if (label == "attachment") {
        // for now we just link to the attachment
        continue;
      } else if (label == "listitem") {
        continue;
      } else {
        _logImportMessage("Don't know how to process " + label);
      }

      if (localPadId) {
        urlMap[_getCanonicalUrlForEntry(entry)] = localPadId;
        _logImportMessage("<a href='/"+encodeURIComponent(localPadId)+"'>" + getElementText(getChild(entry, "title")) + "<a/>");
      }
    }
    startIndex += pageSize;
  }

  // Rewrite links
  values(urlMap).forEach(function(localPadId) {
    var globalId = padutils.getGlobalPadId(localPadId, domainId);
    model.accessPadGlobal(globalId, function(pad) {
      // rewrite the links in the apool
      pad.pool().modifyAttribs(function(k,v) {
        if (k == "link" && v) {
          var relativePadLinkRE = /^(https?:\/\/sites.google.com\/.*)$/;
          var padMatch = v.match(relativePadLinkRE);
          if (padMatch && padMatch[1] in urlMap) {
            v = "/" + urlMap[padMatch[1]];
          }
        }
        return v;
      });

      pad.writeToDB();
    }, 'rw', true);
  });

  importStatus(ownerId, importId).state = "done";

  //request.profile.tick('end import');
  //_logImportMessage(request.profile.asString());
}

function _getCanonicalUrlForEntry(entry) {
  var pageUrlLink = filterByAttr(filterByAttr(getChildren(entry, "link"), "rel", "alternate"), "type", "text/html")[0];
  if (!pageUrlLink) {
    pageUrlLink = filterByAttr(getChildren(entry, "link"), "rel", "alternate")[0];
    if (!pageUrlLink) {
      return "";
    }
  }
  return pageUrlLink.getAttribute("href");
}

function _addSubPagesToPad(globalId, subPages) {
  var success = model.accessPadGlobal(globalId, function(pad) {
    var builder = Changeset.builder(pad.text().length);
    builder.keepText(pad.text());
    builder.insert("\n", [], pad.pool());
    builder.insert("Subpages: ", [["bold"  , true]], pad.pool());
    for (var i=0; i<subPages.length; i++) {
      builder.insert(subPages[i][0], [["link", subPages[i][1]]], pad.pool());
      builder.insert("  ", [], pad.pool());
    }
    builder.insert("\n", [], pad.pool());

    var cs = builder.toString();
    pad.appendRevision(cs, "");//revAuthorEmail);

    pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
  });
  return success;
}

function filterByAttr(elements, attrName, attrValue) {
  var filtered = elements.filter(function(e) {
    return e.hasAttribute(attrName) &&
    e.getAttribute(attrName) == attrValue});
  return filtered;
}

function processSubpages(globalId, entry, domainName, siteName, sitesGoogleTokenInfo) {
  // Process subpages
  var idParts = getElementText(getChild(entry, "id")).split('/');
  var entryId = idParts[idParts.length-1];
  var subpagesUrl = "https://sites.google.com/feeds/content/" + domainName + "/" + siteName;
  var xmlSubpagesResponse = makeOAuthRequest(subpagesUrl,
      {'start-index': 1, 'max-results':20, parent:entryId }, sitesGoogleTokenInfo);

  var subPages = [];
  var subpageEntries = getChildren(xmlSubpagesResponse, "entry");
  for (var i=0; i<subpageEntries.length; i++) {
    var subpageEntry = subpageEntries[i];
    var subPageTitle = getElementText(getChild(subpageEntry, "title"));
    var subPageUrl = _getCanonicalUrlForEntry(subpageEntry);
    subPages.push([subPageTitle, subPageUrl]);
  }

  if (subPages.length) {
    _addSubPagesToPad(globalId, subPages);
  }
}

function importWebPage (entry, domainName, siteName, sitesGoogleTokenInfo, domainId, ownerId, importedFrom) {

  // Load the revisions feed
  var links = getChildren(entry, "link");
  links = filterByAttr(links, "rel", "http://schemas.google.com/sites/2008#revision");
  var revFeedUrl = links[0].getAttribute("href");
  var revFeedXML = makeOAuthRequest(revFeedUrl, {}, sitesGoogleTokenInfo);

  // Process the revisions
  var title = getElementText(getChild(getChild(revFeedXML, "entry"), "title"));
  var lastEditedDate = getElementText(getChild(getChild(revFeedXML, "entry"), "updated"));
  var localPadId = processRevisionFeed(revFeedXML, title, lastEditedDate, domainId, ownerId, importedFrom);

  var globalId = padutils.getGlobalPadId(localPadId, domainId);
  processSubpages(globalId, entry, domainName, siteName, sitesGoogleTokenInfo);

  return localPadId;
}

var PUBLISH_DATE_IDX = 0;
var ROW_DATA_IDX = 1;
var COL_INDEX_IDX = 0;
var NAME_IDX = 1;
var VALUE_IDX = 2;

function _listDataFeedToRows(xmlResponse, columns) {
  var rows = [];
  var entries = getChildren(xmlResponse, "entry");

  for (var i=0; i < entries.length; i++) {
      var entry = entries[i];
      var publishDate = getElementText(getChild(entry, "published"));
      var row = [];
      var fields = getChildren(entry, "field");
      for (var j=0; j<fields.length; j++) {
        var index = fields[j].getAttribute("index");
        var name = columns[index];
        var value = getElementText(fields[j]);
        row.push([index, name, value]);
      }
      // sort in columns order A,B,C...
      row.sort(function(f1, f2){ return f1[COL_INDEX_IDX]>f2[COL_INDEX_IDX]});
      row = [publishDate, row];
      rows.push(row);
  }

  // sort by publish date
  rows.sort(function(r1, r2) {
    return r1[PUBLISH_DATE_IDX] > r2[PUBLISH_DATE_IDX];
  });

  return rows;
}

/**
 @return local pad id for the new pad
 */
function importList(entry, domainName, siteName, sitesGoogleTokenInfo, domainId, ownerId, importedFrom) {
  // figure out the names of the columns
  var data = getChild(entry, "data");
  var columns = {};
  var columnElements = getChildren(data, "column");
  for (var i=0; i<columnElements.length; i++) {
    columns[columnElements[i].getAttribute("index")] = columnElements[i].getAttribute("name");
  }

  // load the data feed
  var dataFeedUrl = getChild(entry, "feedLink").getAttribute("href");
  var rows = [];
  if (dataFeedUrl) {
    var xmlResponse = makeOAuthRequest(dataFeedUrl, {}, sitesGoogleTokenInfo);
    rows = _listDataFeedToRows(xmlResponse, columns);
  }

  // generate corresponding html
  /*var html = "";
  for (var i=0; i<rows.length; i++) {
    var rowData = rows[i][ROW_DATA_IDX];
    for (var j=0; j<rowData.length; j++) {
      var last = (j == (rowData.length - 1));
      var name = rowData[j][NAME_IDX];
      var value = rowData[j][VALUE_IDX];
      var _class = "table-col-" + j;
      if (last) {
        _class += " last-col";
      }
      html += "<div class='"+_class+"'><span class='colname "+_class+"'>" + name + ":</span>" + value +"</div>";
    }
  }
  html += "<br/><br/>";*/
  var html = "<table>";
  for (var i=0; i<rows.length; i++) {
    html += "<tr>";
    var rowData = rows[i][ROW_DATA_IDX];

    if (i==0) {
      for (var j=0; j<rowData.length; j++) {
        html += "<td>";
        var name = rowData[j][NAME_IDX];
        html += (name + "</td>");
      }
      html += "</tr><tr>";
    }

    for (var j=0; j<rowData.length; j++) {
      html += "<td>";
      var value = rowData[j][VALUE_IDX];
      html += (value + "</td>");
    }
    html += "</tr>";
  }
  html += "</table>";


  // import the html into the pad
  var newPadId = randomUniquePadId(domainId);
  var globalId = padutils.getGlobalPadId(newPadId, domainId);
  var title = getElementText(getChild(entry, "title"));
  var lastEditedDate = getElementText(getChild(entry, "updated"));

  var success = model.accessPadGlobal(globalId, function(pad) {
    if (!pad.exists()) {
      pad.create(title, title);
      pad.setImportedFrom(importedFrom);
      pro_padmeta.accessProPad(globalId, function(ppad) {
          ppad.setCreatorId(ownerId);
          ppad.setLastEditor(ownerId);
          ppad.setLastEditedDate(new Date(lastEditedDate));
      });

      var atext = importhtml.htmlToAText(title + "<br/>" + html, pad.pool());
      collab_server.setPadAText(pad, atext);

      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
    }
  });

  var globalId = padutils.getGlobalPadId(newPadId, domainId);
  processSubpages(globalId, entry, domainName, siteName, sitesGoogleTokenInfo);

  return newPadId;
}


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

function domToString (element) {
  var transFactory = TransformerFactory.newInstance();
  var transformer = transFactory.newTransformer();
  var buffer = new StringWriter();
  transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes");
  var o = new StreamResult(buffer);

  transformer.transform(new DOMSource(element),
        new StreamResult(buffer));
  return buffer.toString();
}

function processRevisionFeed(xmlResponse, title, lastEditedDate, domainId, ownerId, importedFrom) {
  var lastTxt = "";
  var pageName = "";

  var newPadId = randomUniquePadId(domainId);
  var globalId = padutils.getGlobalPadId(newPadId, domainId);
  var success = model.accessPadGlobal(globalId, function(pad) {

    if (!pad.exists()) {
      pad.create(title, title);
      pad.setImportedFrom(importedFrom);
      pro_padmeta.accessProPad(globalId, function(ppad) {
          ppad.setCreatorId(ownerId);
          ppad.setLastEditor(ownerId);
          ppad.setLastEditedDate(new Date(lastEditedDate));
      });

      var atext = null;
      var attribs = null;
      var entries = getChildren(xmlResponse, "entry");
      for (var i=entries.length-1; i>=0; i--) {
        var entry = entries[i];

        pageName = getElementText(getChild(entry, "pageName"));


        var table = getChild(getChild(getChild(entry, "content"), "div"), "table");
        var html = title + "<br/>" + domToString(getChild(getChild(getChild(getChild(table, "tbody"), "tr"), "td"), "div"));
        atext = importhtml.htmlToAText(html, pad.pool());

        var revDiff = _diff_lineMode(lastTxt, atext.text);
        var revAuthorName =  getElementText(getChild(getChild(entry, "author"), "name"));
        var revAuthorEmail =  getElementText(getChild(getChild(entry, "author"), "email"));
        revAuthorName = revAuthorName || revAuthorEmail;
        revAuthorName = revAuthorName || "unknown";
        var builder = Changeset.builder(pad.text().length);

        var authorData = { colorId: assignColorId(pad, revAuthorEmail), name: revAuthorName};
        pad.setAuthorData(revAuthorEmail, authorData)

        for (segment in revDiff) {
          segment = revDiff[segment];
          var op = segment[0];
          var text = segment[1];

          if (op == -1 && text.length) {
            builder.remove(text.length, text.split('\n').length-1);
          } else if (op == 0) {
            builder.keepText(text, [], pad.pool());
          } else if (op == 1 && text.length) {
            builder.insert(text, [["author", revAuthorEmail]], pad.pool());
          }
        }

        var cs = builder.toString();
        pad.appendRevision(cs, revAuthorEmail);

        lastTxt = pad.text();
        attribs = atext.attribs;
      }
      if (atext) {

        // apply final attributes to the final text
        var cs = String("Z:"+Changeset.numToString(0)+">"+Changeset.numToString(pad.text().length)) + attribs;
        cs = Changeset.convertToKeeps(cs);
        pad.appendRevision(cs, "");//revAuthorEmail);

      }

      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
    }
  });

  return newPadId;
}

