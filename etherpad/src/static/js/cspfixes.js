
var cspfixes = (function() {

  function init() {

    $("*[data-click]").off('click.csp').on('click.csp', function(evt) {
      console.log("data-click handler:", this, evt);
      var action = $(this).attr('data-click');
      switch (action) {
        case "connect-dropbox":
          document.location = '/ep/dropbox/get-dropbox-auth-url';
          return false;
        case "disconnect-dropbox":
          document.location = '/ep/dropbox/disconnect';
          return false;
        case "showmodal":
          modals.showModal($(this).attr('data-modal'), 500);
          return false;
        case "hidemodal":
          modals.hideModal(0);
          return false;
        case "submitmodal":
          var modal = $(this).attr('data-modal');
          modals.submitModal(modal);
          return false;
        case "highlight-pad-picker":
          $('#pad-picker').effect('pulsate', {times:1}, 300).focus();
          return false;
        case "toggle-group-follow":
          toggleGroupFollow(this);
          return false;
        case "signin-account":
          var acctId = $(this).attr('data-id');
          var cont = $(this).attr('data-cont');
          var signInAsURL ='/ep/account/as?id=' + acctId + '&cont=' + cont;

          $('<form/>').attr('action', signInAsURL).attr('method','POST').appendTo(document.body).submit();

          return false;
        case "highlight-input":
          $(this).find('input').select();
          return false;
        case "sitebar-open":
          $('body').toggleClass('sitebar-open');
          return;
        case "preventdefault":
          evt.preventDefault();
          return false;
        case "downloadpads":
          onDownloadPadsClick(evt);
          return false;
        case "cancelclick":
          if (!evt.metaKey && !evt.ctrlKey && evt.button != 2) {
            evt.preventDefault();
            return false;
          }
          break;
        case "pagereload":
          window.location.reload();
          return false;
        case "showembeddialog":
          pad.showEmbedDialog();
          return false;
        case "deletepad":
          pad.deletePad();
          return false;
        case "deletegroup":
          deleteGroup();
          return false;
        case "hideservermessage":
          pad.hideServerMessage();
          return false;
      }
    });

    $("*[data-submit]").off("submit.csp").on("submit.csp", function(evt) {
      var action = $(this).attr('data-submit');
      if (action == "submitmodal") {
        return modals.submitModal(this);
      }
    });

    $("*[data-keyup]").off("keyup.csp").on("keyup.csp", function(evt) {
      var action = $(this).attr('data-keyup');
      if (action == "maybecheckusedomain") {
        maybeCheckUseDomain();
      }
    });
  }

  return {init: init};

})();

$(document).ready(function(){
  cspfixes.init();
});

