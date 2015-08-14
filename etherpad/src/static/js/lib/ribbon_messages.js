/*
    Common library to show ribbon messages (e.g. next to form fields)
    Date: 08/19/13
 */
var ribbonMessage = new (function() {
  // Time to show the message before dismissing it
  MESSAGE_SHOW_DURATION = 3000;

  /**
   * Generate and present a message alongside a DOM element.
   *
   * @param {string} message - The message to display.
   * @param {string} outcome - "success" or "error".
   * @param {string} layout - "left" or "right" of the element.
   * @param {object} element - The DOM node to position the ribbon against (e.g. an input field)
  */
  this.showMessage = function(message, outcome, layout, element) {
    $element = $(element);
    if ($element.length == 0) {
      return false;
    }
    $label = this.getOrCreateLabelForElement(element);
    this.setLabelMessage($label, message);
    this.setLabelOutcome($label, outcome);
    this.setLabelLayout($label, layout);
    this.layoutLabel($label, $element);
    this.showLabel($label);
  }

  // Show a label and then hide it after a delay
  this.showLabel = function(label) {
    var $label = $(label);
    $label.show();
    setTimeout(function() {
        $label.addClass('fadeOut');
        $label.fadeOut(500, function() {
          $(this).remove();
        });
    }, MESSAGE_SHOW_DURATION);
  }

  // Set the message for a label
  this.setLabelMessage = function(label, message) {
    $(label).find('span').text(message);
  }

  // Set the outcome to success of error
  this.setLabelOutcome = function(label, outcome) {
    $(label).attr('data-outcome', outcome);
  }

  // Set a label's layout to left or right
  this.setLabelLayout = function(label, layout) {
    $(label).attr('data-layout', layout);
  }

  // To use ribbon labels for jquery.validate, this is
  // the callback to use in the "showErrors" parameter
  this.layoutLabel = function(label, element) {
    var $element = $(element);
    var $label = $(label);
    var position = $element.offset();
    var layout = $label.attr('data-layout');
    switch(layout) {
      case "left":
        position.left -= ($label.width() + 40);
        position.top += ($label.height()/2) - 8;
        $label.addClass('animated fadeInLeft');
        break;
      case "right":
      default:
        position.left += ($element.width() + 25);
        position.top += ($label.height()/2) - 8;
        $label.addClass('animated fadeInRight');
        break;
    }
    $label.css(position);
  }

  // Returns the label for a given element
  this.getOrCreateLabelForElement = function(element) {
    var id = $(element).attr('id');
    if (!id) {
      console.error("Attempted to get the label for an element with no ID.");
      return false;
    }
    var $label = $('label[for="' + id + '"].ribbon-message');
    if ($label.length < 1) {
      // Create a new label
      $label = $('<label class="ribbon-message" for="' + id + '"><span></span></label>');
      $label.attr('data-first_run', 1);
      $('body').append($label);
    }
    return $label;
  }

  this.removeLabel = function(label) {
    $(label).remove();
  }

  // Clear all ribbon messages
  this.removeAll = function() {
    $('label.ribbon-message').hide().remove();
  }

  return this;
})();