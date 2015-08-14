import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

/*
  A table for tracking emails sent and clicked
*/
function run() {

  sqlobj.createTable('email_tracking', {
    id: 'INT NOT NULL '+sqlcommon.autoIncrementClause()+' PRIMARY KEY',
    emailAddress: 'varchar(128)',
    timeSent: sqlobj.getDateColspec("DEFAULT NULL"),
    emailType: 'SMALLINT NOT NULL',
    //  trackingId
    emailVersion: 'INT NOT NULL',
    timeOpened: sqlobj.getDateColspec("DEFAULT NULL"),
    timeClicked: sqlobj.getDateColspec("DEFAULT NULL"),
    clicks: 'SMALLINT DEFAULT NULL'
  });
  sqlobj.createIndex('email_tracking', ['timeSent']);

}

