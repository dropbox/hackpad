import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('pro_beta_signups', {
  	invitationDate:  sqlobj.getDateColspec(),
  });
}
