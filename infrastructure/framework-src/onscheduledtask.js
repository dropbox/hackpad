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

(function() {
  if (serverhandlers.tasks === undefined) {
    throw new Packages.net.appjet.oui.NoHandlerException("No task handlers defined!");
  }
  var taskName = appjet.context.attributes().apply("taskName");
  if (serverhandlers.tasks[taskName] === undefined) {
    throw new Packages.net.appjet.oui.NoHandlerException("No handler defined for task: "+taskName);
  }
  var taskArgs = appjet.context.attributes().apply("taskArguments");
  var argsArray = [];
  if (taskArgs != null) {
    for (var i = 0; i < taskArgs.length; ++i) {
      argsArray.push(taskArgs[i]);
    }
  }
  return serverhandlers.tasks[taskName].apply(null, argsArray);
})();