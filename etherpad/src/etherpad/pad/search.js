import("execution");
import("etherpad.log");
import("netutils.urlPost");


function onStartup() {
  execution.initTaskThreadPool("async-pad-indexer", 1);
}

function scheduleAsyncSolrUpdate(body) {
  execution.scheduleTask('async-pad-indexer', 'performAsyncUpdate', 0, [body]);
}

serverhandlers.tasks.performAsyncUpdate = function(body) {
  try {
    urlPost("http://" + appjet.config.solrHostPort + "/solr/update", body,
          { "Content-Type": "text/xml; charset=utf-8",
          connectTimeout: 1*1000, readTimeout: 2*1000});
  } catch (ex) {
    log.logException(ex);
  }
  appjet.cache.padsReindexedTimeElapsed = +(new Date() - appjet.cache.padsReindexedStart);
}

