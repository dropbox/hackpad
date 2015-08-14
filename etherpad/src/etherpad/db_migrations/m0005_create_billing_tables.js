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

  sqlobj.createTable('billing_purchase', {
    id: idColspec,
    type: "ENUM('onetimepurchase', 'subscription')",
    customer: "INT(11) NOT NULL",
    product: "VARCHAR(128) NOT NULL",
    cost: "INT(11) NOT NULL",
    coupon: "VARCHAR(128) NOT NULL",
    time: "DATETIME",
    paidThrough: "DATETIME",
    status: "ENUM('active', 'inactive')"
  }, {
    type: true,
    customer: true,
    product: true
  });
  
  sqlobj.createTable('billing_invoice', {
    id: idColspec,
    time: "DATETIME",
    purchase: "INT(11) NOT NULL",
    amt: "INT(11) NOT NULL",
    status: "ENUM('pending', 'paid', 'void', 'refunded')"
  }, {
    status: true
  });
  
  sqlobj.createTable('billing_transaction', {
    id: idColspec,
    customer: "INT(11)",
    time: "DATETIME",
    amt: "INT(11)",
    payInfo: "VARCHAR(128)",
    txnId: "VARCHAR(128)", // depends on gateway used?
    status: "ENUM('new', 'success', 'failure', 'pending')"
  }, {
    customer: true,
    txnId: true
  });
  
  sqlobj.createTable('billing_adjustment', {
    id: idColspec,
    transaction: "INT(11)",
    invoice: "INT(11)",
    time: "DATETIME",
    amt: "INT(11)"
  });
}
