import("execution");

import("fastJSON");
import("jsutils");
import("dateutils");
import("netutils.urlGet");
import("netutils.urlPost");
import("stringutils.trim");
import("stringutils.toHTML");

import("etherpad.log");
import("etherpad.collab.collab_server");
import("etherpad.control.pro.pro_main_control.decorateWithCollectionNames");
import("etherpad.globals.{isProduction,isDogfood}");
import("etherpad.helpers");
import("etherpad.pad.model");
import("etherpad.pad.dbwriter");
import("etherpad.pad.padutils.globalToLocalId");
import("etherpad.pad.padutils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_padmeta");
import("etherpad.sessions.getSession");
import("etherpad.utils.*");
import("sqlbase.sqlobj");

import("etherpad.utils.renderTemplateAsString");

import("etherpad.pro.pro_padlist");
import("funhtml");
import("etherpad.changes.changes");
import("etherpad.pad.padusers");
jimport("net.sf.json.JSONNull");

var ESCAPE_SOLR_CHARS_RE = new RegExp(/([!\+\-&\|\(\)\{\}\[\]\^~\*\?:\\])/g);
function searchPads(q, start, limit, optSnippetCnt, optSnippetMaxSize, optAllowNewLinesInSnippets, optFilterGroupId, optFilterAuthorId, optFilterLastEdit, optFacet) {
  var uid = getSessionProAccount() && getSessionProAccount().id;
  var isDomainGuest = getSessionProAccount() && pro_accounts.getIsDomainGuest(getSessionProAccount());

  var domainId = domains.getRequestDomainId();
  var filterQueryList = ["domainId:" + domainId];

  if (uid && !isDomainGuest) {
    // user invited or authored
    var filterQuery = "invitedId:" + uid + " OR creatorId:" + uid;

    request.profile.tick('before getUserGroupIds');

    // user's groups invited
    var userGroupIds = pro_groups.getUserGroupIds(uid);

    var groupsClause = userGroupIds.map(function(groupid) {
      return "invitedGroupId:" + groupid;
    }).join(" OR ");

    if (userGroupIds.length) {
      filterQuery += " OR ((guestpolicy:allow OR guestpolicy:domain) AND ("+groupsClause+")) "
    }

    // domain's pads
    if (!domains.isPrimaryDomainRequest()) {
      filterQuery += " OR guestpolicy:allow OR guestpolicy:domain";
    } else {
      filterQuery += " OR (editorId:" + uid + " AND guestpolicy:link) ";
    }

    filterQueryList.push(filterQuery);
  } else {
    // no user
    filterQueryList.push("guestpolicy:allow");
  }
  if (optFilterAuthorId) {
    filterQueryList.push("{!tag=authorId}authorId:" + optFilterAuthorId);
  }
  if (optFilterGroupId) {
    filterQueryList.push("{!tag=invitedGroupId}invitedGroupId:" + optFilterGroupId);
  }
  if (optFilterLastEdit) {
    filterQueryList.push("lastedit:[NOW-" + optFilterLastEdit + "DAYS TO NOW]");
  }

  var userQuery = trim(q).replace(ESCAPE_SOLR_CHARS_RE, "\\$1");
  // ensure an even number of quotes
  var parts = userQuery.split('"');
  if (parts.length % 2 == 0) {
    // even number of parts -> so there's an odd number of quotes
    userQuery = parts.slice(0, parts.length-1).join('"') + parts[parts.length-1];
  }

  limit = Number(limit) || 10;
  start = Number(start) || 0;

  var preTag = '0941B8FA-35D9-442C-9BC7-21FB19A0716D';
  var postTag = 'AD1488AB-59B9-481B-B09F-0CCC625F63E0';

  request.profile.tick('before solr');

  var boosts = [];
  // The boost function is adapted from recommendations seen here
  // http://www.slideshare.net/lucenerevolution/potter-timothy-boosting-documents-in-solr
  // The boost parameter only allows one top level function (as opposed to bf which allows multiple functions
  // with independent boosts) but has the advantage of being multiplicative with the tf-idf based BM25Similarity score
  // All the total multiplicative boosts are going to be > 1 so BOOST ALL THE THINGS! (We don't penalize)

  // The last edit boost is 1+.04/((ms since last edit in/ms in a year)+.06)
  // Max boost value 1.666 decaying to 1.27 afer 30 days, 1.13 after 90 days and so on...
  // 1+.04/.06 = max boost multiplier.
  // Lowering .04 and .06 makes the boost drop off faster.
  // var editRecencyBoost = "sum(1,recip(ms(NOW/HOUR,lastedit),3.16e-11,.04,.06))";

  // Old boost function, not optimal because it needs to calculate ordinality of this date
  // and calculates more relative values WRT to other pads as opposed to absolute recency
  //todo: replace with above after date field has been changed to TrieDateField and reindexed.
  boosts.push("sum(1,recip(rord(lastedit),1,1000,1000))");

  // The popularity boost is a multiplier > 1, max of 1.7 where up to 0.5 of the boost
  // comes from the viewsRecent scaled against ALL documents in the index
  // and up to 0.2 of the boost comes from viewTotal scaled against ALL documents in the index
  // todo: Consider other ways to map view count to a reasonable popularity rating.
  boosts.push("sum(1,scale(viewsRecent,0,0.5),scale(viewsTotal,0,0.2))");

  if (uid) {
    boosts.push("if(query({!v='creatorId:"+ uid +"'}),1.6,1)");
    boosts.push("if(query({!v='editorId:"+ uid +"'}),1.3,1)");
    boosts.push("if(query({!v='invitedId:"+ uid +"'}),1.3,1)");
  }

//  boosts.push("if(field(collectionCount), 1.4, 1)");

  var boostFn = "product("+boosts.join(",")+")";

  // todo: this is probably too expensive at scale
  var solrParams = {
    "wt": "json",
    "defType": "edismax",
    "q":userQuery,
    "q.op": "AND",
    "fq": filterQueryList,
    "qf": "title^2 contents", // DisMaxQParserPlugin query fields
    "pf": "title^2 contents", // DisMaxQParserPlugin phrase fields
    "boost": boostFn,
    "rows": limit,
    "start": start,
    "hl": true,

    // TODO: Play around with these to try to get correct highlighting,
    //       defined as each snippet containing (at least) a the full line text of
    //       a line with matches in it.
    //       See http://wiki.apache.org/solr/HighlightingParameters for bad docs
    // NOTE: hl.useFastVectorHighlighter requires a reindex, and only works on schema fields
    //       with termVectors, termPositions, and termOffsets turned on.
    //       Anecdotally it feels faster, btw ;-)

    //"hl.useFastVectorHighlighter": true,
    //"hl.boundaryScanner": "breakIterator",
    "hl.snippets": optSnippetCnt || 3,
    "hl.fragsize": optSnippetMaxSize || 80,
    "hl.bs.type": "SENTENCE",
    "hl.tag.pre": preTag,
    "hl.tag.post": postTag,
    "hl.simple.pre": preTag,
    "hl.simple.post": postTag,
    "hl.fl": "contents",
    "debugQuery":isDogfood(),
  };

  if (optFacet) {
    solrParams = jsutils.extend(solrParams, {
      // facets
      "facet": true,
      "facet.field": ["{!ex=invitedGroupId,authorId}invitedGroupId",
                      "{!ex=invitedGroupId,authorId}authorId"],
      "facet.limit": 10,
      "facet.mincount": 1,
      "fl": "id,title,lastedit,creatorId,lastEditorId"
    });
  }

  var results = _doSolrQuery(solrParams);

  var hits = [];
  var highlighting = {};
  var numFound = 0;
  var invitedGroupIds = [];
  var authorIds = [];
  var debugInfo = {};
  var queryTime = 0;
  if (results) {
    if (isDogfood() && results['debug']) {
      debugInfo = results['debug'];
      helpers.addClientVars({solrDebugInfo: debugInfo});
    }
    hits = results['response']['docs'];
    numFound = results['response']['numFound'];
    highlighting = results['highlighting'];
    if (optFacet) {
      invitedGroupIds = results['facet_counts']['facet_fields']['invitedGroupId'];
      authorIds = results['facet_counts']['facet_fields']['authorId'];
    }
  }

  var list = [];
  for (var i=0; i<hits.length && i<limit; i++) {
    var id = hits[i].id;
    var title = hits[i].title;
    // handle null titles gracefully, apparently JSONNull evaluates as truthy!
    if (title instanceof net.sf.json.JSONNull || !title) {
      title = '';
    } else {
      title = helpers.escapeHtml(title);
    }
    var snippet = '';

    if (highlighting[id] && highlighting[id].contents) {
      for (var j in highlighting[id].contents) {
        var aSnippet = highlighting[id].contents[j];
        //log.info("aSnippet='" + aSnippet + "'");

        // trim to char after first newline before first preTag
        // trim to char after first newline after last postTag
        aSnippet.split("\n").forEach(function(line) {
          if (line.indexOf(postTag) > line.indexOf(preTag)) {
            if (line[0] == '*') { line = line.substring(1); } // skip linemarker
            snippet += line + '\n';
          }
        });
      }
    }

    if (!optAllowNewLinesInSnippets) {
      snippet = trim(snippet).replace(/\n+/g, "\n").replace(/\n/g, "... ").replace(/\.\.\.+ ?/g, "... ");
    }

    snippet = helpers.escapeHtml(snippet);

    snippet = snippet.replace(title, '').replace(new RegExp(preTag, "g"), '<b class="hit">').replace(new RegExp(postTag, "g"), '</b>');

    var lastEditedDate;
    try {
      lastEditedDate = dateutils.dateParse(hits[i].lastedit, "yyyy-MM-dd'T'HH:mm:ss'Z'")
    } catch (ex) {
      log.warn("lastedit date parsing failed in search: "+ex);
    }

    list.push({
      title: title,
      id: globalToLocalId(id),
      localPadId: globalToLocalId(id),
      domainId: padutils.getDomainId(id),
      snippet: snippet,
      lastEditedDate: lastEditedDate,
      lastEditorId: hits[i].lastEditorId,
      creatorId: hits[i].creatorId
    });
  }

  request.profile.tick('before getGroupInfos');

  var filterGroupInfo = null;

  groupIds = [];
  for (var i = 0; i < invitedGroupIds.length; i += 2) {
    groupIds.push(invitedGroupIds[i]);
  }
  groupInfos = pro_groups.getGroupInfos(groupIds);
  pro_groups.decorateWithEncryptedIds(groupInfos);
  if (optFilterGroupId) {
    groupInfos.forEach(function(gi) {
      if (gi.groupId == optFilterGroupId) {
        filterGroupInfo = gi;
        return;
      }
    });
  }

  request.profile.tick('before decorateWithCollectionNames');

  decorateWithCollectionNames(list, groupInfos);

  request.profile.tick('before author infos');

  var filterAuthorInfo = null;

  authorInfos = [];
  for (var i = 0; i < authorIds.length; i += 2) {
    var uid = authorIds[i];
    var info = {
      name: pro_accounts.getFullNameById(uid),
      userLink: pro_accounts.getUserLinkById(uid),
      userPic: pro_accounts.getPicById(uid),
      encryptedId: pro_accounts.getEncryptedUserId(uid)
    };
    authorInfos.push(info);
    if (optFilterAuthorId && uid == optFilterAuthorId) {
      filterAuthorInfo = info;
    }
  }

  return {
    list:list,
    numFound: numFound,
    groupInfos: groupInfos,
    authorInfos: authorInfos,
    filterGroupInfo: filterGroupInfo,
    filterAuthorInfo: filterAuthorInfo,
    filterLastEdit: optFilterLastEdit
  };
}

