import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pro_groups', {
  	domainId: "INT(11)"
  });
}
