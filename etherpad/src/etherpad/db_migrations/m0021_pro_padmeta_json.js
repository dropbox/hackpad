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
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

function run() {
  sqlobj.addColumns('pro_padmeta', {
    proAttrsJson: sqlobj.getLongtextColspec("")
  });

  // convert all existing columns into metaJSON

  sqlcommon.inTransaction(function() {
    var records = sqlobj.selectMulti('pro_padmeta', {}, {});
    records.forEach(function(r) {
      migrateRecord(r);
    });
  });
}

function migrateRecord(r) {
  var editors = [];
  if (r.creatorId) {
    editors.push(r.creatorId);
  }
  if (r.lastEditorId) {
    if (editors.indexOf(r.lastEditorId) < 0) {
      editors.push(r.lastEditorId);
    }
  }
  editors.sort();

  var proAttrs = {
    editors: editors,
  };

  var proAttrsJson = fastJSON.stringify(proAttrs);

  sqlobj.update('pro_padmeta', {id: r.id}, {proAttrsJson: proAttrsJson});
}


