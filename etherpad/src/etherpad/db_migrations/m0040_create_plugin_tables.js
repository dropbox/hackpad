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

import("etherpad.utils.isPrivateNetworkEdition");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

function run() {
  sqlobj.createTable('plugin', {
    id: 'INT NOT NULL '+sqlcommon.autoIncrementClause()+' PRIMARY KEY',
    name: 'VARCHAR(128) character set utf8 collate utf8_bin UNIQUE NOT NULL'
  });
  sqlobj.createTable('hook_type', {
    id: 'INT NOT NULL '+sqlcommon.autoIncrementClause()+' PRIMARY KEY',
    name: 'VARCHAR(128) character set utf8 collate utf8_bin UNIQUE NOT NULL'
  });
  sqlobj.createTable('hook', {
    id: 'INT NOT NULL '+sqlcommon.autoIncrementClause()+' PRIMARY KEY',
    type_id: 'INT NOT NULL REFERENCES hook_type(id)',
    name: 'VARCHAR(128) character set utf8 collate utf8_bin NOT NULL'
  });
  sqlobj.createTable('plugin_hook', {
    plugin_id: 'INT NOT NULL REFERENCES plugin(id)',
    hook_id: 'INT NOT NULL REFERENCES hook(id)',
    original_name: 'VARCHAR(128) character set utf8 collate utf8_bin'
  });
}
