import("sqlbase.sqlobj");
import("etherpad.globals");


function run() {
  if (globals.isProduction()) {
  	// use pt-online-schema-change
  	return;
  }
  sqlobj.createIndex ('pro_accounts', ['email']);
}
