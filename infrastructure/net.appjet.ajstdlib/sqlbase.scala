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

package net.appjet.ajstdlib;

import scala.collection.mutable.ArrayBuffer;

import java.sql.{DriverManager, SQLException, Statement};
import net.appjet.oui.{profiler, config, NoninheritedDynamicVariable};
import com.mchange.v2.c3p0._;

class SQLBase(driverClass: String, url: String, userName: String, password: String, requireSSL: Boolean) {

  def isMysql:Boolean = (url.startsWith("jdbc:mysql:"));
  def isDerby:Boolean = (url.startsWith("jdbc:derby:"));

  if (isDerby) {
    System.setProperty("derby.system.home", config.derbyHome);
    val f = new java.io.File(config.derbyHome);
    if (! f.exists) {
      if (! f.mkdirs())
        throw new RuntimeException("Couldn't create internal database storage directory: "+config.derbyHome);
    }
    if (! f.isDirectory)
      throw new RuntimeException("Internal database storage directory is not a directory: "+config.derbyHome);
    if (! f.canWrite)
      throw new RuntimeException("Can't write to internal database storage directory: "+config.derbyHome);
  }

  val cpds = new ComboPooledDataSource();
  cpds.setDriverClass(driverClass);
  var jdbcUrl = url;
  if (isMysql) {
    jdbcUrl += "?useUnicode=true&characterEncoding=UTF-8";
    if (requireSSL) {
      jdbcUrl += "&useSSL=true&requireSSL=true";
    }
  }
  cpds.setJdbcUrl(jdbcUrl);

  // derby does not require a password
  if (!isDerby) {
    cpds.setUser(userName);
    cpds.setPassword(password);
  }

  cpds.setMaxPoolSize(config.jdbcPoolSize);
  cpds.setMaxConnectionAge(6*60*60); // 6 hours
  if (config.devMode) {
    cpds.setAutomaticTestTable("cpds_testtable");
    cpds.setTestConnectionOnCheckout(true);
  }

//   {
//     // register db driver
//     try {
//       new JDCConnectionDriver(driverClass, url+"?useUnicode=true&characterEncoding=UTF-8", userName, password);
//     } catch {
//       case e : Throwable => {
//         e.printStackTrace();
//         Runtime.getRuntime.halt(1);
//       }
//     }
//   }

  private def getConnectionFromPool = {
    val c = cpds.getConnection();
    c.setAutoCommit(true);
    c;
  }

  // Creates a dynamic variable whose .value depends on the innermost
  // .withValue(){} on the call-stack.
  private val currentConnection = new NoninheritedDynamicVariable[Option[java.sql.Connection]](None);
  
  def withConnection[A](block: java.sql.Connection=>A): A = {
    currentConnection.value match {
      case Some(c) => {
        block(c);
      }
      case None => {
        val t1 = profiler.time;
        val c = getConnectionFromPool;
        profiler.recordCumulative("getConnection", profiler.time-t1);
        try {
          currentConnection.withValue(Some(c)) {
            block(c);
          }
        } finally {
          c.close;
        }
      }
    }
  }

  private val currentlyInTransaction = new NoninheritedDynamicVariable(false);

