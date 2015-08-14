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

import("sqlbase.sqlcommon.{withConnection,inTransaction,closing}");
import("sqlbase.sqlobj");

import("etherpad.testing.testutils.*");

function run() {

  withConnection(function(conn) {
    var s = conn.createStatement();
    closing(s, function() {
      s.execute("delete from just_a_test");
    });
  });

  sqlobj.insert("just_a_test", {id: 1, x: "a"});

  try {  // this should fail
    inTransaction(function(conn) {
      sqlobj.updateSingle("just_a_test", {id: 1}, {id: 1, x: "b"});
      // note: this will be pritned to the console, but that's OK
      throw Error();
    });
  } catch (e) {}

  var testRecord = sqlobj.selectSingle("just_a_test", {id: 1});

  assertTruthy(testRecord.x == "a");
}




