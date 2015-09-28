
var padrelated = (function() {
  var self = {
    init: function() {
      if (!$('#related-pads-div').length) {
        return;
      }
      $.get("/ep/pad/related", { padId: pad.getPadId() }, function(data) {
        var lines = data.split("\n");
        for (var i=0; i<lines.length; i++) {
          var line = lines[i];
          var related = line.split("|");
          if (related.length < 2) { return; }
          var d = $('<li>');
          var a = $("<a/>").attr("href", "/" + related[1]).
              attr('title', related[0]).
              append(related[0]).appendTo(d);
          $('#related-pads-menu .hp-ui-button-list-ul').append(d);
        }
        if (lines.length > 0) {
          var text = lines.length + ' Related Pad' + (lines.length === 1 ? '' : 's');
          $('#related-pads-menu .hp-ui-button-content').text(text);
          if (!$('#related-pads-menu .icon-privacy-link').length) {
            $('#related-pads-menu .hp-ui-button-content').append(
                $('<i>').addClass('icon-privacy-link'));
          }
          $("#related-pads-div").show();
        } else {
          $("#related-pads-div").hide();
        }
      });
    }
  };
  return self;
}());
