import("etherpad.db_migrations.live_migration");
import("etherpad.globals.isProduction");
import("sqlbase.sqlobj");

function run() {
  var migrator = sqlobj;
  if (isProduction() && appjet.config['etherpad.fakeProduction'] != 'true'){
    migrator = live_migration;
    return;
  }
  migrator.addColumns('pro_padmeta', {
    viewCount: "INT(11) NOT NULL DEFAULT 0",
    recentViewCount: "INT(11) NOT NULL DEFAULT 0"
  });
}
