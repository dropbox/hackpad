import("sqlbase.sqlobj");
import("sqlbase.sqlbase");
import("etherpad.log");

function run() {

  sqlobj.addColumns('PAD_SQLMETA', {
    guestPolicy: 'VARCHAR(20) NOT NULL',
  });

  sqlobj.createIndex('PAD_SQLMETA', ['guestPolicy']);

  var allPadIds = sqlbase.getAllJSONKeys("PAD_META");

  allPadIds.forEach(function(padId) {
    var meta = sqlbase.getJSON("PAD_META", padId);
    var guestPolicy = "deny";
    try {
      guestPolicy = meta.dataRoot.padOptions.guestPolicy;
    } catch (ex) {
      log.info("Pad " + padId + "has no guestPolicy. Resetting to " + guestPolicy + ".");
      meta.dataRoot = meta.dataRoot || {};
      meta.dataRoot.padOptions = meta.dataRoot.padOptions || {};
      meta.dataRoot.padOptions.guestPolicy = guestPolicy;
      sqlbase.putJSON("PAD_META", padId, meta);
    }
    sqlobj.update("PAD_SQLMETA", {id:padId}, {guestPolicy: guestPolicy});
  });
}
