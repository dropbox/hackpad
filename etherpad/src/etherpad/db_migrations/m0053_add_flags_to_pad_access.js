import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pad_access', {
    flags: "TINYINT (3) default 0"
  });
}