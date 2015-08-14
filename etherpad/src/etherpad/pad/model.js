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

import("fastJSON");
import("sqlbase.sqlbase");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("timer");
import("sync");
import("netutils.urlPost");
import("dateutils");

import("etherpad.collab.ace.easysync2.{Changeset,AttribPool}");
import("etherpad.log");
import("etherpad.pad.padevents");
import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.dbwriter");
import("etherpad.pad.pad_migrations");
import("etherpad.pad.pad_security");
import("etherpad.pad.pad_access");
import("etherpad.pad.search");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_pad_tracking");
import("etherpad.pro.domains");
import("etherpad.collab.collab_server");
import("cache_utils.syncedWithCache");
import("etherpad.utils.renderTemplateAsString");

jimport("net.appjet.common.util.LimitedSizeMapping");

jimport("java.lang.System.out.println");

jimport("java.util.concurrent.ConcurrentHashMap");
jimport("net.appjet.oui.GlobalSynchronizer");
jimport("net.appjet.oui.exceptionlog");

function onStartup() {
  appjet.cache.pads = {};
  appjet.cache.pads.meta = new ConcurrentHashMap();
  appjet.cache.pads.temp = new ConcurrentHashMap();
  appjet.cache.pads.revs = new ConcurrentHashMap();
  appjet.cache.pads.revs10 = new ConcurrentHashMap();
  appjet.cache.pads.revs100 = new ConcurrentHashMap();
  appjet.cache.pads.revs1000 = new ConcurrentHashMap();
  appjet.cache.pads.chat = new ConcurrentHashMap();
  appjet.cache.pads.revmeta = new ConcurrentHashMap();
  appjet.cache.pads.authors = new ConcurrentHashMap();
  appjet.cache.pads.apool = new ConcurrentHashMap();
  appjet.cache.pads.segments = new ConcurrentHashMap();
}

var _JSON_CACHE_SIZE = 10000;
//var XML_UNSAFE_CHARS_RE = new RegExp(/[^\u0009\u000A\u000D\u0020-\ud7ff\ue000-\ufffd\u10000-\u10fff]/g);
var XML_UNSAFE_CHARS_RE = new RegExp(/[^\u0009\u000A\u000D\u0020-\ud7ff\ue000-\ufffd]/g);

// to clear: appjet.cache.padmodel.modelcache.map.clear()
function _getModelCache() {
  return syncedWithCache('padmodel.modelcache', function(cache) {
    if (! cache.map) {
      cache.map = new LimitedSizeMapping(_JSON_CACHE_SIZE);
    }
    return cache.map;
  });
}

function cleanText(txt) {
  return txt.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\t/g, '        ').replace(/\xa0/g, ' ');
}

/**
 * Access a pad object, which is passed as an argument to
 * the given padFunc, which is executed inside an exclusive lock,
 * and return the result.  If the pad doesn't exist, a wrapper
 * object is still created and passed to padFunc, and it can
 * be used to check whether the pad exists and create it.
 *
 * Note: padId is a GLOBAL id.
 */
