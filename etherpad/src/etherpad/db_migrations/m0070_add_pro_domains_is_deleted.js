

import("sqlbase.sqlobj");

function run() {

  sqlobj.addColumns('pro_domains', {
    createdDate: sqlobj.getDateColspec(),
    isDeleted: sqlobj.getBoolColspec("NOT NULL DEFAULT 0")
  });

  // clear domain cache
  delete appjet.cache.pro_domains;

}
