
import("sqlbase.sqlobj");

function run() {

  sqlobj.addColumns('pro_accounts', {
    flags: "TINYINT (3) default 0"
  });
}