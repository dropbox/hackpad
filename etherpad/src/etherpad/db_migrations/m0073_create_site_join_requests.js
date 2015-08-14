import("sqlbase.sqlobj");

function run() {

  sqlobj.createTable('site_join_requests', {
    accountId: 'INT(11)',
    createdDate: sqlobj.getDateColspec(),
    domainId: 'INT NOT NULL',
    token: 'VARCHAR(128) DEFAULT NULL',
  });

  sqlobj.createIndex('site_join_requests', ['domainId', 'accountId']);
  sqlobj.createIndex('site_join_requests', ['token']);

}

