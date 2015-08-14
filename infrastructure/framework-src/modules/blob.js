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
 * Constructs and returns a new Blob from a JavaScript string.
 */
function stringToBlob(contentType, string) {
  return { contentType: contentType,
	   _stringData: string,
	   numDataBytes: string.length*2 };
}

/**
 * Constructs and returns a new Blob from a Java byte array (byte[]).
 */
function byteArrayToBlob(contentType, javaByteArray) {
  return { contentType: contentType,
	   _binaryData: javaByteArray,
	   numDataBytes: javaByteArray.length };
}

/**
 * Serves a Blob to the client, using the appropriate content-type,
 * and stops execution of the current request.
 */
function serveBlob(blob) {
  response.setContentType(blob.contentType);
  if (blob._binaryData) {
    response.writeBytes(new java.lang.String(blob._binaryData, 0));
  }
  else if (blob._stringData) {
    response.write(blob._stringData);
  }
  response.stop();
}
