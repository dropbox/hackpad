
import("etherpad.control.pro.account_control");
import("sqlbase.sqlobj");
import("netutils");
import("etherpad.log");
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("etherpad.control.pro.account_control");

jimport ("org.apache.http.util.EntityUtils");
jimport ("org.apache.http.impl.client.HttpClients");
jimport ("org.apache.http.client.methods.HttpGet");
jimport ("org.apache.http.client.methods.HttpPost");
jimport ("org.apache.http.impl.client.BasicCookieStore");
jimport ("org.apache.http.protocol.BasicHttpContext");
jimport ("org.apache.http.protocol.ClientContext");
jimport("org.apache.http.HttpVersion");
jimport("org.apache.http.protocol.ExecutionContext");

function MockBrowser() {
  this.httpclient = new org.apache.http.impl.client.DefaultHttpClient();
  this.httpclient.getParams().setParameter("http.protocol.version",
                HttpVersion.HTTP_1_0);
  // Create a local instance of cookie store
  this.cookieStore = new BasicCookieStore();

  return this;
}

MockBrowser.prototype.get = function(url, params) {
  // Create HTTP context
  var localContext = new BasicHttpContext();
  localContext.setAttribute(ClientContext.COOKIE_STORE, this.cookieStore);

  url = url + (params ? ("?" + encodeUrlParams(params)) : "");

  var httpget = new HttpGet(url);
  var response = this.httpclient.execute(httpget, localContext);

  var entity = response.getEntity();
  var content = EntityUtils.toString(entity, "UTF-8");
  if(entity != null) {
      entity.consumeContent();
  }

  return {
    content: content,
    currentUrl: this.currentUrl(localContext),
    status: response.getStatusLine().getStatusCode(),
    contentLength: entity.getContentLength(),
    contentType: entity.getContentType(),
    contentEncoding: entity.getContentEncoding(),
  }
}

MockBrowser.prototype.currentUrl = function(context) {
  var currentReq = context.getAttribute(ExecutionContext.HTTP_REQUEST);
  var currentHost = context.getAttribute(ExecutionContext.HTTP_TARGET_HOST);
  var currentUrl = (currentReq.getURI().isAbsolute()) ? currentReq.getURI().toString() : (currentHost.toURI() + currentReq.getURI());
  return currentUrl;
}

MockBrowser.prototype.post = function(url, params) {
  // Create HTTP context
  var localContext = new BasicHttpContext();
  localContext.setAttribute(ClientContext.COOKIE_STORE, this.cookieStore);

  url = url + (params ? ("?" + encodeUrlParams(params)) : "");
  var httppost = new HttpPost(url);
  var response = this.httpclient.execute(httppost, localContext);
  var entity = response.getEntity();
  var content = EntityUtils.toString(entity, "UTF-8");

  if(entity != null)
  {
      entity.consumeContent();
  }

  if (response.getStatusLine().getStatusCode() == 302) {
    var locationHeader = response.getFirstHeader(new java.lang.String("Location"));
    if (locationHeader != null) {
      return this.get(new String(locationHeader.getValue()));
    }
  }


  return {
    content: content,
    currentUrl: this.currentUrl(localContext),
    status: response.getStatusLine().getStatusCode(),
    contentLength: entity.getContentLength(),
    contentType: entity.getContentType(),
    contentEncoding: entity.getContentEncoding(),
  }
}


