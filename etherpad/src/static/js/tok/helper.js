
define(function(require, exports, module) {
  var Tokenizer = require("./tokenizer").Tokenizer;

  var Mode = function(name, desc, clazz, extensions) {
    this.name = name;
    this.desc = desc;
    this.clazz = clazz;
    this.rules = new clazz();
    this.rules.name = name;
    this.extRe = new RegExp("^.*\\.(" + extensions.join("|") + ")$", "g");
  };
  Mode.prototype.supportsFile = function(filename) {
    return filename.match(this.extRe);
  };

  var modes = [
    new Mode("text", "Text", require("./rules/text_highlight_rules").TextHighlightRules, ["txt"]),
    new Mode("c_cpp", "C/C++", require("./rules/c_cpp_highlight_rules").c_cppHighlightRules, ["c", "cpp", "cxx", "h", "hpp"]),
    //new Mode("clojure", "Clojure", require("./rules/clojure_highlight_rules").ClojureHighlightRules, ["clj"]),
    new Mode("coffee", "CoffeeScript", require("./rules/coffee_highlight_rules").CoffeeHighlightRules, ["coffee"]),
    //new Mode("coldfusion", "ColdFusion", require("./rules/coldfusion_highlight_rules").ColdfusionHighlightRules, ["cfm"]),
    new Mode("csharp", "C#", require("./rules/csharp_highlight_rules").CSharpHighlightRules, ["cs"]),
    new Mode("css", "CSS", require("./rules/css_highlight_rules").CssHighlightRules, ["css"]),
    //new Mode("groovy", "Groovy", require("./rules/groovy_highlight_rules").GroovyHighlightRules, ["groovy"]),
    //new Mode("haxe", "haXe", require("./rules/haxe_highlight_rules").HaxeHighlightRules, ["hx"]),
    new Mode("html", "HTML", require("./rules/html_highlight_rules").HtmlHighlightRules, ["html", "htm"]),
    new Mode("java", "Java", require("./rules/java_highlight_rules").JavaHighlightRules, ["java"]),
    new Mode("javascript", "JavaScript", require("./rules/javascript_highlight_rules").JavaScriptHighlightRules, ["js"]),
    new Mode("json", "JSON", require("./rules/json_highlight_rules").JsonHighlightRules, ["json"]),
    new Mode("latex", "LaTeX", require("./rules/latex_highlight_rules").LatexHighlightRules, ["tex"]),
    new Mode("lua", "Lua", require("./rules/lua_highlight_rules").LuaHighlightRules, ["lua"]),
    new Mode("markdown", "Markdown", require("./rules/markdown_highlight_rules").MarkdownHighlightRules, ["md", "markdown"]),
    //new Mode("ocaml", "OCaml", require("./rules/ocaml_highlight_rules").OcamlHighlightRules, ["ml", "mli"]),
    new Mode("perl", "Perl", require("./rules/perl_highlight_rules").PerlHighlightRules, ["pl", "pm"]),
    //new Mode("pgsql", "pgSQL",require("./rules/pgsql_highlight_rules").PgsqlHighlightRules, ["pgsql", "sql"]),
    //new Mode("php", "PHP",require("./rules/php_highlight_rules").PhpHighlightRules, ["php"]),
    //new Mode("powershell", "Powershell", require("./rules/powershell_highlight_rules").PowershellHighlightRules, ["ps1"]),
    new Mode("python", "Python", require("./rules/python_highlight_rules").PythonHighlightRules, ["py"]),
    new Mode("scala", "Scala", require("./rules/scala_highlight_rules").ScalaHighlightRules, ["scala"]),
    //new Mode("scss", "SCSS", require("./rules/scss_highlight_rules").ScssHighlightRules, ["scss"]),
    new Mode("ruby", "Ruby", require("./rules/ruby_highlight_rules").RubyHighlightRules, ["rb"]),
    new Mode("sql", "SQL", require("./rules/sql_highlight_rules").SqlHighlightRules, ["sql"]),
    //new Mode("svg", "SVG", require("./rules/SVG_highlight_rules").SvgHighlightRules, ["svg"]),
    new Mode("textile", "Textile", require("./rules/textile_highlight_rules").TextileHighlightRules, ["textile"]),
    new Mode("xml", "XML", require("./rules/xml_highlight_rules").XmlHighlightRules, ["xml"])
  ];

  return function(filename) {
    var mode = modes[0]; // text fallback
    for (var i = 0; i < modes.length; i++) {
      if (modes[i].supportsFile(filename)) {
        mode = modes[i];
        break;
      }
    }
    return new Tokenizer(mode.rules.getRules());
  };

});
