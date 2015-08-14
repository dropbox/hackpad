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

import("cache_utils.syncedWithCache");
import("sqlbase.sqlcommon.*");
import("jsutils.*");
import("etherpad.log");

jimport("java.lang.System.out.println");
jimport("java.sql.Statement");
jimport("java.util.ArrayList");
jimport("java.sql.Types");

function _withCache(name, fn) {
  return syncedWithCache('sqlobj.'+name, fn);
}

function getIdColspec() {
  return ('INT NOT NULL '+autoIncrementClause()+' PRIMARY KEY');
}

function getLongtextColspec(extra) {
  var spec = getSqlBase().longTextType();
  if (extra) {
    spec = (spec + " " + extra);
  }
  return spec;
}

function getBoolColspec(extra) {
  var spec;
  if (isMysql()) {
    spec = 'TINYINT(1)';
  } else {
    spec = 'SMALLINT';
  }
  if (extra) {
    spec = (spec + " " + extra);
  }
  return spec;
}

function getDateColspec(extra) {
  var spec;
  if (isMysql()) {
    spec = 'DATETIME';
  } else {
    spec = 'TIMESTAMP';
  }
  if (extra) {
    spec = (spec + " " + extra);
  }
  return spec;
}

function _bq(x) { return btquote(x); }

/*
 * for debugging queries
 */
function _qdebug(q, c) {
  if (appjet.config.debugSQL == "true") {
    println(q);
    if (c) {
      println(JSON.stringify(c));
    }
  }
}

/** executeFn is either "execute" or "executeUpdate" "executeQuery" */
function _execute(stmnt, executeFn) {
  if (!executeFn) {
    executeFn = 'execute';
  }
  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      _qdebug(stmnt);
      return pstmnt[executeFn]();
    });
  });
}

function _executeUpdate(stmnt) {
  return _execute(stmnt, 'executeUpdate');
}

function _executeQuery(stmnt) {
  return _execute(stmnt, 'executeQuery');
}

/*
 * Not all SQL/JS types supported.
 */
function _getJsValFromResultSet(rs, type, colName) {
  var r;
  if (type == java.sql.Types.VARCHAR ||
      type == java.sql.Types.LONGVARCHAR ||
      type == java.sql.Types.CHAR) {
    r = String(rs.getString(colName));
  } else if (type == java.sql.Types.TIMESTAMP) {
    var t = rs.getTimestamp(colName);
    if (t) {
      r = new Date(t.getTime());
    } else {
      r = null;
    }
  } else if (type == java.sql.Types.BIGINT ||
             type == java.sql.Types.INTEGER ||
             type == java.sql.Types.SMALLINT ||
             type == java.sql.Types.TINYINT) {
    r = rs.getInt(colName);
  } else if (type == java.sql.Types.DECIMAL) {
    r = rs.getFloat(colName);
  } else if (type == java.sql.Types.BIT) {
    r = rs.getBoolean(colName);
  } else {
    throw Error("Cannot fetch sql type ID "+type+" (columnName = "+colName+")");
  }

  if (rs.wasNull()) {
    r = null;
  }
  return r;
}

function _getJsValFromResultSetFast(rs, typeId, colName) {
  var r;
  if (typeId == 1) {
    r = String(rs.getString(colName));
  } else if (typeId == 2) {
    var t = rs.getTimestamp(colName);
    if (t) {
      r = new Date(t.getTime());
    } else {
      r = null;
    }
  } else if (typeId == 3) {
    r = rs.getInt(colName);
  } else if (typeId == 4) {
    r = rs.getFloat(colName);
  } else if (typeId == 5) {
    r = rs.getBoolean(colName);
  } else {
    throw Error("Cannot fetch sql type ID "+type+" (columnName = "+colName+")");
  }

  if (rs.wasNull()) {
    r = null;
  }
  return r;
}

function _lookupColumnType(tableName, columnName) {
  return withConnection(function(conn) {
    var metadata = conn.getMetaData();
    var rs = metadata.getColumns(null, null, tableName, columnName);
    if (!rs) {
      throw Error("Table '"+tableName+"' does not appear to have colum '"+columnName+"'.");
    }
    var rsmd = rs.getMetaData();
    var colCount = rsmd.getColumnCount();
//    rs.first();
    rs.next();
    var type = rs.getInt("DATA_TYPE");
    return type;
  });
}

