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

function run() {
  var recordList = sqlobj.selectMulti('pro_domains', {});
  recordList.forEach(function(r) {
    var subDomain = r.subDomain;
    if (subDomain != subDomain.toLowerCase()) {
      // delete this domain record and all accounts associated with it.
      sqlobj.deleteRows('pro_domains', {id: r.id});
      sqlobj.deleteRows('pro_accounts', {domainId: r.id});
    }
  });
}


