// Template util taken from https://github.com/jashkenas/underscore/blob/master/underscore.js

// Certain characters need to be escaped so that they can be put into a
// string literal.
var escapes = {
  "'":      "'",
  '\\':     '\\',
  '\r':     'r',
  '\n':     'n',
  '\t':     't',
  '\u2028': 'u2028',
  '\u2029': 'u2029'
};
var _
var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

// JavaScript micro-templating, similar to John Resig's implementation.
// Underscore templating handles arbitrary delimiters, preserves whitespace,
// and correctly escapes quotes within interpolated code.
module.exports = function(text, data) {
  var render;

  // Combine delimiters into one regular expression via alternation.
  var matcher = new RegExp([
    /<%-([\s\S]+?)%>/g.source,
    /<%=([\s\S]+?)%>/g.source,
    /<%([\s\S]+?)%>/g.source
  ].join('|') + '|$', 'g');

  // Compile the template source, escaping string literals appropriately.
  var index = 0;
  var source = "__p+='";
  text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
    source += text.slice(index, offset)
      .replace(escaper, function(match) { return '\\' + escapes[match]; });

    // if (escape) {
    //   source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
    // }
    if (interpolate) {
      source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
    }
    if (evaluate) {
      source += "';\n" + evaluate + "\n__p+='";
    }
    index = offset + match.length;
    return match;
  });
  source += "';\n";

  // If a variable is not specified, place data values in local scope.
  source = 'with(obj||{}){\n' + source + '}\n';

  source = "var __t,__p='',__j=Array.prototype.join," +
    "print=function(){__p+=__j.call(arguments,'');};\n" +
    source + "return __p;\n";

  try {
    render = new Function('obj', '_', source);
  } catch (e) {
    e.source = source;
    throw e;
  }

  if (data) return render(data, _);
  var template = function(data) {
    return render.call(this, data, _);
  };
  return template;
};