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

  sqlobj.createTable('checkout_purchase', {
    id: idColspec,
    invoiceId: "INT NOT NULL",
    owner: "VARCHAR(128) NOT NULL",
    email: "VARCHAR(128) NOT NULL",
    organization: "VARCHAR(128) NOT NULL",
    firstName: "VARCHAR(100) NOT NULL",
    lastName: "VARCHAR(100) NOT NULL",
    addressLine1: "VARCHAR(100) NOT NULL",
    addressLine2: "VARCHAR(100) NOT NULL",
    city: "VARCHAR(40) NOT NULL",
    state: "VARCHAR(2) NOT NULL",
    zip: "VARCHAR(10) NOT NULL",
    numUsers: "INT NOT NULL",
    date: "TIMESTAMP NOT NULL",
    cents: "INT NOT NULL",
    referral: "VARCHAR(8)",
    receiptEmail: "TEXT",
    purchaseType: "ENUM('creditcard', 'invoice', 'paypal') NOT NULL",
    licenseKey: "VARCHAR(1024)"
  }, {
    email: true,
    invoiceId: true
  });
  
  sqlobj.createTable('checkout_referral', {
    id: "VARCHAR(8) NOT NULL PRIMARY KEY",
    productPctDiscount: "INT",
    supportPctDiscount: "INT",
    totalPctDiscount: "INT",
    freeUsersCount: "INT",
    freeUsersPct: "INT"
  });
  
  // add a sample referral code.
  sqlobj.insert('checkout_referral', {
    id: 'EPCO6128',
    productPctDiscount: 50,
    supportPctDiscount: 25,
    totalPctDiscount: 15,
    freeUsersCount: 20,
    freeUsersPct: 10
  });
  
  // add a "free" referral code.
  sqlobj.insert('checkout_referral', {
    id: 'EP99FREE',
    totalPctDiscount: 99
  });
  
  sqlobj.insert('checkout_referral', {
    id: 'EPFREE68',
    totalPctDiscount: 100
  });
  
}
