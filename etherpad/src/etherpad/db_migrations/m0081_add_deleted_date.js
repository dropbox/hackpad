import("sqlbase.sqlobj");
import("etherpad.globals");


function run() {
  sqlobj.addColumns("pro_accounts", {"deletedDate": sqlobj.getDateColspec("DEFAULT NULL")});
  sqlobj.addColumns("pro_padmeta", {"deletedDate": sqlobj.getDateColspec("DEFAULT NULL")});
  sqlobj.addColumns("pro_domains", {"deletedDate": sqlobj.getDateColspec("DEFAULT NULL")});
  sqlobj.addColumns("pro_groups", {"deletedDate": sqlobj.getDateColspec("DEFAULT NULL")});
}
