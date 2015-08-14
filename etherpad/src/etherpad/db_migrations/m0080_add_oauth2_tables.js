import("sqlbase.sqlobj");
import("etherpad.globals");


function run() {
  sqlobj.createTable('oauth_clients', {
    clientId: 'VARCHAR(80) NOT NULL PRIMARY KEY',
    clientName: 'VARCHAR(80) NOT NULL',
    clientSecret: 'VARCHAR(80) NOT NULL',
    redirectUri: 'VARCHAR(2000) NOT NULL',
    grantTypes: 'VARCHAR(80)',
    scope: 'VARCHAR(100)',
    accountId: 'INT(11)',
    autoApprove: 'BOOLEAN',
  });

  sqlobj.createTable('oauth_access_tokens', {
    accessToken: 'VARCHAR(40) NOT NULL PRIMARY KEY',
    clientId: 'VARCHAR(80) NOT NULL',
    accountId: 'INT(11)',
    expires: 'DATETIME NOT NULL',
    scope: 'VARCHAR(2000)'
  });

  sqlobj.createTable('oauth_authorization_codes', {
    authorizationCode: 'VARCHAR(40) NOT NULL PRIMARY KEY',
    clientId: 'VARCHAR(80) NOT NULL',
    accountId: 'INT(11)',
    redirectUri: 'VARCHAR(2000)',
    expires: 'DATETIME NOT NULL',
    scope: 'VARCHAR(2000)'
  });

  sqlobj.createTable('oauth_refresh_tokens', {
    refreshToken: 'VARCHAR(40) NOT NULL PRIMARY KEY',
    clientId: 'VARCHAR(80) NOT NULL',
    accountId: 'INT(11)',
    expires: 'DATETIME NOT NULL',
    scope: 'VARCHAR(2000)',
  });

  sqlobj.createTable('oauth_scopes', {
    scope: 'TEXT',
    isDefault: 'BOOLEAN'
  });
}

