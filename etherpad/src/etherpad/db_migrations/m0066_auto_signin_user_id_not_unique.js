
import("sqlbase.sqlobj");

function run() {
  // Clean up after userId -> accountId rename.
  sqlobj.executeRaw('ALTER TABLE pro_accounts_auto_signin DROP INDEX userId', [], true);
  sqlobj.executeRaw('ALTER TABLE pro_accounts_auto_signin DROP INDEX idx_userId', [], true);

  // Remove unique index of accountId
  sqlobj.executeRaw('ALTER TABLE pro_accounts_auto_signin DROP INDEX accountId', [], true);
}
