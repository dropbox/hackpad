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

import("sqlbase.sqlcommon");
import("etherpad.pad.dbwriter");
import("etherpad.utils.*");
import("etherpad.globals.*");
import("etherpad.sessions");

function onRequest() {
  if (!sessions.isAnEtherpadAdmin()) {
    response.forbid();
  }
}

function render_setdbwritable_post() {
  var dbwritable = (String(request.params.value).toLowerCase() != 'false'); // default to true
  dbwriter.setWritableState({constant: dbwritable});

  response.write("OK, set to "+dbwritable);
}

function render_switch_dbs_post() {

  dbwriter.setWritableState({constant: false});

  appjet.cache.sqlbase.cpds().close();
  sqlcommon.onShutdown();
  var newURL = "jdbc:mysql://"+ request.params.hostport + "/etherpad";
  var sp = function(k) { return appjet.config['etherpad.SQL_'+k] || null; };
  sqlcommon.init(sp('JDBC_DRIVER'), newURL, sp('USERNAME'), sp('PASSWORD'));

}


function render_getdbwritable_get() {
  var state = dbwriter.getWritableState();

  response.write(String(dbwriter.getWritableStateDescription(state)));
}

function render_pausedbwriter_post() {
  var seconds = request.params.seconds;
  var seconds = Number(seconds || 0);
  if (isNaN(seconds)) seconds = 0;

  var finishTime = (+new Date())+(1000*seconds);
  dbwriter.setWritableState({trueAfter: finishTime});

  response.write("Paused dbwriter for "+seconds+" seconds.");
}





