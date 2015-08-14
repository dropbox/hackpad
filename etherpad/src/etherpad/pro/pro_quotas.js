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

import("funhtml.*");
import("stringutils.startsWith");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");

import("etherpad.globals.*");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.domains");
import("etherpad.sessions.{getSession,saveSession}");


function _createRecordIfNecessary(domainId) {
  inTransaction(function() {
    var r = sqlobj.selectSingle('pro_account_usage', {domainId: domainId});
    if (!r) {
      var count = pro_accounts.getActiveCount(domainId);
      sqlobj.insert('pro_account_usage', {
        domainId: domainId,
        count: count,
        lastReset: (new Date),
        lastUpdated: (new Date)
      });
    }
  });
}

/**
 * Called after a successful payment has been made.
 * Effect: counts the current number of domain accounts and stores that
 * as the current account usage count.
 */
function resetAccountUsageCount(domainId) {
  _createRecordIfNecessary(domainId);
  var newCount = pro_accounts.getActiveCount(domainId);
  sqlobj.update(
    'pro_account_usage',
    {domainId: domainId},
    {count: newCount, lastUpdated: (new Date), lastReset: (new Date)}
  );
}

/**
 * Returns the max number of accounts that have existed simultaneously
 * since the last reset.
 */
function getAccountUsageCount(domainId) {
  _createRecordIfNecessary(domainId);
  var record = sqlobj.selectSingle('pro_account_usage', {domainId: domainId});
  return record.count;
}


/**
 * Updates the current account usage count by computing:
 *   usage_count = max(current_accounts, usage_count)
 */
function updateAccountUsageCount(domainId) {
  if (domainId == domains.getPrimaryDomainId()) {
    return;
  }
  _createRecordIfNecessary(domainId);
  var record = sqlobj.selectSingle('pro_account_usage', {domainId: domainId});
  var currentCount = pro_accounts.getActiveCount(domainId);
  var newCount = Math.max(record.count, currentCount);
  sqlobj.update(
    'pro_account_usage',
    {domainId: domainId},
    {count: newCount, lastUpdated: (new Date)}
  );
}

