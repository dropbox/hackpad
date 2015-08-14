
import("etherpad.globals.isProduction");
import("underscore._");

jimport("java.io");
jimport("java.lang.System");
jimport("java.math.BigInteger");
jimport("java.nio.charset.Charset");
jimport("javax.crypto.Cipher");
jimport("javax.crypto.Mac");
jimport("javax.crypto.spec");
jimport("javax.crypto.spec.SecretKeySpec");
jimport("javax.crypto.SecretKeyFactory");
jimport("net.appjet.oui.Encryptomatic");
jimport("java.io.ByteArrayOutputStream");
//jimport("java.lang.reflect.Array"); // <- never ever import this.  it breaks rhino.
jimport("java.util.Arrays");
jimport("java.lang.System");
jimport("javax.xml.bind.DatatypeConverter");
jimport("org.apache.commons.codec.binary.Base64");


function convertToBase64(str) {
  return Base64.encodeBase64String(new java.lang.String(str).getBytes("UTF-8")) + '';
}

function _getEncryptionKey() {
  return appjet.cache.SECRET;
}

function signRequest(requestDict, key) {
  var key = new java.lang.String(appjet.config.requestSigningSecret);
  var mac = new Mac.getInstance("HmacSHA256");
  var secret = new SecretKeySpec(key.getBytes(),"HmacSHA256");
  mac.init(secret);

  var sortedKeys = _.keys(requestDict).sort();

  // Do not use any special chars that are base64 compatible (such as '=', '.', '_', '+', etc.).
  // Pipe seems to be a good one. See http://en.wikipedia.org/wiki/Base64.
  var DELIMITER_BYTES = new java.lang.String("|").getBytes();

  sortedKeys.forEach(function (key) {
    // Encode the keys and values to base 64 so we can use a delimiter that is for sure not
    // contained in the keys and values.
    var stringKey = new java.lang.String(convertToBase64(key));
    var stringValue = new java.lang.String(convertToBase64(requestDict[key]));

    mac.update(stringKey.getBytes());
    mac.update(DELIMITER_BYTES);
    mac.update(stringValue.getBytes());
  });

  var SIGNATURE_VERSION = new java.lang.String(convertToBase64("v0"));
  mac.update(DELIMITER_BYTES);
  mac.update(SIGNATURE_VERSION.getBytes());

  var digest = mac.doFinal();
  var bi = new BigInteger(1, digest);
  var encoded = java.lang.String.format("%0" + (digest.length << 1) + "X", bi);
  return String(encoded);
}

function signString(key, str, opt_hmacType) {
  var algorithm = opt_hmacType || "HmacSHA256";
  var mac = new Mac.getInstance(algorithm);
  mac.init(new SecretKeySpec(key, algorithm));
  return mac.doFinal((new java.lang.String(str)).getBytes("UTF-8"));
}

function isValidSignedRequest(requestDict, providedSignature, optMaxAge) {
  var requestToCheck = {};
  for (var i in requestDict) {
    if (i != "sig") {
      requestToCheck[i] = requestDict[i];
    }
  }
  var signature = signRequest(requestToCheck);
  if (!_timeIndependentEquals(providedSignature, signature)) {
      return false;
  }

  // Check for expiration based on 't' param
  if (optMaxAge && (parseInt(requestDict['t']) + optMaxAge) < (new Date()).getTime()) {
    return false;
  }

  return true;
}

/*
  Loop over the whole signature regardless of when it diverges
  to prevent timing attacks
*/
function _timeIndependentEquals(a, b) {

  if (a === undefined || b === undefined) {
    return false;
  }

  if (a.length != b.length) {
    return false;
  }

  var result = 0;
  for (var i=0; i<a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result == 0;
}

function _getDefaultIdEncryptionKey() {
  var key = appjet.config.defaultIdEncryptionKey; // 8 bytes
  return new javax.crypto.spec.SecretKeySpec(DatatypeConverter.parseHexBinary(key), "DES");
}

function encryptedId(id, optKey) {
  var c = javax.crypto.Cipher.getInstance("DES/ECB/PKCS5Padding");
  c.init(javax.crypto.Cipher.ENCRYPT_MODE, optKey || _getDefaultIdEncryptionKey());
  var enc = c.doFinal((new java.lang.String(id)).getBytes("UTF-8"));
  return fixedBytesToAscii(enc);
}

function decryptedId(encTxt, optKey) {
  var c = javax.crypto.Cipher.getInstance("DES/ECB/PKCS5Padding");
  c.init(javax.crypto.Cipher.DECRYPT_MODE, optKey || _getDefaultIdEncryptionKey());
  var enc = fixedAsciiToBytes(encTxt);
  var srcBytes = c.doFinal(enc);
  var src = new java.lang.String(srcBytes, "UTF-8");
  return new String(src);
}

function fixedBytesToAscii(srcBytes) {
  // prepend 0x01
  var byteStream = java.io.ByteArrayOutputStream();
  byteStream.write(0x01);
  byteStream.write(srcBytes, 0, srcBytes.length);
  return net.appjet.oui.Encryptomatic.bytesToAscii(byteStream.toByteArray());
}

function fixedAsciiToBytes(ascii) {
  var enc = net.appjet.oui.Encryptomatic.asciiToBytes(ascii);
  return Arrays.copyOfRange(enc, 1, enc.length);
}



