

import("sqlbase.sqlobj");

function run() {
	// add 'trialing', 'past_due' status to billing_purchase
	sqlobj.modifyColumn("billing_purchase", "status", "enum('active', 'inactive', 'trialing', 'past_due', 'canceled', 'unpaid')");
}
