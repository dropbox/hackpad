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

// requires: easysync2.Changeset
// requires: top
// requires: undefined

// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.linestylefilter
if (typeof(server_side_import)!='undefined') {
  server_side_import("etherpad.collab.ace.easysync2.Changeset");
}


var linestylefilter = {};

linestylefilter.ATTRIB_CLASSES = {
  'bold':'tag:b',
  'italic':'tag:i',
  'underline':'tag:u',
  'strikethrough':'tag:s',
  'superscript':'tag:sup',
  'subscript':'tag:sub',
  'code':'line:code'
};

/*
    Given "p.34" produces  "author-p-34"
*/
linestylefilter.getAuthorClassName = function(author) {
  return "author-"+author.replace(/[^a-y0-9]/g, function(c) {
    if (c == ".") return "-";
    return 'z'+c.charCodeAt(0)+'z';
  });
};

/*
    Given "[fa-author,author,gutter-author]-p-34" produces p.34
*/
linestylefilter.className2Author = function(className) {
  var encoded = className.replace(/^fa-author-|^author-|^gutter-author-/, "");
  if (encoded != className) {
    return encoded.replace(/[a-y0-9]+|-|z.+?z/g, function(cc) {
      if (cc == '-') return '.';
      else if (cc.charAt(0) == 'z') {
        return String.fromCharCode(Number(cc.slice(1,-1)));
      }
      else {
        return cc;
      }
    });
  }
  return null;
}

var RELATIVE_URL_RE = new RegExp("^(/|https?://[\w\.]*hackpad.com).*");