/* cached, on misses calls _lookuParameterType */
function _getParameterType(tableName, columnName) {
  var key = [tableName, columnName].join(".");
  return _withCache('column-types', function(cache) {
    if (!cache[key]) {
      cache[key] = _lookupColumnType(tableName, columnName);
    }
    return cache[key];
  });
}

/*
 * Not all SQL/JS types supported.
 */
function _setPreparedValues(tableName, pstmnt, keyList, obj, indexOffset) {
  if (!indexOffset) { indexOffset = 0; }

  for (var i = 1; i <= keyList.length; i++) {
    var k = keyList[i-1];
    var v = obj[k];
    var j = i + indexOffset;

    if (v === undefined) {
      throw Error("value is undefined for key "+k);
    }

    if (v === null) {
      var type = _getParameterType(tableName, k);
      pstmnt.setNull(j, type);
    } else if (typeof(v) == 'string') {
      pstmnt.setString(j, v);
    } else if (typeof(v) == 'number') {
      pstmnt.setInt(j, v);
    } else if (v instanceof Array) {
      for (var l=0; l<v.length; l++) {
        // only increment after the first value
        if (l > 0) {
          indexOffset = indexOffset + 1;
        }
        j = i + indexOffset;

        if (typeof(v[l]) == 'string') {
          pstmnt.setString(j, v[l]);
        } else if (typeof(v[l]) == 'number') {
          pstmnt.setInt(j, v[l]);
        } else if (v[l].valueOf && v[l].getDate && v[l].getHours) {
          pstmnt.setTimestamp(j, new java.sql.Timestamp(+v[l]));
        }
      }
    } else if (typeof(v) == 'boolean') {
      pstmnt.setBoolean(j, v);
    } else if (v.valueOf && v.getDate && v.getHours) {
      pstmnt.setTimestamp(j, new java.sql.Timestamp(+v));
    } else {
      throw Error("Cannot insert this type of javascript object: "+typeof(v)+" (key="+k+", value = "+v+")");
    }
  }
}

function _resultRowToJsObj(resultSet) {
  var resultObj = {};

  var metaData = resultSet.getMetaData();
  var colCount = metaData.getColumnCount();

  for (var i = 1; i <= colCount; i++) {
    var colName = metaData.getColumnLabel(i);
    var type = metaData.getColumnType(i);
    // this call is really slow at scale
    resultObj[colName] = _getJsValFromResultSet(resultSet, type, colName);
  }

  return resultObj;
}

function _resultRowToJsObjFast(resultSet, metaData, colCount, colNames, types) {
  var resultObj = {};
  for (var i = 1; i <= colCount; i++) {
    resultObj[colNames[i]] = _getJsValFromResultSetFast(resultSet, types[i], colNames[i]);
  }
  return resultObj;
}



/*
 * Inserts the object into the given table, and returns auto-incremented ID if any.
 */
function insert(tableName, obj) {
  var keyList = keys(obj);

  var stmnt = "INSERT INTO "+_bq(tableName)+" (";
  stmnt += keyList.map(function(k) { return _bq(k); }).join(', ');
  stmnt += ") VALUES (";
  stmnt += keyList.map(function(k) { return '?'; }).join(', ');
  stmnt += ")";

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt, Statement.RETURN_GENERATED_KEYS);
    return closing(pstmnt, function() {
      _setPreparedValues(tableName, pstmnt, keyList, obj, 0);
      _qdebug(stmnt);
      pstmnt.executeUpdate();
      return _getGeneratedKeyFromStatement(pstmnt);
    });
  });
};

function _buildSelectWithConstraints(tableName, constraints) {
  var stmnt = "SELECT * FROM "+_bq(tableName)+" ";

  var constraintKeys = keys(constraints);
  if (constraintKeys.length > 0) {
    stmnt += "WHERE (";
    stmnt += constraintKeys.map(function(key) {
        return _makeConstraintString(key, constraints[key]);
      }).join(' AND ');
    stmnt += ')';
  }
  return stmnt;
}

/*
 * Selects a single object given the constraintMap.  If there are more
 * than 1 objects that match, it will return a single one of them
 * (unspecified which one).  If no objects match, returns null.
 *
 * constraints is a javascript object of column names to values.
 *  Currently only supports string equality of constraints.
 */
