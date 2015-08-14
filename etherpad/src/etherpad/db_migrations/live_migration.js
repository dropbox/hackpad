import("jsutils");
import("sqlbase.sqlcommon.btquote")
jimport("java.lang.ProcessBuilder");
jimport("java.io.File");
jimport("java.util.ArrayList");

// Uses external tool pt-online-schema-change to run the migration, docs here:
// http://www.percona.com/doc/percona-toolkit/2.2/pt-online-schema-change.html

function _extractPartsFromJdbcUrl() {
  var pieces = /jdbc:mysql:\/\/([^\/]+)\/(\S+)$/.exec(appjet.config["etherpad.SQL_JDBC_URL"]);
  return {
    host: pieces[1],
    db: pieces[2]
  };
}


// Builds the data source name parameter
function _getDSN(tableName, optOverride) {
  optOverride = optOverride || {};
  var jdbcUrlPieces = _extractPartsFromJdbcUrl();
  var parts = jsutils.extend({
    h: jdbcUrlPieces['host'],
    D: jdbcUrlPieces['db'],
    t: tableName,
    u: 'root'
  }, optOverride);

  return jsutils.keys(parts).map(function(k) {
    return k + "=" +parts[k];
  }).join(",");
}

function addColumns(tableName, cols, optArgs, optDsn) {
  var dsn = _getDSN(tableName, optDsn);
  optArgs = optArgs || [];

  var alterString = jsutils.keys(cols).map(function(k) {
    return "ADD COLUMN "+btquote(k)+" "+cols[k];
  }).join(", ");

  // return alterString;
  var args = ["./pt-online-schema-change", "--execute", "--alter", alterString, dsn].concat(optArgs);
  var argsList = new ArrayList();
  args.forEach(function(arg) { argsList.add(arg); });
  var runner = new ProcessBuilder(argsList);
  // Outputs directly to stdout
  runner.inheritIO().directory(new File("../contrib/bin/"));
  runner.start();
}