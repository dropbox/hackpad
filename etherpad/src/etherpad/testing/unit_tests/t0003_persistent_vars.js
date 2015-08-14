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

import("sqlbase.persistent_vars");

import("stringutils");

import("etherpad.testing.testutils.*");

function run() {
  var varname = stringutils.randomString(50);
  var varval = stringutils.randomString(50);

  var x = persistent_vars.get(varname);
  assertTruthy(!x);

  persistent_vars.put(varname, varval);

  for (var i = 0; i < 3; i++) {
    x = persistent_vars.get(varname);
    assertTruthy(x == varval);
  }

  persistent_vars.remove(varname);

  var x = persistent_vars.get(varname);
  assertTruthy(!x);
}