function render_autocomplete_get() {
  if (!request.params.q || !trim(request.params.q)) {
    return true;
  }

  if (pro_accounts.getSessionProAccount() &&
      pro_accounts.getIsDomainGuest(pro_accounts.getSessionProAccount()) &&
      !domains.isPublicDomain()) {
    // don't let domain guests search
    renderJSON({success:true, data:[].join("\n")});
    return true;
  }

  var res = searchPads(request.params.q, 0, request.params.limit);
  var numFound = res.numFound;
  var list = res.list;
  var ret = [];
  for (var i = 0; i < list.length; i++) {
    var filteredTitle = list[i].title.replace(/[\|\n]/g, '');
    var filteredSnippet = list[i].snippet.replace(/\|/g, '');
    ret.push([filteredTitle, list[i].id, filteredSnippet].join('|'));
  }
  renderJSON({success:true, data:ret.join("\n"), numFound: numFound});
  return true;
}

function _renderSearchResultsAsStream(list) {
  var c = funhtml.DIV({id:"padtablecontainer"});
  var o = funhtml.DIV({id:"padtable", 'class':"streamtable"});
  c.push(o);

  var padTitles = helpers.getClientVar('padTitles') || {}; // maps localPadId -> title
  var canDelete = helpers.getClientVar('canDelete') || {};

  for (var i = 0; i < list.length; i++) {
    var snipHtml = list[i].snippet.split("\n").map(function(line) {
      return "<div class='ace-line'>" + line + "</div>";
    }).join("");

    var authorHtml = "";
    var picAuthorId = list[i].creatorId;
    var lastEditedDate = list[i].lastEditedDate;
    var lastEditorId = list[i].lastEditorId;

    if (lastEditorId && lastEditorId > -1) {
      authorHtml = "<a href='" + pro_accounts.getUserLinkById(lastEditorId) + "'>" + toHTML(pro_accounts.getFullNameById(lastEditorId)) + "</a>";
    }
    padTitles[list[i].id] = list[i].title;

    if ((getSessionProAccount() && getSessionProAccount().id == list[i].creatorId) || pro_accounts.isAdminSignedIn()) {
      canDelete[list[i].id] = 1;
    }

    var s = pro_padlist.renderPadStreamItem(list[i].id, list[i].title, list[i].isPinned, lastEditedDate, picAuthorId, authorHtml, snipHtml, null /* columnMeta */, { titleIsEscaped: true }, list[i].groupInfos);
    o.push(s);
  }

  helpers.addClientVars({
    padTitles: padTitles,
    canDelete: canDelete
  });

  return c;
}

