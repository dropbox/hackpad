
function onDownloadPadsClick(e) {
  e.preventDefault();

  function onSuccess (resp) {
    // nuke the form so that we can reuse the name
    if (resp.html) {
      var modal = $(resp.html).appendTo("body");
      modal.addClass("disposeUponHide");
      modals.showModal("#" + modal.attr("id"), 0);
    } else if (resp.error) {
      alert(resp.error);
    }
  }

  function onFailure(jqXHR) {
      alert("An error has occurred. We're looking into it");
  }

  var downloadFormat = {'download-pads-html' : 'html',
      'download-pads-md' : 'md',
      'download-pads-txt': 'txt'}[e.target.id];
  if (downloadFormat) {
    var url = $($(e.target).parents('.hp-ui-button-menu')[0]).data('url');
    $.get(url, {format:downloadFormat}, onSuccess).fail(onFailure);
  }

  return false;
}