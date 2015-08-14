import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");

function run() {
  sqlobj.createTable('pro_groups', {
    groupId: 'INT(11) NOT NULL '+sqlcommon.autoIncrementClause()+' PRIMARY KEY',
    name: 'VARCHAR(128) NOT NULL',
    createdDate: sqlobj.getDateColspec('NOT NULL'),
    creatorId: 'INT(11) NOT NULL',
    facebookGroupId: 'VARCHAR(128) DEFAULT NULL',
    isPublic: sqlobj.getBoolColspec("DEFAULT 0")
  });

  sqlobj.createIndex('pro_groups', ['groupId']);

  sqlobj.createTable('pro_group_members', {
    groupId: 'INT(11) NOT NULL',
    userId: 'INT(11) NOT NULL',
    isMember: sqlobj.getBoolColspec("DEFAULT 1"),
    addedDate: sqlobj.getDateColspec('NOT NULL'),
    addedByUserId: 'INT(11)'
  });

  sqlobj.createIndex('pro_group_members', ['groupId']);
  sqlobj.createIndex('pro_group_members', ['userId']);

  sqlobj.addColumns('pad_access', {
    groupId: 'INT(11)'
  });
}

