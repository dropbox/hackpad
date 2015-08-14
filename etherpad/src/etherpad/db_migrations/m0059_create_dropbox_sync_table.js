import("sqlbase.sqlobj");

/*
	These are tokens given out to 3rd party apps
*/
function run() {

  sqlobj.createTable('pro_dropbox_sync', {
    userId: 'INT(11) NOT NULL PRIMARY KEY',
    checkpoint: 'CHAR(32)',
    lastUpdated: sqlobj.getDateColspec(),
  });
}



