import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pro_groups', {
    isDeleted: sqlobj.getBoolColspec("DEFAULT 0")
  });
}
