import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

/*
  Add tracking of pad sent
*/
function run() {
  sqlobj.addColumns('email_tracking', {
    globalPadId: 'VARCHAR(128) NOT NULL',
  });
  sqlobj.createIndex('email_tracking', ['emailAddress', 'globalPadId']);
}

