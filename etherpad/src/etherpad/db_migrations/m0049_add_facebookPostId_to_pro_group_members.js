
import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pro_group_members', {
    facebookPostId: "VARCHAR(20)"
  });
}