// lineLength is without newline; aline includes newline,
// but may be falsy if lineLength == 0
linestylefilter.getLineStyleFilter = function(lineLength, aline,
                                              textAndClassFunc, apool) {

  if (lineLength == 0) {
    textAndClassFunc('', 'line:longKeep line:gutter-noauthor');
    return textAndClassFunc;
  }

  var nextAfterAuthorColors = textAndClassFunc;

  var authorColorFunc = (function() {
    var lineEnd = lineLength;
    var curIndex = 0;
    var extraClasses;
    var leftInAuthor;

    var lineAuthorLongest = null;
    var lineAuthorLongestLength = 0;
    var allLongKeep = null;
    var listType = null;
    var lastCol = false;
    var aCol = false;

    function attribsToClasses(attribs, spanLen) {
      var classes = [];

      Changeset.eachAttribNumber(attribs, function(n) {
        var key = apool.getAttribKey(n);
        if (key) {
          var value = apool.getAttribValue(n);
          if (value) {
            if (key == 'author') {
              hasAuthor = true;
              var isIndent = false;
              Changeset.eachAttribNumber(attribs, function(n) {
                var key = apool.getAttribKey(n);
                if (key && key == 'list') {
                  isIndent = true;
                }
              });

              if (spanLen > lineAuthorLongestLength) {
                lineAuthorLongest = value;
                lineAuthorLongestLength = spanLen;
              }

              classes.push(linestylefilter.getAuthorClassName(value));

            } else if (key == 'link') {
                classes.push('attrlink', 'url:'+encodeURIComponent(value));
                if (value.match(RELATIVE_URL_RE)) {
                  classes.push("internal");
                }
            } else if (key == 'autolink') {
              classes.push('tag:autolink');
            } else if (key == 'img') {
              classes.push('attrimg img:'+encodeURIComponent(value));
            } else if (key == 'attachmentPlaceholder') {
              classes.push('placeholder-' + encodeURIComponent(value));
            } else if (key == 'embed') {
              classes.push('attrembed embed:'+encodeURIComponent(value));
            } else if (key == 'table') {
              classes.push('attrtable table:'+encodeURIComponent(value));
            } else if (key == 'tex') {
              classes.push('attrtex tex:'+encodeURIComponent(value));
            } else if (key == 'last-col') {
              classes.push('last-col');
              lastCol = true;
            } else if (key == 'colname') {
              classes.push('colname');
              aCol = true;
            } else if (key == 'diff' && value == "plus") {
              classes.push('added');
              allLongKeep = false;
            } else if (key == 'diff' && value == "minus") {
              classes.push('removed');
              allLongKeep = false;
            } else if (key == 'longkeep') {
              classes.push('longkeep');
              allLongKeep = (allLongKeep != false);
            } else if (key == 'list' && /(\D+)(\d+)/.test(value)) {
              classes.push('list:'+value);
              var listTypes = /(\D+)(\d+)/.exec(value);
              listType = listTypes[1];
            } else if (key == 'start') {
              classes.push('start:' + value);
            } else if (key == 'highlight') {
              classes.push('highlight');
            } else if (key == 'lang') {
              classes.push('lang:' + value);
            } else if (linestylefilter.ATTRIB_CLASSES[key]) {
              classes.push(linestylefilter.ATTRIB_CLASSES[key]);
            }
          }
        }
      });
      return classes.join(" ");
    }

    var attributionIter = Changeset.opIterator(aline);
    var nextOp, nextOpClasses;
    function goNextOp() {
      nextOp = attributionIter.next();
      nextOpClasses = (nextOp.opcode && attribsToClasses(nextOp.attribs, nextOp.chars));
    }
    goNextOp();
    function nextClasses() {
      if (curIndex < lineEnd) {
        extraClasses = nextOpClasses;
        leftInAuthor = nextOp.chars;
        goNextOp();
        while (nextOp.opcode && nextOpClasses == extraClasses) {
          leftInAuthor += nextOp.chars;
          goNextOp();
        }
      }
    }
    nextClasses();

    return function(txt, cls) {

      var allAdd = true;
      while (txt.length > 0) {
        if (leftInAuthor <= 0) {
          // prevent infinite loop if something funny's going on
          return nextAfterAuthorColors(txt, cls);
        }

        // grab just the text for this author/span
        var spanSize = txt.length;
        if (spanSize > leftInAuthor) {
          spanSize = leftInAuthor;
        }
        var curTxt = txt.substring(0, spanSize);
        txt = txt.substring(spanSize);

        // add this span
        var allClasses = (cls&&cls+" ")+extraClasses;
        nextAfterAuthorColors(curTxt, allClasses);
        if (allClasses.indexOf("added") == -1) {
          allAdd = false;
        }
        // advance the pointers
        curIndex += spanSize;
        leftInAuthor -= spanSize;
        if (leftInAuthor == 0) {
          nextClasses();
        }
      }

      // now that we've processed the whole line, set whole line class
      var wholeLineClasses = "";

      if (!aCol) {
        wholeLineClasses += lineAuthorLongest ?
          'line:gutter-'+linestylefilter.getAuthorClassName(lineAuthorLongest) :
          'line:gutter-noauthor';
      }
      wholeLineClasses += (allLongKeep ? ' line:longKeep' : '');
      wholeLineClasses += (lastCol ? ' line:lastCol' : '');
      wholeLineClasses += (aCol ? ' line:aCol' : '');
      wholeLineClasses += (listType ? ' line:line-list-type-' + listType : '');
      wholeLineClasses += ' line:emptyGutter';
      if (allAdd) {
        wholeLineClasses += ' line:allAdd';
      }
      nextAfterAuthorColors('', wholeLineClasses);

    };
  })();
  return authorColorFunc;
};

linestylefilter.getAtSignSplitterFilter = function(lineText,
                                                   textAndClassFunc) {
  var at = /@/g;
  at.lastIndex = 0;
  var splitPoints = null;
  var execResult;
  while ((execResult = at.exec(lineText))) {
    if (! splitPoints) {
      splitPoints = [];
    }
    splitPoints.push(execResult.index);
  }

  if (! splitPoints) return textAndClassFunc;

  return linestylefilter.textAndClassFuncSplitter(textAndClassFunc,
                                                  splitPoints);
};

