var hints = function () {

	function showHint(element, content, optDelay) {
		var delay = optDelay || 2000;
		setTimeout(function(){doShowHint(element, content)}, delay);
	}
	function doShowHint(element, content) {
		var elOffset = $(element).offset();
		if (!elOffset) {
			return;
		}

		// create
		var tipHTML = '\
		  <div class="tip">\
		    <div class="arrow-top-left">\
		      <div class="arrow-up-border"></div>\
		      <div class="arrow-up"></div>\
		    </div>\
		    <div class="tip-box">' + content + '</div>\
		  </div>';
		var tipElement = $(tipHTML);
		$("body").append(tipElement);

		// position
		var arrowElement = $(tipElement).find(".arrow-top-left");
		tipElement.css({top: elOffset.top + $(element).height() + arrowElement.height() + 2,
		 left:elOffset.left - arrowElement.position().left + 5, display: 'none'}).fadeIn();

		// remove
		function _handleBodyClick() {
			_removeTip();
		}
		function _removeTip() {
			tipElement.fadeOut(function() {tipElement.remove()});
			$("body").unbind('click', _handleBodyClick);
		}
		setTimeout(_removeTip, 4000);
		$("body").click(_handleBodyClick);
	}

	return {
		showHint: showHint
	};
}();