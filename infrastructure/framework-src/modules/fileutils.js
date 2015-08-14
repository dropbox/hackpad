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

/** @fileOverview misc file functions */

jimport("java.io.File",
	"java.io.DataInputStream",
	"java.io.FileInputStream",
	"java.lang.reflect.Array",
	"java.lang.Byte",
	"java.io.FileReader",
	"java.io.BufferedReader",
	"net.appjet.oui.JarVirtualFile");

function readFileBytes(path) {
  var jfile = new JarVirtualFile(path);
  if (!jfile.exists() || jfile.isDirectory()) {
    throw 'Not a file: '+path;
  }
  return net.appjet.common.util.BetterFile.getStreamBytes(jfile.openStream());
}

function readFile(path) {
  var bytes = readFileBytes(path);
  if (bytes !== null) {
    return String(new java.lang.String(bytes));
  } else {
    return null;
  }
}

function stringFromInputStream(is) {
  var bytes = net.appjet.common.util.BetterFile.getStreamBytes(is);
  if (bytes !== null) {
    return String(new java.lang.String(bytes));
  } else {
    return null;
  }
}

function fileLastModified(path) {
  var jfile = new JarVirtualFile(path);
  if (!jfile.exists()) {
    throw "Not a file: "+path;
  }
  return jfile.lastModified();
}

//----------------------------------------------------------------
// real files
//----------------------------------------------------------------

function readRealFileBytes(path) {
  var jfile = new File(path);
  if (!jfile.exists() || jfile.isDirectory()) {
    throw 'Not a real file: '+path;
  }
  var jdata = new DataInputStream(new FileInputStream(jfile));
  var size = jfile.length();
  var bytes = Array.newInstance(Byte.TYPE, size);
  jdata.read(bytes, 0, size);
  jdata.close();
  return bytes;
}

function readRealFile(path) {
  var bytes = readRealFileBytes(path);
  if (bytes !== null) {
    return String(new java.lang.String(bytes));
  } else {
    return null;
  }
}

function writeRealFile(path, data) {
  var jf = new Packages.java.io.File(path);
  var fw = new Packages.java.io.FileWriter(jf);
  fw.write(data);
  fw.flush();
  fw.close();
}


function eachFileLine(file, fn) {
  var iter = fileLineIterator(file);
  while (iter.hasNext) {
    fn(iter.next);
  }
}

function fileLineIterator(file) {
  var reader = new BufferedReader(new FileReader(file));
  var nextLine = reader.readLine();
  return {
    get hasNext() { return nextLine !== null },
    get next() {
      var curLine = nextLine;
      if (this.hasNext) {
        nextLine = reader.readLine();
      }
      return curLine;
    }
  };
}
