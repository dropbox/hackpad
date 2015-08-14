import("sqlbase.sqlobj");

function run() {

  // Drop the unique constraint on subDomain names
  sqlobj.dropIndex("pro_domains", "subDomain");

  // Add a compound index for existing domain checks
  sqlobj.createIndex("pro_domains", ["subDomain", "isDeleted"]);
}
