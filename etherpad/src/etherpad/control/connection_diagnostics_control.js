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

import("etherpad.utils.*");
import("etherpad.helpers.*");

//----------------------------------------------------------------
// Connection diagnostics
//----------------------------------------------------------------

/*
function _getDiagnosticsCollection() {
  var db = storage.getRoot("connection_diagnostics");
  if (!db.diagnostics) {
    db.diagnostics = new StorableCollection();
  }
  return db.diagnostics;
}
*/

function render_main_get() {
  /*
  var diagnostics = _getDiagnosticsCollection();

  var data = new StorableObject({
    ip: request.clientAddr,
    userAgent: request.headers['User-Agent']
  });
  
  diagnostics.add(data);

  helpers.addClientVars({
    diagnosticStorableId: data.id
  });
*/
  renderFramed("main/connection_diagnostics_body.ejs");
}

function render_submitdata_post() {
  response.setContentType('text/plain; charset=utf-8');
  /*
  var id = request.params.diagnosticStorableId;
  var storedData = storage.getStorable(id);
  if (!storedData) {
    response.write("Error retreiving diagnostics record.");
    response.stop();
  }
  var diagnosticData = JSON.parse(request.params.dataJson);
  eachProperty(diagnosticData, function(k,v) {
    storedData[k] = v;
  });
*/
  response.write("OK");
}

function render_submitemail_post() {
  response.setContentType('text/plain; charset=utf-8');
  /*
  var id = request.params.diagnosticStorableId;
  var data = storage.getStorable(id);
  if (!data) {
    response.write("Error retreiving diagnostics record.");
    response.stop();
  }
  var email = request.params.email;
  if (!isValidEmail(email)) {
    response.write("Invalid email address.");
    response.stop();
  }
  data.email = email;
*/
  response.write("OK");
}

