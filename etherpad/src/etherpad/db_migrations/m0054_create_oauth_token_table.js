import("sqlbase.sqlobj");

/*
	These are tokens given out to 3rd party apps
*/
function run() {
  // fix 0050
  var sql = "alter table pro_tokens drop primary key";
  sqlobj.executeRaw(sql, [], true);
  // end fix

  sqlobj.createIndex('pro_tokens', ['userId']);

  sqlobj.createTable('pro_oauth_tokens', {
    token: 'VARCHAR(25)',       // if the token is invalidated, set this to NULL
    userId: 'INT(11) NOT NULL',
    valid: 'BOOLEAN DEFAULT TRUE',
    expirationDate: sqlobj.getDateColspec(),
  });

  sqlobj.createIndex('pro_oauth_tokens', ['token']);
}



