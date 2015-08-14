/// <reference path="../../../definitions/default.d.ts"/>
/// <reference path="../../../definitions/default.d.ts"/>
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

function run() {
  var tables = ['billing_adjustment', 'billing_invoice', 'billing_payment_info', 'billing_purchase', 'billing_transaction', 'checkout_pro_referral', 'checkout_purchase', 'checkout_referral'];
  tables.forEach(function (t) {
    if (sqlcommon.doesTableExist(t)) {
      sqlobj.dropTable(t);
    }
  });
}