function selectSingle(tableName, constraints) {
  var keyList = keys(constraints);

  var stmnt = _buildSelectWithConstraints(tableName, constraints);

  if (isMysql()) {
    stmnt += ' LIMIT 1';
  }

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      _setPreparedValues(tableName, pstmnt, keyList, _preparedValuesConstraints(constraints), 0);
      _qdebug(stmnt, constraints);
      var resultSet = pstmnt.executeQuery();
      return closing(resultSet, function() {
        if (!resultSet.next()) {
          return null;
        }
        return _resultRowToJsObj(resultSet);
      });
    });
  });
}

function _makeConstraintString(key, value) {
  if (typeof(value) != 'object' || ! (value instanceof Array)) {
    return '('+_bq(key)+' = ?)';
  } else {
    var comparator = value[0];
    if (comparator.toLowerCase() == 'between') {
      return '('+_bq(key)+' '+comparator+' ? and ?)';
    }  else {
      var questions = "?";
      if (value[1] instanceof Array) {
        questions = "(" + value[1].map(function(){return "?"}).join(",") + ")";
      }
      return '('+_bq(key)+' '+comparator+' '+ questions+ ')';
    }
  }
}

function _preparedValuesConstraints(constraints) {
  var c = {};
  eachProperty(constraints, function(k, v) {
    c[k] = (typeof(v) != 'object' || ! (v instanceof Array) ? v : v[1]);
  });
  return c;
}

function selectMulti(tableName, constraints, options) {
  if (!options) {
    options = {};
  }

  // if there's an empty IN constraint, return no results
  for (key in constraints) {
    if (constraints[key] instanceof Array &&
        constraints[key][0].toLowerCase() == "in" &&
        constraints[key][1].length == 0) {
          return [];
    }
  }

  var stmnt = _buildSelectWithConstraints(tableName, constraints);

  if (options.orderBy) {
    var orderEntries = [];
    options.orderBy.split(",").forEach(function(orderBy) {
      var asc = "ASC";
      if (orderBy.charAt(0) == '-') {
        orderBy = orderBy.substr(1);
        asc = "DESC";
      }
      orderEntries.push(_bq(orderBy)+" "+asc);
    });
    stmnt += " ORDER BY "+orderEntries.join(", ");
  }

  if (options.groupBy) {
    var groupEntries = [];
    options.groupBy.split(",").forEach(function(groupBy) {
      groupEntries.push(_bq(groupBy));
    });
    stmnt += " GROUP BY "+groupEntries.join(", ");
  }

  if (options.limit) {
    stmnt += " LIMIT "+options.limit;
  }

  var constraintKeys = keys(constraints);

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      _setPreparedValues(
        tableName, pstmnt, constraintKeys,
        _preparedValuesConstraints(constraints), 0);

      _qdebug(stmnt, constraints);
      var resultSet = pstmnt.executeQuery();
      return closing(resultSet, function() {
        return _getResultsFromResultSet(resultSet);
      });
    });
  });
}

// a more efficient way of processing lots of result rows
function _getResultsFromResultSet(resultSet){
  var resultArray = [];

  /*
  old slow way:
  while(resultSet.next()) {
    resultArray.push(_resultRowToJsObj(resultSet));
  }
  return resultArray;*/

  if (resultSet.next()) {
    var metaData = resultSet.getMetaData();
    var colCount = metaData.getColumnCount();
    var colNames = [];
    var types = [];

    for (var i = 1; i <= colCount; i++) {
      colNames[i] = metaData.getColumnLabel(i);
      switch (metaData.getColumnType(i)) {
        case java.sql.Types.VARCHAR:
          types[i]=1; break;
        case java.sql.Types.LONGVARCHAR:
          types[i]=1; break;
        case java.sql.Types.CHAR:
          types[i]=1; break;
        case java.sql.Types.TIMESTAMP:
          types[i]=2; break;
        case java.sql.Types.BIGINT:
          types[i]=3; break;
        case java.sql.Types.INTEGER:
          types[i]=3; break;
        case java.sql.Types.SMALLINT:
          types[i]=3; break;
        case java.sql.Types.TINYINT:
          types[i]=3; break;
        case java.sql.Types.DECIMAL:
          types[i]=4; break;
        case java.sql.Types.BIT:
          types[i]=5; break;
      }
    }
    do {
      resultArray.push(_resultRowToJsObjFast(resultSet, metaData, colCount, colNames, types));
    } while (resultSet.next());
  }
  return resultArray;
}

