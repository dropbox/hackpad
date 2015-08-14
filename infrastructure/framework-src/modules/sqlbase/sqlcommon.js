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

import("jsutils.scalaF1")
import("stringutils.startsWith");

jimport("net.appjet.ajstdlib.SQLBase");
jimport("java.lang.System.out.println");

function _sqlbase() { return appjet.cache.sqlbase };

function init(driver, url, username, password, optRequireSSL) {
  var dbName = url.split(":")[1];
  println("Using "+dbName+" database type.");

  appjet.cache.sqlbase = new SQLBase(driver, url, username, password, optRequireSSL);

  // Test the connection
  println("Establishing "+dbName+" connection (this may take a minute)...");
  try {
    withConnection(function() {
      return;
    });
  } catch (ex) {
    println("Error establishing "+dbName+" connection:");
    println(ex.toString().split('\n')[0]);
    if (_sqlbase().isMysql()) {
      println("Perhaps mysql server is not running, or you did not specify "+
	      "proper database credentials with --etherpad.SQL_PASSWORD "+
	      "and --etherpad.SQL_USERNAME?");
    }
    if (_sqlbase().isDerby()) {
      println("Perhaps database directory "+appjet.config.derbyHome+
	      " is not writable?");
    }
    println("Exiting...");
    Packages.java.lang.System.exit(1);
  }
  println(dbName+" connection established.");
}

function onShutdown() {
  _sqlbase().close();
}

function withConnection(f) {
  return _sqlbase().withConnection(scalaF1(f));
}

function inTransaction(f) {
  return _sqlbase().inTransaction(scalaF1(f));
}

function closing(s, f) {
  if (s instanceof java.sql.Connection) {
    throw new java.lang.IllegalArgumentException("Don't want to use 'closing()' on a sql connection!");
  }
  try {
    return f();
  }
  finally {
    s.close();
  }
}

function doesTableExist(table) {
  return withConnection(function(conn) {
    return _sqlbase().doesTableExist(conn, table);
  });
}

function autoIncrementClause() {
  return _sqlbase().autoIncrementClause();
}

function createTableOptions() {
  return _sqlbase().createTableOptions();
}

function btquote(x) { return _sqlbase().quoteIdentifier(x); }

function getSqlBase() { return _sqlbase(); }

function isMysql() { return _sqlbase().isMysql(); }
function isDerby() { return _sqlbase().isDerby(); }

