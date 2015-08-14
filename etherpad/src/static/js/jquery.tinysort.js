/*! TinySort 1.4.29
* Copyright (c) 2008-2012 Ron Valstar http://www.sjeiti.com/
*
* Dual licensed under the MIT and GPL licenses:
*   http://www.opensource.org/licenses/mit-license.php
*   http://www.gnu.org/licenses/gpl.html
*//*
* Description:
*   A jQuery plugin to sort child nodes by (sub) contents or attributes.
*
* Contributors:
*	brian.gibson@gmail.com
*	michael.thornberry@gmail.com
*
* Usage:
*   $("ul#people>li").tsort();
*   $("ul#people>li").tsort("span.surname");
*   $("ul#people>li").tsort("span.surname",{order:"desc"});
*   $("ul#people>li").tsort({place:"end"});
*
* Change default like so:
*   $.tinysort.defaults.order = "desc";
*
* in this update:
* 	- added plugin hook
*   - stripped non-latin character ordering and turned it into a plugin
*
* in last update:
*   - header comment no longer stripped in minified version
*	- revision number no longer corresponds to svn revision since it's now git
*
* Todos:
* 	- todo: uppercase vs lowercase
* 	- todo: 'foobar' != 'foobars' in non-latin
*
*/
;(function($) {
	// private vars
	var fls = !1							// minify placeholder
		,nll = null							// minify placeholder
		,prsflt = parseFloat				// minify placeholder
		,mathmn = Math.min					// minify placeholder
		,rxLastNr = /(-?\d+\.?\d*)$/g		// regex for testing strings ending on numbers
		,aPluginPrepare = []
		,aPluginSort = []
	;
	//
	// init plugin
	$.tinysort = {
		 id: 'TinySort'
		,version: '1.4.29'
		,copyright: 'Copyright (c) 2008-2012 Ron Valstar'
		,uri: 'http://tinysort.sjeiti.com/'
		,licensed: {
			MIT: 'http://www.opensource.org/licenses/mit-license.php'
			,GPL: 'http://www.gnu.org/licenses/gpl.html'
		}
		,plugin: function(prepare,sort){
			aPluginPrepare.push(prepare);	// function(settings){doStuff();}
			aPluginSort.push(sort);			// function(valuesAreNumeric,sA,sB,iReturn){doStuff();return iReturn;}
		}
		,defaults: { // default settings

			 order: 'asc'			// order: asc, desc or rand

			,attr: nll				// order by attribute value
			,data: nll				// use the data attribute for sorting
			,useVal: fls			// use element value instead of text

			,place: 'start'			// place ordered elements at position: start, end, org (original position), first
			,returns: fls			// return all elements or only the sorted ones (true/false)

			,cases: fls				// a case sensitive sort orders [aB,aa,ab,bb]
			,forceStrings:fls		// if false the string '2' will sort with the value 2, not the string '2'

			,sortFunction: nll		// override the default sort function
		}
	};
	$.fn.extend({
		tinysort: function(_find,_settings) {
			if (_find&&typeof(_find)!='string') {
				_settings = _find;
				_find = nll;
			}

			var oSettings = $.extend({}, $.tinysort.defaults, _settings)
				,sParent
				,oThis = this
				,iLen = $(this).length
				,oElements = {} // contains sortable- and non-sortable list per parent
				,bFind = !(!_find||_find=='')
				,bAttr = !(oSettings.attr===nll||oSettings.attr=="")
				,bData = oSettings.data!==nll
				// since jQuery's filter within each works on array index and not actual index we have to create the filter in advance
				,bFilter = bFind&&_find[0]==':'
				,$Filter = bFilter?oThis.filter(_find):oThis
				,fnSort = oSettings.sortFunction
				,iAsc = oSettings.order=='asc'?1:-1
				,aNewOrder = []
			;

			$.each(aPluginPrepare,function(i,fn){
				fn.call(fn,oSettings);
			});


			if (!fnSort) fnSort = oSettings.order=='rand'?function() {
				return Math.random()<.5?1:-1;
			}:function(a,b) {
				var bNumeric = fls
				// maybe toLower
					,sA = !oSettings.cases?toLowerCase(a.s):a.s
					,sB = !oSettings.cases?toLowerCase(b.s):b.s;
				// maybe force Strings
//				var bAString = typeof(sA)=='string';
//				var bBString = typeof(sB)=='string';
//				if (!oSettings.forceStrings&&(bAString||bBString)) {
//					if (!bAString) sA = ''+sA;
//					if (!bBString) sB = ''+sB;
				if (!oSettings.forceStrings) {
					// maybe mixed
					var  aAnum = sA&&sA.match(rxLastNr)
						,aBnum = sB&&sB.match(rxLastNr);
					if (aAnum&&aBnum) {
						var  sAprv = sA.substr(0,sA.length-aAnum[0].length)
							,sBprv = sB.substr(0,sB.length-aBnum[0].length);
						if (sAprv==sBprv) {
							bNumeric = !fls;
							sA = prsflt(aAnum[0]);
							sB = prsflt(aBnum[0]);
						}
					}
				}
				// return sort-integer
				var iReturn = iAsc*(sA<sB?-1:(sA>sB?1:0));

				$.each(aPluginSort,function(i,fn){
					iReturn = fn.call(fn,bNumeric,sA,sB,iReturn);
				});

				return iReturn;
			};

			oThis.each(function(i,el) {
				var $Elm = $(el)
					// element or sub selection
					,mElmOrSub = bFind?(bFilter?$Filter.filter(el):$Elm.find(_find)):$Elm
					// text or attribute value
					,sSort = bData?''+mElmOrSub.data(oSettings.data):(bAttr?mElmOrSub.attr(oSettings.attr):(oSettings.useVal?mElmOrSub.val():mElmOrSub.text()))
 					// to sort or not to sort
					,mParent = $Elm.parent();
				if (!oElements[mParent])	oElements[mParent] = {s:[],n:[]};	// s: sort, n: not sort
				if (mElmOrSub.length>0)		oElements[mParent].s.push({s:sSort,e:$Elm,n:i}); // s:string, e:element, n:number
				else						oElements[mParent].n.push({e:$Elm,n:i});
			});
			//
			// sort
			for (sParent in oElements) oElements[sParent].s.sort(fnSort);
			//
			// order elements and fill new order
			for (sParent in oElements) {
				var oParent = oElements[sParent]
					,aOrg = [] // list for original position
					,iLow = iLen
					,aCnt = [0,0] // count how much we've sorted for retreival from either the sort list or the non-sort list (oParent.s/oParent.n)
					,i;
				switch (oSettings.place) {
					case 'first':	$.each(oParent.s,function(i,obj) { iLow = mathmn(iLow,obj.n) }); break;
					case 'org':		$.each(oParent.s,function(i,obj) { aOrg.push(obj.n) }); break;
					case 'end':		iLow = oParent.n.length; break;
					default:		iLow = 0;
				}
				for (i = 0;i<iLen;i++) {
					var bSList = contains(aOrg,i)?!fls:i>=iLow&&i<iLow+oParent.s.length
						,mEl = (bSList?oParent.s:oParent.n)[aCnt[bSList?0:1]].e;
					mEl.parent().append(mEl);
					if (bSList||!oSettings.returns) aNewOrder.push(mEl.get(0));
					aCnt[bSList?0:1]++;
				}
			}
			oThis.length = 0;
			Array.prototype.push.apply(oThis,aNewOrder);
			return oThis;
		}
	});
	// toLowerCase
	function toLowerCase(s) {
		return s&&s.toLowerCase?s.toLowerCase():s;
	}
	// array contains
	function contains(a,n) {
		for (var i=0,l=a.length;i<l;i++) if (a[i]==n) return !fls;
		return fls;
	}
	// set functions
	$.fn.TinySort = $.fn.Tinysort = $.fn.tsort = $.fn.tinysort;
})(jQuery);

/*! Array.prototype.indexOf for IE (issue #26) */
if (!Array.prototype.indexOf) {
	Array.prototype.indexOf = function(elt /*, from*/) {
		var len = this.length
			,from = Number(arguments[1])||0;
		from = from<0?Math.ceil(from):Math.floor(from);
		if (from<0) from += len;
		for (;from<len;from++){
			if (from in this && this[from]===elt) return from;
		}
		return -1;
	};
}
