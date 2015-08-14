

toISOString = function (d) {
  function padzero(n) {
    return n < 10 ? '0' + n : n;
  }
  function pad2zeros(n) {
    if (n < 100) {
      n = '0' + n;
    }
    if (n < 10) {
      n = '0' + n;
    }
    return n;
  }

  return d.getUTCFullYear()
    + '-'
    + padzero(d.getUTCMonth() + 1)
    + '-'
    + padzero(d.getUTCDate())
    + 'T'
    + padzero(d.getUTCHours())
    + ':'
    + padzero(d.getUTCMinutes())
    + ':'
    + padzero(d.getUTCSeconds())
    + '.'
    + pad2zeros(d.getUTCMilliseconds())
    + 'Z';
};

