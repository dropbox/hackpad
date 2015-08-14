

import("sqlbase.sqlobj");

function run() {
  sqlobj.executeRaw("ALTER TABLE pro_account_key_values DROP PRIMARY KEY;", {}, true /*isUpdate*/);
}
