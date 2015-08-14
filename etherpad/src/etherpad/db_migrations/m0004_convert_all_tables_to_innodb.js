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

import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");

import('etherpad.db_migrations.migration_runner.dmesg');

function run() {
  // This migration only applies to MySQL
  if (!sqlcommon.isMysql()) {
    return;
  }

  var tables = sqlobj.listTables();
  tables.forEach(function(t) {
    if (sqlobj.getTableEngine(t) != "InnoDB") {
      dmesg("Converting table "+t+" to InnoDB...");
      sqlobj.setTableEngine(t, "InnoDB");
    }
  });

};


