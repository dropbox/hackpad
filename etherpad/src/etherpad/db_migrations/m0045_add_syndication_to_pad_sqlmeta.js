import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");
// options:
// create a new table just for this column
// throw the column into the pad_sqlmeta. <


import("sqlbase.sqlobj");
import("sqlbase.sqlbase");
import("etherpad.log");

function run() {
  sqlobj.addColumns('PAD_SQLMETA', {
    lastSyndicatedRev: 'INT NOT NULL DEFAULT 0'
  });

  var sql = "update PAD_SQLMETA set lastSyndicatedRev=headRev";
  var result = sqlobj.executeRaw(sql, [], true);
}