linestylefilter.getRegexpFilter = function (regExp, tag, tagOnly) {
  return function (lineText, textAndClassFunc) {
    regExp.lastIndex = 0;
    var regExpMatchs = null;
    var splitPoints = null;
    var execResult;
    while ((execResult = regExp.exec(lineText))) {
      if (! regExpMatchs) {
        regExpMatchs = [];
        splitPoints = [];
      }
      var startIndex = execResult.index;
      var regExpMatch = execResult[0];
      regExpMatchs.push([startIndex, regExpMatch]);
      splitPoints.push(startIndex, startIndex + regExpMatch.length);
    }

    if (! regExpMatchs) return textAndClassFunc;

    function regExpMatchForIndex(idx) {
      for(var k=0; k<regExpMatchs.length; k++) {
        var u = regExpMatchs[k];
        if (idx >= u[0] && idx < u[0]+u[1].length) {
          return u[1];
        }
      }
      return false;
    }

    var handleRegExpMatchsAfterSplit = (function() {
      var curIndex = 0;
      return function(txt, cls) {
        var txtlen = txt.length;
        var newCls = cls;
        var regExpMatch = regExpMatchForIndex(curIndex);
        if (regExpMatch) {
          newCls += " "+tag+ (tagOnly ? '' : ":"+ encodeURIComponent(regExpMatch));
        }
        textAndClassFunc(txt, newCls);
        curIndex += txtlen;
      };
    })();

    return linestylefilter.textAndClassFuncSplitter(handleRegExpMatchsAfterSplit,
                                                    splitPoints);
  };
};

// XXX: See: http://stackoverflow.com/questions/19135354/assuming-unicode-and-case-insensitivity-should-the-pattern-match-ffiss
// There are problems with the ß character when combined with doing
// case-insensitive matching - it boils down to: the uppercase version of ß is
// 'SS' which is 2 characters and changes the string length.  Fun times!
// "As maaartinus pointed out in his comment, Java provides (at least in theory)
// Unicode support for case-insensitive reg-exp matching. The wording in the
// Java API documentation is that matching is done "in a manner consistent with
// the Unicode Standard". The problem is however, that the Unicode standard
// defines different levels of support for case conversion and case-insensitive
// matching and the API documentation does not specify which level is supported
// by the Java language. Although not documented, at least in Oracle's Java VM,
// the reg-exp implementation is limited to so called simple case-insensitive
// matching. The limiting factors relevant to your example data is that the
// matching algorithm only works as expected if the case folding (conversion)
// results in the same number of characters and that sets (e.g. ".") are limited
// to match exactly one character in the input string. The first limitation even
// leads to "ß" not matching "SS", as you also may have had expected."
linestylefilter.REGEX_WORDCHAR_WITHOUT_00DF = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00DE\u00E0-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;

