$(document).ready(function() {
  var booting = true;

	//When page loads...
	$(".tab_content").show(); //Hide all content

	$(".tab_content:first-child").show(); //Show first tab content

  if ($('.tab_content:first-child').find('input:visible').length) {
    $('.tab_content:first-child').find('input:visible')[0].focus();
  }

	//On Click Event
	$("ul.tabs li").click(function() {
    var tabWidget = $(this).parents(".tab_wrapper");
		$(this).parents("ul.tabs").find("li").removeClass("active"); //Remove any "active" class
		$(this).addClass("active"); //Add "active" class to selected tab
		tabWidget.find(".tab_content").hide(); //Hide all tab content
    tabWidget.find(".tab_content").find('input').unplaceholder(); //Hide all tab content

		var activeTabId = $(this).find("a").attr("href"); //Find the href attribute value to identify the active tab + content

		var placeholderIt = function(){
		  tabWidget.find('input[placeholder]:visible').placeholder();
		  if (tabWidget.find('input:visible').length) {
		    if (!booting) {
          tabWidget.find('input:visible')[0].focus();
        }
      }
		}

		tabWidget.find(activeTabId).fadeIn();

		placeholderIt(); //Fade in the active ID content
    // run on-activate callback
    if (window[$(activeTabId).attr("id") +"_onactivate"]){
      window[$(activeTabId).attr("id") +"_onactivate"]();
    }

		return false;
	});

  $("ul.tabs li[selected]").click();
  booting = false;
});


function tab1_onactivate() {
  if (! $("#signin-form input[name=email]").val()) {
    $("#signin-form input[name=email]").val($("#signup-form input[name=email]").val());
  }
  if (! $("#signin-form input[name=password]").val()) {
    $("#signin-form input[name=password]").val($("#signup-form input[name=password]").val());
  }
}