function accessPadGlobal(padId, padFunc, rwMode, skipAccessCheck) {
  // this may make a nested call to accessPadGlobal, so do it first
  if (!skipAccessCheck) {
    pad_security.checkAccessControl(padId, rwMode);
  }

  // pad is never loaded into memory (made "active") unless it has been migrated.
  // Migrations do not use accessPad, but instead access the database directly.
  //pad_migrations.ensureMigrated(padId, true);

  var mode = (rwMode || "rw").toLowerCase();
  var lastAccess = +new Date();

  if (! appjet.requestCache.padsAccessing) {
    appjet.requestCache.padsAccessing = {};
  }
  if (appjet.requestCache.padsAccessing[padId]) {
    // nested access to same pad
    var p = appjet.requestCache.padsAccessing[padId];
    var m = p._meta;
    if (m && mode != "r") {
      m.status.dirty = true;
    }
    return padFunc(p);
  }

  return doWithPadLock(padId, function() {
    return sqlcommon.inTransaction(function() {
      var meta = _getPadMetaData(padId); // null if pad doesn't exist yet

      if (meta && ! meta.status) {
        meta.status = { validated: false };
      }

      function getCurrentAText() {
        var tempObj = pad.tempObj();
        if (! tempObj.atext) {
          tempObj.atext = pad.getInternalRevisionAText(meta.head);
        }
        return tempObj.atext;
      }
      function addRevision(theChangeset, author, optDatestamp) {
        var atext = getCurrentAText();
        var newAText = Changeset.applyToAText(theChangeset, atext, pad.pool());
        Changeset.copyAText(newAText, atext); // updates pad.tempObj().atext!

        var newRev = ++meta.head;

        var revs = _getPadStringArray(padId, "revs");
        revs.setEntry(newRev, theChangeset);

        var revmeta = _getPadStringArray(padId, "revmeta");
        var thisRevMeta = {t: (optDatestamp || (+new Date())),
          a: getNumForAuthor(author)};
        if ((newRev % meta.keyRevInterval) == 0) {
          thisRevMeta.atext = atext;
        }
        revmeta.setJSONEntry(newRev, thisRevMeta);

        updateCoarseChangesets(true);
        updateSegments(theChangeset, thisRevMeta.t, author);

        delete pad.tempObj().taskCounts;
      }
      function getNumForAuthor(author, dontAddIfAbsent) {
        return pad.pool().putAttrib(['author',author||''], dontAddIfAbsent);
      }
      function getAuthorForNum(n) {
        // must return null if n is an attrib number that isn't an author
        var pair = pad.pool().getAttrib(n);
        if (pair && pair[0] == 'author') {
          return pair[1];
        }
        return null;
      }

      function updateCoarseChangesets(onlyIfPresent) {
        // this is fast to run if the coarse changesets
        // are up-to-date or almost up-to-date;
        // if there's no coarse changeset data,
        // it may take a while.

        if (! meta.coarseHeads) {
          if (onlyIfPresent) {
            return;
          }
          else {
            meta.coarseHeads = {10:-1, 100:-1, 1000:-1};
          }
        }
        var head = meta.head;
        // once we reach head==9, coarseHeads[10] moves
        // from -1 up to 0; at head==19 it moves up to 1
        var desiredCoarseHeads = {
          10: Math.floor((head-9)/10),
          100: Math.floor((head-99)/100),
          1000: Math.floor((head-999)/1000)
        };
        var revs = _getPadStringArray(padId, "revs");
        var revs10 = _getPadStringArray(padId, "revs10");
        var revs100 = _getPadStringArray(padId, "revs100");
        var revs1000 = _getPadStringArray(padId, "revs1000");
        var fineArrays = [revs, revs10, revs100];
        var coarseArrays = [revs10, revs100, revs1000];
        var levels = [10, 100, 1000];
        var dirty = false;
        for(var z=0;z<3;z++) {
          var level = levels[z];
          var coarseArray = coarseArrays[z];
          var fineArray = fineArrays[z];
          while (meta.coarseHeads[level] < desiredCoarseHeads[level]) {
            dirty = true;
            // for example, if the current coarse head is -1,
            // compose 0-9 inclusive of the finer level and call it 0
            var x = meta.coarseHeads[level] + 1;
            var cs = fineArray.getEntry(10 * x);
            for(var i=1;i<=9;i++) {
              cs = Changeset.compose(cs, fineArray.getEntry(10*x + i),
                                     pad.pool());
            }
            coarseArray.setEntry(x, cs);
            meta.coarseHeads[level] = x;
          }
        }
        if (dirty) {
          meta.status.dirty = true;
        }
      }

      function updateSegments(theChangeset, timestamp, author, optRevNum, optForce) {
        if (meta.segment == undefined) {
          if (!optForce) { return; }
          meta.segment = -1;
        }

        var segments = _getPadStringArray(padId, "segments");
        var lastSegment = segments.getJSONEntry(meta.segment);
        var revNum = optRevNum == undefined ? meta.head : optRevNum;

        var MAX_GAP = 30 * 60 * 1000; // 30 minutes
        if (lastSegment && (timestamp - lastSegment.endTime) < MAX_GAP) {
          lastSegment.endTime = timestamp;
          lastSegment.endRev = revNum;
          lastSegment.cs = Changeset.compose(lastSegment.cs, theChangeset, pad.pool());
          if (author && lastSegment.authors.indexOf(author) == -1) {
            lastSegment.authors.push(author);
          }
          segments.setJSONEntry(meta.segment, lastSegment);
        } else {
          var newSegment = {
            startTime: timestamp, startRev: revNum,
            endTime: timestamp, endRev: revNum,
            cs: theChangeset,
            authors: author ? [author] : [] };
          segments.setJSONEntry(++meta.segment, newSegment);
          meta.status.dirty = true;
        }
      }

      function populateSegments() {

        if (meta.segment != undefined && meta.segment != -1) {
          return;
        }
        /* -- Force segment recreate
        meta.segment = -1;
        _getPadStringArray(padId, "segments").setJSONEntry(null);
        */

        var revmeta = _getPadStringArray(padId, "revmeta");
        var revs = _getPadStringArray(padId, "revs");
        try {
          for (var i=0; i<=meta.head; i++) {
            var metaEntry = revmeta.getJSONEntry(i);
            var author = getAuthorForNum(metaEntry.a);
            var timestamp = metaEntry.t;
            var cs = revs.getEntry(i);
            updateSegments(cs, timestamp, author, i, true /* force */);
          }
        } catch (ex) {
          log.logException("Failed to populate segments for pad " + padId);
        }
      }

      /////////////////// "Public" API starts here (functions used by collab_server or other modules)
      var pad = {
        // Operations that write to the data structure should
        // set meta.dirty = true.  Any pad access that isn't
        // done in "read" mode also sets dirty = true.
        getId: function() { return padId; },
        exists: function() { return !!meta; },
        lastAccessed: function () { return meta.status.lastAccess; },
        create: function(optText, optTitle) {
          meta = {};
          meta.head = -1; // incremented below by addRevision
          meta.segment = -1;
          pad.tempObj().atext = Changeset.makeAText("\n");
          meta.padId = padId,
          meta.keyRevInterval = 100;
          meta.numChatMessages = 0;
          var t = +new Date();
          meta.status = { validated: true };
          meta.status.lastAccess = t;
          meta.status.dirty = true;
          meta.supportsTimeSlider = true;
          meta.dataRoot = {};
          var padDomainId = padutils.getDomainId(padId);
          if (!padDomainId) {
            throw Error("Impossible");
          }

          if (padDomainId == domains.getPrimaryDomainId()) {
            meta.dataRoot.padOptions = { guestPolicy: "link" };
          } else {
            var policy = domains.isPublicDomain(padDomainId) ? "allow" : (pro_config.getConfig(padDomainId).defaultGuestPolicy || "domain"); //
            meta.dataRoot.padOptions = { guestPolicy: policy };
          }

          var firstChangeset = Changeset.makeSplice("\n", 0, 0,
            cleanText(optText || ''));
          addRevision(firstChangeset, '');

          _insertPadMetaData(padId, meta);

          sqlobj.insert("PAD_SQLMETA", {
            id: padId, version: 2, creationTime: new Date(t), lastWriteTime: new Date(),
            headRev: meta.head, // headRev is not authoritative, just for info
            guestPolicy: meta.dataRoot.padOptions.guestPolicy });

          padevents.onNewPad(pad, optTitle);
        },
        destroy: function(delaySolrCommit) { // you may want to collab_server.bootAllUsers first
          padevents.onDestroyPad(pad);

          var body = renderTemplateAsString('solr/delete.ejs', {
            "id": padId
          });

          var commitParam = delaySolrCommit ? "" : "commit=true";
          urlPost("http://" + appjet.config.solrHostPort + "/solr/update?" + commitParam, body,
                  { "Content-Type": "text/xml; charset=utf-8" });

          _destroyPadStringArray(padId, "revs");
          _destroyPadStringArray(padId, "revs10");
          _destroyPadStringArray(padId, "revs100");
          _destroyPadStringArray(padId, "revs1000");
          _destroyPadStringArray(padId, "revmeta");
          _destroyPadStringArray(padId, "chat");
          _destroyPadStringArray(padId, "authors");
          _destroyPadStringArray(padId, "segments");
          _removePadMetaData(padId);
          _removePadAPool(padId);
          sqlobj.deleteRows("PAD_SQLMETA", { id: padId });
          meta = null;
        },
        writeToDB: function() {
          var meta2 = {};
          for(var k in meta) meta2[k] = meta[k];
          var syndicationUpToDateRev = meta.status.syndicationUpToDateRev;
          delete meta.status.syndicationUpToDateRev;
          delete meta2.status;
          sqlbase.putJSON("PAD_META", padId, meta2);

          _getPadStringArray(padId, "revs").writeToDB();
          _getPadStringArray(padId, "revs10").writeToDB();
          _getPadStringArray(padId, "revs100").writeToDB();
          _getPadStringArray(padId, "revs1000").writeToDB();
          _getPadStringArray(padId, "revmeta").writeToDB();
          _getPadStringArray(padId, "chat").writeToDB();
          _getPadStringArray(padId, "authors").writeToDB();
          _getPadStringArray(padId, "segments").writeToDB();
          sqlbase.putJSON("PAD_APOOL", padId, pad.pool().toJsonable());

          var props = { headRev: meta.head, lastWriteTime: new Date(), guestPolicy: pad.getGuestPolicy()};
          if (typeof(syndicationUpToDateRev) != "undefined") {
            props.lastSyndicatedRev = syndicationUpToDateRev;
          }
          _writePadSqlMeta(padId, props);

          // cache now to speed up padlisting
          pad.getTaskCounts();

          // only update SOLR for pro-pads
          if (padutils.isProPadId(padId)) {
            pad.updateSolrIndex();
          }
        },
        pool: function() {
          return _getPadAPool(padId);
        },
        setSyndicationUpToDateRev: function(rev) {
          meta.status.syndicationUpToDateRev = rev;
        },
        getHeadRevisionNumber: function() { return meta.head; },
        forceSetHeadRevisionNumber: function(r, optAllowNewer, opt_skipChecks) {
          if (r < 0 || (!optAllowNewer && r > meta.head)) {
            return;
          }
          removeFromMemory(pad);
          appjet.cache.pads.temp.remove(padId);
          meta.head = r;

          if (!opt_skipChecks) {
            // reset coarse heads
            meta.coarseHeads = {10:-1, 100:-1, 1000:-1};
            updateCoarseChangesets();

            // Force segment recreate
            meta.segment = -1;
            populateSegments();
          }
        },
        getRevisionAuthor: function(r) {
          var n = _getPadStringArray(padId, "revmeta").getJSONEntry(r).a;
          return getAuthorForNum(Number(n));
        },
        getRevisionChangeset: function(r) {
          return _getPadStringArray(padId, "revs").getEntry(r);
        },
        tempObj: function() { return _getPadTemp(padId); },
        getKeyRevisionNumber: function(r) {
          return Math.floor(r / meta.keyRevInterval) * meta.keyRevInterval;
        },
        getInternalRevisionAText: function(r) {
          var cacheKey = "atext/C/"+r+"/"+padId;
          var modelCache = _getModelCache();
          var cachedValue = modelCache.get(cacheKey);
          if (padId == "v7g8AbDDfg0" || padId == "1$v7g8AbDDfg0" ||
              padId=="x1xVcW2sFp8" || padId =="1$x1xVcW2sFp8") {
            cachedValue = null;
          }

          if (cachedValue) {
            modelCache.touch(cacheKey);
            //java.lang.System.out.println("HIT! "+cacheKey);
            return Changeset.cloneAText(cachedValue);
          }
          //java.lang.System.out.println("MISS! "+cacheKey);

          var keyRev = pad.getKeyRevisionNumber(r);
          var revmeta = _getPadStringArray(padId, "revmeta");
          var atext = revmeta.getJSONEntry(keyRev).atext;
          var curRev = keyRev;
          var targetRev = r;
          var apool = pad.pool();
          while (curRev < targetRev) {
            curRev++;
            var cs = pad.getRevisionChangeset(curRev);
            atext = Changeset.applyToAText(cs, atext, apool);
          }
          modelCache.put(cacheKey, Changeset.cloneAText(atext));
          return atext;
        },

        getReconstructedAText: function() {
          var keyRev = 0;
          var revmeta = _getPadStringArray(padId, "revmeta");
          var atext = revmeta.getJSONEntry(keyRev).atext;
          var curRev = keyRev;
          var targetRev = meta.head;
          var apool = pad.pool();
          while (curRev < targetRev) {
            curRev++;
            var cs = pad.getRevisionChangeset(curRev);
            atext = Changeset.applyToAText(cs, atext, apool);
          }
          return atext;
        },

        getRecoveredAText: function(r) {
          var keyRev = meta.keyRevInterval;
          var revmeta = _getPadStringArray(padId, "revmeta");

          while(revmeta.getEntry(keyRev)) {
            keyRev += meta.keyRevInterval;
          }
          keyRev -= meta.keyRevInterval;
          if (keyRev >=0) {
            var atext = revmeta.getJSONEntry(keyRev).atext;
            curRev = keyRev;
            while (curRev < keyRev + meta.keyRevInterval) {
              curRev++;
              var cs = pad.getRevisionChangeset(curRev);
              if (cs) {
                try {
                  atext = Changeset.applyToAText(cs, atext, apool);
                } catch (e) {
                  return atext;
                }
              } else {
                return atext;
              }
            }
            return atext;
          }
          return {text:'', attribs:''};
        },
        getInternalRevisionText: function(r, optInfoObj) {
          var atext = pad.getInternalRevisionAText(r);
          var text = atext.text;
          if (optInfoObj) {
            if (text.slice(-1) != "\n") {
              optInfoObj.badLastChar = text.slice(-1);
            }
          }
          return text;
        },
        getRevisionText: function(r, optInfoObj) {
          var internalText = pad.getInternalRevisionText(r, optInfoObj);
          return internalText.slice(0, -1);
        },
        atext: function() { return Changeset.cloneAText(getCurrentAText()); },
        text: function() { return pad.atext().text; },
        getRevisionDate: function(r) {
          var revmeta = _getPadStringArray(padId, "revmeta");
          return new Date(revmeta.getJSONEntry(r).t);
        },
        // note: calls like appendRevision will NOT notify clients of the change!
        // you must go through collab_server.
        // Also, be sure to run cleanText() on any text to strip out carriage returns
        // and other stuff.
        appendRevision: function(theChangeset, author, optDatestamp) {
          addRevision(theChangeset, author || '', optDatestamp);
        },
        setImportedFrom: function(obj) {
          meta.importedFrom = obj;
        },
        setForkedFrom: function(obj) {
          meta.forkedFrom = obj;
        },
        getForkedFrom: function(obj) {
          return meta.forkedFrom;
        },
        setTags: function(obj) {
          meta.tags = obj;
        },
        getTags: function(obj) {
          return meta.tags;
        },
        appendChatMessage: function(obj) {
          var index = meta.numChatMessages;
          meta.numChatMessages++;
          var chat = _getPadStringArray(padId, "chat");
          chat.setJSONEntry(index, obj);
        },
        getNumChatMessages: function() {
          return meta.numChatMessages;
        },
        getChatMessage: function(i) {
          var chat = _getPadStringArray(padId, "chat");
          return chat.getJSONEntry(i);
        },
        getPadOptionsObj: function() {
          var data = pad.getDataRoot();
          if (! data.padOptions) {
            data.padOptions = {};
          }
          if ((! data.padOptions.guestPolicy) ||
            (data.padOptions.guestPolicy == 'ask')) {
            data.padOptions.guestPolicy = 'deny';
          }
          return data.padOptions;
        },
        getGuestPolicy: function() {
          // anon/allow/ask/deny/friends
          return pad.getPadOptionsObj().guestPolicy;
        },
        setGuestPolicy: function(policy) {
          pad.getPadOptionsObj().guestPolicy = policy;
          pad_security.clearPadUserAccessCache(padId);
          delete pad.getPadOptionsObj().groupId;
        },
        getGuestPolicies: function() {
          var policies = [ 'deny', 'allow' ];
          if (domains.isPrimaryDomainRequest()) {
            policies.push('link');
          } else {
            policies.push('domain');
            if (pro_config.getConfig().allowMemberLinkAccess) {
              policies.push('link');
            }
          }
          if (policies.indexOf(pad.getGuestPolicy()) == -1) {
            policies.push(pad.getGuestPolicy());
          }
          return policies;
        },
        getGroupId: function() {
          return pad.getPadOptionsObj().groupId;
        },
        setGroupId: function(groupId) {
          pad.getPadOptionsObj().guestPolicy = "deny";
          pad.getPadOptionsObj().groupId = groupId;
        },
        getIsEmbeddedEditor: function() {
          return pad.getPadOptionsObj().embeddedEditor;
        },
        setIsEmbeddedEditor: function(allow) {
          pad.getPadOptionsObj().embeddedEditor = allow;
        },
        getIsModerated: function() {
          return pad.getPadOptionsObj().isModerated;
        },
        setIsModerated: function(allow) {
          pad.getPadOptionsObj().isModerated = allow;
        },
        getDataRoot: function() {
          var dataRoot = meta.dataRoot;
          if (! dataRoot) {
            dataRoot = {};
            meta.dataRoot = dataRoot;
          }
          return dataRoot;
        },
        // returns an object, changes to which are not reflected
        // in the DB;  use setAuthorData for mutation
        getAuthorData: function(author) {
          var authors = _getPadStringArray(padId, "authors");
          var n = getNumForAuthor(author, true);
                if (n < 0) {
                  return null;
                }
                else {
            return authors.getJSONEntry(n);
                }
        },
        setAuthorData: function(author, data) {
          var authors = _getPadStringArray(padId, "authors");
          var n = getNumForAuthor(author);
          authors.setJSONEntry(n, data);
        },
        adoptChangesetAttribs: function(cs, oldPool) {
          return Changeset.moveOpsToNewPool(cs, oldPool, pad.pool());
        },
        eachATextAuthor: function(atext, func) {
          var seenNums = {};
          Changeset.eachAttribNumber(atext.attribs, function(n) {
            if (! seenNums[n]) {
              seenNums[n] = true;
              var author = getAuthorForNum(n);
              if (author) {
        	func(author, n);
              }
            }
          });
        },
        eachATextLink: function(atext, func) {
          var linksSeen = [];
          Changeset.eachAttribNumber(atext.attribs, function(n) {
            var pair = pad.pool().getAttrib(n);
            if (pair && pair[0] == 'link') {
              if (linksSeen.indexOf(pair[1]) == -1) {
                linksSeen.push(pair[1]);
                func(pair[1]);
              }
            }
          });
        },
        eachATextTableCellValue: function(atext, func) {
          Changeset.eachAttribNumber(atext.attribs, function(n) {
            var pair = pad.pool().getAttrib(n);
            if (pair && pair[0].split(":").length == 2) {
              func(pair[1]);
            }
          });
        },
        getTaskCounts: function() {
          var tempObj = pad.tempObj();
          if (!tempObj.taskCounts) {
            var completed = 0;
            var open = 0;
            try {
              Changeset.eachAttribNumber(pad.atext().attribs, function(n) {
                var pair = pad.pool().getAttrib(n);
                if (pair && pair[0] == 'list') {
                  if (pair[1].indexOf('taskdone') > -1) {
                    completed++;
                  } else if (pair[1].indexOf('task') > -1) {
                    open++;
                  }
                }
              });
            } catch (ex) {
              log.logException(ex);
            }
            tempObj.taskCounts = { completed: completed, open: open };
          }
          return tempObj.taskCounts;
        },
        getOutgoingPadLinks: function() {
          var links = [];
          pad.eachATextLink(pad.atext(), function(url) { links.push(url); });
          return links;
        },
        getCoarseChangeset: function(start, numChangesets) {
          updateCoarseChangesets();

          if (!(numChangesets == 10 || numChangesets == 100 ||
                numChangesets == 1000)) {
            return null;
          }
          var level = numChangesets;
          var x = Math.floor(start / level);
          if (!(x >= 0 && x*level == start)) {
            return null;
          }

          var cs = _getPadStringArray(padId, "revs"+level).getEntry(x);

          if (! cs) {
            return null;
          }

          return cs;
        },
        getSupportsTimeSlider: function() {
          if (! ('supportsTimeSlider' in meta)) {
            if (padutils.isProPadId(padId)) {
              return true;
            }
            else {
              return false;
            }
          }
          else {
            return !! meta.supportsTimeSlider;
          }
        },
        setSupportsTimeSlider: function(v) {
          meta.supportsTimeSlider = v;
        },
        setTitleIsReadOnly: function() {
          meta.titleIsReadOnly = true;
        },
        getTitleIsReadOnly: function() {
          return !! meta.titleIsReadOnly;
        },
        setIsWikiText: function(v) {
          meta.isWikiText = v;
        },
        getIsWikiText: function() {
          return !! meta.isWikiText;
        },
        getMostRecentEditSegments: function(count, filterFn, timeLimit) {
          populateSegments();

          var segmentIdx = meta.segment;
          var segments = _getPadStringArray(padId, "segments");
          var recentSegments = [];
          var matchedOneSegment = false;

          function now() { return (new Date()).getTime(); }

          var startTime = now();
          var isTimeUp = function() {
            if (timeLimit) {
              var elapsed = now() - startTime;
              return elapsed >= timeLimit;
            }
            return false;
          };

          while (segmentIdx >= 0 && count > 0 && !isTimeUp()) {
            var segment = segments.getJSONEntry(segmentIdx);
            if (!filterFn || filterFn(segment) || matchedOneSegment) {
              matchedOneSegment = true;
              recentSegments.push(
                [segment.startRev, segment.endRev, segment.authors, segment.endTime, segment.cs]);
              count--;
            }
            segmentIdx--;
          }

          return recentSegments;
        },
        getPadSqlMeta: function() {
          return _getPadSqlMeta(pad.getId());
        },

        getEditSegmentsForRange: function(from, to) {
          // iterate through all the metadatas
          var segments = [];
          var currentSegmentAuthors = null;
          var currentSegmentStartRev = null;
          var currentSegmentEndRev = null;
          var currentSegmentStartTime = null;
          var currentSegmentEndTime = null;
          var revmeta = _getPadStringArray(padId, "revmeta");

          for (var i=from; i<=to; i++) {
            var metaEntry = revmeta.getJSONEntry(i);
            var author = getAuthorForNum(metaEntry.a);

            var MAX_GAP = 30 * 60 * 1000; // 30 minutes
            if (currentSegmentAuthors == null || metaEntry.t - currentSegmentEndTime > MAX_GAP) {
              // save old segment
              if (currentSegmentAuthors) {
                segments.push([currentSegmentStartRev, currentSegmentEndRev, currentSegmentAuthors, currentSegmentEndTime]);
              }

              // start a new segment
              currentSegmentAuthors = [author];
              currentSegmentStartRev = currentSegmentEndRev = i;
              currentSegmentStartTime = currentSegmentEndTime = metaEntry.t;
            } else {
              if ((currentSegmentAuthors.indexOf(author) < 0)) {
                currentSegmentAuthors.push(author);
              }
              currentSegmentEndRev = i;
              currentSegmentEndTime = metaEntry.t;
            }
          }

          // flush last segment
          currentSegmentAuthors = currentSegmentAuthors || [];
          segments.push([currentSegmentStartRev, currentSegmentEndRev, currentSegmentAuthors, currentSegmentEndTime]);
          return segments.reverse();
        },
        getChangesetBetweenRevisions: function(from, to) {
          // accumulate all the relevant changes into a single changeset
          var revs = _getPadStringArray(padId, "revs");
          var cs = revs.getEntry(from);

          // todo: this is kind of inefficient since we do it separately from getDiffATextForChangeRange
          var i = from+1;
          while(i <= to) {
            if (i % 1000 == 0 && i+1000 <= to) {
              cs = Changeset.compose(cs, pad.getCoarseChangeset(i, 1000), this.pool());
              i = i + 1000;
            } else if (i % 100 == 0 && i+100 <= to) {
              cs = Changeset.compose(cs, pad.getCoarseChangeset(i, 100), this.pool());
              i = i + 100;
            } else if (i % 10 == 0 && i+10 <= to) {
              cs = Changeset.compose(cs, pad.getCoarseChangeset(i, 10), this.pool());
              i = i + 10;
            } else {
              cs = Changeset.compose(cs, revs.getEntry(i), this.pool());
              i++;
            }
          }
          return cs;
        },
        getUsersNewlyMentionInRevisions: function(from, to) {
          var cs = pad.getChangesetBetweenRevisions(from, to);
          if (!Changeset.isEmpty(cs)) {
            return Changeset.getNewlyMentionedEncryptedUserIds(cs, this.pool());
          } else {
            return null;
          }
        },
        getDiffATextForChangeset: function(cs, from, includeDeletes) {
          if (!Changeset.isEmpty(cs)) {
            // create a new apool just for this changeset
            var newPool = this.pool().copy();

            // transform the changeset into a diff-style changeset
            var atext;
            if (from > 0) {
              atext = this.getInternalRevisionAText(from - 1);
            } else {
              atext = Changeset.makeAText('\n');
            }

            var green = newPool.putAttrib(['diff', 'plus'], false);
            var red = newPool.putAttrib(['diff', 'minus'], false);
            var longkeep = newPool.putAttrib(['longkeep', 1], false);


            var retVal = Changeset.applyToTextAsDiff(cs, atext.text, green, red, longkeep, includeDeletes);
            var diffCS = retVal[0];
            var trivial = retVal[1];
            var modifiedAttributes = retVal[2];
            if (trivial) {
              return null;
            }

            // mark the modified attribs with "m" for modified
            for (var i=0; i<modifiedAttributes.length; i++) {
              var num = modifiedAttributes[i];
              newPool.putAttrib([newPool.getAttribKey(num), "m"]);
            }

            // rewrite table cell deletions as changes to " "
            newPool.modifyAttribs(function(k, v) {
              if (k.split(":").length==2 && v == "") {
                v = " ";
              }
              return v;
            });

            // apply to pre CS text
            atext = Changeset.applyToAText(diffCS, atext, newPool);

            return [atext, newPool];
          } else {
            return null;
          }
        },
        getDiffATextForChangeRange: function (from, to, includeDeletes) {
          var cs = pad.getChangesetBetweenRevisions(from, to);
          return pad.getDiffATextForChangeset(cs, from, includeDeletes);
        },
        updateSolrIndex: function() {
          var atext = pad.atext();
          var title = "";
          var isDeleted = false;
          var viewsTotal = 0;
          var viewsRecent = 0;
          var lastEditorId = -1;
          var creatorId = -1;
          var editorIds;
          var visibility;

          pro_padmeta.accessProPad(padId, function(propad) {
            title = propad.getDisplayTitle();
            isDeleted = propad.isDeleted();
            viewsTotal = propad.getTotalViewCount();
            viewsRecent = propad.getRecentViewCount();
            lastEditorId = propad.getLastEditor();
            creatorId = propad.getCreatorId();
            editorIds = propad.getEditors();
            visibility = propad.getVisibility() || "visible";
          });

          if (isDeleted) {
            return;
          }

          var text = atext.text;

          var authorIds = [];
          pad.eachATextAuthor(atext, function (author) {
            authorIds.push(padusers.getAccountIdForProAuthor(author));
            text += (padusers.getNameForUserId(author) || "") + "\n";
          });

          if (authorIds.indexOf(creatorId) == -1) {
            authorIds.push(creatorId);
          }

          pad.eachATextTableCellValue(atext, function(cellValue) {
            text += cellValue + "\n";
          });

          var invitedIds = pad_access.getUserIdsWithAccess(padId);

          var invitedGroupIds = pad_access.getGroupIdsWithAccess(padId);
          pro_groups.getGroupInfos(invitedGroupIds).forEach(function(info) {
            text += info.name + "\n";
          });

          var revDate = pad.getRevisionDate(meta.head);

          var urls = pad.getOutgoingPadLinks();
          urls.forEach(function(url) {
            if (text.indexOf(url) == -1) {
              text += url + "\n";
            }
          });

          text = text.replace(XML_UNSAFE_CHARS_RE, '');

          // index in /solr/update
          var body = renderTemplateAsString('solr/update.ejs', {
            "id": padId,
            "domainId": padutils.getDomainId(padId),
            "lastedit": dateutils.dateFormat(revDate, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            "tlastedit": dateutils.dateFormat(revDate, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            "revision": meta.head,
            "contents": text,
            "chat": [],      // XXX
            "deleted": false,
            "invitedId": invitedIds,
            "invitedGroupId": invitedGroupIds,
            "collectionCount": invitedGroupIds.length,
            "authorId": authorIds,
            "title": title,
            "caption": meta.tags, // XXX
            "url": urls,     // XXX
            "guestpolicy": pad.getGuestPolicy(),
            "lastEditorId": lastEditorId || -1,
            "creatorId": creatorId || -1,
            "editorId": editorIds,
            "visibility": visibility,
            "viewsTotal": viewsTotal || 0,
            "viewsRecent": viewsRecent || 0
          });

          search.scheduleAsyncSolrUpdate(body);

        },

        get _meta() { return meta; }
      };

      try {
        padutils.setCurrentPad(padId);
        appjet.requestCache.padsAccessing[padId] = pad;
        var padDomainId = padutils.getDomainId(padId);
        if (padDomainId && !domains.domainIsOnThisServer(padDomainId)) {
          log.warn("Accessing pad " + padId + " from wrong server");
        }
        return padFunc(pad);
      }
      finally {
        padutils.clearCurrentPad();
        delete appjet.requestCache.padsAccessing[padId];
        if (meta) {
          if (request.isDefined) {
            meta.status.lastAccess = lastAccess;
          }

          if (mode != "r") {
            meta.status.dirty = true;
          }
          if (meta.status.dirty) {
            dbwriter.notifyPadDirty(padId);
          }
        }
      }
    });
  });
}

/**
 * Call an arbitrary function with no arguments inside an exclusive
 * lock on a padId, and return the result.
 */
function doWithPadLock(padId, func) {
  var lockName = "document/"+padId;
  return sync.doWithStringLock(lockName, func);
}

function isPadLockHeld(padId) {
  var lockName = "document/"+padId;
  return GlobalSynchronizer.isHeld(lockName);
}

/**
 * Get pad meta-data object, which is stored in SQL as JSON
 * but cached in appjet.cache.  Returns null if pad doesn't
 * exist at all (does NOT create it).  Requires pad lock.
 */
function _getPadMetaData(padId) {
  var padMeta = appjet.cache.pads.meta.get(padId);
  if (! padMeta) {
    // not in cache
    padMeta = sqlbase.getJSON("PAD_META", padId);
    if (! padMeta) {
      // not in SQL
      padMeta = null;
    }
    else {
      appjet.cache.pads.meta.put(padId, padMeta);
    }
  }
  return padMeta;
}

/**
 * Sets a pad's meta-data object, such as when creating
 * a pad for the first time.  Requires pad lock.
 */
function _insertPadMetaData(padId, obj) {
  appjet.cache.pads.meta.put(padId, obj);
}

/**
 * Removes a pad's meta data, writing through to the database.
 * Used for the rare case of deleting a pad.
 */
function _removePadMetaData(padId) {
  appjet.cache.pads.meta.remove(padId);
  sqlbase.deleteJSON("PAD_META", padId);
}

function _getPadAPool(padId) {
  var padAPool = appjet.cache.pads.apool.get(padId);
  if (! padAPool) {
    // not in cache
    padAPool = new AttribPool();
    padAPoolJson = sqlbase.getJSON("PAD_APOOL", padId);
    if (padAPoolJson) {
      // in SQL
      padAPool.fromJsonable(padAPoolJson);
    }
    appjet.cache.pads.apool.put(padId, padAPool);
  }
  return padAPool;
}

/**
 * Removes a pad's apool data, writing through to the database.
 * Used for the rare case of deleting a pad.
 */
function _removePadAPool(padId) {
  appjet.cache.pads.apool.remove(padId);
  sqlbase.deleteJSON("PAD_APOOL", padId);
}

/**
 * Get an object for a pad that's not persisted in storage,
 * e.g. for tracking open connections.  Creates object
 * if necessary.  Requires pad lock.
 */
function _getPadTemp(padId) {
  var padTemp = appjet.cache.pads.temp.get(padId);
  if (! padTemp) {
    padTemp = {};
    appjet.cache.pads.temp.put(padId, padTemp);
  }
  return padTemp;
}

/**
 * Returns an object with methods for manipulating a string array, where name
 * is something like "revs" or "chat".  The object must be acquired and used
 * all within a pad lock.
 */
function _getPadStringArray(padId, name) {
  var padFoo = appjet.cache.pads[name].get(padId);
  if (! padFoo) {
    padFoo = {};
    // writes go into writeCache, which is authoritative for reads;
    // reads cause pages to be read into readCache
    padFoo.readCache = {};
    padFoo.writeCache = {};
    appjet.cache.pads[name].put(padId, padFoo);
  }
  var tableName = "PAD_"+name.toUpperCase();
  var self = {
    getEntry: function(idx) {
      var n = Number(idx);
      if (padFoo.writeCache[n]) return padFoo.writeCache[n];
      if (padFoo.readCache[n]) return padFoo.readCache[n];
      sqlbase.getPageStringArrayElements(tableName, padId, n, padFoo.readCache);
      return padFoo.readCache[n]; // null if not present in SQL
    },
    setEntry: function(idx, value) {
      var n = Number(idx);
      var v = String(value);
      padFoo.writeCache[n] = v;
    },
    getJSONEntry: function(idx) {
      var result = self.getEntry(idx);
      if (! result) return result;
      return fastJSON.parse(String(result));
    },
    setJSONEntry: function(idx, valueObj) {
      self.setEntry(idx, fastJSON.stringify(valueObj));
    },
    writeToDB: function() {
      sqlbase.putDictStringArrayElements(tableName, padId, padFoo.writeCache);
      // copy key-vals of writeCache into readCache
      var readCache = padFoo.readCache;
      var writeCache = padFoo.writeCache;
      for(var p in writeCache) {
        readCache[p] = writeCache[p];
      }
      padFoo.writeCache = {};
    },
  };
  return self;
}

/**
 * Destroy a string array;  writes through to the database.  Must be
 * called within a pad lock.
 */
function _destroyPadStringArray(padId, name) {
  appjet.cache.pads[name].remove(padId);
  var tableName = "PAD_"+name.toUpperCase();
  sqlbase.clearStringArray(tableName, padId);
}

/**
 * SELECT the row of PAD_SQLMETA for the given pad.  Requires pad lock.
 */
function _getPadSqlMeta(padId) {
  return sqlobj.selectSingle("PAD_SQLMETA", { id: padId });
}

function _writePadSqlMeta(padId, updates) {
  sqlobj.update("PAD_SQLMETA", { id: padId }, updates);
}


// called from dbwriter
function removeFromMemory(pad) {
  // safe to call if all data is written to SQL, otherwise will lose data;
  var padId = pad.getId();
  appjet.cache.pads.meta.remove(padId);
  appjet.cache.pads.revs.remove(padId);
  appjet.cache.pads.revs10.remove(padId);
  appjet.cache.pads.revs100.remove(padId);
  appjet.cache.pads.revs1000.remove(padId);
  appjet.cache.pads.chat.remove(padId);
  appjet.cache.pads.revmeta.remove(padId);
  appjet.cache.pads.apool.remove(padId);
  appjet.cache.pads.segments.remove(padId);
  collab_server.removeFromMemory(pad);
}

function flushModelCacheForPad(padId, maxRev) {
  accessPadGlobal(padId, function(pad) {
    var modelCache = _getModelCache();
    for (var i=0; i<=maxRev; i++) {
      var cacheKey = "atext/C/"+i+"/"+padId;
      modelCache.remove(cacheKey);
    }
  });
}

function rollbackToRevNum(padId, revNum, opt_skipChecks) {
  accessPadGlobal(padId, function(pad) {
    pad.forceSetHeadRevisionNumber(revNum, undefined, opt_skipChecks);
    pad.writeToDB();
  });
}

function rollforwardToRevNum(padId, revNum, opt_skipChecks) {
  accessPadGlobal(padId, function(pad) {
    pad.forceSetHeadRevisionNumber(revNum, true, opt_skipChecks);
    pad.writeToDB();
  });
}

function updateSolrIndexForPad(globalPadId) {
  accessPadGlobal(globalPadId, function(pad) {
    pad.updateSolrIndex();
  }, 'r');
}


