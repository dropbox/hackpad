import("sqlbase.sqlobj");
import("sqlbase.sqlbase");
import("email.sendEmail");
import("etherpad.pro.pro_utils");
import("etherpad.log");

function importPad(path, filename) {
  var filepath = path + filename;

  var fis = new java.io.FileInputStream(new java.io.File(filepath));
  var reader = new java.io.BufferedReader(new java.io.InputStreamReader(fis));

  var value;
  var padId = consume(reader, "padId");

  value = consumeJSON(reader, "PAD_APOOL");
  sqlbase.putJSON('PAD_APOOL', padId, value);

  while (value = consumeJSON(reader, "PAD_AUTHORS")) {
    sqlbase.putDictStringArrayElements('PAD_AUTHORS', padId, value);
  }

  value = consumeJSON(reader, "PAD_META");
  sqlbase.putJSON('PAD_META', padId, value);

  while (value = consumeJSON(reader, "PAD_REVMETA")) {
    sqlbase.putDictStringArrayElements('PAD_REVMETA', padId, value);
  }

  while (value = consumeJSON(reader, "PAD_REVS")) {
    sqlbase.putDictStringArrayElements('PAD_REVS', padId, value);
  }

  value = consumeJSON(reader, "PAD_SQLMETA");
  sqlobj.insert('PAD_SQLMETA', value);

  value = consumeJSON(reader, "pro_padmeta");
  value.creatorId = null; //just to be safe, userIds might not match
  sqlobj.insert('pro_padmeta', value);

  log.info("Restored: " + padId);
}

function notifyUsers(filepath) {
  var fis = new java.io.FileInputStream(new java.io.File(filepath));
  var reader = new java.io.BufferedReader(new java.io.InputStreamReader(fis));

  while (line = reader.readLine()) {
    var parts = line.split("\t");
    var url = parts[0];
    var title = parts[1];
    var fullName = parts[2];
    var email = parts[3];

    var body = fullName + ",\n\n" +
    "One of your documents, '"+ title +"' was affected by an outage Hackpad experienced two days ago, on the morning of Friday the 6th.\n\nDue to an error during routine maintenance, Hackpad failed to save changes made to certain documents for a period of about 30 minutes.\n\nFortunately, we've been able to recover all the affected edits and have created a restored copy of your document (as it was during the outage) here: " + url+ "_restored" +
    "\n\nOur sincere apologies about this outage.  We take the trust you put in Hackpad seriously and are working to make sure this does not happen again.\n\n" +
    "Thanks for using Hackpad,\nThe Hackpad Team";

    log.info('Emailing ' + email + ' about ' + url);
    sendEmail(email, pro_utils.getSupportEmailFromAddr(), "Hackpad Outage", {}, body);
  }
}

var lastLine = null;
function consume(reader, name) {
  var line = lastLine || reader.readLine();
  lastLine = line;
  var value = line.split(name+":")[1];
  if (value) {
    lastLine = null;
    return value;
  }
}

function consumeJSON(reader, name) {
  var value = consume(reader,name);
  if (value) {
    return JSON.parse(value);
  }
}