linestylefilter.REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
linestylefilter.REGEX_URLCHAR = new RegExp('('+/[-:@a-zA-Z0-9_.,~%+\/\\?=&#;()!'$]/.source+'|'+linestylefilter.REGEX_WORDCHAR_WITHOUT_00DF.source+')');
linestylefilter.REGEX_URL = new RegExp(/(?:(?:https?|sftp|ftps?|ssh|ircs?|file|gopher|telnet|nntp|worldwind|chrome|chrome-extension|svn|git|mms|smb|afp|nfs|(x-)?man|gopher|txmt):\/\/|mailto:|xmpp:|sips?:|tel:|sms:|news:|bitcoin:|magnet:|urn:|geo:)/.source+linestylefilter.REGEX_URLCHAR.source+'*(?![:.,;\\)\'])'+linestylefilter.REGEX_URLCHAR.source, 'gi');
linestylefilter.getURLFilter = linestylefilter.getRegexpFilter(
  linestylefilter.REGEX_URL, 'url');
linestylefilter.getCodeSpanFilter = linestylefilter.getRegexpFilter(
  new RegExp(/`[^`]+`/g), 'code', true);
linestylefilter.EMOJI_LIST = ['+1','-1','100','1234','8ball','a','ab','abc','abcd','accept','aerial_tramway','airplane','alarm_clock','alien','ambulance','anchor','angel','anger','angry','anguished','ant','apple','aquarius','aries','arrow_backward','arrow_double_down','arrow_double_up','arrow_down','arrow_down_small','arrow_forward','arrow_heading_down','arrow_heading_up','arrow_left','arrow_lower_left','arrow_lower_right','arrow_right','arrow_right_hook','arrow_up','arrow_up_down','arrow_up_small','arrow_upper_left','arrow_upper_right','arrows_clockwise','arrows_counterclockwise','art','articulated_lorry','astonished','athletic_shoe','atm','b','baby','baby_bottle','baby_chick','baby_symbol','back','baggage_claim','balloon','ballot_box_with_check','bamboo','banana','bangbang','bank','bar_chart','barber','baseball','basketball','bath','bathtub','battery','bear','bee','beer','beers','beetle','beginner','bell','bento','bicyclist','bike','bikini','bird','birthday','black_circle','black_joker','black_large_square','black_medium_small_square','black_medium_square','black_nib','black_small_square','black_square_button','blossom','blowfish','blue_book','blue_car','blue_heart','blush','boar','boat','bomb','book','bookmark','bookmark_tabs','books','boom','boot','bouquet','bow','bowling','boy','bread','bride_with_veil','bridge_at_night','briefcase','broken_heart','bug','bulb','bullettrain_front','bullettrain_side','bus','busstop','bust_in_silhouette','busts_in_silhouette','cactus','cake','calendar','calling','camel','camera','cancer','candy','capital_abcd','capricorn','car','card_index','carousel_horse','cat','cat2','cd','chart','chart_with_downwards_trend','chart_with_upwards_trend','checkered_flag','cherries','cherry_blossom','chestnut','chicken','children_crossing','chocolate_bar','christmas_tree','church','cinema','circus_tent','city_sunrise','city_sunset','cl','clap','clapper','clipboard','clock1','clock10','clock1030','clock11','clock1130','clock12','clock1230','clock130','clock2','clock230','clock3','clock330','clock4','clock430','clock5','clock530','clock6','clock630','clock7','clock730','clock8','clock830','clock9','clock930','closed_book','closed_lock_with_key','closed_umbrella','cloud','clubs','cn','cocktail','coffee','cold_sweat','collision','computer','confetti_ball','confounded','confused','congratulations','construction','construction_worker','convenience_store','cookie','cool','cop','copyright','corn','couple','couple_with_heart','couplekiss','cow','cow2','credit_card','crescent_moon','crocodile','crossed_flags','crown','cry','crying_cat_face','crystal_ball','cupid','curly_loop','currency_exchange','curry','custard','customs','cyclone','dancer','dancers','dango','dart','dash','date','de','deciduous_tree','department_store','diamond_shape_with_a_dot_inside','diamonds','disappointed','disappointed_relieved','dizzy','dizzy_face','do_not_litter','dog','dog2','dollar','dolls','dolphin','door','doughnut','dragon','dragon_face','dress','dromedary_camel','droplet','dvd','e-mail','ear','ear_of_rice','earth_africa','earth_americas','earth_asia','egg','eggplant','eight','eight_pointed_black_star','eight_spoked_asterisk','electric_plug','elephant','email','end','envelope','envelope_with_arrow','es','euro','european_castle','european_post_office','evergreen_tree','exclamation','expressionless','eyeglasses','eyes','facepunch','factory','fallen_leaf','family','fast_forward','fax','fearful','feet','ferris_wheel','file_folder','fire','fire_engine','fireworks','first_quarter_moon','first_quarter_moon_with_face','fish','fish_cake','fishing_pole_and_fish','fist','five','flags','flashlight','flipper','floppy_disk','flower_playing_cards','flushed','foggy','football','footprints','fork_and_knife','fountain','four','four_leaf_clover','fr','free','fried_shrimp','fries','frog','frowning','fuelpump','full_moon','full_moon_with_face','game_die','gb','gem','gemini','ghost','gift','gift_heart','girl','globe_with_meridians','goat','golf','grapes','green_apple','green_book','green_heart','grey_exclamation','grey_question','grimacing','grin','grinning','guardsman','guitar','gun','haircut','hamburger','hammer','hamster','hand','handbag','hankey','hash','hatched_chick','hatching_chick','headphones','hear_no_evil','heart','heart_decoration','heart_eyes','heart_eyes_cat','heartbeat','heartpulse','hearts','heavy_check_mark','heavy_division_sign','heavy_dollar_sign','heavy_exclamation_mark','heavy_minus_sign','heavy_multiplication_x','heavy_plus_sign','helicopter','herb','hibiscus','high_brightness','high_heel','hocho','honey_pot','honeybee','horse','horse_racing','hospital','hotel','hotsprings','hourglass','hourglass_flowing_sand','house','house_with_garden','hushed','ice_cream','icecream','id','ideograph_advantage','imp','inbox_tray','incoming_envelope','information_desk_person','information_source','innocent','interrobang','iphone','it','izakaya_lantern','jack_o_lantern','japan','japanese_castle','japanese_goblin','japanese_ogre','jeans','joy','joy_cat','jp','key','keycap_ten','kimono','kiss','kissing','kissing_cat','kissing_closed_eyes','kissing_heart','kissing_smiling_eyes','knife','koala','koko','kr','lantern','large_blue_circle','large_blue_diamond','large_orange_diamond','last_quarter_moon','last_quarter_moon_with_face','laughing','leaves','ledger','left_luggage','left_right_arrow','leftwards_arrow_with_hook','lemon','leo','leopard','libra','light_rail','link','lips','lipstick','lock','lock_with_ink_pen','lollipop','loop','loud_sound','loudspeaker','love_hotel','love_letter','low_brightness','m','mag','mag_right','mahjong','mailbox','mailbox_closed','mailbox_with_mail','mailbox_with_no_mail','man','man_with_gua_pi_mao','man_with_turban','mans_shoe','maple_leaf','mask','massage','meat_on_bone','mega','melon','memo','mens','metro','microphone','microscope','milky_way','minibus','minidisc','mobile_phone_off','money_with_wings','moneybag','monkey','monkey_face','monorail','moon','mortar_board','mount_fuji','mountain_bicyclist','mountain_cableway','mountain_railway','mouse','mouse2','movie_camera','moyai','muscle','mushroom','musical_keyboard','musical_note','musical_score','mute','nail_care','name_badge','necktie','negative_squared_cross_mark','neutral_face','new','new_moon','new_moon_with_face','newspaper','ng','night_with_stars','nine','no_bell','no_bicycles','no_entry','no_entry_sign','no_good','no_mobile_phones','no_mouth','no_pedestrians','no_smoking','non-potable_water','nose','notebook','notebook_with_decorative_cover','notes','nut_and_bolt','o','o2','ocean','octopus','oden','office','ok','ok_hand','ok_woman','older_man','older_woman','on','oncoming_automobile','oncoming_bus','oncoming_police_car','oncoming_taxi','one','open_book','open_file_folder','open_hands','open_mouth','ophiuchus','orange_book','outbox_tray','ox','package','page_facing_up','page_with_curl','pager','palm_tree','panda_face','paperclip','parking','part_alternation_mark','partly_sunny','passport_control','paw_prints','peach','pear','pencil','pencil2','penguin','pensive','performing_arts','persevere','person_frowning','person_with_blond_hair','person_with_pouting_face','phone','pig','pig2','pig_nose','pill','pineapple','pisces','pizza','point_down','point_left','point_right','point_up','point_up_2','police_car','poodle','poop','post_office','postal_horn','postbox','potable_water','pouch','poultry_leg','pound','pouting_cat','pray','princess','punch','purple_heart','purse','pushpin','put_litter_in_its_place','question','rabbit','rabbit2','racehorse','radio','radio_button','railway_car','rainbow','raised_hand','raised_hands','raising_hand','ram','ramen','rat','recycle','red_car','red_circle','registered','relaxed','relieved','repeat','repeat_one','restroom','revolving_hearts','rewind','ribbon','rice','rice_ball','rice_cracker','rice_scene','ring','rocket','roller_coaster','rooster','rose','rotating_light','round_pushpin','rowboat','ru','rugby_football','runner','running','running_shirt_with_sash','sa','sagittarius','sailboat','sake','sandal','santa','satellite','satisfied','saxophone','school','school_satchel','scissors','scorpius','scream','scream_cat','scroll','seat','secret','see_no_evil','seedling','seven','shaved_ice','sheep','shell','ship','shirt','shit','shoe','shower','signal_strength','six','six_pointed_star','ski','skull','sleeping','sleepy','slot_machine','small_blue_diamond','small_orange_diamond','small_red_triangle','small_red_triangle_down','smile','smile_cat','smiley','smiley_cat','smiling_imp','smirk','smirk_cat','smoking','snail','snake','snowboarder','snowflake','snowman','sob','soccer','soon','sos','sound','space_invader','spades','spaghetti','sparkle','sparkler','sparkles','sparkling_heart','speak_no_evil','speaker','speech_balloon','speedboat','star','star2','stars','station','statue_of_liberty','steam_locomotive','stew','straight_ruler','strawberry','stuck_out_tongue','stuck_out_tongue_closed_eyes','stuck_out_tongue_winking_eye','sun_with_face','sunflower','sunglasses','sunny','sunrise','sunrise_over_mountains','surfer','sushi','suspension_railway','sweat','sweat_drops','sweat_smile','sweet_potato','swimmer','symbols','syringe','tada','tanabata_tree','tangerine','taurus','taxi','tea','telephone','telephone_receiver','telescope','tennis','tent','thought_balloon','three','thumbsdown','thumbsup','ticket','tiger','tiger2','tired_face','tm','toilet','tokyo_tower','tomato','tongue','top','tophat','tractor','traffic_light','train','train2','tram','triangular_flag_on_post','triangular_ruler','trident','triumph','trolleybus','trophy','tropical_drink','tropical_fish','truck','trumpet','tshirt','tulip','turtle','tv','twisted_rightwards_arrows','two','two_hearts','two_men_holding_hands','two_women_holding_hands','u5272','u5408','u55b6','u6307','u6708','u6709','u6e80','u7121','u7533','u7981','u7a7a','uk','umbrella','unamused','underage','unlock','up','us','v','vertical_traffic_light','vhs','vibration_mode','video_camera','video_game','violin','virgo','volcano','vs','walking','waning_crescent_moon','waning_gibbous_moon','warning','watch','water_buffalo','watermelon','wave','wavy_dash','waxing_crescent_moon','waxing_gibbous_moon','wc','weary','wedding','whale','whale2','wheelchair','white_check_mark','white_circle','white_flower','white_large_square','white_medium_small_square','white_medium_square','white_small_square','white_square_button','wind_chime','wine_glass','wink','wolf','woman','womans_clothes','womans_hat','womens','worried','wrench','x','yellow_heart','yen','yum','zap','zero','zzz'];
linestylefilter.REGEX_EMOJI = new RegExp(':(\\' + linestylefilter.EMOJI_LIST.join('|') + '):', 'gi');
linestylefilter.getEmojiSpanFilter = linestylefilter.getRegexpFilter(
  linestylefilter.REGEX_EMOJI, 'emoji');
linestylefilter.REGEX_EMOJI_CODE = new RegExp(':emoji_[^:]+:', 'gi');
linestylefilter.getEmojiCodeSpanFilter = linestylefilter.getRegexpFilter(
  linestylefilter.REGEX_EMOJI_CODE, 'emoji-code');
linestylefilter.REGEX_TEX = /\$\$.+\$\$/g;
linestylefilter.getTexFilter = linestylefilter.getRegexpFilter(
  linestylefilter.REGEX_TEX, 'tex');


// Capture the preceding character to exclude hashtags on left context
linestylefilter.REGEX_HASHTAG = RegExp('(^|.)(#(?:_|'+linestylefilter.REGEX_WORDCHAR.source+')+)','g');

linestylefilter.getHashtagFilter = function (lineText, textAndClassFunc) {
  var regExp = linestylefilter.REGEX_HASHTAG;
  var tag = "hashtag";
  regExp.lastIndex = 0;
  var regExpMatchs = null;
  var splitPoints = null;

  var invalidHashtagRegex = RegExp('^#\\d+$');

  lineText.replace(regExp, function (match, prev, hashtag, offset, str) {
    if (invalidHashtagRegex.test(hashtag) ||
      linestylefilter.REGEX_WORDCHAR.test(prev) ||
      /^&$/.test(prev)) {
      return match;
    }
    if (! regExpMatchs) {
      regExpMatchs = [];
      splitPoints = [];
    }
    var startIndex = offset+prev.length;
    regExpMatchs.push([startIndex, hashtag]);
    splitPoints.push(startIndex, startIndex + hashtag.length);
    return match;
  });

  if (! regExpMatchs) return textAndClassFunc;

  function regExpMatchForIndex(idx) {
    for(var k=0; k<regExpMatchs.length; k++) {
      var u = regExpMatchs[k];
      if (idx >= u[0] && idx < u[0]+u[1].length) {
        return u[1];
      }
    }
    return false;
  }

  var handleRegExpMatchsAfterSplit = (function() {
    var curIndex = 0;
    return function(txt, cls) {
      var txtlen = txt.length;
      var newCls = cls;
      var regExpMatch = regExpMatchForIndex(curIndex);
      if (regExpMatch) {
        newCls += " " + tag + ":" + encodeURIComponent(regExpMatch);
      }
      textAndClassFunc(txt, newCls);
      curIndex += txtlen;
    };
  })();

  return linestylefilter.textAndClassFuncSplitter(handleRegExpMatchsAfterSplit,
                                                  splitPoints);
};

linestylefilter.getTokenizerFilter = function (lineText, textAndClassFunc, lexerState, tokenizer) {
  var tokens = tokenizer.getLineTokens(lineText, lexerState || "start");
  var state = tokens.state;
  tokens = tokens.tokens;
  //console.log(tokens);

  var idx = 0;
  var splitPoints = [];
  forEach(tokens, function(token) {
    if (token.type != "text") {
      splitPoints.push(idx, idx + token.value.length);
    }
    idx += token.value.length;
  });

  //console.log(splitPoints);

  var applyTokens = (function() {
    textAndClassFunc('', 'line:lexer_'+state);

    return function(txt, cls) {
      var found = false;
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        if (token.value == txt && token.type != "text") {
          var newCls = cls + ' ' + token.type.replace(/\./g, ' ');
          textAndClassFunc(txt, newCls);
          found = true;
          break;
        }
      }
      if (!found) {
        textAndClassFunc(txt, cls);
      }
    };
  })();

  return linestylefilter.textAndClassFuncSplitter(applyTokens, splitPoints);
}


linestylefilter.textAndClassFuncSplitter = function(func, splitPointsOpt) {
  var nextPointIndex = 0;
  var idx = 0;

  // don't split at 0
  while (splitPointsOpt &&
         nextPointIndex < splitPointsOpt.length &&
         splitPointsOpt[nextPointIndex] == 0) {
    nextPointIndex++;
  }

  function spanHandler(txt, cls) {
    if ((! splitPointsOpt) || nextPointIndex >= splitPointsOpt.length) {
      func(txt, cls);
      idx += txt.length;
    }
    else {
      var splitPoints = splitPointsOpt;
      var pointLocInSpan = splitPoints[nextPointIndex] - idx;
      var txtlen = txt.length;
      if (pointLocInSpan >= txtlen) {
        func(txt, cls);
        idx += txt.length;
        if (pointLocInSpan == txtlen) {
          nextPointIndex++;
        }
      }
      else {
        if (pointLocInSpan > 0) {
          func(txt.substring(0, pointLocInSpan), cls);
          idx += pointLocInSpan;
        }
        nextPointIndex++;
        // recurse
        spanHandler(txt.substring(pointLocInSpan), cls);
      }
    }
  }
  return spanHandler;
};

linestylefilter.getFilterStack = function(lineText, textAndClassFunc, browser, filterDecorativeSnippets, lexerState, tokenizer) {
  var func = linestylefilter.getURLFilter(lineText, textAndClassFunc);
  if (!(tokenizer && lexerState)) {
    // no hashtags in code snips
    func = linestylefilter.getHashtagFilter(lineText, func);
  }
  func = linestylefilter.getCodeSpanFilter(lineText, func);
  if (filterDecorativeSnippets) {
    func = linestylefilter.getTexFilter(lineText, func);
  }

  func = linestylefilter.getEmojiSpanFilter(lineText, func);
  func = linestylefilter.getEmojiCodeSpanFilter(lineText, func);

  if (tokenizer && lexerState) {
    func = linestylefilter.getTokenizerFilter(lineText, func, lexerState, tokenizer);
  }

  if (browser !== undefined && browser.msie) {
    // IE7+ will take an e-mail address like <foo@bar.com> and linkify it to foo@bar.com.
    // We then normalize it back to text with no angle brackets.  It's weird.  So always
    // break spans at an "at" sign.
    func = linestylefilter.getAtSignSplitterFilter(
      lineText, func);
  }
  return func;
};

// domLineObj is like that returned by domline.createDomLine
linestylefilter.populateDomLine = function(textLine, aline, apool,
                                           domLineObj, classToStyle) {
  // remove final newline from text if any
  var text = textLine;
  if (text.slice(-1) == '\n') {
    text = text.substring(0, text.length-1);
  }

  function textAndClassFunc(tokenText, tokenClass) {
      domLineObj.appendSpan(tokenText, tokenClass, classToStyle);
  }

  var func = linestylefilter.getFilterStack(text, textAndClassFunc);
  func = linestylefilter.getLineStyleFilter(text.length, aline,
                                            func, apool);
  func(text, '');
};
