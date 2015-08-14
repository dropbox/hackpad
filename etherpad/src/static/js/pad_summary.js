var authorData = {};

$(document).ready(function(){
  function getAuthorColorClassSelector(oneClassName) {
    return ".authorColors ."+oneClassName;
  }

  function receiveAuthorData(newAuthorData) {
    return;
    for(var author in newAuthorData) {
      var data = newAuthorData[author];
      if ((typeof data.colorId) == 'number') {
        var bgcolor = clientVars.colorPalette[data.colorId %
            clientVars.colorPalette.length];
        if (bgcolor && dynamicCSS) {
          dynamicCSS.selectorStyle(
              '.added.'+linestylefilter.getAuthorClassName(author)).
              backgroundColor = bgcolor;
          dynamicCSS.selectorStyle(
              '.added.fa-'+linestylefilter.getAuthorClassName(author)).
              backgroundColor = bgcolor;
        }
      }
      authorData[author] = data;
    }
  }

  $(":not(div.longKeep) + div.longKeep").css('color', 'gray');
  $(":not(div.longKeep) + div.longKeep").css('cursor', 'pointer');
  $(":not(div.longKeep) + div.longKeep").css('cursor', 'hand');
  $(":not(div.longKeep) + div.longKeep").click (function() {
    var linesToToggle = [];
    var current = $(this);
    while (current = current.next()) {
      if (current.hasClass('longKeep')) {
        linesToToggle.push(current);
      } else {
        break;
      }
    }

    $(linesToToggle).each(function(){
      $(this).css('display') == 'none' ? $(this).css('display', 'block') :
          $(this).css('display', 'none');
    });
  });
  $("div.longKeep + div.longKeep").css('display', 'none');


 var dynamicCSS = makeCSSManager('dynamicsyntax');
 receiveAuthorData(clientVars.historicalAuthorData);

 if (clientVars.minRev != 0) {
   $("#show-more a").attr('href',
     "/ep/pad/summary/" + clientVars.padId +
     "?show=" + (Number(clientVars.show) + 20));
   $("#show-more").show();
 }
});
