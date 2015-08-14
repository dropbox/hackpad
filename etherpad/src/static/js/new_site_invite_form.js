var newSiteInviteForm = new (function() {
  var NUM_DEFAULT_INVITE_FIELDS = 4;
  var INVITE_FORM_STEP_INITIALIZED = 0;

  // Returns a new DOM element for an additional invite field
  generateInviteField = function(email) {
    $li = $('<li></li>');
    $li.append($('<input type="email" name="invites[]" class="email-invite" placeholder="Invitee Email">'));
    var emailInput = $li.find('input');
    if (email) {
      emailInput.val(email);
    }
    invitizeEmailInput(emailInput);
    return $li;
  };

  invitizeEmailInput = function(emailInputs) {
    emailInputs.on('keydown', function(e) {
      if (e.keyCode == 13) {  // don't allow submitting via enter key on email form.
        return false;
      }
    });
    $.each(emailInputs, function(index, input) {
      $(input).invite({ target: 'Site',
          dataURL: "/ep/invite/autocomplete?emailonly=1",
          inviteItemHandlers: {
            '*': {
              callback: function(item) {
                var email;
                var fullName;
                if (item[3] == "typedemail") {
                  email = item[1];
                  fullName = item[1];
                } else if (item[3] == "email") {
                  fullName = item[1].split("<span ")[0];
                  email = item[2];
                }
                if (email) {
                  $(input).val(email);
                  setTimeout(function() {
                    $(input).parent().next().find('input[type=email]').focus();
                  }, 0);
                }
              }
            }
          }
      });
    });
  };

  // Return metadata about the invite fields:
  //  - the number of fields
  //  - the number of fields with values
  getInviteFieldMetadata = function() {
    numFullFields = 0;
    numFields = $('input.email-invite').length;
    $('input.email-invite').each(function() {
      if (this.value.trim().length > 0) {
        numFullFields++;
      }
    });
    return {
      numFields: numFields,
      numFullFields: numFullFields
    };
  };

  // Automatically add new email fields as required
  autoGrowEmailFields = function() {
    $('ol.invites').on('focusin', 'input.email-invite', function(event) {
      lastField = $('input.email-invite').last()[0];
      fieldMetadata = getInviteFieldMetadata();
      if (this == lastField &&
          fieldMetadata.numFullFields == fieldMetadata.numFields - 1) {
        newField = generateInviteField();
        $(this).parents('ol').append(newField);
        $(newField).find('input[placeholder]').placeholder();
      }
    });

    $('ol.invites').on('focusout', 'input.email-invite', function(event) {
      //console.log("field blur");
      secondLastField = $('ol.invites li:nth-last-child(2) input')[0];
      if (this == secondLastField && this.value == '') {
        // Remove last field if we are above the default num of fields
        if ($('ol.invites li').length > NUM_DEFAULT_INVITE_FIELDS) {
          $('ol.invites li:last-child').remove();
        }
      }
    });
  };

  // Allow clicking to copy invite link to the clipboard
  initClipboardCopy = function() {
    return;
    var _defaults = {
      moviePath:         "/static/swf/ZeroClipboard.swf",        // URL to movie
      hoverClass:        "primary-button-hover",   // The class used to hover over the object
      activeClass:       "primary-button-active",  // The class used to set object active
      allowScriptAccess: "sameDomain",               // SWF outbound scripting policy
      useNoCache:        true,                       // Include a nocache query parameter on requests for the SWF
      forceHandCursor:   true                       // Forcibly set the hand cursor ("pointer") for all glued elements
    };
    var clip = new ZeroClipboard( document.getElementById("copy-link-button"), _defaults);

    clip.on( 'load', function(client) {
      // make button active
    } );

    clip.on( 'complete', function(client, args) {
        // Show a friendly message that the copy was successful
        ribbonMessage.showMessage("Copied", "success", "right", $('#copy-link-button'));
        // Unfocus the pesky flash component
        $('.email-invite').first().focus();
    } );
  };

  this.handleFormSubmit = function() {
    // Show activity spinner
    $('button[name="finish"]').addClass('loading');
    var postData = {  allowAllFromDomain: $('#allow_all_checkbox').length > 0 ? $('#allow_all_checkbox').get(0).checked : false,
                      notificationAddress: $('#mailing-list-invite').val(),
                      emailInvites: [],
                      name: $('#new_site_form')[0].name.value,
                      shortname: $('#new_site_form')[0].shortname.value,
                      permission: $('#new_site_form input[type="radio"][name="permission"]:checked').val()
    }
    // email invites
    $('input.email-invite').each(function(index, item) {
      var val = $(item).val();
      if (val != "") {
        postData.emailInvites.push(val);
      }
    });
    var url = "/ep/pro-signup/ajax";
    // post the data
    $.post(url, postData, function(data) {
      if(data.success) {
        window.location.href = data.newSite;
      } else {
        alert(data.error);
      }
    }).always(function(){
      $('button[name="finish"]').removeClass('loading');
    });
  };

  this.initModals = function() {
    // Move all modal nodes to be an immediate child of body if not already
    if ($('#welcome_email_modal').parent().prop('nodeName') != 'BODY') {
      $('body').append($('.modaldialog'));
    }
    // Show the email preview editor modal
    $('#preview_button').click(function() {
      // load the content for the modal if not already loaded
      if ($('#welcome_email_modal span.modal_close').length == 0) {
        var $container = $('#welcome_email_modal');
        // inject the content into the DOM
        $container.load('/ep/new-site/welcome_email_partial', function() {
          modals.showModal('#welcome_email_modal', 100);
        });
      } else {
        modals.showModal('#welcome_email_modal', 100);
      }
    });
    $('#welcome_email_modal').on('click', 'span.modal_close, button[name="cancel"]', function() {
      modals.hideModal(100);
      return false;
    });

    // Perform save for invite email
    // Show activity spinner
    $('#welcome_email_modal').on('submit', 'form', function() {
      $('button[name="save"]').addClass('loading');
      valueObj = {  subject: $('input[name=subject]').val(),
                    body: $('textarea').val() };
      $.post('/ep/new-site/welcome_email_post', valueObj, function() {
        $('button[name="save"]').removeClass('loading');
        modals.hideModal(100);
      });
      return false;
    });

    // Reset invite email to default
    $('#welcome_email_modal').on("click", 'button[name="reset"]', function() {
      $('#welcome_email_modal input[name="subject"]').val(clientVars.newSiteData.defaultWelcomeEmailSubject);
      $('#welcome_email_modal textarea').val(clientVars.newSiteData.defaultWelcomeEmailBody);
    });
  };

  this.init = function() {
    if (INVITE_FORM_STEP_INITIALIZED) {
      return false;
    }

    $('button[name="back"]').click(function() {
      gotoStep(1);
    });

    // Enable tooltips
    padutils.tooltip("[data-tooltip]");

    $('#invite_link').mouseup(function() {
      event.preventDefault();
    });
    $('#invite_link').focus(function() {
      $(this).select();
    });

    $('#allow_all_checkbox').change(function() {
      if (this.checked == 1) {
        $('div.welcome-email-field').show().animate({
            height: "95px",
          opacity: 1
        }, function() {
          $('div.welcome-email-field input').placeholder();
        });
      } else {
        $('div.welcome-email-field').animate({
          height: 0,
          opacity: 0
        });
      }
    });

    autoGrowEmailFields();
    initClipboardCopy();

    // Initialize the common functions for multi-step flow
    // configured externally in onboarding_configuration.js
    multiStepFlowLibrary.init(multiStepConfig);

    // Form validation
    $('#invite_form').validate({
      debug: false,
      errorPlacement: ribbonMessage.layoutLabel,
      showErrors: function(errorMap, errorList) {
        $('label[generated="true"]').remove();
        this.defaultShowErrors();
        $.each(errorList, function(i, item) {
          var $element = $(item.element);
          var message = item.message;
          ribbonMessage.showMessage(message, "error", "left", $element);
        });
      },
      submitHandler: newSiteInviteForm.handleFormSubmit
    });

    // Populate the invite fields
    if (emailInvites = clientVars.newSiteData.emailInvites) {
      // ensure it's an array
      if (!$.isArray(emailInvites)) {
        emailInvites = [emailInvites];
      }
      // add a blank field to the end
      emailInvites.push("");
      $.each(emailInvites, function(index, item) {
        $field = $($('input.email-invite').get(index));
        // Add a new field if required
        if ($field.length == 0) {
          $li = generateInviteField();
          $('ol.invites').append($li);
          $field = $li.find('input');
        }
        // set the values
        $field.val(item);
      });
    }
    $('ol.invites input[placeholder]').placeholder();

    invitizeEmailInput($('input[type=email]'));

    if(clientVars.newSiteData.allowAllFromDomain == "true") {
      $('div.welcome-email-field input').placeholder();
    }

    setTimeout(function() { // wait until after animation is done.
      $('.email-invite').first().focus();
    }, 250);
    this.initModals();

    INVITE_FORM_STEP_INITIALIZED = 1;
  };

  return this;
})();

$(document).ready(function() {
  if ($("[data-class='newSiteInviteForm']").length > 0) {
    newSiteInviteForm.init();
  }
});