  def inTransaction[A](block: java.sql.Connection=>A): A = {
    withConnection(c => {
      if (currentlyInTransaction.value) {
        return block(c);
      } else {
        currentlyInTransaction.withValue(true) {
          c.setAutoCommit(false);
          c.setTransactionIsolation(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
            
          try {
            val result = block(c);
            c.commit();
            c.setAutoCommit(true);
            result;
          } catch {
            case e@net.appjet.oui.AppGeneratedStopException => {
              c.commit();
              c.setAutoCommit(true);
              throw e;
            }
            case (e:org.mozilla.javascript.WrappedException) if (e.getWrappedException ==
              net.appjet.oui.AppGeneratedStopException) => {
              c.commit();
              c.setAutoCommit(true);
              throw e;
            }
            case e => {
              //println("inTransaction() caught error:");
              //e.printStackTrace();
              try {
                c.rollback();
                c.setAutoCommit(true);
              } catch {
                case ex => {
                  println("Could not rollback transaction because: "+ex.toString());
                }
              }
              throw e;          
            }
          }
        }
      }
    });
  }
  
  def closing[A](closable: java.sql.Statement)(block: =>A): A = {
    try { block } finally { closable.close(); }
  }

  def closing[A](closable: java.sql.ResultSet)(block: =>A): A = {
    try { block } finally { closable.close(); }
  }
  
  def tableName(t: String) = id(t); 

  val identifierQuoteString = withConnection(_.getMetaData.getIdentifierQuoteString);
  def quoteIdentifier(s: String) = identifierQuoteString+s+identifierQuoteString;
  private def id(s: String) = quoteIdentifier(s);
  
  def longTextType = if (isDerby) "CLOB" else "MEDIUMTEXT";

  // derby seems to do things intelligently w.r.t. case-sensitivity and unicode support.
  def createTableOptions = if (isMysql) " ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE utf8_bin" else "";

  // creates table if it doesn't exist already
  def createJSONTable(table: String) {
    withConnection { c=>
      val s = c.createStatement;
      if (! doesTableExist(c, table)) {
        closing(s) {
          s.execute("CREATE TABLE "+tableName(table)+" ("+
                    id("ID")+" VARCHAR(128) PRIMARY KEY NOT NULL, "+
                    id("JSON")+" "+longTextType+" NOT NULL"+
                    ")"+createTableOptions);
        }
      }
    }
  }
  
  // requires: table exists
  // returns null if key doesn't exist
  def getJSON(table: String, key: String): String = {
    withConnection { c=>
      val s = c.prepareStatement("SELECT "+id("JSON")+" FROM "+tableName(table)+" WHERE "+id("ID")+" = ?");
      closing(s) {
        s.setString(1, key);
        var resultSet = s.executeQuery();
        closing(resultSet) {
          if (! resultSet.next()) {
            null;
          }
          else {
            resultSet.getString(1);
          }
        }
      }
    }
  }

  case class IdValueMapping(val id: String, val value: String);

  def getAllJSON(table: String, start: Int, count: Int): Array[IdValueMapping] = {
    withConnection { c =>
      val s = c.prepareStatement("SELECT "+id("ID")+","+id("JSON")+" FROM "+tableName(table)+
                                 " ORDER BY "+id("ID")+" DESC"+
                                 " LIMIT ? OFFSET ?");
      closing(s) {
        s.setInt(2, start);
        s.setInt(1, count);
        var resultSet = s.executeQuery();
        var output = new ArrayBuffer[IdValueMapping];
        closing(resultSet) {
          while (resultSet.next()) {
            output += IdValueMapping(resultSet.getString(1), resultSet.getString(2));
          }
          output.toArray;
        }
      }
    }
  }

  def getAllJSONKeys(table: String): Array[String] = {
    withConnection { c =>
      val s = c.prepareStatement("SELECT "+id("ID")+" FROM "+tableName(table));
      closing(s) {
        var resultSet = s.executeQuery();
        var output = new ArrayBuffer[String];
        closing(resultSet) {
          while (resultSet.next()) {
            output += resultSet.getString(1);
          }
          output.toArray;
        }
      }
    }    
  }

  // requires: table exists
  // inserts key if it doesn't exist
  def putJSON(table: String, key: String, json: String) {
    withConnection { c=>
      val update = c.prepareStatement("UPDATE "+tableName(table)+" SET "+id("JSON")+"=? WHERE "+id("ID")+"=?");
      closing(update) {
        update.setString(1, json);
        update.setString(2, key);
        update.executeUpdate();
        if (update.getUpdateCount == 0) {
          val insert = c.prepareStatement(
            "INSERT INTO "+tableName(table)+" ("+id("ID")+", "+id("JSON")+") values (?,?)");
          closing(insert) {
            insert.setString(1, key);
            insert.setString(2, json);
            insert.executeUpdate();
          }
        }
      }
    }
  }

  def deleteJSON(table: String, key: String) {
    // requires: table exists
    withConnection { c=>
      val update = c.prepareStatement("DELETE FROM "+tableName(table)+" WHERE "+id("ID")+"=?");
      closing(update) {
        update.setString(1, key);
        update.executeUpdate();
      }
    }    
  }

  private def metaName(table: String) = table+"_META";
  private def metaTableName(table: String) = tableName(metaName(table));
  private def textTableName(table: String) = tableName(table+"_TEXT");
  private def escapeSearchString(dbm: java.sql.DatabaseMetaData, s: String): String = {
    val e = dbm.getSearchStringEscape();
    s.replace("_", e+"_").replace("%", e+"%");
  }
  
  private final val PAGE_SIZE = 20;
  
  def doesTableExist(connection: java.sql.Connection, table: String): Boolean = {
    val databaseMetadata = connection.getMetaData;
    val tables = databaseMetadata.getTables(null, null,
                                            escapeSearchString(databaseMetadata, table), null);
    closing(tables) {
      tables.next();
    }
  }

  def autoIncrementClause = if (isDerby) "GENERATED BY DEFAULT AS IDENTITY" else "AUTO_INCREMENT";

  // creates table if it doesn't exist already
  def createStringArrayTable(table: String) {
    withConnection { c=>
      if (! doesTableExist(c, metaName(table))) { // check to see if the *_META table exists
        // create tables and indices
        val s = c.createStatement;
        closing(s) {
          s.execute("CREATE TABLE "+metaTableName(table)+" ("+
                    id("ID")+" VARCHAR(128) PRIMARY KEY NOT NULL, "+
                    id("NUMID")+" INT UNIQUE "+autoIncrementClause+" "+
                    ")"+createTableOptions);
          val defaultOffsets = (1 to PAGE_SIZE).map(x=>"").mkString(",");
          s.execute("CREATE TABLE "+textTableName(table)+" ("+
                    ""+id("NUMID")+" INT, "+id("PAGESTART")+" INT, "+id("OFFSETS")+" VARCHAR(256) NOT NULL DEFAULT '"+defaultOffsets+
                    "', "+id("DATA")+" "+longTextType+" NOT NULL"+
                    ")"+createTableOptions);
          s.execute("CREATE INDEX "+id(table+"-NUMID-PAGESTART")+" ON "+textTableName(table)+"("+id("NUMID")+", "+id("PAGESTART")+")");
        }
      }
    }
  }
  
  // requires: table exists
  // returns: null if key or (key,index) doesn't exist, else the value
  def getStringArrayElement(table: String, key: String, index: Int): String = {
    val (pageStart, offset) = getPageStartAndOffset(index);
    val page = new StringArrayPage(table, key, pageStart, true);
    page.data(offset);
  }

  // requires: table exists
  // returns: an array of the mappings present in the page that should hold the
  // particular (key,index) mapping.  the array may be empty or otherwise not
  // contain the given (key,index).
  def getPageStringArrayElements(table: String, key: String, index: Int): Array[IndexValueMapping] = {
    val (pageStart, offset) = getPageStartAndOffset(index);
    val page = new StringArrayPage(table, key, pageStart, true);
    val buf = new scala.collection.mutable.ListBuffer[IndexValueMapping];

    for(i <- 0 until page.data.length) {
      val s = page.data(i);
      if (s ne null) {
        val n = pageStart + i;
        buf += IndexValueMapping(n, s);
      }
    }
    
    buf.toArray;
  }
  
  // requires: table exists
  // creates key if doesn't exist
  // value may be null
  def putStringArrayElement(table: String, key: String, index: Int, value: String) {
    val (pageStart, offset) = getPageStartAndOffset(index);
    val page = new StringArrayPage(table, key, pageStart, false);
    page.data(offset) = value;
    page.updateDB();
  }

  def putMultipleStringArrayElements(table: String, key: String): Multiputter = new Multiputter {
    var currentPage = None:Option[StringArrayPage];
    def flushPage() {
      if (currentPage.isDefined) {
        val page = currentPage.get;
        page.updateDB();
        currentPage = None;
      }
    }
    def finish() {
      flushPage();
    }
    def put(index: Int, value: String) {
      try {
        val (pageStart, offset) = getPageStartAndOffset(index);
        if (currentPage.isEmpty || currentPage.get.pageStart != pageStart) {
          flushPage();
          currentPage = Some(new StringArrayPage(table, key, pageStart, false));
        }
        currentPage.get.data(offset) = value;
      }
      catch {
        case e => { e.printStackTrace; throw e }
      }
    }
  }

  trait Multiputter {
    def put(index: Int, value: String);
    def finish();
  }

  case class IndexValueMapping(index: Int, value: String);

  def clearStringArray(table: String, key: String) {
    withConnection { c=>
      val numid = getStringArrayNumId(c, table, key, false);
      if (numid >= 0) {
        {
          val s = c.prepareStatement("DELETE FROM "+textTableName(table)+" WHERE "+id("NUMID")+"=?");
          closing(s) {
            s.setInt(1, numid);
            s.executeUpdate();
          }
        }
        {
          val s = c.prepareStatement("DELETE FROM "+metaTableName(table)+" WHERE "+id("NUMID")+"=?");
          closing(s) {
            s.setInt(1, numid);
            s.executeUpdate();
          }
        }
      }
    }
  }
  
  private def getPageStartAndOffset(index: Int): (Int,Int) = {
    val pageStart = (index / PAGE_SIZE) * PAGE_SIZE;
    (pageStart, index - pageStart);
  }
  
  // requires: table exists
  // returns: numid of new string array
  private def newStringArray(c: java.sql.Connection, table: String, key: String): Int = {
    val s = c.prepareStatement("INSERT INTO "+metaTableName(table)+" ("+id("ID")+") VALUES (?)",
                               Statement.RETURN_GENERATED_KEYS);
    closing(s) {
      s.setString(1, key);
      s.executeUpdate();
      val resultSet = s.getGeneratedKeys;
      if (resultSet == null)
        error("No generated numid for insert");
      closing(resultSet) {
        if (! resultSet.next()) error("No generated numid for insert");
        resultSet.getInt(1);
      }
    }
  }
    
  def getStringArrayNumId(c: java.sql.Connection, table: String, key: String, creating: Boolean): Int = {
    val s = c.prepareStatement("SELECT "+id("NUMID")+" FROM "+metaTableName(table)+" WHERE "+id("ID")+"=?");
    closing(s) {
      s.setString(1, key);
      val resultSet = s.executeQuery();
      closing(resultSet) {
        if (! resultSet.next()) {
          if (creating) {
            newStringArray(c, table, key);
          }
          else {
            -1
          }
        }
        else {
          resultSet.getInt(1);
        }
      }
    }
  }

  def getStringArrayAllKeys(table: String): Array[String] = {
    withConnection { c=>
      val s = c.prepareStatement("SELECT "+id("ID")+" FROM "+metaTableName(table));
      closing(s) {
        val resultSet = s.executeQuery();
        closing(resultSet) {
          val buf = new ArrayBuffer[String];
          while (resultSet.next()) {
            buf += resultSet.getString(1);
          }
          buf.toArray;
        }
      }
    }
  }
  
  private class StringArrayPage(table: String, key: String, val pageStart: Int, readonly: Boolean) {

    val data = new Array[String](PAGE_SIZE);
    
    private val numid = withConnection { c=>
      val nid = getStringArrayNumId(c, table, key, ! readonly);

      if (nid >= 0) {
        val s = c.prepareStatement(
          "SELECT "+id("OFFSETS")+","+id("DATA")+" FROM "+textTableName(table)+" WHERE "+id("NUMID")+"=? AND "+id("PAGESTART")+"=?");
        closing(s) {
          s.setInt(1, nid);
          s.setInt(2, pageStart);
          val resultSet = s.executeQuery();
          closing(resultSet) {
            if (! resultSet.next()) {
              if (! readonly) { 
                val insert = c.prepareStatement("INSERT INTO "+textTableName(table)+
                  " ("+id("NUMID")+", "+id("PAGESTART")+", "+id("DATA")+") VALUES (?,?,'')");
                closing(insert) {
                  insert.setInt(1, nid);
                  insert.setInt(2, pageStart);
                  insert.executeUpdate();
                }
              }
            }
            else {
              val offsetsField = resultSet.getString(1);
              val dataField = resultSet.getString(2);
              val offsetStrings = offsetsField.split(",", -1);
              var i = 0;
              var idx = 0;
              while (i < PAGE_SIZE) {
                val nstr = offsetStrings(i);
                if (nstr != "") {
                  val n = nstr.toInt;
                  data(i) = dataField.substring(idx, idx+n);
                  idx += n;
                }
                i += 1;
              }
            }
          }
        }
      }
      nid;
    }

    def updateDB() {
      if (readonly) {
        error("this is a readonly StringArrayPage");
      }
      // assert: the relevant row of the TEXT table exists
      if (data.find(_ ne null).isEmpty) {
        withConnection { c=>
          val update = c.prepareStatement("DELETE FROM "+textTableName(table)+
            " WHERE "+id("NUMID")+"=? AND "+id("PAGESTART")+"=?");
          closing(update) {
            update.setInt(1, numid);
            update.setInt(2, pageStart);
            update.executeUpdate();
          }
        }
      }
      else {
        val offsetsStr = data.map(s => if (s eq null) "" else s.length.toString).mkString(",");
        val dataStr = data.map(s => if (s eq null) "" else s).mkString("");
        withConnection { c=>
          val s = c.prepareStatement("UPDATE "+textTableName(table)+
            " SET "+id("OFFSETS")+"=?, "+id("DATA")+"=? WHERE "+id("NUMID")+"=? AND "+id("PAGESTART")+"=?");
          closing(s) {
            s.setString(1, offsetsStr);
            s.setString(2, dataStr);
            s.setInt(3, numid);
            s.setInt(4, pageStart);
            s.executeUpdate();
          }
        }
      }
    }
  }

  def close {
    if (isDerby) {
      cpds.close();
      try {
        DriverManager.getConnection("jdbc:derby:;shutdown=true");
      } catch {
        case e: SQLException => if (e.getErrorCode() != 50000) throw e
      }
    }
  }
}

  
