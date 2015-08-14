import ("etherpad.control.statscontrol");

function arraysAreEqual(ary1,ary2){
  return (ary1.join('') == ary2.join(''));
}

function test_ancientHistoryFunction() {
	var correctResult = [1849,5033,6264,7421,9909,10769,11215,10770,8008,6884,6137,3961,3102,31,470,686,820,1140,1647,2548,3034,3222,3417,3577,3471,2858,2567];
	var testData = [{"id":14600,"timestamp":1333627200,"value":"{\"value\":2567}","name":"active_user_ids_7days"},{"id":14641,"timestamp":1333627200,"value":"{\"value\":0}","name":"active_user_ids_7days"},{"id":14518,"timestamp":1333540800,"value":"{\"value\":0}","name":"active_user_ids_7days"},{"id":14559,"timestamp":1333540800,"value":"{\"value\":2858}","name":"active_user_ids_7days"},{"id":14436,"timestamp":1333454400,"value":"{\"value\":3471}","name":"active_user_ids_7days"},{"id":14477,"timestamp":1333454400,"value":"{\"value\":0}","name":"active_user_ids_7days"},{"id":14354,"timestamp":1333368000,"value":"{\"value\":3577}","name":"active_user_ids_7days"},{"id":14272,"timestamp":1333281600,"value":"{\"value\":3417}","name":"active_user_ids_7days"},{"id":14190,"timestamp":1333195200,"value":"{\"value\":3222}","name":"active_user_ids_7days"},{"id":14067,"timestamp":1333022400,"value":"{\"value\":3034}","name":"active_user_ids_7days"},{"id":13985,"timestamp":1332936000,"value":"{\"value\":2548}","name":"active_user_ids_7days"},{"id":13903,"timestamp":1332849600,"value":"{\"value\":1647}","name":"active_user_ids_7days"},{"id":13821,"timestamp":1332763200,"value":"{\"value\":1140}","name":"active_user_ids_7days"},{"id":13739,"timestamp":1332676800,"value":"{\"value\":820}","name":"active_user_ids_7days"},{"id":13657,"timestamp":1332590400,"value":"{\"value\":686}","name":"active_user_ids_7days"},{"id":13575,"timestamp":1332504000,"value":"{\"value\":470}","name":"active_user_ids_7days"},{"id":13493,"timestamp":1332417600,"value":"{\"value\":31}","name":"active_user_ids_7days"},{"id":13452,"timestamp":1332331200,"value":"{\"value\":3102}","name":"active_user_ids_7days"},{"id":13370,"timestamp":1332244800,"value":"{\"value\":3961}","name":"active_user_ids_7days"},{"id":13288,"timestamp":1332158400,"value":"{\"value\":6137}","name":"active_user_ids_7days"},{"id":13206,"timestamp":1332072000,"value":"{\"value\":6884}","name":"active_user_ids_7days"},{"id":13124,"timestamp":1331985600,"value":"{\"value\":8008}","name":"active_user_ids_7days"},{"id":13042,"timestamp":1331899200,"value":"{\"value\":10770}","name":"active_user_ids_7days"},{"id":12960,"timestamp":1331812800,"value":"{\"value\":11215}","name":"active_user_ids_7days"},{"id":12878,"timestamp":1331726400,"value":"{\"value\":10769}","name":"active_user_ids_7days"},{"id":12796,"timestamp":1331640000,"value":"{\"value\":9909}","name":"active_user_ids_7days"},{"id":12714,"timestamp":1331553600,"value":"{\"value\":7421}","name":"active_user_ids_7days"},{"id":12632,"timestamp":1331467200,"value":"{\"value\":6264}","name":"active_user_ids_7days"},{"id":12468,"timestamp":1331380800,"value":"{\"value\":5033}","name":"active_user_ids_7days"},{"id":12304,"timestamp":1331294400,"value":"{\"value\":1849}","name":"active_user_ids_7days"}];

	var listStats = function () {
		return testData;
	}

	var f = statscontrol.ancientHistoryFunction(60*24*60,listStats);
	var result = f("active_user_ids_7days");
	if (!arraysAreEqual(result, correctResult)) {
		throw "failed";
	}

	return true;
}


