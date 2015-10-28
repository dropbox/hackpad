
import("crypto");
jimport("com.amazonaws.services.s3.model.CannedAccessControlList");
jimport("com.amazonaws.services.s3.model.GeneratePresignedUrlRequest");
jimport("org.apache.commons.codec.binary.Hex");
jimport("java.io.ByteArrayInputStream");
jimport("java.io.ByteArrayOutputStream");


S3 = null;

function _init() {
  if (S3 == null) {
    S3 = new com.amazonaws.services.s3.AmazonS3Client(
      new com.amazonaws.auth.BasicAWSCredentials(
        appjet.config.awsUser, appjet.config.awsPass));
  }
}

function getBucketName(bucketName) {
  if (appjet.config["s3." + bucketName]) {
    return appjet.config["s3." + bucketName];
  }
  return bucketName;
}

function list(bucketName) {
  _init();
  return S3.listObjects(getBucketName(bucketName)).getObjectSummaries().toArray();
}

function put(bucketName, keyName, bytes, isPublicRead, contentType) {
  _init();

  if (!(bytes instanceof java.io.InputStream)) {
    bytes = new java.io.ByteArrayInputStream(new java.lang.String(bytes).getBytes());
  }

  var meta = null;
  if (contentType) {
    meta = new com.amazonaws.services.s3.model.ObjectMetadata();
    meta.setContentType(contentType);
  }

  S3.putObject(getBucketName(bucketName), keyName, bytes, meta);
  if (isPublicRead) {
    S3.setObjectAcl(getBucketName(bucketName), keyName, CannedAccessControlList.PublicRead);
  }
}

function getURL(bucketName, keyName, useHTTP) {
  return (useHTTP?"http":"https") + "://s3.amazonaws.com/" + getBucketName(bucketName) + "/" + keyName;
}

function getPresignedURL(bucketName, keyName, durationValidMs) {
  var expiration = new java.util.Date();
  expiration.setTime(expiration.getTime() + durationValidMs);

  var generatePresignedUrlRequest = new GeneratePresignedUrlRequest(getBucketName(bucketName), keyName);
  generatePresignedUrlRequest.setExpiration(expiration);

  return S3.generatePresignedUrl(generatePresignedUrlRequest);
}

function getBytes(bucketName, keyName) {
  _init();
  var obj = S3.getObject(getBucketName(bucketName), keyName);
  var inStream = obj.getObjectContent();
  try {
    return new java.io.ByteArrayOutputStream(inStream).toByteArray();
  } finally {
    inStream.close();
  }
}

var AWS_SERVICE = 's3';
var AWS_REQUEST = 'aws4_request';
/**
 * This signature allows the user to upload a file to the bucket that begins with a specific
 * key (domain_localPadId_userId_), enforces only image uploads up to a max size of 20MB.
 */
function _getS3Policy(domain, localPadId, userId, expirationDate, utcDateStr) {
  var isoDate = expirationDate.toISOString();

  // Amazon wants two types of date strings, one like:
  //   "2015-04-28T00:36:03.092Z"
  // and one like:
  //   "20150428T003603Z"
  // :facepalm:
  var alternateWTFAreYouSeriousISOAmazonDate = isoDate.replace(/[:\-]|\.\d{3}/g, '');

  return {
    "expiration": isoDate,
    "conditions": [
      {"bucket": getBucketName(appjet.config.s3Bucket)},
      ["starts-with", "$key", domain + '_' + localPadId + '_' + userId + '_'],
      {"acl": "public-read"},
      ["starts-with", "$Content-Type", "image/"],
      ["content-length-range", 0, 1024*1024*20 /* 20 MB for animated gifs! */],

      {"x-amz-credential":
          appjet.config.awsUser + "/" +
          utcDateStr + "/" +
          appjet.config.s3Region + "/" +
          AWS_SERVICE + "/" +
          AWS_REQUEST
      },
      {"x-amz-algorithm": "AWS4-HMAC-SHA256"},
      {"x-amz-date": alternateWTFAreYouSeriousISOAmazonDate }
    ]
  };
}

/**
 * We must sign requests to Amazon, otherwise you could have people arbitrarily:
 *   - uploading files of random content types to our bucket
 *   - uploading files with whatever key they want
 *   - uploading files with an acl that they can choose
 *   - uploading files of unbounded size
 */
function getS3PolicyAndSig(domain, localPadId, userId) {
  var expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 1);

  function pad(n) { return n < 10 ? '0' + n.toString() : n.toString() }
  var utcDateStr = pad(expirationDate.getUTCFullYear()) +
      pad(expirationDate.getUTCMonth() + 1) +
      pad(expirationDate.getUTCDate());

  var s3Policy = crypto.convertToBase64(JSON.stringify(
      _getS3Policy(domain, localPadId, userId, expirationDate, utcDateStr)));
  var AWSAccessKeyId = appjet.config.awsUser;
  var AWSSecretAccessKey = appjet.config.awsPass;
  var awsSecretKey = new java.lang.String("AWS4" + AWSSecretAccessKey).getBytes("UTF8");

  var dateKey = crypto.signString(awsSecretKey, utcDateStr);
  var dateRegionKey = crypto.signString(dateKey, appjet.config.s3Region);
  var dateRegionServiceKey = crypto.signString(dateRegionKey, AWS_SERVICE);
  var signingKey = crypto.signString(dateRegionServiceKey, AWS_REQUEST);
  var signature = crypto.signString(signingKey, s3Policy);

  // XXX Amazon's documentation lies.  I've emailed them to correct it.
  // http://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-UsingHTTPPOST.html
  // says to take the final result and and base64 encode it.
  // But what they really want is *hex* encoding, not base64.
  // See also: http://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-post-example.html
  // and: http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-other

  return {
    s3Policy: s3Policy,
    s3PolicySig: Hex.encodeHexString(signature)
  };
}
