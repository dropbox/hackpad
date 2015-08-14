
var modals = (function() {
  var lastFocusedAce = false;

  var self = {
    showModal: function(modalId, duration, notCancellable) {
      if (navigator.userAgent.toLowerCase().indexOf('iphone') != -1
          || navigator.userAgent.toLowerCase().indexOf('ipad') != -1
          || navigator.userAgent.toLowerCase().indexOf('android') != -1) {
        // On mobile, our dialogs are positioned absolutely instead of fixed.
        // Scroll to the top to see them.
        $(window).scrollTop(0);
      }

      $(modalId + " input[placeholder]").unplaceholder();
      $(".modaldialog").hide();

      $(modalId).css('display', 'block');
      setTimeout(function() { $(modalId).addClass('modal-ready') }, 0);
      $(modalId + " input[placeholder]").placeholder();

      if (!$("#modaloverlay").length) {
        $('<div id="modaloverlay"><div id="modaloverlay-inner"><!-- --></div></div>').appendTo("body");
      }
      $("#modaloverlay").unbind('click');
      if (!notCancellable) {
        $("#modaloverlay").click(function() {modals.hideModal(200)});
      }

      lastFocusedAce = document.activeElement.parentNode.id == "padeditor";

      $("#modaloverlay").stop(true,true).show().css({'opacity': 0}).animate({'opacity': 1}, duration);

      // ensure we get rid of the keyboard on ios
      document.activeElement.blur();
      $("input").blur();

      if ($(modalId).find('input:visible').length) {
        // todo: fixme.
        if (modalId != "#page-login-box") {
          $(modalId).find('input:visible')[0].focus();
        } else {
          $(modalId).focus();
        }
      } else {
        $(modalId).focus();
      }

      trackEvent("showModal", modalId, null, { modalId: modalId, isPad: clientVars.padId? true :false, isEmbed: clientVars.isEmbed||false });

      cspfixes.init();
    },
    showHTMLModal: function(html, duration, notCancellable) {
      var modal = $(html);
      if (! $("#" + modal.attr("id")).length) {
        modal.appendTo("body");
        modal.addClass("disposeUponHide");
      } else {
        modal = $($("#" + modal.attr("id"))[0]);
      }
      modals.showModal("#" + modal.attr("id"), duration, notCancellable);
    },

    hideModal: function(duration) {
      var modalId = $(".modaldialog:visible").attr("id");

      trackEvent("hideModal", modalId, null, { modalId: modalId, isPad: clientVars.padId? true :false, isEmbed: clientVars.isEmbed||false });
      $('.modaldialog').removeClass('modal-ready');
      setTimeout(function() {
        $('.modaldialog').css('display', 'none');
        if ($(this).hasClass("disposeUponHide")) {
          $(this).remove();
        }
      }, 250);
      $("#modaloverlay").animate({'opacity': 0}, duration, function () { $("#modaloverlay").hide(); });

      if (lastFocusedAce) {
        padeditor.ace.focus();
      }
    },
    submitModal: function(form) {
      if (!$(form).is(":visible")) {
        // You cannot submit an invisible modal dialog!
        // This fixes lastpass logging in to things in the background
        return false;
      }
      var data = $(form).serialize();

      $(form).parents().filter(".modaldialog").find(".error-message").remove();
      $("<div>").addClass("loading-indicator").css({"position": "absolute", 'top': '10px', 'left': '10px'}).appendTo($(form).parents().filter(".modaldialog"));

      $.post($(form).attr('action'), data, function (resp) {

        // nuke the form so that we can reuse the name
        if (resp.html) {
          var modal = $(resp.html).appendTo("body");
          modal.addClass("disposeUponHide");
          $(form).trigger('closed');
          modals.showModal("#" + modal.attr("id"), 0);
          trackEvent("submitModalHtml", $(form).attr('action'));
        } else if (resp.moreInfo) {
          $(form).trigger('more-info');
        } else if (resp.error) {
          showGlobalMsg(resp.error);
          if (resp.reset) {
            $(form).trigger('reset');
            form.reset();
          }
          trackEvent("submitModalError", $(form).attr('action'), resp.error, {error: resp.error});
        } else if (resp.success && resp.cont) {
          trackEvent("submitModalSuccessCont", $(form).attr('action'), null, {cont: resp.cont});
          if (document.location.href == resp.cont) {
            document.location.reload();
          } else {
            document.location.href = resp.cont;
          }
        } else if (resp.success) {
          //document.location.reload();
          $(form).trigger('closed');
          modals.hideModal(0);
          trackEvent("submitModalSuccess", $(form).attr('action'));
        }
      }).fail(function(jqXHR) {
        $("<div/>")
          .text("An error has occurred. We're looking into it.")
          .addClass("error-message")
          .appendTo($(form).parents().filter(".modaldialog"));
      }).always(function(){
        $(form).parents().filter(".modaldialog").find(".loading-indicator").remove();
      });

      trackEvent("submitModal", $(form).attr('action'));

      return false;
    }
  }
  return self;
}());

