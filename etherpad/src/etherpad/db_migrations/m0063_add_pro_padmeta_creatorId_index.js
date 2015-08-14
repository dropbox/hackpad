import("sqlbase.sqlobj");


function run() {
  sqlobj.createIndex ('pro_padmeta', ['creatorId', 'lastEditedDate']);
}
