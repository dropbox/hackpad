$(document).ready(function() {
  $('.two-button-toggle button.inactive').live('click', function() {
    // set all buttons inactive
    $(this).parents('.two-button-toggle').find('button.active').removeClass('active').addClass('inactive');
    // set this button active
    $(this).removeClass('inactive').addClass('active');
  });

  $('.two-button-toggle .stream').live('click', function () {
    goToSection('stream');
  });
  $('.two-button-toggle .list').live('click', function () {
    goToSection('home');
  });
});