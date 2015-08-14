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

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.testing.testutils");
import("etherpad.pro.pro_accounts");
import("jsutils");

jimport("java.lang.System.out.println");
jimport("org.apache.commons.lang.exception.ExceptionUtils");

//----------------------------------------------------------------
var tests = [
  "t0000_test",
  "t0001_sqlbase_transaction_rollback",
  "t0003_persistent_vars",
  "t0004_sqlobj",
  "t0005_easysync",
  "t0006_accounts",
  "t0007_padsecurity",
  "t0008_sitemaps",
  "t0009_encrypted_ids",
  "t0010_email_unsub"
];

var tscope = this;
tests.forEach(function(t) {
  import.call(tscope, 'etherpad.testing.unit_tests.'+t);
});
//----------------------------------------------------------------

function _testName(x) {
  x = x.replace(/^t\d+\_/, '');
  return x;
}

var _JENKINS_ROBOT_COOKIE = "ICANHAZJENKINS";
var _JENKINS_ROBOT_VAL = "XT7eIDnIC31RTDS9QvLJdzAPNKaveQT34Afbal8JvNvC9DL9Eq8n587UNHd0Al6";

function _checkJenkinsRobotCookie() {
  var cookie = request.cookies[_JENKINS_ROBOT_COOKIE];
  return cookie == _JENKINS_ROBOT_VAL;
}

function render_run_both() {
  var results = {};
  response.setContentType("text/plain; charset=utf-8");
  // Let admins and requests with the jenkins cookie run unit tests on stage
  if (isProduction() && ((!pro_accounts.isAdminSignedIn() && !_checkJenkinsRobotCookie()) || appjet.config['etherpad.fakeProduction'] != 'true')) {
    response.write("access denied");
    response.stop();
  }

  var singleTest = request.params.t;
  var numRun = 0;

  testutils.init();

  println("----------------------------------------------------------------");
  println("running tests");
  println("----------------------------------------------------------------");
  tests.every(function(t) {
    var testName = _testName(t);
    if (singleTest && (singleTest != testName)) {
      return true;
    }
    println("running test: "+testName);
    numRun++;
    try {
      tscope[t].run();
      results[testName] = "PASS";
    } catch (ex) {
      // This is a JavaException and not a javascript error
      if (ex.javaException && ex.javaException.getMessage) {
        ex = {
          stacktrace: ExceptionUtils.getStackTrace(ex.javaException),
          message: ex.javaException.getMessage()
        };
      }
      results[testName] = "FAIL\n"+jsutils.debug(ex);
      return false;
    }
    println("|| pass ||");
    return true;
  });
  println("----------------------------------------------------------------");

  var resultsString = "";
  jsutils.eachProperty(results, function(k, v) {
    resultsString += k + ": " + v + "\n";
  });

  if (numRun == 0) {
    response.write("Error: no tests found");
  } else {
    response.write(resultsString);
  }
}


import("s3");
import("netutils.urlGet");

function render_s3_both() {
  var obj = urlGet("https://lh3.googleusercontent.com/-Po7FK11TI-g/ThnIwGN_XKI/AAAAAAAAAFQ/QyElfFDzu-U/G+B_circles.png");
  s3.put("hackpad-test", "circles.png", obj.content, true, "image/png");
  s3.put("hackpad-test", "text.txt", "This is some text", true, "text/plain");
  response.write("Go to: " + s3.getURL("hackpad-test", "circles.png") + " and " + s3.getURL("hackpad-test", "text.txt"));
}