function _getGeneratedKeyFromStatement(pstmnt) {
  var rs = pstmnt.getGeneratedKeys();
  if (rs != null) {
    return closing(rs, function() {
      if (rs.next()) {
        return rs.getInt(1);
      }else {
        // This returns null instead of undefined because the withConnection function returns
        // the string "undefined".
        // TODO: Investigate why withConnection returns the string "undefined" 
        // when the passed function block returns undefined
        return null;
      }
    });
  }
}

function _setStatementParams(pstmnt, params) {
  for (var i = 0; i < params.length; i++) {
    var v = params[i];

    if (v === undefined) {
      throw Error("value is undefined for key "+i);
    }

    if (typeof(v) == 'object' && v.isnull) {
      pstmnt.setNull(i+1, v.type);
    } else if (typeof(v) == 'string') {
      pstmnt.setString(i+1, v);
    } else if (typeof(v) == 'number') {
      pstmnt.setInt(i+1, v);
    } else if (typeof(v) == 'boolean') {
      pstmnt.setBoolean(i+1, v);
    } else if (v.valueOf && v.getDate && v.getHours) {
      pstmnt.setTimestamp(i+1, new java.sql.Timestamp(+v));
    } else {
      throw Error("Cannot insert this type of javascript object: "+typeof(v)+" (key="+i+", value = "+v+")");
    }
  }
}

function executeRawInsert(stmnt, params) {
  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt, Statement.RETURN_GENERATED_KEYS);
    return closing(pstmnt, function() {
      _setStatementParams(pstmnt, params);
      _qdebug(stmnt, params);
      pstmnt.executeUpdate();
      return _getGeneratedKeyFromStatement(pstmnt);
    });
  });
}

function executeRaw(stmnt, params, isUpdate) {
  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      _setStatementParams(pstmnt, params);
      _qdebug(stmnt, params);
      if (isUpdate) {
        return pstmnt.executeUpdate();
      }
      var resultSet = pstmnt.executeQuery();

      return closing(resultSet, function() {
        return _getResultsFromResultSet(resultSet);
      });
    });
  });
}

/* returns number of rows updated */
function update(tableName, constraints, obj) {
  var objKeys = keys(obj);
  var constraintKeys = keys(constraints);

  var stmnt = "UPDATE "+_bq(tableName)+" SET ";
  stmnt += objKeys.map(function(k) { return ''+_bq(k)+' = ?'; }).join(', ');
  stmnt += " WHERE (";
  stmnt += constraintKeys.map(function(k) { return '('+_bq(k)+' = ?)'; }).join(' AND ');
  stmnt += ')';

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      _setPreparedValues(tableName, pstmnt, objKeys, obj, 0);
      _setPreparedValues(tableName, pstmnt, constraintKeys, constraints, objKeys.length);
      _qdebug(stmnt, constraints);
      return pstmnt.executeUpdate();
    });
  });
}

/* returns number of rows updated */
function insertOrUpdate(tableName, obj) {
  var keyList = keys(obj);

  var stmnt = "INSERT INTO "+_bq(tableName)+" (";
  stmnt += keyList.map(function(k) { return _bq(k); }).join(', ');
  stmnt += ") VALUES (";
  stmnt += keyList.map(function(k) { return '?'; }).join(', ');
  stmnt += ") ON DUPLICATE KEY UPDATE ";
  stmnt += keyList.map(function(k) { return ''+_bq(k)+' = ?'; }).join(', ');

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt, Statement.RETURN_GENERATED_KEYS);
    return closing(pstmnt, function() {
      _setPreparedValues(tableName, pstmnt, keyList.concat(keyList), obj, 0);
      _qdebug(stmnt);
      pstmnt.executeUpdate();
      return _getGeneratedKeyFromStatement(pstmnt);
    });
  });
}


function updateSingle(tableName, constraints, obj) {
  var count = update(tableName, constraints, obj);
  if (count != 1) {
    throw Error("save count != 1.  instead, count = "+count);
  }
}

function deleteRows(tableName, constraints) {
  var constraintKeys = keys(constraints);
  var stmnt = "DELETE FROM "+_bq(tableName)+" WHERE (";
  stmnt += constraintKeys.map(function(key) {
    return _makeConstraintString(key, constraints[key]);
  }).join(' AND ');
  stmnt += ')';
  withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    closing(pstmnt, function() {
      _setPreparedValues(tableName, pstmnt, constraintKeys, _preparedValuesConstraints(constraints));
      _qdebug(stmnt);
      pstmnt.executeUpdate();
    });
  })
}