function _buildFakeResult(padId, query){
  var title;

  pro_padmeta.accessProPad(padutils.getGlobalPadId(padId), function(ppad) {
    title = ppad.getDisplayTitle()
  });

  var fakeResult = {
    id: padId,
    title: title,
    isPinned: false,
    snippet: '<b class="hit">' + helpers.escapeHtml(query) + '</b>'
  }
  return fakeResult;
}

function _renderSearchResultsPage(template) {
  if (!request.params.q || !trim(request.params.q)) {
    return true; // show empty results
  }
  var start = parseInt(request.params.start||0);
  var limit = parseInt(request.params.limit||20);

  request.profile.tick('start');

  var filterGroupId = request.params.filterGroupId ? pro_groups.getGroupIdByEncryptedId(request.params.filterGroupId) : null;
  var filterAuthorId = request.params.filterAuthorId ? pro_accounts.getUserIdByEncryptedId(request.params.filterAuthorId) : null;
  var filterLastEdit = request.params.filterLastEdit || null;
  var resultIncludes = request.params.via;

  request.profile.tick('before searchPads');

  var result = searchPads(request.params.q, start, limit, 100/*optSnippetCnt*/, 1000/*optSnippetMaxSize*/, true/*optAllowNewLinesInSnippets*/, filterGroupId, filterAuthorId, filterLastEdit, true /* optFacet */);

  if (resultIncludes) {
    var padFound = false;
    result.list.every(function(r) {
      if (r.id == resultIncludes) {
        padFound = true;
        return;
      }
    });
    if (!padFound) {
      var fakePadResult = _buildFakeResult(resultIncludes, request.params.q);
      result.numFound += 1;
      result.list.unshift(fakePadResult);
    }
  }

  var bodyClass = [request.userAgent.isIPad() ? "ipad" : "", "searchResultPage"].join(" ");

  request.profile.tick('before _renderSearchResultsAsStream');

  var padListHtml = _renderSearchResultsAsStream(result.list);

  request.profile.tick('before renderTemplateAsString');

  return renderTemplateAsString(template, {
    padListHtml: padListHtml,
    bodyClass: bodyClass,
    query: request.params.q,
    start: start,
    limit: limit,
    numFound: result.numFound,
    pageSize: 20,
    groupInfos: result.groupInfos,
    authorInfos: result.authorInfos,
    filterGroupInfo: result.filterGroupInfo,
    filterAuthorInfo: result.filterAuthorInfo,
    filterLastEdit: result.filterLastEdit
  });
}

