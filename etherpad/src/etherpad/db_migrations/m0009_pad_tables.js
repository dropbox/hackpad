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

import("sqlbase.sqlbase");

function run() {

  // These table creations used to be in etherpad.pad.model.onStartup, but
  // they make more sense here because later migrations access these tables.
  sqlbase.createJSONTable("PAD_META");
  sqlbase.createJSONTable("PAD_APOOL");
  sqlbase.createStringArrayTable("PAD_REVS");
  sqlbase.createStringArrayTable("PAD_CHAT");
  sqlbase.createStringArrayTable("PAD_REVMETA");
  sqlbase.createStringArrayTable("PAD_AUTHORS");
  
}

