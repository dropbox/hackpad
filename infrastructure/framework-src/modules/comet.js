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

/**
 * @fileOverview
 * Comet presents a real-time bidirectional-channel interface. Using comet, your
 * server can push data to any connected client without waiting for that client
 * to issue a request.
 *
 * <tt>comet</tt> reserves the <tt>/newcomet</tt> path and its subpaths for its
 * own use.
 */

/**
 * Gets a list of all client currently connected to the server.
 * @function
 * @name connections
 * @return {array} An array of the string ids of all connected clients.
 */
function connections() {
  return Packages.net.appjet.ajstdlib.Comet.connections(appjet.context);
}

function getNumCurrentConnections() {
  return Packages.net.appjet.ajstdlib.Comet.getNumCurrentConnections();
}

function isConnected(id) {
  return Packages.net.appjet.ajstdlib.Comet.isConnected(id);
}

function disconnect(id) {
  Packages.net.appjet.ajstdlib.Comet.disconnect(id);
}

function getAttribute(id, key) {
  var ret = Packages.net.appjet.ajstdlib.Comet.getAttribute(appjet.context, id, key);
  if (ret != null)
    return String(ret);
}

function setAttribute(id, key, value) {
  Packages.net.appjet.ajstdlib.Comet.setAttribute(appjet.context, id, key, value);
}

/**
 * Sends a message to a particular client.
 * @functionn
 * @name sendMessage
 * @param {string} id The <tt>id</tt> of the client to send to.
 * @param {string} data The string data to send to the client.
 */
function sendMessage(id, msg) {
  Packages.net.appjet.ajstdlib.Comet.write(id, msg);
}

function headInclude() { return '<script src="'+appjet.config.cometPrefix+'/js/client.js"></script>'; };
function clientCode() {
  return Packages.net.appjet.ajstdlib.Comet.getClientCode(appjet.context);
};
function clientMTime() {
  return Packages.net.appjet.ajstdlib.Comet.getClientMTime(appjet.context);
};

/**
 * WebSocket allows the client to connect to the server via a
 * "bidirectional" channel. Messages sent by the server are received by
 * the client without the need for additional connections or other delays.
 * @class
 * @name WebSocket
 * @param {string} id The id to use for this client.
 */

/**
 * Connects to the server using the id specified in the constructor.
 * @methodOf WebSocket
 * @name connect
 */
