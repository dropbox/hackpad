import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

/*
  Add tracking of pad sent
*/
function run() {
  sqlobj.addColumns('email_tracking', {
    campaignId: 'CHAR(16) DEFAULT NULL',
  });
  sqlobj.createIndex('email_tracking', ['campaignId', 'emailAddress']);
}