function render_search_get() {
  renderFramedHtml(_renderSearchResultsPage('pro/pro_search.ejs'));
  return true;
}
//render_main_get = render_search_get;

function render_search_live_get() {
  response.write(_renderSearchResultsPage('pro/pro_search_live.ejs'));
  return true;
}


function render_reindex_both () {
  pro_accounts.requireAdminAccount();

  appjet.cache.padsReindexed = 0;
  appjet.cache.padsReindexedStart = new Date();
  execution.scheduleTask('indexer', 'reindexPadsBatch', 0, [0, 1000]);
  response.write("Ok");
}

function render_reindex_status_get () {
  var status = "Pads reindexed: "+appjet.cache.padsReindexed || "None";
  status += "\nTime elapsed: "+ appjet.cache.padsReindexedTimeElapsed;
  response.write(status);
}

serverhandlers.tasks.reindexPadsBatch = function(firstPadId, count) {
  // re-index count pads and schedule the next batch
  var rows = sqlobj.selectMulti('pro_padmeta', {id: ['between', [firstPadId, firstPadId+count-1]], isDeleted: false, isArchived: false});
  if (!rows.length) {
    return;
  }
  for (var i=0; i<rows.length; i++) {
    if (isProduction() && !domains.domainIsOnThisServer(rows[i].domainId)) {
      continue;
    }
    var globalPadId = padutils.makeGlobalId(rows[i].domainId, rows[i].localPadId);

    try {
      model.accessPadGlobal(globalPadId, function(pad) {
        model.updateSolrIndexForPad(globalPadId);
        appjet.cache.padsReindexed += 1;

        if (collab_server.getNumConnections(pad) > 0) {
          // don't mess with active pads.
          return null;
        }

        // flush the pad if it's freshly loaded
        if (!pad._meta.status.lastAccess) {
          dbwriter.writePadNow(pad, true/*and flush*/);
        }

        model.flushModelCacheForPad(globalPadId, pad.getHeadRevisionNumber());
      });


    } catch(e) {
      log.warn("Failed to re-index pad " + globalPadId);
    }
  }
  execution.scheduleTask('indexer', 'reindexPadsBatch', 200, [firstPadId+count, count]);
}

