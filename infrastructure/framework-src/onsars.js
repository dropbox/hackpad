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

if (serverhandlers.sarsHandler === undefined) {
  throw new Packages.net.appjet.oui.NoHandlerException("No SARS handler defined.");
}

if (serverhandlers.sarsHandler !== undefined) {
  (function() {
    var ret = serverhandlers.sarsHandler(appjet.context.attributes().apply("sarsRequest"));
    if (ret)
      appjet.context.attributes().update("sarsResponse", ret);
  })()
}