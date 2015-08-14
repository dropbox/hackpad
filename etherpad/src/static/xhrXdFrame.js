try {
  document.domain = document.domain.split(".").slice(-2).join(".");
} catch (ex) {
  console.log("error setting document.domain: " + ex);
}
function createRequestObject() {
  var xmlhttp=false;
  /*@cc_on @*/
  /*@if (@_jscript_version >= 5)
   try {
    xmlhttp = new ActiveXObject("Msxml2.XMLHTTP");
   } catch (e) {
    try {
     xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    } catch (E) {
     xmlhttp = false;
    }
   }
  @end @*/
  if (!xmlhttp && typeof XMLHttpRequest!='undefined') {
    try {
      xmlhttp = new XMLHttpRequest();
    } catch (e) {
      xmlhttp=false;
    }
  }
  if (!xmlhttp && window.createRequest) {
    try {
      xmlhttp = window.createRequest();
    } catch (e) {
      xmlhttp=false;
    }
  }
  return xmlhttp
}

function doAction(method, uri, async, headers, body, cb) {
  var req = createRequestObject();
  req.open(method, uri, async);
  for (var i in headers) {
    req.setRequestHeader(i, headers[i]);
  }
  req.onreadystatechange = function() {
    if (req.readyState == 4) {
      cb(req.status, req.responseText);
    }
  }
  req.send(body);
}
function doAbort(xhr) {
  xhr.abort();
}
window.onload = function() {
  var doneKey = 'done_'+window.location.host.split("comet", 2)[0];
    setTimeout(function() {
      window.parent[doneKey]();
    }, 0);
}