function onStartup() {
  execution.initTaskThreadPool("indexer", 1);
}

function onRequest() {
  if (!(domains.isPrimaryDomainRequest() || domains.isPublicDomain())) {
    pro_accounts.requireAccount();
  }
}

function render_flush_deleted_both() {
  pro_accounts.requireAdminAccount();

  ppadRows = sqlobj.selectMulti('pro_padmeta', {isDeleted: true, isArchived: false}, { orderBy: 'id' });

  var start = parseInt(request.params.start) || 0;
  var end = ppadRows.length;
  if (request.params.limit) {
    end = Math.min(start + parseInt(request.params.limit), end);
  }
  var body = "<delete>";

  for (var i=start; i<end; i++) {
    var ppadRow = ppadRows[i];
    var globalPadId = padutils.makeGlobalId(ppadRow.domainId, ppadRow.localPadId);

    body += "<id>"+globalPadId+ "</id>";
    response.write(globalPadId + "<br/>");
  }

  body += "</delete>";

  response.write(urlPost("http://" + appjet.config.solrHostPort + "/solr/update", body,
    { "Content-Type": "text/xml; charset=utf-8" }).status);

  return true;
}


/*
  Returns: List of hashtags and occurance count for each
    {"success":true,"data":{"#xxx":2,"#in":1,"#internet":1,"#the":1,"#yyy":1,"#z":1}}
  Optional Arguments:
    q - prefix for hashtags, if not supplied returns all hastags
    authorId - limit tags returned to those in documents where authorId has edited
*/
function render_hashtags_get() {
  var authorFilterId = request.params.authorId;
  var query = request.params.q;

  if (pro_accounts.getSessionProAccount() &&
      pro_accounts.getIsDomainGuest(pro_accounts.getSessionProAccount()) &&
      !domains.isPublicDomain()) {
    // don't let domain guests search
    renderJSON({success:true, data:[].join("\n")});
    return true;
  }

  var terms = getHashtags(authorFilterId, query);

  renderJSON({success:true, data:terms});
  return true;
}

