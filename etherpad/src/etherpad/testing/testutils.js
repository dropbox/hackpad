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

import ("etherpad.pro.domains");
import ("etherpad.pro.pro_config");
import ("stringutils");

function assertTruthy(x) {
  if (!x) {
    throw new Error("assertTruthy failure: "+x);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw Error(message || "Assertion failed");
  }
}

function init() {
  // Configuration
  var testPublicDomain = "unittestpublic" + stringutils.randomString(10).toLowerCase();
  var testPrivateDomain = "unittestprivate" + stringutils.randomString(10).toLowerCase();
  var testEmailAddy = "noreply+" + stringutils.randomString(10).toLowerCase() + "@hackpad.com";

  var testPublicDomainId = domains.createNewSubdomain(testPublicDomain, testPublicDomain);
  var testPrivateDomainId = domains.createNewSubdomain(testPrivateDomain, testPrivateDomain);

  pro_config.setConfigVal('publicDomain', true, testPublicDomainId);
  pro_config.setConfigVal('publicDomain', false, testPrivateDomainId);

  appjet.requestCache.testPublicDomainId =  testPublicDomainId;
  appjet.requestCache.testPrivateDomainId =  testPrivateDomainId;
}

function publicDomainRecord() {
  return domains.getDomainRecord(appjet.requestCache.testPublicDomainId);
}
function privateDomainRecord() {
  return domains.getDomainRecord(appjet.requestCache.testPrivateDomainId);
}

function getXsrfFromDOM(result) {
  // ugh! is there an easier way?
  var xsrfTagRe = '<input .*?name="xsrf".*?>';
  var xsrfValueRe = 'value="(.+?)"';
  return result.content.match(xsrfTagRe)[0].match(xsrfValueRe)[1];
}
