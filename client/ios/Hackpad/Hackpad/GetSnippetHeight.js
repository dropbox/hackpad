(function () {
  var elems = document.body.getElementsByTagName('div');
  var min = 0;
  var max = elems.length - 1;
  var i, height;
  while (min != max) {
    i = Math.floor((min + max) >> 1);
    if (elems[i].offsetTop + elems[i].offsetHeight < 160) {
      min = i + 1;
    } else {
      max = i;
    }
  }
  return elems[min].offsetTop + elems[min].offsetHeight;
})();
