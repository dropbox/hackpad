/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package net.appjet.common.util;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.net.URL;
import java.net.URI;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Enumeration;
import java.util.Collections;
import java.util.Locale;
import java.util.Iterator;
import java.util.Vector;

public class HttpServletRequestFactory {
    public static class RequestResponse {
	public final HttpServletRequest request;
	public final HttpServletResponse response;

	private RequestResponse(HttpServletRequest req, HttpServletResponse res) {
	    request = req;
	    response = res;
	}
    }
	
    public static HttpServletRequest createRequest(String uri, Map<String, String> headers,
						   String method, String body) 
	throws java.net.URISyntaxException {
	return new InnerHttpServletRequest(new URI(uri), headers, method, body);
    }
    
    public static HttpServletRequest createRequest(HttpServletRequest req) 
      throws java.net.URISyntaxException {
      Map<String, String> headers = new java.util.HashMap<String, String>();
      Enumeration<String> headerNames = (Enumeration<String>) req.getHeaderNames();
      while (headerNames.hasMoreElements()) {
        String e = headerNames.nextElement();
        headers.put(e, req.getHeader(e));
      }
      return createRequest(
        req.getRequestURL() +
        (req.getQueryString() != null ? "?"+req.getQueryString() : ""),
        headers, req.getMethod(), null);
    }

    public static HttpServletResponse createResponse() {
	return new InnerHttpServletResponse();
    }

    public static RequestResponse createPair(String uri, Map<String, String> headers,
					     String method, String body) 
	throws java.net.URISyntaxException {
	return new RequestResponse(createRequest(uri, headers, method, body), createResponse());
    }

    public static interface ServletAccessor {
	int getStatusCode();
	String getOutput();
    }

    private static class InnerHttpServletRequest implements HttpServletRequest {
	private String method;
	private String host;
	private String scheme;
	private int port;
	private String path;
	private String queryString;
	private Map<String, String[]> parameters;
	private Map<String, String> headers;
	private final String body;
	
	public InnerHttpServletRequest(URI uri, Map<String, String> headers, String method,
				       String body) 
	  throws java.net.URISyntaxException {
	    this.method = method;
	    this.host = uri.getHost();
	    this.scheme = uri.getScheme();
	    this.port = uri.getPort();
	    this.path = uri.getRawPath();
	    this.queryString = uri.getRawQuery();
	    extractParameters();
	    extractHeaders(headers);
	    this.headers.put("host", host);
	    if (body != null)
		this.headers.put("content-length", Integer.toString(body.length()));
	    this.body = body;
	}

	private void extractHeaders(Map<String, String> headers) {
	    this.headers = new HashMap<String, String>();
	    for (Map.Entry<String, String> kv : headers.entrySet()) {
		this.headers.put(kv.getKey().toLowerCase(), kv.getValue());
	    }
	}

	private String decodeUTF8(String s) {
	    try {
		return URLDecoder.decode(s, "UTF-8");
	    } catch (java.io.UnsupportedEncodingException e) {
		System.err.println("Unsupported character encoding! UTF-8");
		return s;
	    }
	}

	private void extractParameters() {
	    parameters = new HashMap<String, String[]>();
	    if (queryString == null)
		return;

	    Map<String, List<String> > params = new HashMap<String, List<String> >();
	    String[] pairs = queryString.split("&");
	    for (String s : pairs) {
		String[] kv = s.split("=", 2);
		if (! params.containsKey(kv[0])) {
		    params.put(decodeUTF8(kv[0]), new ArrayList<String>());
		}
		params.get(decodeUTF8(kv[0])).add(decodeUTF8(kv[1]));
	    }
	    String[] stringArray = new String[0];

	    for (Map.Entry<String, List<String> > e : params.entrySet()) {
		parameters.put(e.getKey(), e.getValue().toArray(stringArray));
	    }
	}

	// HttpServletRequest methods
	public String getAuthType() { return null; }
	public String getContextPath() { return ""; }
	public javax.servlet.http.Cookie[] getCookies() { return new javax.servlet.http.Cookie[0]; }
	@SuppressWarnings({"deprecation"})
	public long getDateHeader(String name) { return java.util.Date.parse(getHeader(name)); }
	public String getHeader(String name) { return headers.get(name.toLowerCase()); }
	public Enumeration<String> getHeaders(String name) { 
	    Vector<String> v = new Vector<String>();
	    v.add(getHeader(name));
	    return v.elements();
	}
	public Enumeration<String> getHeaderNames() {
	    return Collections.enumeration(headers.keySet());
	}
	public int getIntHeader(String name) { return Integer.parseInt(getHeader(name)); }
	public String getMethod() { return method.toUpperCase(); }
	public String getPathInfo() { return null; }
	public String getPathTranslated() { return null; }
	public String getQueryString() { return queryString; }
	public String getRemoteUser() { return null; }
	public boolean isUserInRole(String role) { return false; }
	public java.security.Principal getUserPrincipal() { return null; }
	public String getRequestedSessionId() { return null; }
	public String getRequestURI() { return path; }
	public StringBuffer getRequestURL() { 
	    return new StringBuffer(scheme+"://"+host+(port==-1?"":":"+port)+path);
	}
	public String getServletPath() { return ""; }
	public javax.servlet.http.HttpSession getSession(boolean create) { return null; }
	public javax.servlet.http.HttpSession getSession() { return null; }
	public boolean isRequestedSessionIdValid() { return false; }
	public boolean isRequestedSessionIdFromCookie() { return false; }
	public boolean isRequestedSessionIdFromURL() { return false; }
	public boolean isRequestedSessionIdFromUrl() { return isRequestedSessionIdFromURL(); }