$(document).ready(function(){
  // instrument signin buttons
  if ($('.google-signin-button').length) {
    trackLinks('.google-signin-button', 'google-signin');
  }
//  if ($('.fb-login-required').length) {
//    trackLinks('.fb-login-required', 'facebook-signin');
//  }

  $(document).keydown(function(e) {
      // ESCAPE key pressed
      if (e.keyCode == 27) {
        modals.hideModal(0);
      }
  });

  $('#login-email').on('focus', function() {
    if (!$('#login-form').hasClass('active')) {
      $('#login-email-go').fadeIn();
    }
  });

  var switchToSignup = function() {
    $('#login-form').find('.modal-more-info').show();
    $('#login-form').addClass('more-info-requested');
    updateSubmitButton();
    $('#login-forgot-password').hide();
    $('#login-form').attr('action', '/ep/account/signup');
    $('#login-submit').text('Sign me up!');
  };

  var switchToLogin = function() {
    $('#login-form').find('.modal-more-info').hide();
    $('#login-form').removeClass('more-info-requested');
    updateSubmitButton();
    $('#login-forgot-password').show();
    $('#login-form').attr('action', '/ep/account/signin');
    $('#login-submit').text('Start using Hackpad');
  };

  $('#login-email').on('keypress', function(event) {
    if (event.keyCode == 13) {  // enter
      $('#login-email-go').click();
    }
  });

  $('#login-email-go').on('click', function() {
    if (!$('#login-email').val()) {
      return false;
    }

    $('#login-email-go').fadeOut();
    $("<div>").addClass("loading-indicator").
        css({"position": "absolute", 'top': '10px', 'left': '10px'}).
        appendTo($('#login-form').filter(".modaldialog"));

    var showEmailForm = function(isSignup) {
      if (!$('#login-form').hasClass('active')) {
        var originalPositionTop = $('#login-email-wrapper').position().top;
        $('#login-email-wrapper').css({
          'position': 'absolute',
          'width': $('#login-email-wrapper').outerWidth(),
          'top': $('#login-email-wrapper').position().top
        });
        $('#login-email-wrapper').data('originalPositionTop', originalPositionTop);
        $('#login-google, #login-facebook, #login-or').fadeOut(400, function() {
          $('#login-email-wrapper').removeClass('no-transition').
              css('top', '40px');
          setTimeout(function() {
            $('#login-email-wrapper').addClass('no-transition').css({
              'position': 'relative',
              'width': '100%',
              'top': 0
            });
            $('#login-form').addClass('active');
            $('#login-email-secondary').fadeIn();
            $('#login-email-secondary .icon-back').fadeIn();
            setTimeout(function() { $('#login-password').focus() }, 0);


            if (isSignup) {
              switchToSignup();
            } else {
              switchToLogin();
            }
          }, 200);
        });
      }
    };

    $.ajax({
      type: 'post',
      url: '/ep/account/login-or-signup',
      data: { email: $('#login-email').val() },
      success: function(res) {
        showEmailForm(res.signup);
      }
    }).always(function(){
      $('#login-form').filter(".modaldialog").find(".loading-indicator").remove();
    });

    return false;
  });

  var returnToPrimaryScreen = function() {
    $('#login-email-secondary .icon-back').fadeOut();
    $('#login-email-secondary').fadeOut(400, function() {
      $('#login-form').removeClass('active');
      $('#login-email-wrapper').css({
        'position': 'absolute',
        'width': $('#login-email-wrapper').outerWidth(),
        'top': '40px'
      });
      setTimeout(function() {
        $('#login-email-wrapper').removeClass('no-transition').
            css('top', $('#login-email-wrapper').data('originalPositionTop'));
        setTimeout(function() {
          $('#login-email-wrapper').addClass('no-transition').css({
            'position': 'relative',
            'width': '100%',
            'top': 0
          });
          $('#login-google, #login-facebook, #login-or').fadeIn();
          if ($('#login-email').val()) {
            $('#login-email-go').fadeIn();
          }
        }, 200);
      }, 0);
    });
  };

  $('#login-email-secondary .icon-back').on('click', function() {
    returnToPrimaryScreen();
  });

  var updateSubmitButton = function() {
    $('#login-submit').prop('disabled',
        !$('#login-email').val() || !$('#login-password').val() ||
        ($('#login-form').hasClass('more-info-requested') && !$('#login-fullname').val()));
  };

  // If we signup, we're told we'll get a verification email. If the user
  // reopens the dialog in this tab let's set it up for them.
  $('#login-form').on('closed', function(res) {
    returnToPrimaryScreen();
  });

  $('#login-form').on('reset', function(res) {
    returnToPrimaryScreen();
  });

  $('#login-form').on('more-info', function() {
    switchToSignup();
  });

  $('#login-email, #login-password, #login-fullname').on('input', function() {
    updateSubmitButton();
  });

  $("#login-form").validate({
    rules: {
      email: { required: true, email: true},
      password: { required: true }
    },
    errorPlacement: function(error, element) {
      error.prependTo(element.parent().parent());
    },
    submitHandler: function(form) {
      modals.submitModal(form);
    }
  });
});
