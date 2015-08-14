/**
 * Wiky.js - Javascript library to converts Wiki MarkUp language to HTML.
 * You can do whatever with it. Please give me some credits (Apache License)
 * - Tanin Na Nakorn
 */

var wiky = {}
function trim(str) {
  return String(str).replace(/^\s+|\s+$/g, '');
}

wiky.process = function(wikitext) {
  var html = "";
  var lines = wikitext.split(/\n/);
  var consecutiveNewlines = 0;
  for (i=0;i<lines.length;i++)
  {
    line = lines[i];

    if (line.match(/^\s*(----)?\s*$/) || line.match(/\s*<br\/?>\s*/)) {
      consecutiveNewlines++;
      if (consecutiveNewlines>1) {
        continue;
      }
    } else {
      consecutiveNewlines = 0;
    }

    // bold
    if (line.match(/^\s*=/)!=null && line.match(/=\s*$/)!=null) {
      var startMatch = line.match(/^\s*(=+)/);
      var endMatch = line.match(/(=+)\s*$/);
      var startLevel = endMatch[1].length;
      var endLevel = endMatch[1].length;
      var content = line.substring(startMatch[0].length,
          line.length-endMatch[0].length);
      html += "<b>"+trim(content)+"</b>";
      html += "<br/>\n";

    // source code
    } else if (line.match(/^\s*<source /)!=null) {
      // find start line and ending line
      start = i;
      while (i < lines.length && lines[i].match(/^<\/source>\s*/)==null) i++;
      html += wiky.process_code(lines, start, i);
      html += "<br/>\n";

    // more source code
    } else if (line.match(/^\s*<syntaxhighlight/)!=null) {
      // find start line and ending line
      start = i;
      while (i < lines.length && lines[i].match(/^\s*<\/syntaxhighlight>\s*/)==null) i++;
      html += wiky.process_code(lines,start,i);
      html += "<br/>\n";

    // indentation
    } else if (line.match(/^:+/)!=null) {
      // find start line and ending line
      start = i;
      while (i < lines.length && lines[i].match(/^\:+/)!=null) i++;
      i--;

      html += wiky.process_indent(lines,start,i);

    // bullet points
    } else if (line.match(/^(\*+)/)!=null) {
      // find start line and ending line
      start = i;
      while (i < lines.length && lines[i].match(/^(\*+|\#\#+)\:?/)!=null) i++;
      i--;

      html += wiky.process_bullet_point(lines,start,i);

    // more bullet points (numbered, but we don't handle numbering)
    } else if (line.match(/^(\#+)/)!=null) {
      // find start line and ending line
      start = i;
      while (i < lines.length && lines[i].match(/^(\#+|\*\*+)\:?/)!=null) i++;
      i--;
      html += wiky.process_bullet_point(lines,start,i);

    // we don't respect notoc
    } else if (line.match(/^\s*__NOTOC__\s*$/)!=null) {
      continue;

    // tables
    } else if (line.match(/^\s*\{\|.*"/)!=null) {
      // find start line and ending line
      start = i;
      while (i < lines.length && lines[i].match(/^\|\}/)==null) i++;
      html += wiky.process_table(lines,start,i);

    // plain old regular text
    } else {
      html += wiky.process_normal(line);
      html += "<br/>\n";
    }

  }

  // maybe collapse 2+ linebreaks into 2
  return html;//.replace(/(\s*<br\/>\s*)+(\s*<br\/>)/g,"<br/><br/>");
}

/*
{| class=&quot;wikitable&quot;
|-
! thing
! over thing
|-
| stuff
| other stuff
|}
*/
wiky.process_table = function(lines,start,end) {


  function _insertCell(content, col) {
    content = wiky.process_normal(content);
    html.push("<td>" + content +"</td>");
  }

  var start = start+1; // skip first row

  var html = [];
  var columns = [];
  var rowId = 0;
  var colId = 0;
  var maxColId = 0;
  var cellContent = null;
  var virtualHeader = false;
  var realHeader = false;

  html.push("<table>");

  for(var i=start;i<=end;i++) {
    // we fell off the end of the file!
    if (!lines[i]) {
      if (cellContent) {
        _insertCell(cellContent, colId-1);
        html.push("</tr>");
        break;
      }
      break;
    }

    // explicit column headers
    var colMatch = lines[i].match(/^\!\s*(.*)/);
    if (colMatch) {
      var colParts = colMatch[1].split("|");
      var colName = trim(colParts[colParts.length-1]);
      columns.push(colName);
      //response.write("Found column name: " + colName);
      continue;
    }

    // start of next row or end of table
    var nextRowMatch = lines[i].match(/^\|-/);
    var endTableMatch = lines[i].match(/^\s*\|\}/);
    if (nextRowMatch || endTableMatch) {
      maxColId = colId;
      // are we at the end of the existing row?
      if ((!columns.length && rowId > 0) || (columns.length && rowId > 1)) {
        _insertCell(cellContent, colId-1, true);
        cellContent = null;
      } else if (virtualHeader && cellContent) {
        var colName = trim(cellContent.replace(/'''/g,""));
        _insertCell(colName/*cellContent*/, colId-1, true);
        // treat the first row as column names
        /*var colName = trim(cellContent.replace(/'''/g,""));
        //columns.push(colName);*/
        cellContent = null;
        //response.write("Found assumed column name: " + colName);
      }
      html.push("</tr>");

      colId = 0;
      rowId++;
      continue;
    }

    // next cell
    var cellMatch = lines[i].match(/^\|\s*(.*)/);
    if (cellMatch) {
      if (colId == 0) {
        html.push("<tr>");
      }
      if (cellContent) {

        if (rowId == 1 && cellContent.match(/\s*'''.*'''\s*/)) {
          virtualHeader = true;
        }
        if (rowId == 1 && virtualHeader) {
          // treat the first row as column names
          var colName = trim(cellContent.replace(/'''/g,""));
          _insertCell(colName/*cellContent*/, colId-1, true);

          /*var colName = trim(cellContent.replace(/'''/g,""));
          columns.push(colName);*/
          cellContent = null;
          //response.write("Found assumed column name: " + colName);
        } else {
          _insertCell(cellContent, colId-1, false);
        }
      }
      cellContent = cellMatch[1];
      colId++;
    } else {
      cellContent += "\n" + lines[i];
    }
  }


  html.push("</table>");
  return html.join("");
}

wiky.process_indent = function(lines,start,end) {
  var i = start;
  var html = "";

  for(var i=start;i<=end;i++) {

    var this_count = lines[i].match(/^(\:+)/)[1].length;

    html += "<ul class='list-indent" + this_count + "'>";
    html += "<li>";

    html += wiky.process_normal(lines[i].substring(this_count));

    var nested_end = i;
    for (var j=i+1;j<=end;j++) {
      var nested_count = lines[j].match(/^(\:+)/)[1].length;
      if (nested_count <= this_count) break;
      else nested_end = j;
    }

    if (nested_end > i) {
      html += wiky.process_indent(lines,i+1,nested_end);
      i = nested_end;
    }

    html += "</li></ul>";
  }

  //  html += "</ul>";
  return html;
}

wiky.process_bullet_point = function(lines,start,end) {
  var i = start;

  var html = (lines[start].charAt(0)=='*')?"<ul>":"<ul>";

  for(var i=start;i<=end;i++) {

    html += "<li>";

    var this_count = lines[i].match(/^([\*|\#]+)\s*/)[1].length;

    html += wiky.process_normal(lines[i].substring(this_count));

    // continue previous with #:
    {
      var nested_end = i;
      for (var j = i + 1; j <= end; j++) {
        var nested_count = lines[j].match(/^([\*|\#]+)\:?/)[1].length;

        if (nested_count < this_count)
          break;
        else {
          if (lines[j].charAt(nested_count) == ':') {
            html += "<br/>" + wiky.process_normal(lines[j].substring(nested_count + 2));
            nested_end = j;
          } else {
            break;
          }
        }

      }

      i = nested_end;
    }

    // nested bullet point
    {
      var nested_end = i;
      for (var j = i + 1; j <= end; j++) {
        var nested_count = lines[j].match(/^([\*|\#]+)\:?/)[1].length;
        if (nested_count <= this_count)
          break;
        else
          nested_end = j;
      }

      if (nested_end > i) {
        html += wiky.process_bullet_point(lines, i + 1, nested_end);
        i = nested_end;
      }
    }

    // continue previous with #:
    {
      var nested_end = i;
      for (var j = i + 1; j <= end; j++) {
        var nested_count = lines[j].match(/^([\*|\#]+)\:?/)[1].length;

        if (nested_count < this_count)
          break;
        else {
          if (lines[j].charAt(nested_count) == ':') {
            html += wiky.process_normal(lines[j].substring(nested_count + 2));
            nested_end = j;
          } else {
            break;
          }
        }

      }
      i = nested_end;
    }


    html += "</li>";
  }

  html += (lines[start].charAt(0)=='*')?"</ul>":"</ul>";
  return html;
}

wiky.process_url = function(txt) {
  var index = txt.indexOf(" ");
  if (index == -1) {
    return "<a target='"+txt+"' href='"+txt+"' style='background: url(\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAFZJREFUeF59z4EJADEIQ1F36k7u5E7ZKXeUQPACJ3wK7UNokVxVk9kHnQH7bY9hbDyDhNXgjpRLqFlo4M2GgfyJHhjq8V4agfrgPQX3JtJQGbofmCHgA/nAKks+JAjFAAAAAElFTkSuQmCC\") no-repeat scroll right center transparent;padding-right: 13px;'></a>";
  } else {
    url = txt.substring(0,index);
    label = txt.substring(index+1);
    //response.write("url: " + url + " label:" +label+ "<br/>");
    return "<a target='"+url+"' href='"+url+"' style='background: url(\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAFZJREFUeF59z4EJADEIQ1F36k7u5E7ZKXeUQPACJ3wK7UNokVxVk9kHnQH7bY9hbDyDhNXgjpRLqFlo4M2GgfyJHhjq8V4agfrgPQX3JtJQGbofmCHgA/nAKks+JAjFAAAAAElFTkSuQmCC\") no-repeat scroll right center transparent;padding-right: 13px;'>"+label+"</a>";
  }
}

/*
/ep/mwproxy/file.extension
if file is image, insert reference:
    * src=/ep/mwproxy/file.extension'
  mediawikiroot/images/x/xy/file.xml
*/
wiky.process_file = function(txt) {
  var index = txt.indexOf("|");
  url = txt.replace(/\u200e/, "");
  label = "";

  if (index > -1) {
    url = txt.substring(0,index).toLowerCase();
    label = txt.substring(index+1);// || url;
  }


  // NOTE: this re is duplicated in contentcollector.js;  you should prolly update both
  var imgRe = new RegExp("^[^\\s]+\.(png|jpg|jpeg|gif)$");
  var imgMatch = url.match(imgRe);
  if (imgMatch) {
    var proxiedUrl = "/ep/mwproxy/"+ encodeURI(url);
    //response.write("img: " + proxiedUrl + "<br/>");
    return " <img class='inline-img' src='"+proxiedUrl+"' alt=\""+label+"\" />";
  } else {
    proxiedUrl = "/ep/mwproxy/"+ encodeURI(url);
    //response.write("file: " + proxiedUrl + "<br/>");

    return "<a href='"+proxiedUrl+"'>"+(label||url)+"</a>";
  }
}

wiky.process_media = function(txt) {
  var index = txt.indexOf("|");
  url = txt;
  label = "";

  if (index > -1)
  {
    url = txt.substring(0,index).toLowerCase();
    label = txt.substring(index+1);// || url;
  }

  // url might be http:// or name...
  proxiedUrl = "/ep/mwproxy/"+encodeURI(encodeURI(url));
  //response.write("media: " + proxiedUrl + "<br/>");

  return "<a href='"+proxiedUrl+"'>"+(label||url)+"</a>";
}

wiky.process_video = function(url) {
  //response.write("video: " + url + "<br/>");

  if (url.match(/^(https?:\/\/)?(www.)?youtube.com\//) == null)
  {
    return "<b>"+url+" is an invalid YouTube URL</b>";
  }

  if ((result = url.match(/^(https?:\/\/)?(www.)?youtube.com\/watch\?(.*)v=([^&]+)/)) != null)
  {
    url = "http://www.youtube.com/embed/"+result[4];
  }


  return '<iframe width="480" height="390" src="'+url+'" frameborder="0" allowfullscreen></iframe>';
}

wiky.process_wikilink = function(url) {
  url = url.replace(/_/g, " ");
  url = url.replace(/'''/g, "");
  url = url.split("|")[0];
  // special sauce for the importer
  //response.write("wiki: " + url + "<br/>");

  return '<a href="MEDIAWIKILINK:' + url + '">'+url + "</a>";
}

wiky.process_code = function(lines, start, end) {
  var html=""
  i++;
  for(var i=start;i<=end-1;i++) {

    line = lines[i];
    var s = 0;
    if (line.match(/^(\t+).*/)) {
      s = line.match(/^(\t+).*/)[1].length;
    } else if (line.match(/^(\s+).*/)) {
      s = (line.match(/^(\s+).*/)[1].length)/2;
    }
    if (s>0) {
      html += "<ul class='list-indent" + (s) + "'>";
      html += "<li>";
    }
    html += trim(lines[i]);
    if (s>0) {
      html += "</li></ul>";
    } else {
      html += "<br/>";
    }

  }
  return html;
}

wiky.process_normal = function(wikitext) {

  function _nextFileLink () {
    var fileMacros = ["File", "Image", "image"];
    for (var i=0; i<fileMacros.length; i++) {
      var prefix = "[[" + fileMacros[i] + ":";
      var index = wikitext.indexOf(prefix);
      if (index > -1) {
        var endIndex = wikitext.indexOf("]]", index + prefix.length);
        if (endIndex > -1) {
          return {startIndex: index, contentEnd:endIndex, contentStart:index + prefix.length,
              endIndex: endIndex+2};
        } else {
          break;
        }
      }
    }
    return null;
  }

  wikitext = trim(wikitext);

  // File
  {
    var nextLink = _nextFileLink();
    while (nextLink) {
      wikitext = wikitext.substring(0, nextLink.startIndex)
            + wiky.process_file(wikitext.substring(nextLink.contentStart, nextLink.contentEnd))
            + wikitext.substring(nextLink.endIndex);
      nextLink = _nextFileLink();
    }
  }
  // Media
  {
    var prefix = "[[Media:";
    var index = wikitext.indexOf(prefix);
    var end_index = wikitext.indexOf("]]", index + prefix.length);
    while (index > -1 && end_index > -1) {
      wikitext = wikitext.substring(0,index)
            + wiky.process_media(wikitext.substring(index+prefix.length,end_index))
            + wikitext.substring(end_index+2);

      index = wikitext.indexOf(prefix);
      end_index = wikitext.indexOf("]]", index + prefix.length);
    }
  }



  // Video
  {
    var index = wikitext.indexOf("[[Video:");
    var end_index = wikitext.indexOf("]]", index + 8);
    while (index > -1 && end_index > -1) {

      wikitext = wikitext.substring(0,index)
            + wiky.process_video(wikitext.substring(index+8,end_index))
            + wikitext.substring(end_index+2);

      index = wikitext.indexOf("[[Video:");
      end_index = wikitext.indexOf("]]", index + 8);
    }
  }


  // URL
  var protocols = ["http","ftp","news"];

  for (var i=0;i<protocols.length;i++)
  {
    var index = wikitext.indexOf("["+protocols[i]+"://");
    var end_index = wikitext.indexOf("]", index + 1);
    while (index > -1 && end_index > -1) {

      wikitext = wikitext.substring(0,index)
            + wiky.process_url(wikitext.substring(index+1,end_index))
            + wikitext.substring(end_index+1);

      index = wikitext.indexOf("["+protocols[i]+"://",end_index+1);
      end_index = wikitext.indexOf("]", index + 1);

    }
  }

  // Internal Links
  {
    //var processed = "";
    var index = wikitext.indexOf("[[");
    var end_index = wikitext.indexOf("]]", index + 1);
    while (index > -1 && end_index > -1) {
      var linkhtml = wiky.process_wikilink(wikitext.substring(index+2,end_index));
      wikitext = wikitext.substring(0,index)
  //            + wikitext.substring(index+2, end_index);
            + linkhtml
            + wikitext.substring(end_index+2);

      index = wikitext.indexOf("[[",end_index+1);
      end_index = wikitext.indexOf("]]", index + 1);
    }

  }

  var count_b = 0;
  var index = wikitext.indexOf("'''");
  while(index > -1) {

    if ((count_b%2)==0) wikitext = wikitext.replace(/'''/,"<b>");
    else wikitext = wikitext.replace(/'''/,"</b>");

    count_b++;

    index = wikitext.indexOf("'''",index);
  }

  var count_i = 0;
  var index = wikitext.indexOf("''");
  while(index > -1) {

    if ((count_i%2)==0) wikitext = wikitext.replace(/''/,"<i>");
    else wikitext = wikitext.replace(/''/,"</i>");

    count_i++;

    index = wikitext.indexOf("''",index);
  }

  wikitext = wikitext.replace(/<\/b><\/i>/g,"</i></b>");

  return wikitext;
}