	// ServletRequest methods
	public Object getAttribute(String name) { return null; }
	public Enumeration<String> getAttributeNames() { 
	    return Collections.enumeration(new ArrayList<String>());
	}
	public String getCharacterEncoding() { return null; }
	public void setCharacterEncoding(String env) { }
	public int getContentLength() {
	    return ((getHeader("Content-Length") == null)
		    ? (body == null ? 0 : body.length())
		    : getIntHeader("Content-Length"));
	}
	public String getContentType() { return getHeader("Content-Type"); }
	public javax.servlet.ServletInputStream getInputStream() throws java.io.IOException{
	    return new javax.servlet.ServletInputStream() {
		private java.io.InputStream istream = 
		    new java.io.ByteArrayInputStream(body.getBytes());
		public int read() throws java.io.IOException {
		    return istream.read();
		}
	    };
	}
	public String getParameter(String name) {
	    String[] vals = getParameterValues(name);
	    if (vals == null) return null;
	    if (vals.length < 1) return null;
	    return vals[0];
	}
	public Enumeration<String> getParameterNames() {
	    return Collections.enumeration(parameters.keySet());
	}
	public String[] getParameterValues(String name) { return parameters.get(name); }
	public Map getParameterMap() { return Collections.unmodifiableMap(parameters); }
	public String getProtocol() { return "HTTP/1.1"; }
	public String getScheme() { return scheme; }
	public String getServerName() { return host; }
	public int getServerPort() { return port; }
	public java.io.BufferedReader getReader() { 
	    return new java.io.BufferedReader(new java.io.StringReader(body));
	}
	public String getRemoteAddr() { return "127.0.0.1"; }
	public String getRemoteHost() { return "localhost"; }
	public void setAttribute(String name, Object o) { }
	public void removeAttribute(String name) { }
	public java.util.Locale getLocale() { return java.util.Locale.US; }
	public Enumeration<java.util.Locale> getLocales() {
	    Vector<java.util.Locale> v = new Vector<java.util.Locale>();
	    v.add(java.util.Locale.US);
	    return v.elements();
	}
	public boolean isSecure() { return false; }
	public javax.servlet.RequestDispatcher getRequestDispatcher(String path) { return null; }
	public String getRealPath(String path) { return null; }
	public int getRemotePort() { return -1; }
	public String getLocalName() { return "localhost"; }
	public String getLocalAddr() { return "127.0.0.1"; }
	public int getLocalPort() { return 80; }
    }

    private static class InnerHttpServletResponse implements HttpServletResponse, ServletAccessor {
        private InnerHttpServletResponse() { }	

	// ServletAccessor methods
	public int getStatusCode() { return e_code; }
	public String getOutput() { 
	    try {
		writer.flush(); 
		ostream.flush(); 
	    } catch (java.io.IOException e) {
		return "(An IOException occurred while getting output: "+e.getMessage()+")";
	    }
	    return ostream.toString();
	}

	// HttpServletResponse methods
	private int e_code = 200;
	private String e_msg = "";

	public void addCookie(javax.servlet.http.Cookie cookie) { }
	public void addDateHeader(String name, long date) { }
	public void addHeader(String name, String value) { }
	public void addIntHeader(String name, int value) { }
	public boolean containsHeader(String name) { return true; }
	public String encodeRedirectUrl(String url) { return encodeRedirectURL(url); }
	public String encodeRedirectURL(String url) { return url; }
	public String encodeUrl(String url) { return encodeURL(url); }
	public String encodeURL(String url) { return url; }
	public void sendError(int sc) { e_code = sc; }
	public void sendError(int sc, String msg) { e_code = sc; e_msg = msg;}
	public void sendRedirect(String location) { }
	public void setDateHeader(String name, long date) { }
	public void setHeader(String name, String value) { }
	public void setIntHeader(String name, int value) { }
	public void setStatus(int sc) { e_code = sc; }
	public void setStatus(int sc, String sm) { e_code = sc; e_msg = sm; }

	// ServletResponse methods
	private String c_enc = "";
	private String c_type = "";
	private java.util.Locale locale = java.util.Locale.US;
	private final java.io.OutputStream ostream = new java.io.ByteArrayOutputStream();
	private final javax.servlet.ServletOutputStream sostream = 
	    new javax.servlet.ServletOutputStream() {
		public void write(int b) throws java.io.IOException {
		    ostream.write(b);
		}
	    };
	private final java.io.PrintWriter writer = new java.io.PrintWriter(ostream);

	public void flushBuffer() { }
	public int getBufferSize() { return 0; }
	public String getCharacterEncoding() { return c_enc; }
	public String getContentType() { return c_type; }
	public java.util.Locale getLocale() { return locale; }
	public javax.servlet.ServletOutputStream getOutputStream() { return sostream; }
	public java.io.PrintWriter getWriter() { return writer; }
	public boolean isCommitted() { return false; }
	public void reset() { }
	public void resetBuffer() { }
	public void setBufferSize(int size) { }
	public void setCharacterEncoding(String charset) { c_enc = charset; }
	public void setContentLength(int len) { }
	public void setContentType(String type) { c_type = type; }
	public void setLocale(java.util.Locale loc) { locale = loc; }
    }
}