//----------------------------------------------------------------
// table management
//----------------------------------------------------------------

/*
 * Create a SQL table, specifying column names and types with a
 * javascript object.
 */
function createTable(tableName, colspec, indices) {
  if (doesTableExist(tableName)) {
    return;
  }

  var stmnt = "CREATE TABLE "+_bq(tableName)+ " (";
  stmnt += keys(colspec).map(function(k) { return (_bq(k) + ' ' + colspec[k]); }).join(', ');
  if (indices) {
    stmnt += ', ' + keys(indices).map(function(k) { return 'INDEX (' + _bq(k) + ')'; }).join(', ');
  }
  stmnt += ')'+createTableOptions();
  _execute(stmnt);
}

function dropTable(tableName) {
  _execute("DROP TABLE "+_bq(tableName));
}

function dropAndCreateTable(tableName, colspec, indices) {
  if (doesTableExist(tableName)) {
    dropTable(tableName);
  }

  return createTable(tableName, colspec, indices);
}

function renameTable(oldName, newName) {
  _executeUpdate("RENAME TABLE "+_bq(oldName)+" TO "+_bq(newName));
}

function modifyColumn(tableName, columnName, newSpec) {
  _executeUpdate("ALTER TABLE "+_bq(tableName)+" MODIFY "+_bq(columnName)+" "+newSpec);
}

function alterColumn(tableName, columnName, alteration) {
  var q = "ALTER TABLE "+_bq(tableName)+" ALTER COLUMN "+_bq(columnName)+" "+alteration;
  _executeUpdate(q);
}

function changeColumn(tableName, columnName, newSpec) {
  var q = ("ALTER TABLE "+_bq(tableName)+" CHANGE COLUMN "+_bq(columnName)
           +" "+newSpec);
  _executeUpdate(q);
}

function addColumns(tableName, colspec) {
  inTransaction(function(conn) {
    eachProperty(colspec, function(name, definition) {
      var stmnt = "ALTER TABLE "+_bq(tableName)+" ADD COLUMN "+_bq(name)+" "+definition;
      _executeUpdate(stmnt);
    });
  });
}

function dropColumn(tableName, columnName) {
  var stmnt = "ALTER TABLE "+_bq(tableName)+" DROP COLUMN "+_bq(columnName);
  _executeUpdate(stmnt);
}

function listTables() {
  return withConnection(function(conn) {
    var metadata = conn.getMetaData();
    var resultSet = metadata.getTables(null, null, null, null);
    var resultArray = [];

    return closing(resultSet, function() {
      while (resultSet.next()) {
        resultArray.push(resultSet.getString("TABLE_NAME"));
      }
      return resultArray;
    });
  });
}

function setTableEngine(tableName, engineName) {
  var stmnt = "ALTER TABLE "+_bq(tableName)+" ENGINE="+_bq(engineName);
  _executeUpdate(stmnt);
}

function getTableEngine(tableName) {
  if (!isMysql()) {
    throw Error("getTableEngine() only supported by MySQL database type.");
  }

  var tableEngines = {};

  withConnection(function(conn) {
    var stmnt = "show table status";
    var pstmnt = conn.prepareStatement(stmnt);
    closing(pstmnt, function() {
      _qdebug(stmnt);
      var resultSet = pstmnt.executeQuery();
      closing(resultSet, function() {
        while (resultSet.next()) {
          var n = resultSet.getString("Name");
          var eng = resultSet.getString("Engine");
          tableEngines[n] = eng;
        }
      });
    });
  });

  return tableEngines[tableName];
}

function createIndex(tableName, columns, type) {
  var indexName = "idx_"+(columns.join("_"));
  var stmnt = "CREATE "+(type||"")+" INDEX "+_bq(indexName)+" on "+_bq(tableName)+" (";
  stmnt += columns.map(_bq).join(", ");
  stmnt += ")";
  _executeUpdate(stmnt);
}

function dropIndex(tableName, indexName) {
  var stmnt = "DROP INDEX "+_bq(indexName)+" ON "+_bq(tableName);
  _executeUpdate(stmnt);
}
