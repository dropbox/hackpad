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

import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

function run() {
  sqlobj.renameTable('pro_users', 'pro_accounts');
  sqlobj.renameTable('pro_users_auto_signin', 'pro_accounts_auto_signin');
  sqlobj.changeColumn('pro_accounts_auto_signin', 'userId', 'accountId INT UNIQUE NOT NULL');
  sqlobj.createIndex('pro_accounts_auto_signin', ['accountId']);
}

