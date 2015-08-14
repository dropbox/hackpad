import("sqlbase.sqlobj");

function run() {
  sqlobj.createTable('email_signup', {
    email: 'VARCHAR(128) NOT NULL PRIMARY KEY',
    passwordHash: 'VARCHAR(128) DEFAULT NULL', //?
    token: 'VARCHAR(128) DEFAULT NULL',
    fullName: 'VARCHAR(128) NOT NULL',
    createdDate: 'datetime NOT NULL',
  });
}

