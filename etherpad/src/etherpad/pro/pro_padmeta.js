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

import("stringutils");
import("cache_utils.syncedWithCache");
import("sync");
import("netutils.urlPost");

import("etherpad.log")
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pro.pro_pad_db");

import("etherpad.utils.renderTemplateAsString");

var MAX_TITLE_LENGTH = 128;

function _doWithProPadLock(domainId, localPadId, func) {
  var lockName = ["pro-pad", domainId, localPadId].join("/");
  return sync.doWithStringLock(lockName, func);
}

function accessProPad(globalPadId, fn) {
  // retrieve pad from cache
  var domainId = padutils.getDomainId(globalPadId);
  if (!domainId) {
    throw Error("not a pro pad: "+globalPadId);
  }
  var localPadId = padutils.globalToLocalId(globalPadId);
  var padRecord = pro_pad_db.getSingleRecord(domainId, localPadId);

  return _doWithProPadLock(domainId, localPadId, function() {
    var isDirty = false;

    var proPad = {
      exists: function() { return !!padRecord; },
      getDomainId: function() { return domainId; },
      getLocalPadId: function() { return localPadId; },
      getGlobalId: function() { return globalPadId; },
      getDisplayTitle: function() { return padutils.getProDisplayTitle(localPadId, padRecord.title); },
      setTitle: function(newTitle) {
        padRecord.title = newTitle;
        isDirty = true;
      },
      isDeleted: function() { return padRecord.isDeleted; },
      markDeleted: function() {
        padRecord.isDeleted = true;
        padRecord.deletedDate = new Date();
        isDirty = true;

        var body = renderTemplateAsString('solr/delete.ejs', {
          "id": globalPadId
        });
        try {
          urlPost("http://" + appjet.config.solrHostPort + "/solr/update", body,
            { "Content-Type": "text/xml; charset=utf-8" });
        } catch (ex) {
          log.logException(ex);
        }
      },
      unmarkDeleted: function() {
        padRecord.isDeleted = false;
        padRecord.deletedDate = null;
        isDirty = true;
        model.updateSolrIndexForPad(globalPadId);
      },
      getPassword: function() { return padRecord.password; },
      setPassword: function(newPass) {
        if (newPass == "") {
          newPass = null;
        }
        padRecord.password = newPass;
        isDirty = true;
      },
      isArchived: function() { return padRecord.isArchived; },
      markArchived: function() {
        padRecord.isArchived = true;
        isDirty = true;
      },
      unmarkArchived: function() {
        padRecord.isArchived = false;
        isDirty = true;
      },
      getCreatedDate: function() {
        return padRecord.createdDate;
      },
      setCreatedDate: function(d) {
        // for imported pads
        padRecord.createdDate = d;
        isDirty = true;
      },
      getLastEditedDate: function() {
        return padRecord.lastEditedDate;
      },
      setLastEditedDate: function(d) {
        padRecord.lastEditedDate = d;
        isDirty = true;
      },
      addEditor: function(editorId) {
        var es = String(editorId);
        if (es && es.length > 0 && stringutils.isNumeric(editorId)) {
          if (padRecord.proAttrs.editors.indexOf(editorId) < 0) {
            padRecord.proAttrs.editors.push(editorId);
            padRecord.proAttrs.editors.sort();
          }
          isDirty = true;
        }
      },
      setLastEditor: function(editorId) {
        var es = String(editorId);
        if (es && es.length > 0 && stringutils.isNumeric(editorId)) {
          padRecord.lastEditorId = editorId;
          this.addEditor(editorId);
          isDirty = true;
        }
      },
      getLastEditor: function() {
        return padRecord.lastEditorId;
      },
      getCreatorId: function() { return padRecord.creatorId; },
      setCreatorId: function(creatorId) {
        padRecord.creatorId = creatorId;
        isDirty = true;
      },
      getPadIdMovedTo: function() {
        return padRecord.proAttrs.movedTo;
      },
      setPadIdMovedTo: function(globalPadId) {
        padRecord.proAttrs.movedTo = globalPadId;
      },
      getTotalViewCount: function() {
        return padRecord.viewCount;
      },
      getRecentViewCount: function() {
        return padRecord.recentViewCount;
      },
      getEditors: function() {
        return padRecord.proAttrs.editors;
      },
      setVisibility: function(visibility) {
        padRecord.proAttrs.visibility = visibility;
        isDirty = true;
      },
      getVisibility: function() {
        return padRecord.proAttrs.visibility;
      }
    };

    var ret = fn(proPad);

    if (isDirty) {
      pro_pad_db.update(padRecord);
    }

    return ret;
  });
}

function accessProPadLocal(localPadId, fn) {
   var globalPadId = padutils.getGlobalPadId(localPadId);
   return accessProPad(globalPadId, fn);
}

