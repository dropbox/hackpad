import("sqlbase.sqlobj");

function run() {
  sqlobj.createTable('pro_groups_key_values', {
    groupId: 'INT(11) NOT NULL',
    key: 'varchar(128)',
    jsonVal: sqlobj.getLongtextColspec("DEFAULT NULL"),
    lastUpdatedDate: sqlobj.getDateColspec("DEFAULT NULL"),
  });
  sqlobj.createIndex('pro_groups_key_values', ['groupId', 'key'], 'UNIQUE');
}
