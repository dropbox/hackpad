// Script to include a remote editor (such as Hackpad) and receive the posted message back
// Author: Neil Kandalgaonkar
//
// On all wiki pages
// Create an editing button that will invoke hackpad
// Pass in hackpad invocation URL
//   uniqueID 'net:' + canonical URL + rev  -- to identify session
//   title                                  -- so they can join sessions
//   username                               -- so they can id the user in the interface

( function( $, mw ) { 
    // change this if your wiki's domain name is not available on the public internet
    var domainNamespace = 'INTERNET';
    
    var configurations = {
        hackpad: { 
            name: 'hackpad',
            tabTitle: 'HackPad',
            url: 'https://hackpad.com/ep/pad/anon',
            protoHostPort: 'https://hackpad.com'
        },
        test: {
            name: 'test',
            tabTitle: 'TestRemoteEditor',
            url: 'http://www.brevity.org/test/wikieditor.pl',
            protoHostPort: 'http://www.brevity.org'
        }
    };

    mw.remoteEditor = function( editorName ) { 
        if ( typeof configurations[editorName] === undefined ) {
            alert( "don't have config for the remote editor: " + editorName );
            return;
        }
        this.editorConfig = configurations[editorName];
        this.createTab();
        this.canonicalUrl = mw.config.get( 'wgServer' ) + mw.config.get( 'wgScript' ) + '?' 
                + $.param( { 
                    'title': mw.config.get( 'wgPageName' ) 
                } );
        this.$form = $( 'form#editform' );
        if ( this.isOurEditPage() ) {
            this.launchEditor();   
        }
    };
    
    mw.remoteEditor.prototype = {
        launchEditor: function() { 
            
            console.log( "launch the editor: " + this.editorConfig.name );
            
            this.listenForEdit();

            this.$form.hide();
            var form = this.$form.get(0);
            var version = form.wpEdittime.value;
            var pageTitle = mw.config.get( 'wgPageName' );
            var sessionToken = $.map( [ domainNamespace, this.canonicalUrl, version ], encodeURIComponent ).join( ':' );
            this.$iframe = $( '<iframe></iframe>' ).attr( { 'width': '100%', 'height': '600px', 'name': 'remoteEditor' } );
            this.$form.before( this.$iframe );
            $("div.wikiEditor-ui").hide();
            var $postForm = $( '<form style="visibility:hidden; height:0px;"></form>' )
            .attr( { 'method': 'post', 'action': this.editorConfig.url, 'target': 'remoteEditor' } )
            .append(
                $( '<input name="sessionToken"></input>' ).val( sessionToken ),
                $( '<input name="title"></input>' ).val( mw.config.get( 'wgPageName' ) ),
                $( '<input name="username"></input>' ).val( mw.config.get( 'wgUserName' ) ),
                $( '<textarea name="text"></textarea>' ).val( form.wpTextbox1.value )
            );
            
            this.$form.before( $postForm );
            var _this = this;
            $("#wpSave").click(function() {
                  _this.$iframe.get(0).contentWindow.postMessage("wpSave", "*"); return false;
            });
            $postForm.submit();

        },
        
        listenForEdit: function() {
            var _this = this;
            function receiveMessage( event ) {
                if ( event.origin !== _this.editorConfig.protoHostPort ) {
                    console.log( 'unauthorized postmessage -- ' + event.origin );
                    return;
                }
                var data = JSON.parse( event.data );
                _this.$form.get(0).wpTextbox1.value = data.content;
                var summary = _this.$form.find("#wpSummary").val() + " - " + data.comment;
                _this.$form.find("#wpSummary").val(summary);
                _this.$iframe.hide();
                _this.$form.submit();
            }
            window.addEventListener( "message", receiveMessage, false );
        },

        isOurEditPage: function() {
            var currentUrl = window.location.href;
            return currentUrl.indexOf( 'action=edit' ) !== -1
                    && 
                    currentUrl.indexOf( 'editor=' + this.editorConfig.name ) !== -1;
        },
        
        createTab: function() { 
            
            var editUrl = mw.config.get( 'wgServer' ) + mw.config.get( 'wgScript' ) + '?' 
                + $.param( { 
                    'title': mw.config.get( 'wgPageName' ),
                    'action': 'edit', 
                    'editor': this.editorConfig.name 
                } );
                
            $( '#p-views ul' ).prepend( 
                $( '<li></li>' ).append( 
                    $('<span></span>').append( 
                        $('<a></a>' )
                            .attr( { href: editUrl } )
                            .text( this.editorConfig.tabTitle )
                    )
                )
            );
        }
        
    };
  
  
 
  
} )( jQuery, mediaWiki );

var editor = new mw.remoteEditor( 'hackpad' );
