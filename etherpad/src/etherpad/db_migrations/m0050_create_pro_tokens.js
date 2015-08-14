import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

function run() {
  sqlobj.createTable('pro_tokens', {
    userId: 'INT(11) NOT NULL PRIMARY KEY', // <- this shouldn't have been a primary key 
    tokenType: 'TINYINT(3) NOT NULL',
    expirationDate: sqlobj.getDateColspec(),
    token: 'VARCHAR(255)',       // if the token is invalidated, set this to NULL
    tokenExtra: 'VARCHAR(512)'  // token secret, or token renewal token
                                 // it's kind of insane that we have to support OAuth 1.0 :|
  });
}

