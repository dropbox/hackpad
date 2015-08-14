/*!
jQuery Placeholder 1.1.1

Copyright (c) 2010 Michael J. Ryan (http://tracker1.info/)

Dual licensed under the MIT and GPL licenses:
	http://www.opensource.org/licenses/mit-license.php
	http://www.gnu.org/licenses/gpl.html

------------------------------------------------------------------------------

Sets up a watermark for inputted fields... this will create a LABEL.watermark 
tag immediately following the input tag, the positioning will be set absolute, 
and it will be positioned to match the input tag.

To activate on all tags with a 'data-watermark' attribute:

	$('input[placeholder],textarea[placeholder]').placeholder();


To style the tags as appropriate (you'll want to make sure the font matches):

	label.placeholder {
		cursor: text;				<--- display a cursor to match the text input

		padding: 4px 4px 4px 4px;   <--- this should match the border+padding 
											for the input field(s)
		color: #999999;				<--- this will display as faded
	}

You'll also want to have the color set for browsers with native support
	input:placeholder, textarea:placeholder {
		color: #999999;
	}
	input::-webkit-input-placeholder, textarea::-webkit-input-placeholder {
		color: #999999;
	}

------------------------------------------------------------------------------

Thanks to...
	http://www.alistapart.com/articles/makingcompactformsmoreaccessible
	http://plugins.jquery.com/project/overlabel

	This works similar to the overlabel, but creates the actual label tag
	based on a data-watermark attribute on the input tag, instead of 
	relying on the markup to provide it.

*****************************************************************************/
(function($){
	
	var ph = "PLACEHOLDER-INPUT";
	var phl = "PLACEHOLDER-LABEL";
	var boundEvents = false;
	var default_options = {
		labelClass: 'placeholder'
	};
	
	//check for native support for placeholder attribute, if so stub methods and return
	var input = document.createElement("input");
	if ('placeholder' in input) {
		$.fn.placeholder = $.fn.unplaceholder = function(){}; //empty function
		delete input; //cleanup IE memory
		return;
	};
	delete input;

	$.fn.placeholder = function(options) {
		bindEvents();

		var opts = $.extend(default_options, options)

		this.each(function(){
			var rnd=Math.random().toString(32).replace(/\./,'')
				,input=$(this)
				,label=$('<label style="position:absolute;display:none;top:0;left:0;"></label>');


			if (!input.attr('placeholder')) {
				return;
			}
			if (input.data(ph) === ph) {
				itemIn.call(this);
				itemOut.call(this);
				return;
			} //return; //already watermarked

			//make sure the input tag has an ID assigned, if not, assign one.
			if (!input.attr('id')) input.attr('id', 'input_' + rnd);

			label	.attr('id',input.attr('id') + "_placeholder")
					.data(ph, '#' + input.attr('id'))	//reference to the input tag
					.attr('for',input.attr('id'))
					.css("fontSize", input.css("fontSize"))
					.css("lineHeight", input.css("height"))

					.addClass(opts.labelClass)
					.addClass(opts.labelClass + '-for-' + this.tagName.toLowerCase()) //ex: watermark-for-textarea
					.addClass(phl)
					.text(input.attr('placeholder'));

			// on the iphone, you have to forward the click
			label.click(function() {$(this).focus()});

			input
				.data(phl, '#' + label.attr('id'))	//set a reference to the label
				.data(ph,ph)		//set that the field is watermarked
				.addClass(ph)		//add the watermark class
				.after(label);		//add the label field to the page

			//setup overlay
			itemIn.call(this);
			itemOut.call(this);
		});
	};

	$.fn.unplaceholder = function(){
		this.each(function(){
			var	input=$(this),
				label=$(input.data(phl));

			if (input.data(ph) !== ph) return;
				
			label.remove();
			input.removeData(ph).removeData(phl).removeClass(ph);
		});
	};


	function bindEvents() {
		if (boundEvents) return;

		//prepare live bindings if not already done.
		$('.' + ph)
//			.live('click',itemIn)
//			.live('focusin',itemIn)
			.live('keydown',itemIn)
			.live('focusout',itemOut);
		bound = true;

		boundEvents = true;
	};

	function itemIn() {
		var input = $(this)
			,label = $(input.data(phl));

		label.css('display', 'none');
	};

	function itemOut() {
		var that = this;
		//use timeout to let other validators/formatters directly bound to blur/focusout work first
		setTimeout(function(){
			var input = $(that);

			$(input.data(phl))
				.css('top', input.position().top + 'px')
				.css('left', input.position().left + 'px')
				.css('display', !!input.val() ? 'none' : 'block');
		}, 200);
	};

}(jQuery));
