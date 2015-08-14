import("sqlbase.sqlobj");


function run() {
  sqlobj.createIndex ('pad_access', ['userId', 'type']);
  sqlobj.createIndex ('pad_access', ['globalPadId', 'type']);
  sqlobj.createIndex ('pad_access', ['groupId']);
}
