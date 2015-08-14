$('.hp-ui-button-menu-wrapper a').on('click', function() {
  if ($(this).hasClass('hp-ui-button-menu-disabled')) {
    return;
  }

  var buttonEl = $(this).closest('.hp-ui-button');
  buttonEl.find('.hp-ui-button-menuitem-selected').
      removeClass('hp-ui-button-menuitem-selected');
  buttonCloseMenu(buttonEl);
});

var buttonCloseMenu = function(buttonEl) {
  $('body').off('.hp-ui-button-menu');
  buttonEl.find('.hp-ui-button-menu-wrapper').hide();
  buttonEl.removeClass('hp-ui-button-active');
  buttonEl.find('.hp-ui-button-menuitem-selected').
      removeClass('hp-ui-button-menuitem-selected');
  buttonEl.trigger('menu-closed');
};

$('.hp-ui-button-menu').on('click', function() {
  var buttonEl = $(this);
  if (buttonEl.attr('disabled')) {
    return;
  }

  $('#tooltip').remove();

  var isReverse = buttonEl.hasClass('hp-ui-button-menu-reverse');
  var menuWrapperEl = buttonEl.find('.hp-ui-button-menu-wrapper');
  var ulEl = buttonEl.find('.hp-ui-button-list-ul');
  var menuItemsEl = buttonEl.find('.hp-ui-button-list-ul li');
  var index = -1;
  buttonEl.data('close', buttonCloseMenu);

  if (menuWrapperEl.is(':visible')) {
    buttonCloseMenu(buttonEl);
  } else {
    ulEl.css('min-width', buttonEl.outerWidth() + 'px');
    menuWrapperEl.show();
    buttonEl.addClass('hp-ui-button-active');

    var maxHeight = Math.max(200,
        Math.min($('body').height() - ulEl.offset().top - 50, 435));
    ulEl.css('max-height', maxHeight + 'px');
    isReverse && ulEl.css('top', '-' +
        (ulEl.outerHeight() + buttonEl.outerHeight() + 10) + 'px');

    window.setTimeout(function () {
      $('body').on('keydown.hp-ui-button-menu', function (evt) {
        if (menuWrapperEl.is(':hidden')) {
          return true;
        }

        var prevIndex = index;
        switch (evt.keyCode) {
          case 13:
            ulEl.find('li.hp-ui-button-menuitem-selected > a').trigger('click');
            return false;
          case 27:
            buttonCloseMenu(buttonEl);
            return false;
          case 38:
            index = index - 1 < 0 ? menuItemsEl.length - 1 : index - 1;
            break;
          case 40:
            index = (index + 1) % menuItemsEl.length;
            break;
          default:
            return true;
        }
        ulEl.find('li:nth-child(' + (prevIndex + 1) + ')').
            removeClass('hp-ui-button-menuitem-selected');
        ulEl.find('li:nth-child(' + (index + 1) + ')').
            addClass('hp-ui-button-menuitem-selected');
        return false;
      }).on('click.hp-ui-button-menu', function () {
        buttonCloseMenu(buttonEl);
      })
    }, 0);
  }
});
