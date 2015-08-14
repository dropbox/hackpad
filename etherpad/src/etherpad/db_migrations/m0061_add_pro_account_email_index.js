import("sqlbase.sqlobj");


function run() {
  sqlobj.createIndex ('pro_accounts', ['domainId', 'email']);
}
