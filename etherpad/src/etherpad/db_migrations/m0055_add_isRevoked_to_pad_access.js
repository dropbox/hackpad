import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pad_access', {
    isRevoked: sqlobj.getBoolColspec("DEFAULT 0")
  });
}
