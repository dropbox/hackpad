import("sqlbase.sqlobj");

function run() {
  sqlobj.addColumns('billing_purchase', {
    stripeJson: 'MEDIUMTEXT'
  });
}
