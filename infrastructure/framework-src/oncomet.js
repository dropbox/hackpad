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

if (serverhandlers.cometHandler === undefined) {
  throw new Packages.net.appjet.oui.NoHandlerException("No comet handler defined!");
}

function _ga(k) {
  return String(appjet.context.attributes().apply(k));
}

var _op = String(_ga("cometOperation"));
switch (_op) {
  case "connect":
    serverhandlers.cometHandler("connect", _ga("cometId"));
    break;
  case "disconnect":
    serverhandlers.cometHandler("disconnect", _ga("cometId"));
    break;
  case "message":
    serverhandlers.cometHandler("message", _ga("cometId"), _ga("cometData"));
    break;
  default:
    throw new Packages.net.appjet.oui.ExecutionException("Unknown comet operation: '"+_op+"'");
}