function getHashtags(authorFilterId, query) {
  var filterQueryList = ["domainId:" + domains.getRequestDomainId()];
  var userQuery = trim(query||"").replace(ESCAPE_SOLR_CHARS_RE, "\\$1");

  var results = _doSolrQuery({
    "wt": "json",
    "fq": filterQueryList,
    "q": "terms:ht_*" + (authorFilterId ? " AND authorId:" + authorFilterId : ""),
    "rows": 0,
    "facet": true,
    "facet.field": "terms",
    "facet.prefix": "ht_" + userQuery,
    "facet.mincount": 1,
    "facet.method": "enum"
  });

  var terms = {};
  if (results) {
    termcounts = results['facet_counts']['facet_fields']['terms'];
    while(termcounts.length) {
      var ht = termcounts.shift();
      var htcount = termcounts.shift();
      if (ht.match(/^ht_[0-9]+$/)) {
        continue; // hack: skip number-only hashtags
      }
      if (ht.match(/^ht_ht_/)) {
        continue; // hack: ##+ aren't hashtags
      }
      if (ht.match(/^ht_\S{0,1}$/)) {
        continue; // skip 0 and 1 character hashtags
      }
      terms[ht.replace(/^ht_/, '#')] = htcount;
    }
  }
  return terms;
}


function _doSolrQuery(params) {
  var solrUrl = "http://" + appjet.config.solrHostPort + "/solr/select";
  var resp = urlPost(solrUrl, params, undefined /* options */, true /* acceptErrorCodes */);
  if (resp.status == 200) {
    var respObj = fastJSON.parse(resp.content);
    return respObj;
  } else if (resp.status >= 400) {
    var errMsg;
    try {
      var respObj = fastJSON.parse(resp.content);
      errMsg = respObj.error.msg;
    } catch(ex) {
      errMsg = resp.content;
    }
    throw Error(errMsg);
  }
}

function getPublicPads(start, limit, opts) {
  opts = jsutils.extend({
    visibility: "visible",
    domains: [],
  }, opts);

  var filterQueryList = [];

  if (opts.domains.length) {
    var domainsFilter = opts.domains.map(function(id) { return "domainId:"+id;}).join(" OR ");
    filterQueryList.push(domainsFilter);
  }
  // get pads with more than two revisions
  // disable this until we change the revision field to use TrieIntField
  // IntField orders lexicographically therefore range queries don't work as expected
  // filterQueryList.push("revision:[2 TO *]");
  filterQueryList.push("guestpolicy:allow");
  if (opts.visibility == "visible") {
    filterQueryList.push("-visibility:hidden");
  } else if (opts.visibility == "hidden") {
    filterQueryList.push("visibility:hidden");
  }

  var results = _doSolrQuery({
    "wt": "json",
    "fq": filterQueryList,
    "q": "*",
    "defType":"edismax",
    "boost": "sum(1,recip(rord(lastedit),1,1000,1000))",
    "rows": limit || 100,
    "start": start || 0,
  });

  var padObjects = [];
  if (results) {
    var pads = results['response']['docs'];
    pads.forEach(function(pad) {
      if (pad.revision >= 40) {
        padObjects.push({
          globalPadId: pad.id,
          domainId: padutils.getDomainId(pad.id),
          localPadId: padutils.globalToLocalId(pad.id),
          lastEditedDate: dateutils.dateParse(pad.lastedit, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
          title: pad.title,
          lastEditorId: pad.lastEditorId,
          creatorId: pad.creatorId,
        });
      }
    })
  }
  return padObjects;
}
