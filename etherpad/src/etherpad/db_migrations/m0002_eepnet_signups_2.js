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
import("etherpad.utils.isPrivateNetworkEdition");

function run() {
  if (isPrivateNetworkEdition()) {
    return;
  }

  // add new columns.
  sqlobj.addColumns('eepnet_signups', {
    firstName: 'VARCHAR(128) NOT NULL DEFAULT \'\'',
    lastName: 'VARCHAR(128) NOT NULL DEFAULT \'\'',
    phone: 'VARCHAR(128) NOT NULL DEFAULT \'\''
  });

  // split name into first/last
  var rows = sqlobj.selectMulti('eepnet_signups', {}, {});
  rows.forEach(function(r) {
    var name = r.fullName;
    r.firstName = (r.fullName.split(' ')[0]) || "?";
    r.lastName = (r.fullName.split(' ').slice(1).join(' ')) || "?";
    r.phone = "?";
    sqlobj.updateSingle('eepnet_signups', {id: r.id}, r);
  });

  // drop column fullName
  sqlobj.dropColumn('eepnet_signups', 'fullName');
}



