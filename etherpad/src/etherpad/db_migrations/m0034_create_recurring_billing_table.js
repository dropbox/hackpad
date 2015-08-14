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

function run() {
  if (isPrivateNetworkEdition()) {
    return;
  }
  
  var idColspec = "INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY";

  sqlobj.createTable('billing_payment_info', {
    customer: "INT(11) NOT NULL PRIMARY KEY",
    fullname: "VARCHAR(128)",
    paymentsummary: "VARCHAR(128)",
    expiration: "VARCHAR(6)", // MMYYYY
    transaction: "VARCHAR(128)"
  });
  
  sqlobj.addColumns('billing_purchase', {
    error: "TEXT"
  });
  
  sqlobj.addColumns('billing_invoice', {
    users: "INT(11)"
  })
}