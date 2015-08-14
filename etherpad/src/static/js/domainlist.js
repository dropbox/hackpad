function showSpaces(spacesInfo) {

  var overflowEl = $('.domain-item-overflow .hp-ui-button-list-ul');
  var domainListEl = $('#domain-list');
  var sitesEl = $('.domain-item-overflow');

  for (var i in spacesInfo) {
    var domain = spacesInfo[i];

    var html = $("<li>").addClass("domain-item").attr({
      "data-domainid": domain.id,
      "data-orgname": domain.orgName,
      "data-subdomain": domain.subDomain,
      "data-lastlogindate": domain.lastLoginDate
    });
    var link = $("<a/>").attr("href", domain.url).text(domain.id == 1 ? "hackpad" : domain.subDomain);
    if (location.href.indexOf(domain.url) == 0) {
      html.addClass("selected");
    }
    html.append(link);
    var existing = $(".domain-item[data-domainid=" + domain.id + "]");
    if (existing.length) {
      $(existing).replaceWith(html);
    } else {
      sitesEl.before(html);
    }
  }

  // Place the selected site first.
  domainListEl.prepend($('#domain-list .domain-item.selected').detach());

  // Place hackpad always first.
  domainListEl.prepend($('#domain-list .domain-item[data-domainid=1]').detach());

  sitesEl.hide();
}

$(function() {
  if (!$('#domain-list').length) {
    return;
  }
  showSpaces(clientVars.initialSpaces || []);
  //$.get("/ep/api/spaces-info", showSpaces);
  var sitebarHeight = $("#sitebar").height();

  $("body").removeClass("sitebar");

  $("input[name=name]").keyup(function(event) {
    // Don't perform check on enter key press
    if (event.keyCode == 13) {
      return;
    }
    if ($(this).val()) {
      $("input[name=shortname]").val($(this).val().replace(/\W/g, '').toLowerCase()).change().unplaceholder();
    }
  });

  function checkSpaceName() {
    if ($(this).val().indexOf(" ") > -1) {
      $(this).val($(this).val().replace(" ", ''));
      return false;
    }
    if ($(this).val()) {
      $("#shortname").text($(this).val()).show();
      $("#shortname").parent().find("label.error").remove();
      $("#shortname").removeClass().addClass("busy").show();
      $.get("/ep/api/subdomain-check", { subdomain: $(this).val() }, function(data) {
        if (data) {
          $("#shortname").removeClass().addClass(data.exists ? "taken" : "available").show();
        }
      });
    } else {
      // $("#shortname").hide();
    }
  }

  $("input[name=shortname]").keyup(checkSpaceName).change(checkSpaceName);
});
