/*
    Library to provide common functions for a flow that occurs
    over multiple steps, such as new user onboarding (with updating URLs).

    Date: 09/03/13

    This library is designed to allow a user to traverse multiple steps in a smooth
    manner using AJAX queries. The URL will update with each step in order to support
    refreshing the page, the browser back button, and deep-linking.

    When a user moves forwards (or backwards) in the flow, this library will load the
    necessary step via an AJAX query (if not already in the DOM). Configuration is handled
    via a config object that is externalized to avoid repeating in each ejs file
    (e.g. look at the onboarding_configuration.js include).

    To use this library, the JS for every step should be included in each page,
    and the necessary JS object is invoked based on the "data-class" attribute in the
    "step" container div.

    There should be a div id "viewport" as the global container, with a ul id "ajax_wrapper"
    inside (check out new_site_form.ejs for an example). When a new step is requested,
    an "li" node will be created, and the relevant form inserted via the AJAX call.

    The session object will maintain state between steps. It is assumed that it contains
    the relevant data for the previous steps (so that if the user goes back, the previous
    step's form will be loaded with previously entered values).
 */

var multiStepFlowLibrary = new (function() {
  // The width for the container for each step
  var WIDTH_PER_STEP;
  // Records the URLs for each step in the flow
  var FLOW_STEP_URLS;

  // Perform the animation of the viewport
  _animateViewportToStep = function(stepNumber, callback) {
    // Indicate step
    $('div.progress li').removeClass('active');
    $('div.progress li:nth-child(' + stepNumber + ')').addClass('active');
    $('#viewport').addClass('animating');
    // make all steps visible
    $('#ajax_wrapper > li').css({visibility: "visible"});
    $('#ajax_wrapper').animate({ left: -WIDTH_PER_STEP * (stepNumber - 1) + "px" }, 600, "easeOutQuart", function() {
      $('#viewport').removeClass('animating');
      // make all other steps invisible to remove offscreen focus
      $('#ajax_wrapper > li').css({visibility: "hidden"});
      $('#step-' + stepNumber).css({visibility: "visible"});
      if (typeof callback == "function") {
        callback();
      }
    });
  }

  // Return the number of the step we're currently viewing
  _getActiveStep = function() {
    // Determine which step is highlighted
    return $('#progress_indicator li').index($('#progress_indicator li.active')) + 1;
  }

  getActiveStep = function() {
    return _getActiveStep();
  }

  // Use pushState or replaceState to update the URL
  // method: "update" or "replace" to change the URL
  // stepNumber: the current step we are updating to
  this.updateUrl = function(method, stepNumber) {
    // Update the URL with a pushState
    var stateObj = { ajaxChange: true, stepNumber: stepNumber };
    switch (method) {
      case "push":
        window.history.pushState(stateObj, stepNumber, FLOW_STEP_URLS[stepNumber - 1]);
        break;
      case "replace":
        window.history.replaceState(stateObj, stepNumber, FLOW_STEP_URLS[stepNumber - 1]);
        break;
    }
  }

  // Switch to a particular step in the flow
  gotoStep = function(stepNumber) {
    // debugger;
    if (stepNumber > FLOW_STEP_URLS.length) {
      console.error("Attempted to go to step " + stepNumber + ' of ' + (FLOW_STEP_URLS.length) + ' steps.');
      return false;
    }
    if (stepNumber == _getActiveStep()) {
      console.log("Already at step " + stepNumber);
      return false;
    }
    // Hide all ribbon messages
    ribbonMessage.removeAll();
    // Determine if we've loaded that step yet or not
    if ($('#ajax_wrapper #step-' + stepNumber).length > 0) {
      _animateViewportToStep(stepNumber, function() {
        // Update the URL with a replaceState
        multiStepFlowLibrary.updateUrl("replace", stepNumber);
      });
      return true;
    }
    // Create the container for the content we're about to fetch
    var $newNode = $('<li id="step-' + stepNumber + '" class="step"></li>');
    if (_getActiveStep() < stepNumber) {
      $('#ajax_wrapper').append($newNode);
    } else {
      $('#ajax_wrapper').prepend($newNode);
    }
    var urlToLoad = FLOW_STEP_URLS[stepNumber - 1];
    // Fetch the content and inject it into the container
    $('#step-' + stepNumber).load(urlToLoad + ' div.step', function(data) {
      NUM_LOADED_STEPS++;
      // Increase the width of the sliding container if necessary
      var currentWidth = parseInt($('#ajax_wrapper').css('width'));
      // Calculate the new width
      var newWidth = (WIDTH_PER_STEP * NUM_LOADED_STEPS);
      if (newWidth > currentWidth) {
        $('#ajax_wrapper').css({ width: newWidth + "px", left: -WIDTH_PER_STEP * (_getActiveStep() - 1) + "px"});
      }
      _animateViewportToStep(stepNumber, function() {
        // Invoke the new step's JS once the animation is completed (for performance)
        var jsClass = $('#step-' + stepNumber + ' div.step').attr('data-class');
        window[jsClass].init();
        multiStepFlowLibrary.updateUrl("push", stepNumber);
      });
    });
  }

  // Monitor the window state so the user can use the back button
  // to move back/forward to the previous/next step
  function handleWindowStateChange(event) {
      var newPath = document.location.pathname;
      // Remove trailing slash
      newPath = newPath.replace(/\/$/, '');
      // Find the matching step number for this new path
      var index = $.inArray(newPath, FLOW_STEP_URLS);
      if (index > -1) {
        gotoStep(index + 1);
      }
  }

  // Initialize the multi-step flow
  // flowSteps: an array with an ordered list of Urls for each step in the flow
  // widthPerStep: an integer to increase the width of the #ajax_wrapper container per step
  this.init = function(configObj) {
    // Asset that the configObj contains the required params
    var requiredParams = ["flowStepUrls", "widthPerStep"];
    $.each(requiredParams, function(index, value) {
      if(!configObj[value]) {
        console.error("Missing required config param '" + value + "' when initializing multi-step flow handler.")
        return false;
      }
    });
    FLOW_STEP_URLS = configObj.flowStepUrls;
    WIDTH_PER_STEP = configObj.widthPerStep;

    // Monitor window state change (for back button presses)
    window.onpopstate = handleWindowStateChange;
  }

  return this;
})();