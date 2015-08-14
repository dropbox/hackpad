
var imgshrink = (function() {

  function dataURLToBlob(dataURI) {
    // convert base64 to raw binary data held in a string
    var byteString;
    if (dataURI.split(',')[0].indexOf('base64') >= 0) {
      byteString = atob(dataURI.split(',')[1]);
    } else {
      byteString = unescape(dataURI.split(',')[1]);
    }

    // separate out the mime component
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], {type: mimeString});
  }

  var self = {
    maybeShrinkImage: function(file, callback, optMaxWidth, optMaxHeight) {

      if (!window.FileReader || !window.Image || file.type.indexOf("image") == -1 ||
        file.type.indexOf("image/gif") == 0 || file.size < 500000) {
        callback(file);
        return;
      }

      var reader = new FileReader();

      reader.onloadend = function() {
        var image = new Image();

        image.onload = function() {
          var maxWidth = optMaxWidth || 1280,
              maxHeight = optMaxHeight || 3280,
              imageWidth = image.width,
              imageHeight = image.height;

          if (imageWidth > imageHeight) {
            if (imageWidth > maxWidth) {
              imageHeight *= maxWidth / imageWidth;
              imageWidth = maxWidth;
            }
          }
          else {
            if (imageHeight > maxHeight) {
              imageWidth *= maxHeight / imageHeight;
              imageHeight = maxHeight;
            }
          }

          var canvas = document.createElement("canvas");
          canvas.width = imageWidth;
          canvas.height = imageHeight;

          var ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

          var dataUrl = canvas.toDataURL(file.type, 0.8);
          var blob = dataURLToBlob(dataUrl);

          // all done
          callback(blob);
        }

        image.src = reader.result;
      }

      reader.readAsDataURL(file);
    }
  };
  return self;
}());

