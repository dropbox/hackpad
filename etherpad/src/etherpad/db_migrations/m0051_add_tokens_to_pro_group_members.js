import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pro_group_members', {
    token: 'VARCHAR(20) DEFAULT NULL',
  });
}
