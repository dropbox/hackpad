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

function run() {
  // allow null values in passwordHash
  if (sqlcommon.isDerby()) {
    sqlobj.alterColumn('pro_users', 'passwordHash', 'NULL');
  } else {
    sqlobj.modifyColumn('pro_users', 'passwordHash', 'VARCHAR(128)');
  }
  sqlobj.addColumns('pro_users', {
    tempPassHash: 'VARCHAR(128)'
  });
}



