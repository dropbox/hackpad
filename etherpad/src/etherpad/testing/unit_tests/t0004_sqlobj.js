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

import("jsutils.*");
import("stringutils");

import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");

import("etherpad.globals.*");
import("etherpad.testing.testutils.*");

function run() {
  cleanUpTables();
  testGeneral();
  testAlterColumn();
  cleanUpTables();
}

function _getTestTableName() {
  return 'sqlobj_unit_test_'+stringutils.randomString(10);
}

function testGeneral() {

  if (isProduction()) {
    return; // we dont run this in productin!
  }

  // create a test table
  var tableName = _getTestTableName();

  sqlobj.createTable(tableName, {
    id: sqlobj.getIdColspec(),
    varChar: 'VARCHAR(128)',
    dateTime: sqlobj.getDateColspec("NOT NULL"),
    int11: 'INT',
    tinyInt: sqlobj.getBoolColspec("DEFAULT 0")
  });

  // add some columns
  sqlobj.addColumns(tableName, {
    a: 'VARCHAR(200)',
    b: 'VARCHAR(200)',
    c: 'VARCHAR(256)',
    d: 'VARCHAR(256)'
  });

  // drop columns
  sqlobj.dropColumn(tableName, 'c');
  sqlobj.dropColumn(tableName, 'd');

  // list tables and make sure it contains tableName
  var l = sqlobj.listTables();
  var found = false;
  l.forEach(function(x) {
    if (x == tableName) { found = true; }
  });
  assertTruthy(found);

  if (sqlcommon.isMysql()) {
    for (var i = 0; i < 3; i++) {
      ['MyISAM', 'InnoDB'].forEach(function(e) {
        sqlobj.setTableEngine(tableName, e);
        assertTruthy(e == sqlobj.getTableEngine(tableName));
      });
    }
  }

  sqlobj.createIndex(tableName, ['a', 'b']);
  sqlobj.createIndex(tableName, ['int11', 'a', 'b']);

  // test null columns
  for (var i = 0; i < 10; i++) {
    var id = sqlobj.insert(tableName, {dateTime: new Date(), a: null, b: null});
    sqlobj.deleteRows(tableName, {id: id});
  }

  //----------------------------------------------------------------
  // data management
  //----------------------------------------------------------------
  
  // insert + selectSingle
  function _randomDate() {
    // millisecond accuracy is lost in DB.
    var d = +(new Date);
    d = Math.round(d / 1000) * 1000;
    return new Date(d);
  }
  var obj_data_list = [];
  for (var i = 0; i < 40; i++) {
    var obj_data = {
      varChar: stringutils.randomString(20),
      dateTime: _randomDate(),
      int11: +(new Date) % 10000,
      tinyInt: !!(+(new Date) % 2),
      a: "foo",
      b: "bar"
    };
    obj_data_list.push(obj_data);

    var obj_id = sqlobj.insert(tableName, obj_data);
    var obj_result = sqlobj.selectSingle(tableName, {id: obj_id});

    assertTruthy(obj_result.id == obj_id);
    keys(obj_data).forEach(function(k) {
      var d1 = obj_data[k];
      var d2 = obj_result[k];
      if (k == "dateTime") {
        d1 = +d1;
        d2 = +d2;
      }
      if (d1 != d2) {
        throw Error("result mismatch ["+k+"]: "+d1+" != "+d2);
      }
    });
  }

  // selectMulti: no constraints, no options
  var obj_result_list = sqlobj.selectMulti(tableName, {}, {});
  assertTruthy(obj_result_list.length == obj_data_list.length);
  // orderBy
  ['int11', 'a', 'b'].forEach(function(colName) {
    obj_result_list = sqlobj.selectMulti(tableName, {}, {orderBy: colName});
    assertTruthy(obj_result_list.length == obj_data_list.length);
    for (var i = 1; i < obj_result_list.length; i++) {
      assertTruthy(obj_result_list[i-1][colName] <= obj_result_list[i][colName]);
    }

    obj_result_list = sqlobj.selectMulti(tableName, {}, {orderBy: "-"+colName});
    assertTruthy(obj_result_list.length == obj_data_list.length);
    for (var i = 1; i < obj_result_list.length; i++) {
      assertTruthy(obj_result_list[i-1][colName] >= obj_result_list[i][colName]);
    }
  });

  // selectMulti: with constraints
  var obj_result_list1 = sqlobj.selectMulti(tableName, {tinyInt: true}, {});
  var obj_result_list2 = sqlobj.selectMulti(tableName, {tinyInt: false}, {});
  assertTruthy((obj_result_list1.length + obj_result_list2.length) == obj_data_list.length);
  obj_result_list1.forEach(function(o) {
    assertTruthy(o.tinyInt == true);
  });
  obj_result_list2.forEach(function(o) {
    assertTruthy(o.tinyInt == false);
  });

  // updateSingle
  obj_result_list1.forEach(function(o) {
    o.a = "ttt";
    sqlobj.updateSingle(tableName, {id: o.id}, o);
  });
  // update
  sqlobj.update(tableName, {tinyInt: false}, {a: "fff"});
  // verify
  obj_result_list = sqlobj.selectMulti(tableName, {}, {});
  obj_result_list.forEach(function(o) {
    if (o.tinyInt) {
      assertTruthy(o.a == "ttt");
    } else {
      assertTruthy(o.a == "fff");
    }
  });

  // deleteRows
  sqlobj.deleteRows(tableName, {a: "ttt"});
  sqlobj.deleteRows(tableName, {a: "fff"});
  // verify
  obj_result_list = sqlobj.selectMulti(tableName, {}, {});
  assertTruthy(obj_result_list.length == 0);
}

function cleanUpTables() {
  // delete testing table (and any other old testing tables)
  sqlobj.listTables().forEach(function(t) {
    if (t.indexOf("sqlobj_unit_test") == 0) {
      sqlobj.dropTable(t);
    }
  });
}

function testAlterColumn() {
  var tableName = _getTestTableName();

  sqlobj.createTable(tableName, {
    x: 'INT',
    a: 'INT NOT NULL',
    b: 'INT NOT NULL'
  });

  if (sqlcommon.isMysql()) {
    sqlobj.modifyColumn(tableName, 'a', 'INT');
    sqlobj.modifyColumn(tableName, 'b', 'INT');
  } else {
    sqlobj.alterColumn(tableName, 'a', 'NULL');
    sqlobj.alterColumn(tableName, 'b', 'NULL');
  }

  sqlobj.insert(tableName, {a: 5});
}

