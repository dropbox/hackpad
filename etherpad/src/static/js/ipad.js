

function hideIphoneToolbar() {
  if (window.pageYOffset == 0) {
    window.scrollTo(window.pageXOffset , 1);
    window.setTimeout(hideIphoneToolbar, 1000);
  }
}


// window.onorientationchange = hideIphoneToolbar;
var lastPageXOffset = 0;

$(function() {
  $("#friend-picker").attr("placeholder", "name / email");

  if ((navigator.userAgent.toLowerCase().indexOf('iphone') != -1
      || navigator.userAgent.toLowerCase().indexOf('ipad') != -1)
      && !$('body').hasClass('mobile-app')) {
	  // window.setTimeout(hideIphoneToolbar, 1000);


    $(".title a").bind("click", function() {
        if (this.href) {
            location.href = this.href;
            return false;
        }
    });

    if (window.screen.height==568) { // iPhone 4"
      document.querySelector("meta[name=viewport]").content="width=320.1";
    }

  }
});
