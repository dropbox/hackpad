var newSite = new (function() {
  var NEW_SITE_STEP_INITIALIZED = 0;
  var MIN_SHORTNAME_LENGTH = 3;

  // Checks whether the space name is available and reports
  // availability to the user via a ribbon message
  function checkSpaceName(event) {
    $element = $('#shortname');
    $element.val($element.val().replace(/[^A-Za-z0-9_-]/g, ''));
    // find or create the label element
    var $label = ribbonMessage.getOrCreateLabelForElement($('#shortname')[0]);
    ribbonMessage.setLabelLayout($label, 'left');
    if ($element.val().length < MIN_SHORTNAME_LENGTH) {
      ribbonMessage.removeLabel($label);
      return false;
    }
    if ($element.val()) {
      var $field = $element;
      // don't check if we're still less than the min length
      $.get("/ep/api/subdomain-check", { subdomain: $element.val() }, function(data) {
        if (data) {
          // unavailable subdomain
          if (data.exists) {
            ribbonMessage.setLabelMessage($label, "Unavailable");
            ribbonMessage.setLabelOutcome($label, "error");
          } else {
            // available subdomain
            ribbonMessage.setLabelMessage($label, "Available");
            ribbonMessage.setLabelOutcome($label, "success");
          }
        }
        ribbonMessage.layoutLabel($label, $element);
        ribbonMessage.showLabel($label);
      });
    } else {
      ribbonMessage.removeLabel($label);
    }
  }

  // Validate and process the submitted form
  this.handleFormSubmit = function(form) {
    //console.log("Form submitted");
    // Show activity spinner
    $('button[name="next"]').addClass('loading');
    // Submit the form via AJAX
    var postData = {  name: form.name.value,
                      shortname: form.shortname.value,
                      permission: $('input[type="radio"][name="permission"]:checked').val()
                    }
    $.post('/ep/new-site/step1Post', postData, function(data) {
      // Clear spinner
      $('button[name="next"]').removeClass('loading');
      if (data.success == true) {
        clientVars.newSiteData = data.newSiteData;
        gotoStep(2);
        return true;
      }
    });
    return false;
  }

  this.initModals = function() {
    // Move all modal nodes to be an immediate child of body if not already
    if ($('#pricing_modal').parent().prop('nodeName') != 'BODY') {
      $('body').append($('.modaldialog'));
    }
    $('#pricing_link').click(function() {
      // load the content for the modal if not already loaded
      if ($('#pricing_modal span.modal_close').length == 0) {
        var $container = $('#pricing_modal');
        // inject the content into the DOM
        $container.load('/ep/new-site/pricing_partial', function() {
        });
      }
    });
    $('#pricing_modal').on('click', 'span.modal_close', function() {
      modals.hideModal(100);
    });
  }

  this.init = function() {
    if (NEW_SITE_STEP_INITIALIZED) {
      return false;
    }

    // Form validation
    $('#new_site_form').validate({
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
      submitHandler: newSite.handleFormSubmit
    });

    // Allow clicking on the step names of completed steps
    $('div.progress li').click(function() {
      var $clickedElement = $(this);
      // Determine which step was clicked
      var index = $('#progress_indicator li').index($clickedElement);
      var clickedStep = index + 1;
      // Only move backwards
      if (clickedStep < _getActiveStep()) {
        gotoStep(clickedStep);
      } else {
        // Shake the submit buttons if the user tries to skip forwards
        $('div.form_buttons').effect('shake');
      }
    });

    $('input[placeholder]').placeholder();
    // Monitor site name for availability
    $("input[name=shortname]").keyup(checkSpaceName).change(checkSpaceName);
    // Cancel button
    $("#new_site").on("click", "button[name=cancel]", function() {
      $.get('/ep/new-site/cancel', function() {
        location.href = "/";
      });
    });

    this.initModals();

    // Initialize the common functions for multi-step flow
    // configured externally in onboarding_configuration.js
    multiStepFlowLibrary.init(multiStepConfig);

    $('#company_field').
        on('keyup', function() {
          $('#shortname').val($('#company_field').val());
          checkSpaceName();
        }).
        focus();

    NEW_SITE_STEP_INITIALIZED = 1;
  }

  return this;
})();

$(document).ready(function() {
  if ($("[data-class='newSite']").length > 0) {
    newSite.init();
  }
});
