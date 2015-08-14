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
import("sqlbase.sqlcommon");

jimport("java.lang.System.out.println");

// TODO: add caching?

// Curently supports:
//   Strings

function get(name) {
  if (!sqlcommon.doesTableExist('persistent_vars')) {
    return undefined;
  }
  var r = sqlobj.selectSingle('persistent_vars', {name: name});
  if (!r) {
    return undefined;
  }
  return r.stringVal;
}

function put(name, val) {
  if (typeof(val) != 'string') {
    throw Error("unsupported type for persistent_vars: "+typeof(val));
  }

  var r = sqlobj.selectSingle('persistent_vars', {name: name});
  if (r) {
    sqlobj.updateSingle('persistent_vars', {id: r.id}, {stringVal: val});
  } else {
    sqlobj.insert('persistent_vars', {name: name, stringVal: val});
  }
}

function remove(name) {
  var r = sqlobj.selectSingle('persistent_vars', {name: name});
  if (r) {
    sqlobj.deleteRows('persistent_vars', {id: r.id});
  }
}
