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

import("jsutils.cmp");
import("stringutils");

import("etherpad.utils.*");

jimport("java.lang.System.out.println");

/* revisionList is an array of revisionInfo structures.
 *
 * Each revisionInfo structure looks like:
 *
 * {
 *    timestamp: a number unix timestamp
 *    label: string
 *    savedBy: string of author name
 *    savedById: string id of the author
 *    revNum: revision number in the edit history
 *    id: the view id of the (formerly the id of the StorableObject)
 * }
 */

/* returns array */
function _getRevisionsArray(pad) {
  var dataRoot = pad.getDataRoot();
  if (!dataRoot.savedRevisions) {
    dataRoot.savedRevisions = [];
  }
  dataRoot.savedRevisions.sort(function(a,b) {
    return cmp(b.timestamp, a.timestamp);
  });
  return dataRoot.savedRevisions;
}

function _getPadRevisionById(pad, savedRevId) {
  var revs = _getRevisionsArray(pad);
  var rev;
  for(var i=0;i<revs.length;i++) {
    if (revs[i].id == savedRevId) {
      rev = revs[i];
      break;
    }
  }
  return rev || null;
}

/*----------------------------------------------------------------*/
/* public functions */
/*----------------------------------------------------------------*/

function getRevisionList(pad) {
  return _getRevisionsArray(pad);
}

function saveNewRevision(pad, savedBy, savedById, revisionNumber, optIP, optTimestamp, optId) {
  var revArray = _getRevisionsArray(pad);
  var rev = {
    timestamp: (optTimestamp || (+(new Date))),
    label: null,
    savedBy: savedBy,
    savedById: savedById,
    revNum: revisionNumber,
    ip: (optIP || request.clientAddr),
    id: (optId || stringutils.randomString(10)) // *probably* unique
  };
  revArray.push(rev);
  rev.label = "Revision "+revArray.length;
  return rev;
}

function setLabel(pad, savedRevId, userId, newLabel) {
  var rev = _getPadRevisionById(pad, savedRevId);
  if (!rev) {
    throw new Error("revision does not exist: "+savedRevId);
  }
  /*if (rev.savedById != userId) {
    throw new Error("cannot label someone else's revision.");
  }
  if (((+new Date) - rev.timestamp) > (24*60*60*1000)) {
    throw new Error("revision is too old to label: "+savedRevId);
  }*/
  rev.label = newLabel;
}

function getStoredRevision(pad, savedRevId) {
  return _getPadRevisionById(pad, savedRevId);
}

