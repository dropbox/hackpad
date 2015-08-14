import("sqlbase.sqlobj");

function run() {
  sqlobj.createTable('PAD_FOLLOW', {
    id: 'VARCHAR(128) NOT NULL',    
    userId: "INT(11)",
    followPref:"SMALLINT",
  });
}