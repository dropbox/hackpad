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

import("jsutils.scalaF0");

//----------------------------------------------------------------
// global static "appjet" object
//----------------------------------------------------------------

/**
 * @fileOverview The global appjet object contains access to the AppJet runtime,
 * app meta-data, and other information.
 */
var appjet = {

/**
 * This is the interface to the execution context.  You probably won't need
 * to use this, but if you do, be careful!
 * @type object
 */
get context() {
  return net.appjet.oui.ExecutionContextUtils.currentContext();
},

get executionId() {
  return this.context.executionId();
},

// /**
//  * Holds the current request's requestId. (These IDs may be reused!)
//  * @type String
//  */
// get requestId() {
//   return this.context.requestId();
// },

/**
 * Volatile cache that persists between requests.  (JavaScript object).
 */
get cache() {
  return Packages.net.appjet.ajstdlib.ajstdlib.attributes()
    .getOrElseUpdate("cache", scalaF0({}));
},

get cacheRoot() {
  return function(name) {
    return Packages.net.appjet.ajstdlib.ajstdlib.attributes()
      .getOrElseUpdate("cache-"+(name?name:""), scalaF0({}));
  };
},

/**
 * A global lock for this app (ReentrantLock object).
 */
get globalLock() {
  return net.appjet.ajstdlib.ajstdlib.globalLock(); 
},

/**
 * Per-request cache, cleared between requests.
 */
get requestCache() {
  return this.context.attributes().getOrElseUpdate("requestCache", scalaF0({}))
},

/**
 * Per-scope cache, persisted in this "server" instance.
 */
get scopeCache() {
  return this.context.runner().attributes().getOrElseUpdate("scopeCache", scalaF0({}));
},

/**
 * config params for app.
 */
get config() {
  return Packages.net.appjet.oui.config.configObject(this.context.runner().globalScope());
},

/**
 * tells appjet not to re-use this "scope"/"server"
 */
get retireScope() {
  return function() { this.context.runner().reuseOk_$eq(false); }
},
  
/**
 * How many milliseconds the server has been running for.
 */
get uptime() {
  return Date.now() - Packages.net.appjet.oui.main.startTime().getTime();
}
  
}; // end: var appjet = {...