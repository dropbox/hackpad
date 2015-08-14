/*!
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padmodals = (function() {

  var clearFeedbackEmail = function() {};
  function clearFeedback() {
    clearFeedbackEmail();
    $("#feedbackbox-topic").val('');
    $("#feedbackbox-subject").val('');
    $("#feedbackbox-message").val('');
  }

  var sendingFeedback = false;
  function setSendingFeedback(v) {
    v = !! v;
    if (sendingFeedback != v) {
      sendingFeedback = v;
      if (v) {
        $("#feedbackbox-send").css('opacity', 0.75);
      }
      else {
        $("#feedbackbox-send").css('opacity', 1);
      }
    }
  }

  var sendingInvite = false;
  function setSendingInvite(v) {
    v = !! v;
    if (sendingInvite != v) {
      sendingInvite = v;
      if (v) {
        $("#sharebox-send").css('opacity', 0.75);
      }
      else {
        $("#sharebox-send").css('opacity', 1);
      }
    }
  }

  var clearShareBoxTo = function() {};
  function clearShareBox() {
    clearShareBoxTo();
  }

  var self = {
    init: function() {
      self.initFeedback();
      self.initShareBox();
      self.initModeration();
      // modal dialog cancel buttons
      $(".modaldialog input[value=Cancel]").live('click', function() {
        modals.hideModal();
      });
    },
    initModeration: function() {
      $("#moderated-modal button[type=submit]").click(function() {
        pad.disableUnsavedPrompt();
        document.location = "/ep/pad/fork?padId=" + clientVars.padId;
      });

    },
    initFeedback: function() {
      var emailField = $("#feedbackbox-email");
      /*clearFeedbackEmail =
        padutils.makeFieldLabeledWhenEmpty(emailField, '(your email address)').clear;
      clearFeedback();*/

      $("#feedbackbox-hide").click(function() {
        self.hideModal();
      });
      $("#feedbackbox-topic").on('change', function() {
        $('#feedbackbox-faq').hide();
        $('#feedbackbox-feature-request').hide();
        $('#feedbackbox-subject').show();
        $('#feedbackbox-message').show();

        if ($("#feedbackbox-topic").val() == 'howto') {
          $('#feedbackbox-faq').show();
        } else if ($("#feedbackbox-topic").val() == 'feature') {
          $('#feedbackbox-feature-request').show();
          $('#feedbackbox-subject').hide();
          $('#feedbackbox-message').hide();
        }
      });
      $("#feedbackbox-send").click(function() {
        if ($("#feedbackbox-email").is(":visible")) {
          var result = $("#feedback-form").validate().element("#feedbackbox-email");
          if (result) {
            self.sendFeedbackEmail();
          }
        } else {
          self.sendFeedbackEmail();
        }
      });

      $("#feedbackbutton").click(function() {
        self.showFeedback();
      });

      $('#footer-support-link').on('click', function() {
        self.showFeedback();
        return false;
      });

      $("#uservoicelinks a").click(function() {
        self.hideModal();
        return true;
      });
      $("#feedbackemails a").each(function() {
        var node = $(this);
        node.attr('href', "mailto:"+node.attr('href')+"@etherpad.com");
      });

      if (emailField.length) {
        $("#feedback-form").validate({
          rules: {
              'feedbackbox-email': { required: true,
                             email: true}
          },
          errorPlacement: function(error, element) {
            error.prependTo(element.parent());
          },
          submitHandler: function(form) {
            modals.submitModal(form);
          }
        });
      }

    },
    initShareBox: function() {
      $("#nootherusers a").click(self.showShareBox);
      $("#sharebutton").click(padfacebook.publishPad);
        /*
      $("#sharebox-hide").click(function() {
        self.hideModal();
      });
      $("#sharebox-send").click(function() {
        self.sendInvite();
      });

      $("#sharebox-url").click(function() {
        $("#sharebox-url").focus().select();
      });

      clearShareBoxTo =
        padutils.makeFieldLabeledWhenEmpty($("#sharebox-to"),
                                           "(email addresses)").clear;
      clearShareBox();

      $("#sharebox-subject").val(self.getDefaultShareBoxSubjectForName(pad.getUserName()));
      $("#sharebox-message").val(self.getDefaultShareBoxMessageForName(pad.getUserName()));
        */
    },
    getDefaultShareBoxMessageForName: function(name) {
      return (name || "Somebody")+" has shared an EtherPad document with you."+
        "\n\n"+"View it here:\n\n"+
        padutils.escapeHtml($("#sharebox-url").val()+"\n");
    },
    getDefaultShareBoxSubjectForName: function(name) {
      return (name || "Somebody")+" invited you to an EtherPad document";
    },
    relayoutWithBottom: function(px) {
      $("#modaloverlay").height(px);
      $("#sharebox").css('left',
                         Math.floor(($(window).width() -
                                     $("#sharebox").outerWidth())/2));
      $("#feedbackbox").css('left',
                            Math.floor(($(window).width() -
                                        $("#feedbackbox").outerWidth())/2));
    },
    showFeedback: function() {
      self.showModal("#feedbackbox");
    },
    showShareBox: function() {
      self.showModal("#sharebox", 500);
    },
    showModal: function(modalId, duration, notCancellable) {
      modals.showModal(modalId, duration, notCancellable);
    },
    hideModal: function(duration) {
      padutils.cancelActions('hide-feedbackbox');
      padutils.cancelActions('hide-sharebox');
      $("#sharebox-response").hide();

      modals.hideModal(duration);
    },
    hideFeedbackLaterIfNoOtherInteraction: function() {
      return padutils.getCancellableAction('hide-feedbackbox',
                                           function() {
                                             self.hideModal();
                                           });
    },
    hideShareboxLaterIfNoOtherInteraction: function() {
      return padutils.getCancellableAction('hide-sharebox',
                                           function() {
                                             self.hideModal();
                                           });
    },
    sendFeedbackEmail: function() {
      if (sendingFeedback) {
        return;
      }
      var message = $("#feedbackbox-message").val();
      var topic = $("#feedbackbox-topic").val();
      var subject = $("#feedbackbox-subject").val();
      if (!message || !topic || !subject) {
        $("#feedbackbox-response").
            text('Please choose out a topic and fill out all the fields.').
            get(0).className = 'badresponse';
        $("#feedbackbox-response").show();
        return;
      }
      var email = ($("#feedbackbox-email").hasClass('editempty') ? '' :
                   $("#feedbackbox-email").val());
      var padId = typeof(pad) != "undefined" && pad.getPadId();
      var username = typeof(pad) != "undefined" && pad.getUserName();
      setSendingFeedback(true);
      $("#feedbackbox-response").text("Sending...").get(0).className = '';
      $("#feedbackbox-response").show();
      $.ajax({
        type: 'post',
        url: '/ep/pad/feedback',
        data: {
          feedback: message,
          padId: padId,
          username: username,
          email: email,
          topic: topic,
          subject: subject
        },
        success: success,
        error: error
      });
      var hideCall = self.hideFeedbackLaterIfNoOtherInteraction();
      function success(msg) {
        setSendingFeedback(false);
        clearFeedback();
        $("#feedbackbox-response").text("Thanks for your feedback").get(0).className = 'goodresponse';
        $("#feedbackbox-response").show();
        window.setTimeout(function() {
          $("#feedbackbox-response").fadeOut('slow', function() {
            hideCall();
          });
        }, 300);
      }
      function error(e) {
        setSendingFeedback(false);
        $("#feedbackbox-response").text("Could not send feedback.  Please email us at support"+"@"+"hackpad.com instead.").get(0).className = 'badresponse';
        $("#feedbackbox-response").show();
      }
    },
    sendInvite: function() {
      if (sendingInvite) {
        return;
      }
      if (! pad.isFullyConnected()) {
        displayErrorMessage("Error: Connection to the server is down or flaky.");
        return;
      }
      var message = $("#sharebox-message").val();
      if (! message) {
        displayErrorMessage("Please enter a message body before sending.");
        return;
      }
      var emails = ($("#sharebox-to").hasClass('editempty') ? '' :
                   $("#sharebox-to").val()) || '';
      // find runs of characters that aren't obviously non-email punctuation
      var emailArray = emails.match(/[^\s,:;<>\"\'\/\(\)\[\]{}]+/g) || [];
      if (emailArray.length == 0) {
        displayErrorMessage('Please enter at least one "To:" address.');
        $("#sharebox-to").focus().select();
        return;
      }
      for(var i=0;i<emailArray.length;i++) {
        var addr = emailArray[i];
        if (! addr.match(/^[\w\.\_\+\-]+\@[\w\_\-]+\.[\w\_\-\.]+$/)) {
          displayErrorMessage('"'+padutils.escapeHtml(addr) +
                              '" does not appear to be a valid email address.');
          return;
        }
      }
      var subject = $("#sharebox-subject").val();
      if (! subject) {
        subject = self.getDefaultShareBoxSubjectForName(pad.getUserName());
        $("#sharebox-subject").val(subject); // force the default subject
      }

      var padId = pad.getPadId();
      var username = pad.getUserName();
      setSendingInvite(true);
      $("#sharebox-response").text("Sending...").get(0).className = '';
      $("#sharebox-response").show();
      $.ajax({
        type: 'post',
        url: '/ep/pad/emailinvite',
        data: {
          message: message,
          toEmails: emailArray.join(','),
          subject: subject,
          username: username,
          padId: padId
        },
        success: success,
        error: error
      });
      var hideCall = self.hideShareboxLaterIfNoOtherInteraction();
      function success(msg) {
        setSendingInvite(false);
        $("#sharebox-response").text("Email invitation sent!").get(0).className = 'goodresponse';
        $("#sharebox-response").show();
        window.setTimeout(function() {
          $("#sharebox-response").fadeOut('slow', function() {
            hideCall();
          });
        }, 1500);
      }
      function error(e) {
        setSendingFeedback(false);
        $("#sharebox-response").text("An error occurred; no email was sent.").get(0).className = 'badresponse';
        $("#sharebox-response").show();
      }
      function displayErrorMessage(msgHtml) {
        $("#sharebox-response").text(msgHtml).get(0).className = 'badresponse';
        $("#sharebox-response").show();
      }
    }
  };
  return self;
}());
