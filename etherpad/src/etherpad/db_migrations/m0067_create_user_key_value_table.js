import("sqlbase.sqlobj");

/*
  A table for storing user state
*/
function run() {

  sqlobj.createTable('pro_account_key_values', {
    userId: 'INT(11) NOT NULL PRIMARY KEY',
    key: 'varchar(128)',
    stringValue: sqlobj.getLongtextColspec("DEFAULT NULL"),
    dateValue: sqlobj.getDateColspec("DEFAULT NULL"),
    intValue: 'INT DEFAULT NULL',
  });
  sqlobj.createIndex('pro_account_key_values', ['userId', 'key'], 'UNIQUE');

}


