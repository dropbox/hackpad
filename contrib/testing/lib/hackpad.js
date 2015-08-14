function typeAndSelect(keys) {
  $('#editor').sendkeys(keys);
  var rng = bililiteRange($('#editor')[0]);
  rng.bounds([rng.length() - keys.length, rng.length()]).select()
}
