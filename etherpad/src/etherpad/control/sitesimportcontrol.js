
import("fileutils");
import("stringutils");
import("etherpad.utils.*");
import("etherpad.pad.importhtml");
import("etherpad.pad.importhtml.setPadHTML");
import("etherpad.pad.padutils");
import("execution");

import("etherpad.collab.collab_server");
import("etherpad.sessions.getSession");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.google_account");
import("etherpad.pro.domains");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_google_sites");
import("etherpad.pro.pro_mediawiki");
jimport("org.apache.commons.fileupload");

jimport("java.io.File",
        "java.io.DataInputStream",
        "java.io.FileInputStream",
        "java.lang.Byte",
        "java.io.FileReader",
        "java.io.BufferedReader",
        "java.security.MessageDigest",
        "java.lang.Runtime",
        "java.util.zip.ZipFile",
        "java.io.BufferedInputStream");


/* Reads a File and updates a digest with its content */
function updateDigestFromFile(digest, handle) {
  var bytes = java.lang.reflect.Array.newInstance(Byte.TYPE, 512);
  var nbytes = 0;

  while ((nbytes = handle.read(bytes, 0, 512)) != -1)
    digest.update(bytes, 0, nbytes);

  handle.close();
}

/* Normal base64 encoding, except we don't care about adding newlines and we encode padding as - and we use - instead of / */
function base64Encode(stringArray) {
  base64code = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "abcdefghijklmnopqrstuvwxyz" + "0123456789" + "+-";

  /* Pad array to nearest three byte multiple */
  var padding = (3 - (stringArray.length % 3)) % 3;
  var padded = java.lang.reflect.Array.newInstance(Byte.TYPE, stringArray.length + padding);
  java.lang.System.arraycopy(stringArray, 0, padded, 0, stringArray.length);
  stringArray = padded;

  var encoded = "";
  for (var i = 0; i < stringArray.length; i += 3) {
    var j = (((stringArray[i] & 0xff) << 16) +
       ((stringArray[i + 1] & 0xff) << 8) +
       (stringArray[i + 2] & 0xff));
    encoded = (encoded +
         base64code.charAt((j >> 18) & 0x3f) +
         base64code.charAt((j >> 12) & 0x3f) +
         base64code.charAt((j >> 6) & 0x3f) +
         base64code.charAt(j & 0x3f));
  }
  /* replace padding with "-" */
  return encoded.substring(0, encoded.length - padding) + "--".substring(0, padding);
}


function makeSymlink(destination, source) {
  return Runtime.getRuntime().exec(['ln', '-s', source.getPath(), destination.getPath()]).waitFor();
}



function render_mediawiki_both() {
  pro_mediawiki.importWiki(request.params.fileNames, request.params.owner, request.params.collection);
}

function render_googlesite_both() {
  var matches = /https\:\/\/sites.google.com(\/site|\/a)(\/(\w+\.\w+))?\/(\w+)\//.exec(request.params.address);
  if (!matches || !matches[4]) {
    response.redirect('/ep/admin/import-export');
  }
  var domain = matches[3] || null;  // scala mangles undefined
  var sitename = matches[4] || null;  // scala mangles undefined
  var count = request.params.count || null;

  if (!getSession().sitesGoogleTokenInfo) {
    // TODO: Add auth for "https://sites.google.com/feeds/"
    throw Error("Unsupported");
  }

  var importId = stringutils.randomString(10);
  pro_google_sites.importStatus(getSessionProAccount().id, importId).state = "starting";
  pro_google_sites.importStatus(getSessionProAccount().id, importId).siteName = sitename;
  pro_google_sites.importStatus(getSessionProAccount().id, importId).pagesProcessed = 0;
  var importedFrom = request.params.address;
  execution.scheduleTask('importexport', 'importGoogleSite', 0, [importId, domain, sitename, count, getSession().sitesGoogleTokenInfo, domains.getRequestDomainId(), getSessionProAccount().id, importedFrom]);

  response.redirect('/ep/admin/import-export');
}

serverhandlers.tasks.importGoogleSite = function(importId, domain, sitename, count, sitesGoogleTokenInfo, domainId, ownerId, importedFrom) {
  pro_google_sites.importGoogleSite(importId, domain, sitename, count, sitesGoogleTokenInfo, domainId, ownerId, importedFrom);
}


function storeFile(fileItem) {
  var nameParts = fileItem.name.split('.');
  var extension = nameParts[nameParts.length-1];

  var digest = MessageDigest.getInstance("SHA1");
  updateDigestFromFile(digest, fileItem.getInputStream()); // Used to use getStoreLocation(), but that only works for on-disk-files
  var checksum = base64Encode(digest.digest());

  fileItem.write(File("/tmp/" + checksum));

  makeSymlink(
    File("/tmp/" + checksum + '.' + extension),
    File(checksum));

  return checksum + '.' + extension;
}


function processPage(title, htmlString) {
  var newPadId = randomUniquePadId();

  var success = padutils.accessPadLocal(newPadId, function(pad) {
    if (!pad.exists()) {
      htmlString = htmlString.replace(/(<BODY[^>]*>)/, "$1" + title + "<BR/>");
      var atext = importhtml.htmlToAText(htmlString, pad.pool());

      pad.create(title, title);
      pad.setImportedFrom("all_pads.zip");

      var globalId = padutils.getGlobalPadId(newPadId);
      pro_padmeta.accessProPad(globalId, function(ppad) {
          ppad.setCreatorId(getSessionProAccount().id);
          ppad.setLastEditor(getSessionProAccount().id);
          var lastEditedDate = new Date();
          ppad.setLastEditedDate(lastEditedDate);
      });

      collab_server.setPadAText(pad, atext);

      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
    }
  });

  response.write("<a href='/" + newPadId + "'>" + title + "</a>");
  response.write("<br/>");
}

function render_zip_get() {
  response.write("<html>\
    <head></head>\
    <body><div style=\"width:600px; margin:auto; margin-top:100px;\">\
      <h2> Quick Importer </h2>\
      <p> Please select the all_pads.zip file you want to import </p>\
      <form method=\"POST\" action=\"/ep/import/zip\" enctype=\"multipart/form-data\">\
        <input type=\"file\" name=\"file\"/> <br/><br/>\
        <input type=\"submit\" value=\"Import\">\
      </form>\
    </center></body>\
  </html>");
  return true;
}

function render_zip_post() {
  // write file to tmp
  var file = null;
  var itemFactory = new fileupload.disk.DiskFileItemFactory();
  var handler = new fileupload.servlet.ServletFileUpload(itemFactory);
  var items = handler.parseRequest(request.underlying).toArray();
  for (var i = 0; i < items.length; i++) {
    if (!items[i].isFormField()) {
      file = items[i];
      break;
    }
  }

  if (! file) {
    throw "Please provide file";
  }

  response.write("<h2>Imported pads:</h2>")

  var path = storeFile(file);
  path = "/tmp/" + path;

  var htmlString = null;
  var zipfile = new ZipFile(path);
  var e = zipfile.entries();
  while(e.hasMoreElements()) {
    var entry = e.nextElement();

    var is = new BufferedInputStream (zipfile.getInputStream(entry));
    htmlString = fileutils.stringFromInputStream(is);
    processPage(entry.getName().split(".html")[0], htmlString);
    is.close();
  }
  return true;
}
