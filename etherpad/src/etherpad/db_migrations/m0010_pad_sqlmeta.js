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

import("sqlbase.sqlbase");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");
import("etherpad.utils.startConsoleProgressBar");


function run() {

  sqlobj.dropAndCreateTable('PAD_SQLMETA', {
    id: 'VARCHAR(128) PRIMARY KEY NOT NULL',
    version: 'INT NOT NULL',
    creationTime: sqlobj.getDateColspec('NOT NULL'),
    lastWriteTime: sqlobj.getDateColspec('NOT NULL'),
    headRev: 'INT NOT NULL'
  });

  sqlobj.createIndex('PAD_SQLMETA', ['version']);

  var allPadIds = sqlbase.getAllJSONKeys("PAD_META");

  // If this is a new database, there are no pads; else
  // it is an old database with version 1 pads.
  if (allPadIds.length == 0) {
    return;
  }

  var numPadsTotal = allPadIds.length;
  var numPadsSoFar = 0;
  var progressBar = startConsoleProgressBar();

  allPadIds.forEach(function(padId) {
    var meta = sqlbase.getJSON("PAD_META", padId);

    sqlobj.insert("PAD_SQLMETA", {
      id: padId,
      version: 1,
      creationTime: new Date(meta.creationTime || 0),
      lastWriteTime: new Date(),
      headRev: meta.head
    });

    delete meta.creationTime; // now stored in SQLMETA
    delete meta.version; // just in case (was used during development)
    delete meta.dirty; // no longer stored in DB
    delete meta.lastAccess; // no longer stored in DB

    sqlbase.putJSON("PAD_META", padId, meta);

    numPadsSoFar++;
    progressBar.update(numPadsSoFar/numPadsTotal, numPadsSoFar+"/"+numPadsTotal+" pads");
  });

  progressBar.finish();
}

