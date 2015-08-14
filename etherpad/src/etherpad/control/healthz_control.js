
import("varz");
import("etherpad.utils.*");
import("etherpad.log");
import("cache_utils.syncedWithCache");

function onRequest() {
  var count = 0;
  syncedWithCache('exception-counts', function (c) {
    var hourId = log.currentHourId();
    count = c[hourId]  || 0;
  });

  // if more than 20 exceptions have happened in the last hour return unhealthy
  if (count > 20) {
    render400("FAILED");
  }

  response.write("OK");
  return true;
}