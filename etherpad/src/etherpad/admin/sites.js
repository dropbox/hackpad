
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("sqlbase.sqlobj");
import("etherpad.helpers");

function render_main_get() {

  //  {subDomain, isPublic, accountCount, guestCount, adminCount, padCount}
  sql = "select pro_domains.id, pro_domains.subDomain,  count(*) as accountCount, count(CASE WHEN flags & 16  THEN 1 END) as guestCount from pro_accounts join pro_domains on pro_accounts.domainId = pro_domains.id group by pro_accounts.domainId;";
  var sites = sqlobj.executeRaw(sql, {});

  sql = "select domainId, max(lastEditedDate) as lastEditedDate, count(*) as padCount from pro_padmeta group by domainId";
  var sitePadInfos = sqlobj.executeRaw(sql, {});

  sql = "select domainId, jsonVal = '{\"x\":true}' as isPublic from pro_config where name = 'publicDomain'";
  var siteConfigInfos = sqlobj.executeRaw(sql, {});

  var idToSiteInfo = {};
  sites.forEach(function(site) {
    idToSiteInfo[site.id] = site;
  });

  sitePadInfos.forEach(function(sitePadInfo) {
    // copy everything from the second query into the first
    for (name in sitePadInfo){
      if (name != "domainId") {
        if (idToSiteInfo[sitePadInfo.domainId]) {
          idToSiteInfo[sitePadInfo.domainId][name] = sitePadInfo[name];
        }
      }
    }
  });

  siteConfigInfos.forEach(function(siteConfigInfo) {
    // copy everything from the second query into the first
    for (name in siteConfigInfo){
      if (name != "domainId") {
        if (idToSiteInfo[siteConfigInfo.domainId]) {
          idToSiteInfo[siteConfigInfo.domainId][name] = siteConfigInfo[name];
        }
      }
    }
  });

  sites.forEach(function(site) {
    site.lastEditedDate = site.lastEditedDate ? helpers.prettyDate(site.lastEditedDate) : "";
  });

  renderHtml("admin/dynamic.ejs", {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Sites',
    content: renderTemplateAsString('admin/sites.ejs', {
      sites: sites,
      canonicalDomain: appjet.config['etherpad.canonicalDomain'],
    })
  });

}