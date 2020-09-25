'use strict';

(function () {

  /*! picturefill - v3.0.2 - 2016-02-12
   * https://scottjehl.github.io/picturefill/
   * Copyright (c) 2016 https://github.com/scottjehl/picturefill/blob/master/Authors.txt; Licensed MIT
   */
  /*! Gecko-Picture - v1.0
   * https://github.com/scottjehl/picturefill/tree/3.0/src/plugins/gecko-picture
   * Firefox's early picture implementation (prior to FF41) is static and does
   * not react to viewport changes. This tiny module fixes this.
   */
  (function (window) {
    /*jshint eqnull:true */
    var ua = navigator.userAgent;

    if (window.HTMLPictureElement && ((/ecko/).test(ua) && ua.match(/rv\:(\d+)/) && RegExp.$1 < 45)) {
      addEventListener("resize", (function () {
        var timer;

        var dummySrc = document.createElement("source");

        var fixRespimg = function (img) {
          var source, sizes;
          var picture = img.parentNode;

          if (picture.nodeName.toUpperCase() === "PICTURE") {
            source = dummySrc.cloneNode();

            picture.insertBefore(source, picture.firstElementChild);
            setTimeout(function () {
              picture.removeChild(source);
            });
          } else if (!img._pfLastSize || img.offsetWidth > img._pfLastSize) {
            img._pfLastSize = img.offsetWidth;
            sizes = img.sizes;
            img.sizes += ",100vw";
            setTimeout(function () {
              img.sizes = sizes;
            });
          }
        };

        var findPictureImgs = function () {
          var i;
          var imgs = document.querySelectorAll("picture > img, img[srcset][sizes]");
          for (i = 0; i < imgs.length; i++) {
            fixRespimg(imgs[i]);
          }
        };
        var onResize = function () {
          clearTimeout(timer);
          timer = setTimeout(findPictureImgs, 99);
        };
        var mq = window.matchMedia && matchMedia("(orientation: landscape)");
        var init = function () {
          onResize();

          if (mq && mq.addListener) {
            mq.addListener(onResize);
          }
        };

        dummySrc.srcset = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

        if (/^[c|i]|d$/.test(document.readyState || "")) {
          init();
        } else {
          document.addEventListener("DOMContentLoaded", init);
        }

        return onResize;
      })());
    }
  })(window);

  /*! Picturefill - v3.0.2
   * http://scottjehl.github.io/picturefill
   * Copyright (c) 2015 https://github.com/scottjehl/picturefill/blob/master/Authors.txt;
   *  License: MIT
   */

  (function (window, document, undefined) {
    // Enable strict mode
    "use strict";

    // HTML shim|v it for old IE (IE9 will still need the HTML video tag workaround)
    document.createElement("picture");

    var warn, eminpx, alwaysCheckWDescriptor, evalId;
    // local object for method references and testing exposure
    var pf = {};
    var isSupportTestReady = false;
    var noop = function () { };
    var image = document.createElement("img");
    var getImgAttr = image.getAttribute;
    var setImgAttr = image.setAttribute;
    var removeImgAttr = image.removeAttribute;
    var docElem = document.documentElement;
    var types = {};
    var cfg = {
      //resource selection:
      algorithm: ""
    };
    var srcAttr = "data-pfsrc";
    var srcsetAttr = srcAttr + "set";
    // ua sniffing is done for undetectable img loading features,
    // to do some non crucial perf optimizations
    var ua = navigator.userAgent;
    var supportAbort = (/rident/).test(ua) || ((/ecko/).test(ua) && ua.match(/rv\:(\d+)/) && RegExp.$1 > 35);
    var curSrcProp = "currentSrc";
    var regWDesc = /\s+\+?\d+(e\d+)?w/;
    var regSize = /(\([^)]+\))?\s*(.+)/;
    var setOptions = window.picturefillCFG;
    /**
       * Shortcut property for https://w3c.github.io/webappsec/specs/mixedcontent/#restricts-mixed-content ( for easy overriding in tests )
       */
    // baseStyle also used by getEmValue (i.e.: width: 1em is important)
    var baseStyle = "position:absolute;left:0;visibility:hidden;display:block;padding:0;border:none;font-size:1em;width:1em;overflow:hidden;clip:rect(0px, 0px, 0px, 0px)";
    var fsCss = "font-size:100%!important;";
    var isVwDirty = true;

    var cssCache = {};
    var sizeLengthCache = {};
    var DPR = window.devicePixelRatio;
    var units = {
      px: 1,
      "in": 96
    };
    var anchor = document.createElement("a");
    /**
       * alreadyRun flag used for setOptions. is it true setOptions will reevaluate
       * @type {boolean}
       */
    var alreadyRun = false;

    // Reusable, non-"g" Regexes

    // (Don't use \s, to avoid matching non-breaking space.)
    var regexLeadingSpaces = /^[ \t\n\r\u000c]+/,
      regexLeadingCommasOrSpaces = /^[, \t\n\r\u000c]+/,
      regexLeadingNotSpaces = /^[^ \t\n\r\u000c]+/,
      regexTrailingCommas = /[,]+$/,
      regexNonNegativeInteger = /^\d+$/,

      // ( Positive or negative or unsigned integers or decimals, without or without exponents.
      // Must include at least one digit.
      // According to spec tests any decimal point must be followed by a digit.
      // No leading plus sign is allowed.)
      // https://html.spec.whatwg.org/multipage/infrastructure.html#valid-floating-point-number
      regexFloatingPoint = /^-?(?:[0-9]+|[0-9]*\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

    var on = function (obj, evt, fn, capture) {
      if (obj.addEventListener) {
        obj.addEventListener(evt, fn, capture || false);
      } else if (obj.attachEvent) {
        obj.attachEvent("on" + evt, fn);
      }
    };

    /**
       * simple memoize function:
       */

    var memoize = function (fn) {
      var cache = {};
      return function (input) {
        if (!(input in cache)) {
          cache[input] = fn(input);
        }
        return cache[input];
      };
    };

    // UTILITY FUNCTIONS

    // Manual is faster than RegEx
    // http://jsperf.com/whitespace-character/5
    function isSpace(c) {
      return (c === "\u0020" || // space
        c === "\u0009" || // horizontal tab
        c === "\u000A" || // new line
        c === "\u000C" || // form feed
        c === "\u000D");  // carriage return
    }

    /**
       * gets a mediaquery and returns a boolean or gets a css length and returns a number
       * @param css mediaqueries or css length
       * @returns {boolean|number}
       *
       * based on: https://gist.github.com/jonathantneal/db4f77009b155f083738
       */
    var evalCSS = (function () {

      var regLength = /^([\d\.]+)(em|vw|px)$/;
      var replace = function () {
        var args = arguments, index = 0, string = args[0];
        while (++index in args) {
          string = string.replace(args[index], args[++index]);
        }
        return string;
      };

      var buildStr = memoize(function (css) {

        return "return " + replace((css || "").toLowerCase(),
          // interpret `and`
          /\band\b/g, "&&",

          // interpret `,`
          /,/g, "||",

          // interpret `min-` as >=
          /min-([a-z-\s]+):/g, "e.$1>=",

          // interpret `max-` as <=
          /max-([a-z-\s]+):/g, "e.$1<=",

          //calc value
          /calc([^)]+)/g, "($1)",

          // interpret css values
          /(\d+[\.]*[\d]*)([a-z]+)/g, "($1 * e.$2)",
          //make eval less evil
          /^(?!(e.[a-z]|[0-9\.&=|><\+\-\*\(\)\/])).*/ig, ""
        ) + ";";
      });

      return function (css, length) {
        var parsedLength;
        if (!(css in cssCache)) {
          cssCache[css] = false;
          if (length && (parsedLength = css.match(regLength))) {
            cssCache[css] = parsedLength[1] * units[parsedLength[2]];
          } else {
            /*jshint evil:true */
            try {
              cssCache[css] = new Function("e", buildStr(css))(units);
            } catch (e) { }
            /*jshint evil:false */
          }
        }
        return cssCache[css];
      };
    })();

    var setResolution = function (candidate, sizesattr) {
      if (candidate.w) { // h = means height: || descriptor.type === 'h' do not handle yet...
        candidate.cWidth = pf.calcListLength(sizesattr || "100vw");
        candidate.res = candidate.w / candidate.cWidth;
      } else {
        candidate.res = candidate.d;
      }
      return candidate;
    };

    /**
       *
       * @param opt
       */
    var picturefill = function (opt) {

      if (!isSupportTestReady) { return; }

      var elements, i, plen;

      var options = opt || {};

      if (options.elements && options.elements.nodeType === 1) {
        if (options.elements.nodeName.toUpperCase() === "IMG") {
          options.elements = [options.elements];
        } else {
          options.context = options.elements;
          options.elements = null;
        }
      }

      elements = options.elements || pf.qsa((options.context || document), (options.reevaluate || options.reselect) ? pf.sel : pf.selShort);

      if ((plen = elements.length)) {

        pf.setupRun(options);
        alreadyRun = true;

        // Loop through all elements
        for (i = 0; i < plen; i++) {
          pf.fillImg(elements[i], options);
        }

        pf.teardownRun(options);
      }
    };

    /**
       * outputs a warning for the developer
       * @param {message}
       * @type {Function}
       */
    warn = (window.console && console.warn) ?
      function (message) {
        console.warn(message);
      } :
      noop
      ;

    if (!(curSrcProp in image)) {
      curSrcProp = "src";
    }

    // Add support for standard mime types.
    types["image/jpeg"] = true;
    types["image/gif"] = true;
    types["image/png"] = true;

    function detectTypeSupport(type, typeUri) {
      // based on Modernizr's lossless img-webp test
      // note: asynchronous
      var image = new window.Image();
      image.onerror = function () {
        types[type] = false;
        picturefill();
      };
      image.onload = function () {
        types[type] = image.width === 1;
        picturefill();
      };
      image.src = typeUri;
      return "pending";
    }

    // test svg support
    types["image/svg+xml"] = document.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#Image", "1.1");

    /**
       * updates the internal vW property with the current viewport width in px
       */
    function updateMetrics() {

      isVwDirty = false;
      DPR = window.devicePixelRatio;
      cssCache = {};
      sizeLengthCache = {};

      pf.DPR = DPR || 1;

      units.width = Math.max(window.innerWidth || 0, docElem.clientWidth);
      units.height = Math.max(window.innerHeight || 0, docElem.clientHeight);

      units.vw = units.width / 100;
      units.vh = units.height / 100;

      evalId = [units.height, units.width, DPR].join("-");

      units.em = pf.getEmValue();
      units.rem = units.em;
    }

    function chooseLowRes(lowerValue, higherValue, dprValue, isCached) {
      var bonusFactor, tooMuch, bonus, meanDensity;

      //experimental
      if (cfg.algorithm === "saveData") {
        if (lowerValue > 2.7) {
          meanDensity = dprValue + 1;
        } else {
          tooMuch = higherValue - dprValue;
          bonusFactor = Math.pow(lowerValue - 0.6, 1.5);

          bonus = tooMuch * bonusFactor;

          if (isCached) {
            bonus += 0.1 * bonusFactor;
          }

          meanDensity = lowerValue + bonus;
        }
      } else {
        meanDensity = (dprValue > 1) ?
          Math.sqrt(lowerValue * higherValue) :
          lowerValue;
      }

      return meanDensity > dprValue;
    }

    function applyBestCandidate(img) {
      var srcSetCandidates;
      var matchingSet = pf.getSet(img);
      var evaluated = false;
      if (matchingSet !== "pending") {
        evaluated = evalId;
        if (matchingSet) {
          srcSetCandidates = pf.setRes(matchingSet);
          pf.applySetCandidate(srcSetCandidates, img);
        }
      }
      img[pf.ns].evaled = evaluated;
    }

    function ascendingSort(a, b) {
      return a.res - b.res;
    }

    function setSrcToCur(img, src, set) {
      var candidate;
      if (!set && src) {
        set = img[pf.ns].sets;
        set = set && set[set.length - 1];
      }

      candidate = getCandidateForSrc(src, set);

      if (candidate) {
        src = pf.makeUrl(src);
        img[pf.ns].curSrc = src;
        img[pf.ns].curCan = candidate;

        if (!candidate.res) {
          setResolution(candidate, candidate.set.sizes);
        }
      }
      return candidate;
    }

    function getCandidateForSrc(src, set) {
      var i, candidate, candidates;
      if (src && set) {
        candidates = pf.parseSet(set);
        src = pf.makeUrl(src);
        for (i = 0; i < candidates.length; i++) {
          if (src === pf.makeUrl(candidates[i].url)) {
            candidate = candidates[i];
            break;
          }
        }
      }
      return candidate;
    }

    function getAllSourceElements(picture, candidates) {
      var i, len, source, srcset;

      // SPEC mismatch intended for size and perf:
      // actually only source elements preceding the img should be used
      // also note: don't use qsa here, because IE8 sometimes doesn't like source as the key part in a selector
      var sources = picture.getElementsByTagName("source");

      for (i = 0, len = sources.length; i < len; i++) {
        source = sources[i];
        source[pf.ns] = true;
        srcset = source.getAttribute("srcset");

        // if source does not have a srcset attribute, skip
        if (srcset) {
          candidates.push({
            srcset: srcset,
            media: source.getAttribute("media"),
            type: source.getAttribute("type"),
            sizes: source.getAttribute("sizes")
          });
        }
      }
    }

    /**
       * Srcset Parser
       * By Alex Bell |  MIT License
       *
       * @returns Array [{url: _, d: _, w: _, h:_, set:_(????)}, ...]
       *
       * Based super duper closely on the reference algorithm at:
       * https://html.spec.whatwg.org/multipage/embedded-content.html#parse-a-srcset-attribute
       */

    // 1. Let input be the value passed to this algorithm.
    // (TO-DO : Explain what "set" argument is here. Maybe choose a more
    // descriptive & more searchable name.  Since passing the "set" in really has
    // nothing to do with parsing proper, I would prefer this assignment eventually
    // go in an external fn.)
    function parseSrcset(input, set) {

      function collectCharacters(regEx) {
        var chars,
          match = regEx.exec(input.substring(pos));
        if (match) {
          chars = match[0];
          pos += chars.length;
          return chars;
        }
      }

      var inputLength = input.length,
        url,
        descriptors,
        currentDescriptor,
        state,
        c,

        // 2. Let position be a pointer into input, initially pointing at the start
        //    of the string.
        pos = 0,

        // 3. Let candidates be an initially empty source set.
        candidates = [];

      /**
          * Adds descriptor properties to a candidate, pushes to the candidates array
          * @return undefined
          */
      // (Declared outside of the while loop so that it's only created once.
      // (This fn is defined before it is used, in order to pass JSHINT.
      // Unfortunately this breaks the sequencing of the spec comments. :/ )
      function parseDescriptors() {

        // 9. Descriptor parser: Let error be no.
        var pError = false,

          // 10. Let width be absent.
          // 11. Let density be absent.
          // 12. Let future-compat-h be absent. (We're implementing it now as h)
          w, d, h, i,
          candidate = {},
          desc, lastChar, value, intVal, floatVal;

        // 13. For each descriptor in descriptors, run the appropriate set of steps
        // from the following list:
        for (i = 0; i < descriptors.length; i++) {
          desc = descriptors[i];

          lastChar = desc[desc.length - 1];
          value = desc.substring(0, desc.length - 1);
          intVal = parseInt(value, 10);
          floatVal = parseFloat(value);

          // If the descriptor consists of a valid non-negative integer followed by
          // a U+0077 LATIN SMALL LETTER W character
          if (regexNonNegativeInteger.test(value) && (lastChar === "w")) {

            // If width and density are not both absent, then let error be yes.
            if (w || d) { pError = true; }

            // Apply the rules for parsing non-negative integers to the descriptor.
            // If the result is zero, let error be yes.
            // Otherwise, let width be the result.
            if (intVal === 0) { pError = true; } else { w = intVal; }

            // If the descriptor consists of a valid floating-point number followed by
            // a U+0078 LATIN SMALL LETTER X character
          } else if (regexFloatingPoint.test(value) && (lastChar === "x")) {

            // If width, density and future-compat-h are not all absent, then let error
            // be yes.
            if (w || d || h) { pError = true; }

            // Apply the rules for parsing floating-point number values to the descriptor.
            // If the result is less than zero, let error be yes. Otherwise, let density
            // be the result.
            if (floatVal < 0) { pError = true; } else { d = floatVal; }

            // If the descriptor consists of a valid non-negative integer followed by
            // a U+0068 LATIN SMALL LETTER H character
          } else if (regexNonNegativeInteger.test(value) && (lastChar === "h")) {

            // If height and density are not both absent, then let error be yes.
            if (h || d) { pError = true; }

            // Apply the rules for parsing non-negative integers to the descriptor.
            // If the result is zero, let error be yes. Otherwise, let future-compat-h
            // be the result.
            if (intVal === 0) { pError = true; } else { h = intVal; }

            // Anything else, Let error be yes.
          } else { pError = true; }
        } // (close step 13 for loop)

        // 15. If error is still no, then append a new image source to candidates whose
        // URL is url, associated with a width width if not absent and a pixel
        // density density if not absent. Otherwise, there is a parse error.
        if (!pError) {
          candidate.url = url;

          if (w) { candidate.w = w; }
          if (d) { candidate.d = d; }
          if (h) { candidate.h = h; }
          if (!h && !d && !w) { candidate.d = 1; }
          if (candidate.d === 1) { set.has1x = true; }
          candidate.set = set;

          candidates.push(candidate);
        }
      } // (close parseDescriptors fn)

      /**
          * Tokenizes descriptor properties prior to parsing
          * Returns undefined.
          * (Again, this fn is defined before it is used, in order to pass JSHINT.
          * Unfortunately this breaks the logical sequencing of the spec comments. :/ )
          */
      function tokenize() {

        // 8.1. Descriptor tokeniser: Skip whitespace
        collectCharacters(regexLeadingSpaces);

        // 8.2. Let current descriptor be the empty string.
        currentDescriptor = "";

        // 8.3. Let state be in descriptor.
        state = "in descriptor";

        while (true) {

          // 8.4. Let c be the character at position.
          c = input.charAt(pos);

          //  Do the following depending on the value of state.
          //  For the purpose of this step, "EOF" is a special character representing
          //  that position is past the end of input.

          // In descriptor
          if (state === "in descriptor") {
            // Do the following, depending on the value of c:

            // Space character
            // If current descriptor is not empty, append current descriptor to
            // descriptors and let current descriptor be the empty string.
            // Set state to after descriptor.
            if (isSpace(c)) {
              if (currentDescriptor) {
                descriptors.push(currentDescriptor);
                currentDescriptor = "";
                state = "after descriptor";
              }

              // U+002C COMMA (,)
              // Advance position to the next character in input. If current descriptor
              // is not empty, append current descriptor to descriptors. Jump to the step
              // labeled descriptor parser.
            } else if (c === ",") {
              pos += 1;
              if (currentDescriptor) {
                descriptors.push(currentDescriptor);
              }
              parseDescriptors();
              return;

              // U+0028 LEFT PARENTHESIS (()
              // Append c to current descriptor. Set state to in parens.
            } else if (c === "\u0028") {
              currentDescriptor = currentDescriptor + c;
              state = "in parens";

              // EOF
              // If current descriptor is not empty, append current descriptor to
              // descriptors. Jump to the step labeled descriptor parser.
            } else if (c === "") {
              if (currentDescriptor) {
                descriptors.push(currentDescriptor);
              }
              parseDescriptors();
              return;

              // Anything else
              // Append c to current descriptor.
            } else {
              currentDescriptor = currentDescriptor + c;
            }
            // (end "in descriptor"

            // In parens
          } else if (state === "in parens") {

            // U+0029 RIGHT PARENTHESIS ())
            // Append c to current descriptor. Set state to in descriptor.
            if (c === ")") {
              currentDescriptor = currentDescriptor + c;
              state = "in descriptor";

              // EOF
              // Append current descriptor to descriptors. Jump to the step labeled
              // descriptor parser.
            } else if (c === "") {
              descriptors.push(currentDescriptor);
              parseDescriptors();
              return;

              // Anything else
              // Append c to current descriptor.
            } else {
              currentDescriptor = currentDescriptor + c;
            }

            // After descriptor
          } else if (state === "after descriptor") {

            // Do the following, depending on the value of c:
            // Space character: Stay in this state.
            if (isSpace(c)) {

              // EOF: Jump to the step labeled descriptor parser.
            } else if (c === "") {
              parseDescriptors();
              return;

              // Anything else
              // Set state to in descriptor. Set position to the previous character in input.
            } else {
              state = "in descriptor";
              pos -= 1;

            }
          }

          // Advance position to the next character in input.
          pos += 1;

          // Repeat this step.
        } // (close while true loop)
      }

      // 4. Splitting loop: Collect a sequence of characters that are space
      //    characters or U+002C COMMA characters. If any U+002C COMMA characters
      //    were collected, that is a parse error.
      while (true) {
        collectCharacters(regexLeadingCommasOrSpaces);

        // 5. If position is past the end of input, return candidates and abort these steps.
        if (pos >= inputLength) {
          return candidates; // (we're done, this is the sole return path)
        }

        // 6. Collect a sequence of characters that are not space characters,
        //    and let that be url.
        url = collectCharacters(regexLeadingNotSpaces);

        // 7. Let descriptors be a new empty list.
        descriptors = [];

        // 8. If url ends with a U+002C COMMA character (,), follow these substeps:
        //		(1). Remove all trailing U+002C COMMA characters from url. If this removed
        //         more than one character, that is a parse error.
        if (url.slice(-1) === ",") {
          url = url.replace(regexTrailingCommas, "");
          // (Jump ahead to step 9 to skip tokenization and just push the candidate).
          parseDescriptors();

          //	Otherwise, follow these substeps:
        } else {
          tokenize();
        } // (close else of step 8)

        // 16. Return to the step labeled splitting loop.
      } // (Close of big while loop.)
    }

    /*
       * Sizes Parser
       *
       * By Alex Bell |  MIT License
       *
       * Non-strict but accurate and lightweight JS Parser for the string value <img sizes="here">
       *
       * Reference algorithm at:
       * https://html.spec.whatwg.org/multipage/embedded-content.html#parse-a-sizes-attribute
       *
       * Most comments are copied in directly from the spec
       * (except for comments in parens).
       *
       * Grammar is:
       * <source-size-list> = <source-size># [ , <source-size-value> ]? | <source-size-value>
       * <source-size> = <media-condition> <source-size-value>
       * <source-size-value> = <length>
       * http://www.w3.org/html/wg/drafts/html/master/embedded-content.html#attr-img-sizes
       *
       * E.g. "(max-width: 30em) 100vw, (max-width: 50em) 70vw, 100vw"
       * or "(min-width: 30em), calc(30vw - 15px)" or just "30vw"
       *
       * Returns the first valid <css-length> with a media condition that evaluates to true,
       * or "100vw" if all valid media conditions evaluate to false.
       *
       */

    function parseSizes(strValue) {

      // (Percentage CSS lengths are not allowed in this case, to avoid confusion:
      // https://html.spec.whatwg.org/multipage/embedded-content.html#valid-source-size-list
      // CSS allows a single optional plus or minus sign:
      // http://www.w3.org/TR/CSS2/syndata.html#numbers
      // CSS is ASCII case-insensitive:
      // http://www.w3.org/TR/CSS2/syndata.html#characters )
      // Spec allows exponential notation for <number> type:
      // http://dev.w3.org/csswg/css-values/#numbers
      var regexCssLengthWithUnits = /^(?:[+-]?[0-9]+|[0-9]*\.[0-9]+)(?:[eE][+-]?[0-9]+)?(?:ch|cm|em|ex|in|mm|pc|pt|px|rem|vh|vmin|vmax|vw)$/i;

      // (This is a quick and lenient test. Because of optional unlimited-depth internal
      // grouping parens and strict spacing rules, this could get very complicated.)
      var regexCssCalc = /^calc\((?:[0-9a-z \.\+\-\*\/\(\)]+)\)$/i;

      var i;
      var unparsedSizesList;
      var unparsedSizesListLength;
      var unparsedSize;
      var lastComponentValue;
      var size;

      // UTILITY FUNCTIONS

      //  (Toy CSS parser. The goals here are:
      //  1) expansive test coverage without the weight of a full CSS parser.
      //  2) Avoiding regex wherever convenient.
      //  Quick tests: http://jsfiddle.net/gtntL4gr/3/
      //  Returns an array of arrays.)
      function parseComponentValues(str) {
        var chrctr;
        var component = "";
        var componentArray = [];
        var listArray = [];
        var parenDepth = 0;
        var pos = 0;
        var inComment = false;

        function pushComponent() {
          if (component) {
            componentArray.push(component);
            component = "";
          }
        }

        function pushComponentArray() {
          if (componentArray[0]) {
            listArray.push(componentArray);
            componentArray = [];
          }
        }

        // (Loop forwards from the beginning of the string.)
        while (true) {
          chrctr = str.charAt(pos);

          if (chrctr === "") { // ( End of string reached.)
            pushComponent();
            pushComponentArray();
            return listArray;
          } else if (inComment) {
            if ((chrctr === "*") && (str[pos + 1] === "/")) { // (At end of a comment.)
              inComment = false;
              pos += 2;
              pushComponent();
              continue;
            } else {
              pos += 1; // (Skip all characters inside comments.)
              continue;
            }
          } else if (isSpace(chrctr)) {
            // (If previous character in loop was also a space, or if
            // at the beginning of the string, do not add space char to
            // component.)
            if ((str.charAt(pos - 1) && isSpace(str.charAt(pos - 1))) || !component) {
              pos += 1;
              continue;
            } else if (parenDepth === 0) {
              pushComponent();
              pos += 1;
              continue;
            } else {
              // (Replace any space character with a plain space for legibility.)
              chrctr = " ";
            }
          } else if (chrctr === "(") {
            parenDepth += 1;
          } else if (chrctr === ")") {
            parenDepth -= 1;
          } else if (chrctr === ",") {
            pushComponent();
            pushComponentArray();
            pos += 1;
            continue;
          } else if ((chrctr === "/") && (str.charAt(pos + 1) === "*")) {
            inComment = true;
            pos += 2;
            continue;
          }

          component = component + chrctr;
          pos += 1;
        }
      }

      function isValidNonNegativeSourceSizeValue(s) {
        if (regexCssLengthWithUnits.test(s) && (parseFloat(s) >= 0)) { return true; }
        if (regexCssCalc.test(s)) { return true; }
        // ( http://www.w3.org/TR/CSS2/syndata.html#numbers says:
        // "-0 is equivalent to 0 and is not a negative number." which means that
        // unitless zero and unitless negative zero must be accepted as special cases.)
        if ((s === "0") || (s === "-0") || (s === "+0")) { return true; }
        return false;
      }

      // When asked to parse a sizes attribute from an element, parse a
      // comma-separated list of component values from the value of the element's
      // sizes attribute (or the empty string, if the attribute is absent), and let
      // unparsed sizes list be the result.
      // http://dev.w3.org/csswg/css-syntax/#parse-comma-separated-list-of-component-values

      unparsedSizesList = parseComponentValues(strValue);
      unparsedSizesListLength = unparsedSizesList.length;

      // For each unparsed size in unparsed sizes list:
      for (i = 0; i < unparsedSizesListLength; i++) {
        unparsedSize = unparsedSizesList[i];

        // 1. Remove all consecutive <whitespace-token>s from the end of unparsed size.
        // ( parseComponentValues() already omits spaces outside of parens. )

        // If unparsed size is now empty, that is a parse error; continue to the next
        // iteration of this algorithm.
        // ( parseComponentValues() won't push an empty array. )

        // 2. If the last component value in unparsed size is a valid non-negative
        // <source-size-value>, let size be its value and remove the component value
        // from unparsed size. Any CSS function other than the calc() function is
        // invalid. Otherwise, there is a parse error; continue to the next iteration
        // of this algorithm.
        // http://dev.w3.org/csswg/css-syntax/#parse-component-value
        lastComponentValue = unparsedSize[unparsedSize.length - 1];

        if (isValidNonNegativeSourceSizeValue(lastComponentValue)) {
          size = lastComponentValue;
          unparsedSize.pop();
        } else {
          continue;
        }

        // 3. Remove all consecutive <whitespace-token>s from the end of unparsed
        // size. If unparsed size is now empty, return size and exit this algorithm.
        // If this was not the last item in unparsed sizes list, that is a parse error.
        if (unparsedSize.length === 0) {
          return size;
        }

        // 4. Parse the remaining component values in unparsed size as a
        // <media-condition>. If it does not parse correctly, or it does parse
        // correctly but the <media-condition> evaluates to false, continue to the
        // next iteration of this algorithm.
        // (Parsing all possible compound media conditions in JS is heavy, complicated,
        // and the payoff is unclear. Is there ever an situation where the
        // media condition parses incorrectly but still somehow evaluates to true?
        // Can we just rely on the browser/polyfill to do it?)
        unparsedSize = unparsedSize.join(" ");
        if (!(pf.matchesMedia(unparsedSize))) {
          continue;
        }

        // 5. Return size and exit this algorithm.
        return size;
      }

      // If the above algorithm exhausts unparsed sizes list without returning a
      // size value, return 100vw.
      return "100vw";
    }

    // namespace
    pf.ns = ("pf" + new Date().getTime()).substr(0, 9);

    // srcset support test
    pf.supSrcset = "srcset" in image;
    pf.supSizes = "sizes" in image;
    pf.supPicture = !!window.HTMLPictureElement;

    // UC browser does claim to support srcset and picture, but not sizes,
    // this extended test reveals the browser does support nothing
    if (pf.supSrcset && pf.supPicture && !pf.supSizes) {
      (function (image2) {
        image.srcset = "data:,a";
        image2.src = "data:,a";
        pf.supSrcset = image.complete === image2.complete;
        pf.supPicture = pf.supSrcset && pf.supPicture;
      })(document.createElement("img"));
    }

    // Safari9 has basic support for sizes, but does't expose the `sizes` idl attribute
    if (pf.supSrcset && !pf.supSizes) {

      (function () {
        var width2 = "data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==";
        var width1 = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
        var img = document.createElement("img");
        var test = function () {
          var width = img.width;

          if (width === 2) {
            pf.supSizes = true;
          }

          alwaysCheckWDescriptor = pf.supSrcset && !pf.supSizes;

          isSupportTestReady = true;
          // force async
          setTimeout(picturefill);
        };

        img.onload = test;
        img.onerror = test;
        img.setAttribute("sizes", "9px");

        img.srcset = width1 + " 1w," + width2 + " 9w";
        img.src = width1;
      })();

    } else {
      isSupportTestReady = true;
    }

    // using pf.qsa instead of dom traversing does scale much better,
    // especially on sites mixing responsive and non-responsive images
    pf.selShort = "picture>img,img[srcset]";
    pf.sel = pf.selShort;
    pf.cfg = cfg;

    /**
       * Shortcut property for `devicePixelRatio` ( for easy overriding in tests )
       */
    pf.DPR = (DPR || 1);
    pf.u = units;

    // container of supported mime types that one might need to qualify before using
    pf.types = types;

    pf.setSize = noop;

    /**
       * Gets a string and returns the absolute URL
       * @param src
       * @returns {String} absolute URL
       */

    pf.makeUrl = memoize(function (src) {
      anchor.href = src;
      return anchor.href;
    });

    /**
       * Gets a DOM element or document and a selctor and returns the found matches
       * Can be extended with jQuery/Sizzle for IE7 support
       * @param context
       * @param sel
       * @returns {NodeList|Array}
       */
    pf.qsa = function (context, sel) {
      return ("querySelector" in context) ? context.querySelectorAll(sel) : [];
    };

    /**
       * Shortcut method for matchMedia ( for easy overriding in tests )
       * wether native or pf.mMQ is used will be decided lazy on first call
       * @returns {boolean}
       */
    pf.matchesMedia = function () {
      if (window.matchMedia && (matchMedia("(min-width: 0.1em)") || {}).matches) {
        pf.matchesMedia = function (media) {
          return !media || (matchMedia(media).matches);
        };
      } else {
        pf.matchesMedia = pf.mMQ;
      }

      return pf.matchesMedia.apply(this, arguments);
    };

    /**
       * A simplified matchMedia implementation for IE8 and IE9
       * handles only min-width/max-width with px or em values
       * @param media
       * @returns {boolean}
       */
    pf.mMQ = function (media) {
      return media ? evalCSS(media) : true;
    };

    /**
       * Returns the calculated length in css pixel from the given sourceSizeValue
       * http://dev.w3.org/csswg/css-values-3/#length-value
       * intended Spec mismatches:
       * * Does not check for invalid use of CSS functions
       * * Does handle a computed length of 0 the same as a negative and therefore invalid value
       * @param sourceSizeValue
       * @returns {Number}
       */
    pf.calcLength = function (sourceSizeValue) {

      var value = evalCSS(sourceSizeValue, true) || false;
      if (value < 0) {
        value = false;
      }

      return value;
    };

    /**
       * Takes a type string and checks if its supported
       */

    pf.supportsType = function (type) {
      return (type) ? types[type] : true;
    };

    /**
       * Parses a sourceSize into mediaCondition (media) and sourceSizeValue (length)
       * @param sourceSizeStr
       * @returns {*}
       */
    pf.parseSize = memoize(function (sourceSizeStr) {
      var match = (sourceSizeStr || "").match(regSize);
      return {
        media: match && match[1],
        length: match && match[2]
      };
    });

    pf.parseSet = function (set) {
      if (!set.cands) {
        set.cands = parseSrcset(set.srcset, set);
      }
      return set.cands;
    };

    /**
       * returns 1em in css px for html/body default size
       * function taken from respondjs
       * @returns {*|number}
       */
    pf.getEmValue = function () {
      var body;
      if (!eminpx && (body = document.body)) {
        var div = document.createElement("div"),
          originalHTMLCSS = docElem.style.cssText,
          originalBodyCSS = body.style.cssText;

        div.style.cssText = baseStyle;

        // 1em in a media query is the value of the default font size of the browser
        // reset docElem and body to ensure the correct value is returned
        docElem.style.cssText = fsCss;
        body.style.cssText = fsCss;

        body.appendChild(div);
        eminpx = div.offsetWidth;
        body.removeChild(div);

        //also update eminpx before returning
        eminpx = parseFloat(eminpx, 10);

        // restore the original values
        docElem.style.cssText = originalHTMLCSS;
        body.style.cssText = originalBodyCSS;

      }
      return eminpx || 16;
    };

    /**
       * Takes a string of sizes and returns the width in pixels as a number
       */
    pf.calcListLength = function (sourceSizeListStr) {
      // Split up source size list, ie ( max-width: 30em ) 100%, ( max-width: 50em ) 50%, 33%
      //
      //                           or (min-width:30em) calc(30% - 15px)
      if (!(sourceSizeListStr in sizeLengthCache) || cfg.uT) {
        var winningLength = pf.calcLength(parseSizes(sourceSizeListStr));

        sizeLengthCache[sourceSizeListStr] = !winningLength ? units.width : winningLength;
      }

      return sizeLengthCache[sourceSizeListStr];
    };

    /**
       * Takes a candidate object with a srcset property in the form of url/
       * ex. "images/pic-medium.png 1x, images/pic-medium-2x.png 2x" or
       *     "images/pic-medium.png 400w, images/pic-medium-2x.png 800w" or
       *     "images/pic-small.png"
       * Get an array of image candidates in the form of
       *      {url: "/foo/bar.png", resolution: 1}
       * where resolution is http://dev.w3.org/csswg/css-values-3/#resolution-value
       * If sizes is specified, res is calculated
       */
    pf.setRes = function (set) {
      var candidates;
      if (set) {

        candidates = pf.parseSet(set);

        for (var i = 0, len = candidates.length; i < len; i++) {
          setResolution(candidates[i], set.sizes);
        }
      }
      return candidates;
    };

    pf.setRes.res = setResolution;

    pf.applySetCandidate = function (candidates, img) {
      if (!candidates.length) { return; }
      var candidate,
        i,
        j,
        length,
        bestCandidate,
        curSrc,
        curCan,
        candidateSrc,
        abortCurSrc;

      var imageData = img[pf.ns];
      var dpr = pf.DPR;

      curSrc = imageData.curSrc || img[curSrcProp];

      curCan = imageData.curCan || setSrcToCur(img, curSrc, candidates[0].set);

      // if we have a current source, we might either become lazy or give this source some advantage
      if (curCan && curCan.set === candidates[0].set) {

        // if browser can abort image request and the image has a higher pixel density than needed
        // and this image isn't downloaded yet, we skip next part and try to save bandwidth
        abortCurSrc = (supportAbort && !img.complete && curCan.res - 0.1 > dpr);

        if (!abortCurSrc) {
          curCan.cached = true;

          // if current candidate is "best", "better" or "okay",
          // set it to bestCandidate
          if (curCan.res >= dpr) {
            bestCandidate = curCan;
          }
        }
      }

      if (!bestCandidate) {

        candidates.sort(ascendingSort);

        length = candidates.length;
        bestCandidate = candidates[length - 1];

        for (i = 0; i < length; i++) {
          candidate = candidates[i];
          if (candidate.res >= dpr) {
            j = i - 1;

            // we have found the perfect candidate,
            // but let's improve this a little bit with some assumptions ;-)
            if (candidates[j] &&
              (abortCurSrc || curSrc !== pf.makeUrl(candidate.url)) &&
              chooseLowRes(candidates[j].res, candidate.res, dpr, candidates[j].cached)) {

              bestCandidate = candidates[j];

            } else {
              bestCandidate = candidate;
            }
            break;
          }
        }
      }

      if (bestCandidate) {

        candidateSrc = pf.makeUrl(bestCandidate.url);

        imageData.curSrc = candidateSrc;
        imageData.curCan = bestCandidate;

        if (candidateSrc !== curSrc) {
          pf.setSrc(img, bestCandidate);
        }
        pf.setSize(img);
      }
    };

    pf.setSrc = function (img, bestCandidate) {
      var origWidth;
      img.src = bestCandidate.url;

      // although this is a specific Safari issue, we don't want to take too much different code paths
      if (bestCandidate.set.type === "image/svg+xml") {
        origWidth = img.style.width;
        img.style.width = (img.offsetWidth + 1) + "px";

        // next line only should trigger a repaint
        // if... is only done to trick dead code removal
        if (img.offsetWidth + 1) {
          img.style.width = origWidth;
        }
      }
    };

    pf.getSet = function (img) {
      var i, set, supportsType;
      var match = false;
      var sets = img[pf.ns].sets;

      for (i = 0; i < sets.length && !match; i++) {
        set = sets[i];

        if (!set.srcset || !pf.matchesMedia(set.media) || !(supportsType = pf.supportsType(set.type))) {
          continue;
        }

        if (supportsType === "pending") {
          set = supportsType;
        }

        match = set;
        break;
      }

      return match;
    };

    pf.parseSets = function (element, parent, options) {
      var srcsetAttribute, imageSet, isWDescripor, srcsetParsed;

      var hasPicture = parent && parent.nodeName.toUpperCase() === "PICTURE";
      var imageData = element[pf.ns];

      if (imageData.src === undefined || options.src) {
        imageData.src = getImgAttr.call(element, "src");
        if (imageData.src) {
          setImgAttr.call(element, srcAttr, imageData.src);
        } else {
          removeImgAttr.call(element, srcAttr);
        }
      }

      if (imageData.srcset === undefined || options.srcset || !pf.supSrcset || element.srcset) {
        srcsetAttribute = getImgAttr.call(element, "srcset");
        imageData.srcset = srcsetAttribute;
        srcsetParsed = true;
      }

      imageData.sets = [];

      if (hasPicture) {
        imageData.pic = true;
        getAllSourceElements(parent, imageData.sets);
      }

      if (imageData.srcset) {
        imageSet = {
          srcset: imageData.srcset,
          sizes: getImgAttr.call(element, "sizes")
        };

        imageData.sets.push(imageSet);

        isWDescripor = (alwaysCheckWDescriptor || imageData.src) && regWDesc.test(imageData.srcset || "");

        // add normal src as candidate, if source has no w descriptor
        if (!isWDescripor && imageData.src && !getCandidateForSrc(imageData.src, imageSet) && !imageSet.has1x) {
          imageSet.srcset += ", " + imageData.src;
          imageSet.cands.push({
            url: imageData.src,
            d: 1,
            set: imageSet
          });
        }

      } else if (imageData.src) {
        imageData.sets.push({
          srcset: imageData.src,
          sizes: null
        });
      }

      imageData.curCan = null;
      imageData.curSrc = undefined;

      // if img has picture or the srcset was removed or has a srcset and does not support srcset at all
      // or has a w descriptor (and does not support sizes) set support to false to evaluate
      imageData.supported = !(hasPicture || (imageSet && !pf.supSrcset) || (isWDescripor && !pf.supSizes));

      if (srcsetParsed && pf.supSrcset && !imageData.supported) {
        if (srcsetAttribute) {
          setImgAttr.call(element, srcsetAttr, srcsetAttribute);
          element.srcset = "";
        } else {
          removeImgAttr.call(element, srcsetAttr);
        }
      }

      if (imageData.supported && !imageData.srcset && ((!imageData.src && element.src) || element.src !== pf.makeUrl(imageData.src))) {
        if (imageData.src === null) {
          element.removeAttribute("src");
        } else {
          element.src = imageData.src;
        }
      }

      imageData.parsed = true;
    };

    pf.fillImg = function (element, options) {
      var imageData;
      var extreme = options.reselect || options.reevaluate;

      // expando for caching data on the img
      if (!element[pf.ns]) {
        element[pf.ns] = {};
      }

      imageData = element[pf.ns];

      // if the element has already been evaluated, skip it
      // unless `options.reevaluate` is set to true ( this, for example,
      // is set to true when running `picturefill` on `resize` ).
      if (!extreme && imageData.evaled === evalId) {
        return;
      }

      if (!imageData.parsed || options.reevaluate) {
        pf.parseSets(element, element.parentNode, options);
      }

      if (!imageData.supported) {
        applyBestCandidate(element);
      } else {
        imageData.evaled = evalId;
      }
    };

    pf.setupRun = function () {
      if (!alreadyRun || isVwDirty || (DPR !== window.devicePixelRatio)) {
        updateMetrics();
      }
    };

    // If picture is supported, well, that's awesome.
    if (pf.supPicture) {
      picturefill = noop;
      pf.fillImg = noop;
    } else {

      // Set up picture polyfill by polling the document
      (function () {
        var isDomReady;
        var regReady = window.attachEvent ? /d$|^c/ : /d$|^c|^i/;

        var run = function () {
          var readyState = document.readyState || "";

          timerId = setTimeout(run, readyState === "loading" ? 200 : 999);
          if (document.body) {
            pf.fillImgs();
            isDomReady = isDomReady || regReady.test(readyState);
            if (isDomReady) {
              clearTimeout(timerId);
            }

          }
        };

        var timerId = setTimeout(run, document.body ? 9 : 99);

        // Also attach picturefill on resize and readystatechange
        // http://modernjavascript.blogspot.com/2013/08/building-better-debounce.html
        var debounce = function (func, wait) {
          var timeout, timestamp;
          var later = function () {
            var last = (new Date()) - timestamp;

            if (last < wait) {
              timeout = setTimeout(later, wait - last);
            } else {
              timeout = null;
              func();
            }
          };

          return function () {
            timestamp = new Date();

            if (!timeout) {
              timeout = setTimeout(later, wait);
            }
          };
        };
        var lastClientWidth = docElem.clientHeight;
        var onResize = function () {
          isVwDirty = Math.max(window.innerWidth || 0, docElem.clientWidth) !== units.width || docElem.clientHeight !== lastClientWidth;
          lastClientWidth = docElem.clientHeight;
          if (isVwDirty) {
            pf.fillImgs();
          }
        };

        on(window, "resize", debounce(onResize, 99));
        on(document, "readystatechange", run);
      })();
    }

    pf.picturefill = picturefill;
    //use this internally for easy monkey patching/performance testing
    pf.fillImgs = picturefill;
    pf.teardownRun = noop;

    /* expose methods for testing */
    picturefill._ = pf;

    window.picturefillCFG = {
      pf: pf,
      push: function (args) {
        var name = args.shift();
        if (typeof pf[name] === "function") {
          pf[name].apply(pf, args);
        } else {
          cfg[name] = args[0];
          if (alreadyRun) {
            pf.fillImgs({ reselect: true });
          }
        }
      }
    };

    while (setOptions && setOptions.length) {
      window.picturefillCFG.push(setOptions.shift());
    }

    /* expose picturefill */
    window.picturefill = picturefill;

    /* expose picturefill */
    if (typeof module === "object" && typeof module.exports === "object") {
      // CommonJS, just export
      module.exports = picturefill;
    } else if (typeof define === "function" && define.amd) {
      // AMD support
      define("picturefill", function () { return picturefill; });
    }

    // IE8 evals this sync, so it must be the last thing we do
    if (!pf.supPicture) {
      types["image/webp"] = detectTypeSupport("image/webp", "data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAABBxAR/Q9ERP8DAABWUDggGAAAADABAJ0BKgEAAQADADQlpAADcAD++/1QAA==");
    }

  })(window, document);

  (function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define(['exports'], factory) :
        (global = global || self, factory(global.Inputmask = {}));
  }(this, (function (exports) {
    'use strict';

    /*!
 * dist/inputmask
 * https://github.com/RobinHerbots/Inputmask
 * Copyright (c) 2010 - 2020 Robin Herbots
 * Licensed under the MIT license
 * Version: 5.0.6-beta.17
 */
    !function webpackUniversalModuleDefinition(root, factory) {
      if ("object" == typeof exports && "object" == typeof module) module.exports = factory(); else if ("function" == typeof define && define.amd) define([], factory); else {
        var a = factory();
        for (var i in a) ("object" == typeof exports ? exports : root)[i] = a[i];
      }
    }(this, function () {
      return modules = [function (module) {
        module.exports = JSON.parse('{"BACKSPACE":8,"BACKSPACE_SAFARI":127,"DELETE":46,"DOWN":40,"END":35,"ENTER":13,"ESCAPE":27,"HOME":36,"INSERT":45,"LEFT":37,"PAGE_DOWN":34,"PAGE_UP":33,"RIGHT":39,"SPACE":32,"TAB":9,"UP":38,"X":88,"CONTROL":17,"KEY_229":229}');
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.caret = caret, exports.determineLastRequiredPosition = determineLastRequiredPosition,
          exports.determineNewCaretPosition = determineNewCaretPosition, exports.getBuffer = getBuffer,
          exports.getBufferTemplate = getBufferTemplate, exports.getLastValidPosition = getLastValidPosition,
          exports.isMask = isMask, exports.resetMaskSet = resetMaskSet, exports.seekNext = seekNext,
          exports.seekPrevious = seekPrevious, exports.translatePosition = translatePosition;
        var _validationTests = __webpack_require__(3), _validation = __webpack_require__(4), _mask = __webpack_require__(11);
        function caret(input, begin, end, notranslate, isDelete) {
          var inputmask = this, opts = this.opts, range;
          if (void 0 === begin) return "selectionStart" in input && "selectionEnd" in input ? (begin = input.selectionStart,
            end = input.selectionEnd) : window.getSelection ? (range = window.getSelection().getRangeAt(0),
              range.commonAncestorContainer.parentNode !== input && range.commonAncestorContainer !== input || (begin = range.startOffset,
                end = range.endOffset)) : document.selection && document.selection.createRange && (range = document.selection.createRange(),
                  begin = 0 - range.duplicate().moveStart("character", -input.inputmask._valueGet().length),
                  end = begin + range.text.length), {
            begin: notranslate ? begin : translatePosition.call(this, begin),
            end: notranslate ? end : translatePosition.call(this, end)
          };
          if (Array.isArray(begin) && (end = this.isRTL ? begin[0] : begin[1], begin = this.isRTL ? begin[1] : begin[0]),
            void 0 !== begin.begin && (end = this.isRTL ? begin.begin : begin.end, begin = this.isRTL ? begin.end : begin.begin),
            "number" == typeof begin) {
            begin = notranslate ? begin : translatePosition.call(this, begin), end = notranslate ? end : translatePosition.call(this, end),
              end = "number" == typeof end ? end : begin;
            var scrollCalc = parseInt(((input.ownerDocument.defaultView || window).getComputedStyle ? (input.ownerDocument.defaultView || window).getComputedStyle(input, null) : input.currentStyle).fontSize) * end;
            if (input.scrollLeft = scrollCalc > input.scrollWidth ? scrollCalc : 0, input.inputmask.caretPos = {
              begin: begin,
              end: end
            }, opts.insertModeVisual && !1 === opts.insertMode && begin === end && (isDelete || end++),
              input === (input.inputmask.shadowRoot || document).activeElement) if ("setSelectionRange" in input) input.setSelectionRange(begin, end); else if (window.getSelection) {
                if (range = document.createRange(), void 0 === input.firstChild || null === input.firstChild) {
                  var textNode = document.createTextNode("");
                  input.appendChild(textNode);
                }
                range.setStart(input.firstChild, begin < input.inputmask._valueGet().length ? begin : input.inputmask._valueGet().length),
                  range.setEnd(input.firstChild, end < input.inputmask._valueGet().length ? end : input.inputmask._valueGet().length),
                  range.collapse(!0);
                var sel = window.getSelection();
                sel.removeAllRanges(), sel.addRange(range);
              } else input.createTextRange && (range = input.createTextRange(), range.collapse(!0),
                range.moveEnd("character", end), range.moveStart("character", begin), range.select());
          }
        }
        function determineLastRequiredPosition(returnDefinition) {
          var inputmask = this, maskset = this.maskset, $ = this.dependencyLib, buffer = _validationTests.getMaskTemplate.call(this, !0, getLastValidPosition.call(this), !0, !0), bl = buffer.length, pos, lvp = getLastValidPosition.call(this), positions = {}, lvTest = maskset.validPositions[lvp], ndxIntlzr = void 0 !== lvTest ? lvTest.locator.slice() : void 0, testPos;
          for (pos = lvp + 1; pos < buffer.length; pos++) testPos = _validationTests.getTestTemplate.call(this, pos, ndxIntlzr, pos - 1),
            ndxIntlzr = testPos.locator.slice(), positions[pos] = $.extend(!0, {}, testPos);
          var lvTestAlt = lvTest && void 0 !== lvTest.alternation ? lvTest.locator[lvTest.alternation] : void 0;
          for (pos = bl - 1; lvp < pos && (testPos = positions[pos], (testPos.match.optionality || testPos.match.optionalQuantifier && testPos.match.newBlockMarker || lvTestAlt && (lvTestAlt !== positions[pos].locator[lvTest.alternation] && 1 != testPos.match.static || !0 === testPos.match.static && testPos.locator[lvTest.alternation] && _validation.checkAlternationMatch.call(this, testPos.locator[lvTest.alternation].toString().split(","), lvTestAlt.toString().split(",")) && "" !== _validationTests.getTests.call(this, pos)[0].def)) && buffer[pos] === _validationTests.getPlaceholder.call(this, pos, testPos.match)); pos--) bl--;
          return returnDefinition ? {
            l: bl,
            def: positions[bl] ? positions[bl].match : void 0
          } : bl;
        }
        function determineNewCaretPosition(selectedCaret, tabbed) {
          var inputmask = this, maskset = this.maskset, opts = this.opts;
          function doRadixFocus(clickPos) {
            if ("" !== opts.radixPoint && 0 !== opts.digits) {
              var vps = maskset.validPositions;
              if (void 0 === vps[clickPos] || vps[clickPos].input === _validationTests.getPlaceholder.call(inputmask, clickPos)) {
                if (clickPos < seekNext.call(inputmask, -1)) return !0;
                var radixPos = getBuffer.call(inputmask).indexOf(opts.radixPoint);
                if (-1 !== radixPos) {
                  for (var vp in vps) if (vps[vp] && radixPos < vp && vps[vp].input !== _validationTests.getPlaceholder.call(inputmask, vp)) return !1;
                  return !0;
                }
              }
            }
            return !1;
          }
          if (tabbed && (inputmask.isRTL ? selectedCaret.end = selectedCaret.begin : selectedCaret.begin = selectedCaret.end),
            selectedCaret.begin === selectedCaret.end) {
            switch (opts.positionCaretOnClick) {
              case "none":
                break;

              case "select":
                selectedCaret = {
                  begin: 0,
                  end: getBuffer.call(inputmask).length
                };
                break;

              case "ignore":
                selectedCaret.end = selectedCaret.begin = seekNext.call(inputmask, getLastValidPosition.call(inputmask));
                break;

              case "radixFocus":
                if (doRadixFocus(selectedCaret.begin)) {
                  var radixPos = getBuffer.call(inputmask).join("").indexOf(opts.radixPoint);
                  selectedCaret.end = selectedCaret.begin = opts.numericInput ? seekNext.call(inputmask, radixPos) : radixPos;
                  break;
                }

              default:
                var clickPosition = selectedCaret.begin, lvclickPosition = getLastValidPosition.call(inputmask, clickPosition, !0), lastPosition = seekNext.call(inputmask, -1 !== lvclickPosition || isMask.call(inputmask, 0) ? lvclickPosition : -1);
                if (clickPosition <= lastPosition) selectedCaret.end = selectedCaret.begin = isMask.call(inputmask, clickPosition, !1, !0) ? clickPosition : seekNext.call(inputmask, clickPosition); else {
                  var lvp = maskset.validPositions[lvclickPosition], tt = _validationTests.getTestTemplate.call(inputmask, lastPosition, lvp ? lvp.match.locator : void 0, lvp), placeholder = _validationTests.getPlaceholder.call(inputmask, lastPosition, tt.match);
                  if ("" !== placeholder && getBuffer.call(inputmask)[lastPosition] !== placeholder && !0 !== tt.match.optionalQuantifier && !0 !== tt.match.newBlockMarker || !isMask.call(inputmask, lastPosition, opts.keepStatic, !0) && tt.match.def === placeholder) {
                    var newPos = seekNext.call(inputmask, lastPosition);
                    (newPos <= clickPosition || clickPosition === lastPosition) && (lastPosition = newPos);
                  }
                  selectedCaret.end = selectedCaret.begin = lastPosition;
                }
            }
            return selectedCaret;
          }
        }
        function getBuffer(noCache) {
          var inputmask = this, maskset = this.maskset;
          return void 0 !== maskset.buffer && !0 !== noCache || (maskset.buffer = _validationTests.getMaskTemplate.call(this, !0, getLastValidPosition.call(this), !0),
            void 0 === maskset._buffer && (maskset._buffer = maskset.buffer.slice())), maskset.buffer;
        }
        function getBufferTemplate() {
          var inputmask = this, maskset = this.maskset;
          return void 0 === maskset._buffer && (maskset._buffer = _validationTests.getMaskTemplate.call(this, !1, 1),
            void 0 === maskset.buffer && (maskset.buffer = maskset._buffer.slice())), maskset._buffer;
        }
        function getLastValidPosition(closestTo, strict, validPositions) {
          var maskset = this.maskset, before = -1, after = -1, valids = validPositions || maskset.validPositions;
          for (var posNdx in void 0 === closestTo && (closestTo = -1), valids) {
            var psNdx = parseInt(posNdx);
            valids[psNdx] && (strict || !0 !== valids[psNdx].generatedInput) && (psNdx <= closestTo && (before = psNdx),
              closestTo <= psNdx && (after = psNdx));
          }
          return -1 === before || before == closestTo ? after : -1 == after ? before : closestTo - before < after - closestTo ? before : after;
        }
        function isMask(pos, strict, fuzzy) {
          var inputmask = this, maskset = this.maskset, test = _validationTests.getTestTemplate.call(this, pos).match;
          if ("" === test.def && (test = _validationTests.getTest.call(this, pos).match),
            !0 !== test.static) return test.fn;
          if (!0 === fuzzy && void 0 !== maskset.validPositions[pos] && !0 !== maskset.validPositions[pos].generatedInput) return !0;
          if (!0 !== strict && -1 < pos) {
            if (fuzzy) {
              var tests = _validationTests.getTests.call(this, pos);
              return tests.length > 1 + ("" === tests[tests.length - 1].match.def ? 1 : 0);
            }
            var testTemplate = _validationTests.determineTestTemplate.call(this, pos, _validationTests.getTests.call(this, pos)), testPlaceHolder = _validationTests.getPlaceholder.call(this, pos, testTemplate.match);
            return testTemplate.match.def !== testPlaceHolder;
          }
          return !1;
        }
        function resetMaskSet(soft) {
          var maskset = this.maskset;
          maskset.buffer = void 0, !0 !== soft && (maskset.validPositions = {}, maskset.p = 0);
        }
        function seekNext(pos, newBlock, fuzzy) {
          var inputmask = this;
          void 0 === fuzzy && (fuzzy = !0);
          for (var position = pos + 1; "" !== _validationTests.getTest.call(this, position).match.def && (!0 === newBlock && (!0 !== _validationTests.getTest.call(this, position).match.newBlockMarker || !isMask.call(this, position, void 0, !0)) || !0 !== newBlock && !isMask.call(this, position, void 0, fuzzy));) position++;
          return position;
        }
        function seekPrevious(pos, newBlock) {
          var inputmask = this, position = pos - 1;
          if (pos <= 0) return 0;
          for (; 0 < position && (!0 === newBlock && (!0 !== _validationTests.getTest.call(this, position).match.newBlockMarker || !isMask.call(this, position, void 0, !0)) || !0 !== newBlock && !isMask.call(this, position, void 0, !0));) position--;
          return position;
        }
        function translatePosition(pos) {
          var inputmask = this, opts = this.opts, el = this.el;
          return !this.isRTL || "number" != typeof pos || opts.greedy && "" === opts.placeholder || !el || (pos = Math.abs(this._valueGet().length - pos)),
            pos;
        }
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0, __webpack_require__(17), __webpack_require__(18);
        var _mask = __webpack_require__(11), _inputmask = _interopRequireDefault(__webpack_require__(10)), _window = _interopRequireDefault(__webpack_require__(5)), _maskLexer = __webpack_require__(21), _validationTests = __webpack_require__(3), _positioning = __webpack_require__(1), _validation = __webpack_require__(4), _inputHandling = __webpack_require__(7), _eventruler = __webpack_require__(12), _definitions = _interopRequireDefault(__webpack_require__(22)), _defaults = _interopRequireDefault(__webpack_require__(23)), _canUseDOM = _interopRequireDefault(__webpack_require__(6));
        function _typeof(obj) {
          return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function _typeof(obj) {
            return typeof obj;
          } : function _typeof(obj) {
            return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
          }, _typeof(obj);
        }
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var document = _window.default.document, dataKey = "_inputmask_opts";
        function Inputmask(alias, options, internal) {
          if (_canUseDOM.default) {
            if (!(this instanceof Inputmask)) return new Inputmask(alias, options, internal);
            this.dependencyLib = _inputmask.default, this.el = void 0, this.events = {}, this.maskset = void 0,
              !0 !== internal && ("[object Object]" === Object.prototype.toString.call(alias) ? options = alias : (options = options || {},
                alias && (options.alias = alias)), this.opts = _inputmask.default.extend(!0, {}, this.defaults, options),
                this.noMasksCache = options && void 0 !== options.definitions, this.userOptions = options || {},
                resolveAlias(this.opts.alias, options, this.opts)), this.refreshValue = !1, this.undoValue = void 0,
              this.$el = void 0, this.skipKeyPressEvent = !1, this.skipInputEvent = !1, this.validationEvent = !1,
              this.ignorable = !1, this.maxLength, this.mouseEnter = !1, this.originalPlaceholder = void 0,
              this.isComposing = !1;
          }
        }
        function resolveAlias(aliasStr, options, opts) {
          var aliasDefinition = Inputmask.prototype.aliases[aliasStr];
          return aliasDefinition ? (aliasDefinition.alias && resolveAlias(aliasDefinition.alias, void 0, opts),
            _inputmask.default.extend(!0, opts, aliasDefinition), _inputmask.default.extend(!0, opts, options),
            !0) : (null === opts.mask && (opts.mask = aliasStr), !1);
        }
        function importAttributeOptions(npt, opts, userOptions, dataAttribute) {
          function importOption(option, optionData) {
            var attrOption = "" === dataAttribute ? option : dataAttribute + "-" + option;
            optionData = void 0 !== optionData ? optionData : npt.getAttribute(attrOption),
              null !== optionData && ("string" == typeof optionData && (0 === option.indexOf("on") ? optionData = _window.default[optionData] : "false" === optionData ? optionData = !1 : "true" === optionData && (optionData = !0)),
                userOptions[option] = optionData);
          }
          if (!0 === opts.importDataAttributes) {
            var attrOptions = npt.getAttribute(dataAttribute), option, dataoptions, optionData, p;
            if (attrOptions && "" !== attrOptions && (attrOptions = attrOptions.replace(/'/g, '"'),
              dataoptions = JSON.parse("{" + attrOptions + "}")), dataoptions) for (p in optionData = void 0,
                dataoptions) if ("alias" === p.toLowerCase()) {
                  optionData = dataoptions[p];
                  break;
                }
            for (option in importOption("alias", optionData), userOptions.alias && resolveAlias(userOptions.alias, userOptions, opts),
              opts) {
              if (dataoptions) for (p in optionData = void 0, dataoptions) if (p.toLowerCase() === option.toLowerCase()) {
                optionData = dataoptions[p];
                break;
              }
              importOption(option, optionData);
            }
          }
          return _inputmask.default.extend(!0, opts, userOptions), "rtl" !== npt.dir && !opts.rightAlign || (npt.style.textAlign = "right"),
            "rtl" !== npt.dir && !opts.numericInput || (npt.dir = "ltr", npt.removeAttribute("dir"),
              opts.isRTL = !0), Object.keys(userOptions).length;
        }
        Inputmask.prototype = {
          dataAttribute: "data-inputmask",
          defaults: _defaults.default,
          definitions: _definitions.default,
          aliases: {},
          masksCache: {},
          get isRTL() {
            return this.opts.isRTL || this.opts.numericInput;
          },
          mask: function mask(elems) {
            var that = this;
            return "string" == typeof elems && (elems = document.getElementById(elems) || document.querySelectorAll(elems)),
              elems = elems.nodeName ? [elems] : Array.isArray(elems) ? elems : Array.from(elems),
              elems.forEach(function (el, ndx) {
                var scopedOpts = _inputmask.default.extend(!0, {}, that.opts);
                if (importAttributeOptions(el, scopedOpts, _inputmask.default.extend(!0, {}, that.userOptions), that.dataAttribute)) {
                  var maskset = (0, _maskLexer.generateMaskSet)(scopedOpts, that.noMasksCache);
                  void 0 !== maskset && (void 0 !== el.inputmask && (el.inputmask.opts.autoUnmask = !0,
                    el.inputmask.remove()), el.inputmask = new Inputmask(void 0, void 0, !0), el.inputmask.opts = scopedOpts,
                    el.inputmask.noMasksCache = that.noMasksCache, el.inputmask.userOptions = _inputmask.default.extend(!0, {}, that.userOptions),
                    el.inputmask.el = el, el.inputmask.$el = (0, _inputmask.default)(el), el.inputmask.maskset = maskset,
                    _inputmask.default.data(el, dataKey, that.userOptions), _mask.mask.call(el.inputmask));
                }
              }), elems && elems[0] && elems[0].inputmask || this;
          },
          option: function option(options, noremask) {
            return "string" == typeof options ? this.opts[options] : "object" === _typeof(options) ? (_inputmask.default.extend(this.userOptions, options),
              this.el && !0 !== noremask && this.mask(this.el), this) : void 0;
          },
          unmaskedvalue: function unmaskedvalue(value) {
            if (this.maskset = this.maskset || (0, _maskLexer.generateMaskSet)(this.opts, this.noMasksCache),
              void 0 === this.el || void 0 !== value) {
              var valueBuffer = ("function" == typeof this.opts.onBeforeMask && this.opts.onBeforeMask.call(this, value, this.opts) || value).split("");
              _inputHandling.checkVal.call(this, void 0, !1, !1, valueBuffer), "function" == typeof this.opts.onBeforeWrite && this.opts.onBeforeWrite.call(this, void 0, _positioning.getBuffer.call(this), 0, this.opts);
            }
            return _inputHandling.unmaskedvalue.call(this, this.el);
          },
          remove: function remove() {
            if (this.el) {
              _inputmask.default.data(this.el, dataKey, null);
              var cv = this.opts.autoUnmask ? (0, _inputHandling.unmaskedvalue)(this.el) : this._valueGet(this.opts.autoUnmask), valueProperty;
              cv !== _positioning.getBufferTemplate.call(this).join("") ? this._valueSet(cv, this.opts.autoUnmask) : this._valueSet(""),
                _eventruler.EventRuler.off(this.el), Object.getOwnPropertyDescriptor && Object.getPrototypeOf ? (valueProperty = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this.el), "value"),
                  valueProperty && this.__valueGet && Object.defineProperty(this.el, "value", {
                    get: this.__valueGet,
                    set: this.__valueSet,
                    configurable: !0
                  })) : document.__lookupGetter__ && this.el.__lookupGetter__("value") && this.__valueGet && (this.el.__defineGetter__("value", this.__valueGet),
                    this.el.__defineSetter__("value", this.__valueSet)), this.el.inputmask = void 0;
            }
            return this.el;
          },
          getemptymask: function getemptymask() {
            return this.maskset = this.maskset || (0, _maskLexer.generateMaskSet)(this.opts, this.noMasksCache),
              _positioning.getBufferTemplate.call(this).join("");
          },
          hasMaskedValue: function hasMaskedValue() {
            return !this.opts.autoUnmask;
          },
          isComplete: function isComplete() {
            return this.maskset = this.maskset || (0, _maskLexer.generateMaskSet)(this.opts, this.noMasksCache),
              _validation.isComplete.call(this, _positioning.getBuffer.call(this));
          },
          getmetadata: function getmetadata() {
            if (this.maskset = this.maskset || (0, _maskLexer.generateMaskSet)(this.opts, this.noMasksCache),
              Array.isArray(this.maskset.metadata)) {
              var maskTarget = _validationTests.getMaskTemplate.call(this, !0, 0, !1).join("");
              return this.maskset.metadata.forEach(function (mtdt) {
                return mtdt.mask !== maskTarget || (maskTarget = mtdt, !1);
              }), maskTarget;
            }
            return this.maskset.metadata;
          },
          isValid: function isValid(value) {
            if (this.maskset = this.maskset || (0, _maskLexer.generateMaskSet)(this.opts, this.noMasksCache),
              value) {
              var valueBuffer = ("function" == typeof this.opts.onBeforeMask && this.opts.onBeforeMask.call(this, value, this.opts) || value).split("");
              _inputHandling.checkVal.call(this, void 0, !0, !1, valueBuffer);
            } else value = this.isRTL ? _positioning.getBuffer.call(this).slice().reverse().join("") : _positioning.getBuffer.call(this).join("");
            for (var buffer = _positioning.getBuffer.call(this), rl = _positioning.determineLastRequiredPosition.call(this), lmib = buffer.length - 1; rl < lmib && !_positioning.isMask.call(this, lmib); lmib--);
            return buffer.splice(rl, lmib + 1 - rl), _validation.isComplete.call(this, buffer) && value === (this.isRTL ? _positioning.getBuffer.call(this).slice().reverse().join("") : _positioning.getBuffer.call(this).join(""));
          },
          format: function format(value, metadata) {
            this.maskset = this.maskset || (0, _maskLexer.generateMaskSet)(this.opts, this.noMasksCache);
            var valueBuffer = ("function" == typeof this.opts.onBeforeMask && this.opts.onBeforeMask.call(this, value, this.opts) || value).split("");
            _inputHandling.checkVal.call(this, void 0, !0, !1, valueBuffer);
            var formattedValue = this.isRTL ? _positioning.getBuffer.call(this).slice().reverse().join("") : _positioning.getBuffer.call(this).join("");
            return metadata ? {
              value: formattedValue,
              metadata: this.getmetadata()
            } : formattedValue;
          },
          setValue: function setValue(value) {
            this.el && (0, _inputmask.default)(this.el).trigger("setvalue", [value]);
          },
          analyseMask: _maskLexer.analyseMask
        }, Inputmask.extendDefaults = function (options) {
          _inputmask.default.extend(!0, Inputmask.prototype.defaults, options);
        }, Inputmask.extendDefinitions = function (definition) {
          _inputmask.default.extend(!0, Inputmask.prototype.definitions, definition);
        }, Inputmask.extendAliases = function (alias) {
          _inputmask.default.extend(!0, Inputmask.prototype.aliases, alias);
        }, Inputmask.format = function (value, options, metadata) {
          return Inputmask(options).format(value, metadata);
        }, Inputmask.unmask = function (value, options) {
          return Inputmask(options).unmaskedvalue(value);
        }, Inputmask.isValid = function (value, options) {
          return Inputmask(options).isValid(value);
        }, Inputmask.remove = function (elems) {
          "string" == typeof elems && (elems = document.getElementById(elems) || document.querySelectorAll(elems)),
            elems = elems.nodeName ? [elems] : elems, elems.forEach(function (el) {
              el.inputmask && el.inputmask.remove();
            });
        }, Inputmask.setValue = function (elems, value) {
          "string" == typeof elems && (elems = document.getElementById(elems) || document.querySelectorAll(elems)),
            elems = elems.nodeName ? [elems] : elems, elems.forEach(function (el) {
              el.inputmask ? el.inputmask.setValue(value) : (0, _inputmask.default)(el).trigger("setvalue", [value]);
            });
        }, Inputmask.dependencyLib = _inputmask.default, _window.default.Inputmask = Inputmask;
        var _default = Inputmask;
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        function getLocator(tst, align) {
          var locator = (null != tst.alternation ? tst.mloc[getDecisionTaker(tst)] : tst.locator).join("");
          if ("" !== locator) for (; locator.length < align;) locator += "0";
          return locator;
        }
        function getDecisionTaker(tst) {
          var decisionTaker = tst.locator[tst.alternation];
          return "string" == typeof decisionTaker && 0 < decisionTaker.length && (decisionTaker = decisionTaker.split(",")[0]),
            void 0 !== decisionTaker ? decisionTaker.toString() : "";
        }
        function getPlaceholder(pos, test, returnPL) {
          var inputmask = this, opts = this.opts, maskset = this.maskset;
          if (test = test || getTest.call(this, pos).match, void 0 !== test.placeholder || !0 === returnPL) return "function" == typeof test.placeholder ? test.placeholder(opts) : test.placeholder;
          if (!0 !== test.static) return opts.placeholder.charAt(pos % opts.placeholder.length);
          if (-1 < pos && void 0 === maskset.validPositions[pos]) {
            var tests = getTests.call(this, pos), staticAlternations = [], prevTest;
            if (tests.length > 1 + ("" === tests[tests.length - 1].match.def ? 1 : 0)) for (var i = 0; i < tests.length; i++) if ("" !== tests[i].match.def && !0 !== tests[i].match.optionality && !0 !== tests[i].match.optionalQuantifier && (!0 === tests[i].match.static || void 0 === prevTest || !1 !== tests[i].match.fn.test(prevTest.match.def, maskset, pos, !0, opts)) && (staticAlternations.push(tests[i]),
              !0 === tests[i].match.static && (prevTest = tests[i]), 1 < staticAlternations.length && /[0-9a-bA-Z]/.test(staticAlternations[0].match.def))) return opts.placeholder.charAt(pos % opts.placeholder.length);
          }
          return test.def;
        }
        function getMaskTemplate(baseOnInput, minimalPos, includeMode, noJit, clearOptionalTail) {
          var inputmask = this, opts = this.opts, maskset = this.maskset, greedy = opts.greedy;
          clearOptionalTail && (opts.greedy = !1), minimalPos = minimalPos || 0;
          var maskTemplate = [], ndxIntlzr, pos = 0, test, testPos, jitRenderStatic;
          do {
            if (!0 === baseOnInput && maskset.validPositions[pos]) testPos = clearOptionalTail && !0 === maskset.validPositions[pos].match.optionality && void 0 === maskset.validPositions[pos + 1] && (!0 === maskset.validPositions[pos].generatedInput || maskset.validPositions[pos].input == opts.skipOptionalPartCharacter && 0 < pos) ? determineTestTemplate.call(this, pos, getTests.call(this, pos, ndxIntlzr, pos - 1)) : maskset.validPositions[pos],
              test = testPos.match, ndxIntlzr = testPos.locator.slice(), maskTemplate.push(!0 === includeMode ? testPos.input : !1 === includeMode ? test.nativeDef : getPlaceholder.call(this, pos, test)); else {
              testPos = getTestTemplate.call(this, pos, ndxIntlzr, pos - 1), test = testPos.match,
                ndxIntlzr = testPos.locator.slice();
              var jitMasking = !0 !== noJit && (!1 !== opts.jitMasking ? opts.jitMasking : test.jit);
              jitRenderStatic = jitRenderStatic && test.static && test.def !== opts.groupSeparator && null === test.fn || maskset.validPositions[pos - 1] && test.static && test.def !== opts.groupSeparator && null === test.fn,
                jitRenderStatic || !1 === jitMasking || void 0 === jitMasking || "number" == typeof jitMasking && isFinite(jitMasking) && pos < jitMasking ? maskTemplate.push(!1 === includeMode ? test.nativeDef : getPlaceholder.call(this, pos, test)) : jitRenderStatic = !1;
            }
            pos++;
          } while ((void 0 === this.maxLength || pos < this.maxLength) && (!0 !== test.static || "" !== test.def) || pos < minimalPos);
          return "" === maskTemplate[maskTemplate.length - 1] && maskTemplate.pop(), !1 === includeMode && void 0 !== maskset.maskLength || (maskset.maskLength = pos - 1),
            opts.greedy = greedy, maskTemplate;
        }
        function getTestTemplate(pos, ndxIntlzr, tstPs) {
          var inputmask = this, maskset = this.maskset;
          return maskset.validPositions[pos] || determineTestTemplate.call(this, pos, getTests.call(this, pos, ndxIntlzr ? ndxIntlzr.slice() : ndxIntlzr, tstPs));
        }
        function determineTestTemplate(pos, tests) {
          var inputmask = this, opts = this.opts;
          pos = 0 < pos ? pos - 1 : 0;
          for (var altTest = getTest.call(this, pos), targetLocator = getLocator(altTest), tstLocator, closest, bestMatch, ndx = 0; ndx < tests.length; ndx++) {
            var tst = tests[ndx];
            tstLocator = getLocator(tst, targetLocator.length);
            var distance = Math.abs(tstLocator - targetLocator);
            (void 0 === closest || "" !== tstLocator && distance < closest || bestMatch && !opts.greedy && bestMatch.match.optionality && "master" === bestMatch.match.newBlockMarker && (!tst.match.optionality || !tst.match.newBlockMarker) || bestMatch && bestMatch.match.optionalQuantifier && !tst.match.optionalQuantifier) && (closest = distance,
              bestMatch = tst);
          }
          return bestMatch;
        }
        function getTest(pos, tests) {
          var inputmask = this, maskset = this.maskset;
          return maskset.validPositions[pos] ? maskset.validPositions[pos] : (tests || getTests.call(this, pos))[0];
        }
        function getTests(pos, ndxIntlzr, tstPs) {
          var inputmask = this, $ = this.dependencyLib, maskset = this.maskset, opts = this.opts, el = this.el, maskTokens = maskset.maskToken, testPos = ndxIntlzr ? tstPs : 0, ndxInitializer = ndxIntlzr ? ndxIntlzr.slice() : [0], matches = [], insertStop = !1, latestMatch, cacheDependency = ndxIntlzr ? ndxIntlzr.join("") : "";
          function resolveTestFromToken(maskToken, ndxInitializer, loopNdx, quantifierRecurse) {
            function handleMatch(match, loopNdx, quantifierRecurse) {
              function isFirstMatch(latestMatch, tokenGroup) {
                var firstMatch = 0 === tokenGroup.matches.indexOf(latestMatch);
                return firstMatch || tokenGroup.matches.every(function (match, ndx) {
                  return !0 === match.isQuantifier ? firstMatch = isFirstMatch(latestMatch, tokenGroup.matches[ndx - 1]) : Object.prototype.hasOwnProperty.call(match, "matches") && (firstMatch = isFirstMatch(latestMatch, match)),
                    !firstMatch;
                }), firstMatch;
              }
              function resolveNdxInitializer(pos, alternateNdx, targetAlternation) {
                var bestMatch, indexPos;
                if ((maskset.tests[pos] || maskset.validPositions[pos]) && (maskset.tests[pos] || [maskset.validPositions[pos]]).every(function (lmnt, ndx) {
                  if (lmnt.mloc[alternateNdx]) return bestMatch = lmnt, !1;
                  var alternation = void 0 !== targetAlternation ? targetAlternation : lmnt.alternation, ndxPos = void 0 !== lmnt.locator[alternation] ? lmnt.locator[alternation].toString().indexOf(alternateNdx) : -1;
                  return (void 0 === indexPos || ndxPos < indexPos) && -1 !== ndxPos && (bestMatch = lmnt,
                    indexPos = ndxPos), !0;
                }), bestMatch) {
                  var bestMatchAltIndex = bestMatch.locator[bestMatch.alternation], locator = bestMatch.mloc[alternateNdx] || bestMatch.mloc[bestMatchAltIndex] || bestMatch.locator;
                  return locator.slice((void 0 !== targetAlternation ? targetAlternation : bestMatch.alternation) + 1);
                }
                return void 0 !== targetAlternation ? resolveNdxInitializer(pos, alternateNdx) : void 0;
              }
              function isSubsetOf(source, target) {
                function expand(pattern) {
                  for (var expanded = [], start = -1, end, i = 0, l = pattern.length; i < l; i++) if ("-" === pattern.charAt(i)) for (end = pattern.charCodeAt(i + 1); ++start < end;) expanded.push(String.fromCharCode(start)); else start = pattern.charCodeAt(i),
                    expanded.push(pattern.charAt(i));
                  return expanded.join("");
                }
                return source.match.def === target.match.nativeDef || !(!(opts.regex || source.match.fn instanceof RegExp && target.match.fn instanceof RegExp) || !0 === source.match.static || !0 === target.match.static) && -1 !== expand(target.match.fn.toString().replace(/[[\]/]/g, "")).indexOf(expand(source.match.fn.toString().replace(/[[\]/]/g, "")));
              }
              function staticCanMatchDefinition(source, target) {
                return !0 === source.match.static && !0 !== target.match.static && target.match.fn.test(source.match.def, maskset, pos, !1, opts, !1);
              }
              function setMergeLocators(targetMatch, altMatch) {
                var alternationNdx = targetMatch.alternation, shouldMerge = void 0 === altMatch || alternationNdx === altMatch.alternation && -1 === targetMatch.locator[alternationNdx].toString().indexOf(altMatch.locator[alternationNdx]);
                if (!shouldMerge && alternationNdx > altMatch.alternation) for (var i = altMatch.alternation; i < alternationNdx; i++) if (targetMatch.locator[i] !== altMatch.locator[i]) {
                  alternationNdx = i, shouldMerge = !0;
                  break;
                }
                if (shouldMerge) {
                  targetMatch.mloc = targetMatch.mloc || {};
                  var locNdx = targetMatch.locator[alternationNdx];
                  if (void 0 !== locNdx) {
                    if ("string" == typeof locNdx && (locNdx = locNdx.split(",")[0]), void 0 === targetMatch.mloc[locNdx] && (targetMatch.mloc[locNdx] = targetMatch.locator.slice()),
                      void 0 !== altMatch) {
                      for (var ndx in altMatch.mloc) "string" == typeof ndx && (ndx = ndx.split(",")[0]),
                        void 0 === targetMatch.mloc[ndx] && (targetMatch.mloc[ndx] = altMatch.mloc[ndx]);
                      targetMatch.locator[alternationNdx] = Object.keys(targetMatch.mloc).join(",");
                    }
                    return !0;
                  }
                  targetMatch.alternation = void 0;
                }
                return !1;
              }
              function isSameLevel(targetMatch, altMatch) {
                if (targetMatch.locator.length !== altMatch.locator.length) return !1;
                for (var locNdx = targetMatch.alternation + 1; locNdx < targetMatch.locator.length; locNdx++) if (targetMatch.locator[locNdx] !== altMatch.locator[locNdx]) return !1;
                return !0;
              }
              if (testPos > pos + opts._maxTestPos) throw "Inputmask: There is probably an error in your mask definition or in the code. Create an issue on github with an example of the mask you are using. " + maskset.mask;
              if (testPos === pos && void 0 === match.matches) return matches.push({
                match: match,
                locator: loopNdx.reverse(),
                cd: cacheDependency,
                mloc: {}
              }), !0;
              if (void 0 !== match.matches) {
                if (match.isGroup && quantifierRecurse !== match) {
                  if (match = handleMatch(maskToken.matches[maskToken.matches.indexOf(match) + 1], loopNdx, quantifierRecurse),
                    match) return !0;
                } else if (match.isOptional) {
                  var optionalToken = match, mtchsNdx = matches.length;
                  if (match = resolveTestFromToken(match, ndxInitializer, loopNdx, quantifierRecurse),
                    match) {
                    if (matches.forEach(function (mtch, ndx) {
                      mtchsNdx <= ndx && (mtch.match.optionality = !0);
                    }), latestMatch = matches[matches.length - 1].match, void 0 !== quantifierRecurse || !isFirstMatch(latestMatch, optionalToken)) return !0;
                    insertStop = !0, testPos = pos;
                  }
                } else if (match.isAlternator) {
                  var alternateToken = match, malternateMatches = [], maltMatches, currentMatches = matches.slice(), loopNdxCnt = loopNdx.length, altIndex = 0 < ndxInitializer.length ? ndxInitializer.shift() : -1;
                  if (-1 === altIndex || "string" == typeof altIndex) {
                    var currentPos = testPos, ndxInitializerClone = ndxInitializer.slice(), altIndexArr = [], amndx;
                    if ("string" == typeof altIndex) altIndexArr = altIndex.split(","); else for (amndx = 0; amndx < alternateToken.matches.length; amndx++) altIndexArr.push(amndx.toString());
                    if (void 0 !== maskset.excludes[pos]) {
                      for (var altIndexArrClone = altIndexArr.slice(), i = 0, exl = maskset.excludes[pos].length; i < exl; i++) {
                        var excludeSet = maskset.excludes[pos][i].toString().split(":");
                        loopNdx.length == excludeSet[1] && altIndexArr.splice(altIndexArr.indexOf(excludeSet[0]), 1);
                      }
                      0 === altIndexArr.length && (delete maskset.excludes[pos], altIndexArr = altIndexArrClone);
                    }
                    (!0 === opts.keepStatic || isFinite(parseInt(opts.keepStatic)) && currentPos >= opts.keepStatic) && (altIndexArr = altIndexArr.slice(0, 1));
                    for (var unMatchedAlternation = !1, ndx = 0; ndx < altIndexArr.length; ndx++) {
                      amndx = parseInt(altIndexArr[ndx]), matches = [], ndxInitializer = "string" == typeof altIndex && resolveNdxInitializer(testPos, amndx, loopNdxCnt) || ndxInitializerClone.slice(),
                        alternateToken.matches[amndx] && handleMatch(alternateToken.matches[amndx], [amndx].concat(loopNdx), quantifierRecurse) ? match = !0 : 0 === ndx && (unMatchedAlternation = !0),
                        maltMatches = matches.slice(), testPos = currentPos, matches = [];
                      for (var ndx1 = 0; ndx1 < maltMatches.length; ndx1++) {
                        var altMatch = maltMatches[ndx1], dropMatch = !1;
                        altMatch.match.jit = altMatch.match.jit || unMatchedAlternation, altMatch.alternation = altMatch.alternation || loopNdxCnt,
                          setMergeLocators(altMatch);
                        for (var ndx2 = 0; ndx2 < malternateMatches.length; ndx2++) {
                          var altMatch2 = malternateMatches[ndx2];
                          if ("string" != typeof altIndex || void 0 !== altMatch.alternation && altIndexArr.includes(altMatch.locator[altMatch.alternation].toString())) {
                            if (altMatch.match.nativeDef === altMatch2.match.nativeDef) {
                              dropMatch = !0, setMergeLocators(altMatch2, altMatch);
                              break;
                            }
                            if (isSubsetOf(altMatch, altMatch2)) {
                              setMergeLocators(altMatch, altMatch2) && (dropMatch = !0, malternateMatches.splice(malternateMatches.indexOf(altMatch2), 0, altMatch));
                              break;
                            }
                            if (isSubsetOf(altMatch2, altMatch)) {
                              setMergeLocators(altMatch2, altMatch);
                              break;
                            }
                            if (staticCanMatchDefinition(altMatch, altMatch2)) {
                              isSameLevel(altMatch, altMatch2) || void 0 !== el.inputmask.userOptions.keepStatic ? setMergeLocators(altMatch, altMatch2) && (dropMatch = !0,
                                malternateMatches.splice(malternateMatches.indexOf(altMatch2), 0, altMatch)) : opts.keepStatic = !0;
                              break;
                            }
                          }
                        }
                        dropMatch || malternateMatches.push(altMatch);
                      }
                    }
                    matches = currentMatches.concat(malternateMatches), testPos = pos, insertStop = 0 < matches.length,
                      match = 0 < malternateMatches.length, ndxInitializer = ndxInitializerClone.slice();
                  } else match = handleMatch(alternateToken.matches[altIndex] || maskToken.matches[altIndex], [altIndex].concat(loopNdx), quantifierRecurse);
                  if (match) return !0;
                } else if (match.isQuantifier && quantifierRecurse !== maskToken.matches[maskToken.matches.indexOf(match) - 1]) for (var qt = match, qndx = 0 < ndxInitializer.length ? ndxInitializer.shift() : 0; qndx < (isNaN(qt.quantifier.max) ? qndx + 1 : qt.quantifier.max) && testPos <= pos; qndx++) {
                  var tokenGroup = maskToken.matches[maskToken.matches.indexOf(qt) - 1];
                  if (match = handleMatch(tokenGroup, [qndx].concat(loopNdx), tokenGroup), match) {
                    if (latestMatch = matches[matches.length - 1].match, latestMatch.optionalQuantifier = qndx >= qt.quantifier.min,
                      latestMatch.jit = (qndx || 1) * tokenGroup.matches.indexOf(latestMatch) >= qt.quantifier.jit,
                      latestMatch.optionalQuantifier && isFirstMatch(latestMatch, tokenGroup)) {
                      insertStop = !0, testPos = pos;
                      break;
                    }
                    return latestMatch.jit && (maskset.jitOffset[pos] = tokenGroup.matches.length - tokenGroup.matches.indexOf(latestMatch)),
                      !0;
                  }
                } else if (match = resolveTestFromToken(match, ndxInitializer, loopNdx, quantifierRecurse),
                  match) return !0;
              } else testPos++;
            }
            for (var tndx = 0 < ndxInitializer.length ? ndxInitializer.shift() : 0; tndx < maskToken.matches.length; tndx++) if (!0 !== maskToken.matches[tndx].isQuantifier) {
              var match = handleMatch(maskToken.matches[tndx], [tndx].concat(loopNdx), quantifierRecurse);
              if (match && testPos === pos) return match;
              if (pos < testPos) break;
            }
          }
          function mergeLocators(pos, tests) {
            var locator = [], alternation;
            return Array.isArray(tests) || (tests = [tests]), 0 < tests.length && (void 0 === tests[0].alternation || !0 === opts.keepStatic ? (locator = determineTestTemplate.call(inputmask, pos, tests.slice()).locator.slice(),
              0 === locator.length && (locator = tests[0].locator.slice())) : tests.forEach(function (tst) {
                "" !== tst.def && (0 === locator.length ? (alternation = tst.alternation, locator = tst.locator.slice()) : tst.locator[alternation] && -1 === locator[alternation].toString().indexOf(tst.locator[alternation]) && (locator[alternation] += "," + tst.locator[alternation]));
              })), locator;
          }
          if (-1 < pos && (void 0 === inputmask.maxLength || pos < inputmask.maxLength)) {
            if (void 0 === ndxIntlzr) {
              for (var previousPos = pos - 1, test; void 0 === (test = maskset.validPositions[previousPos] || maskset.tests[previousPos]) && -1 < previousPos;) previousPos--;
              void 0 !== test && -1 < previousPos && (ndxInitializer = mergeLocators(previousPos, test),
                cacheDependency = ndxInitializer.join(""), testPos = previousPos);
            }
            if (maskset.tests[pos] && maskset.tests[pos][0].cd === cacheDependency) return maskset.tests[pos];
            for (var mtndx = ndxInitializer.shift(); mtndx < maskTokens.length; mtndx++) {
              var match = resolveTestFromToken(maskTokens[mtndx], ndxInitializer, [mtndx]);
              if (match && testPos === pos || pos < testPos) break;
            }
          }
          return 0 !== matches.length && !insertStop || matches.push({
            match: {
              fn: null,
              static: !0,
              optionality: !1,
              casing: null,
              def: "",
              placeholder: ""
            },
            locator: [],
            mloc: {},
            cd: cacheDependency
          }), void 0 !== ndxIntlzr && maskset.tests[pos] ? $.extend(!0, [], matches) : (maskset.tests[pos] = $.extend(!0, [], matches),
            maskset.tests[pos]);
        }
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.determineTestTemplate = determineTestTemplate, exports.getDecisionTaker = getDecisionTaker,
          exports.getMaskTemplate = getMaskTemplate, exports.getPlaceholder = getPlaceholder,
          exports.getTest = getTest, exports.getTests = getTests, exports.getTestTemplate = getTestTemplate;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.alternate = alternate, exports.checkAlternationMatch = checkAlternationMatch,
          exports.isComplete = isComplete, exports.isValid = isValid, exports.refreshFromBuffer = refreshFromBuffer,
          exports.revalidateMask = revalidateMask, exports.handleRemove = handleRemove;
        var _validationTests = __webpack_require__(3), _keycode = _interopRequireDefault(__webpack_require__(0)), _positioning = __webpack_require__(1), _eventhandlers = __webpack_require__(8);
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        function alternate(maskPos, c, strict, fromIsValid, rAltPos, selection) {
          var inputmask = this, $ = this.dependencyLib, opts = this.opts, maskset = this.maskset, validPsClone = $.extend(!0, {}, maskset.validPositions), tstClone = $.extend(!0, {}, maskset.tests), lastAlt, alternation, isValidRslt = !1, returnRslt = !1, altPos, prevAltPos, i, validPos, decisionPos, lAltPos = void 0 !== rAltPos ? rAltPos : _positioning.getLastValidPosition.call(this), nextPos, input, begin, end;
          if (selection && (begin = selection.begin, end = selection.end, selection.begin > selection.end && (begin = selection.end,
            end = selection.begin)), -1 === lAltPos && void 0 === rAltPos) lastAlt = 0, prevAltPos = _validationTests.getTest.call(this, lastAlt),
              alternation = prevAltPos.alternation; else for (; 0 <= lAltPos; lAltPos--) if (altPos = maskset.validPositions[lAltPos],
                altPos && void 0 !== altPos.alternation) {
                if (prevAltPos && prevAltPos.locator[altPos.alternation] !== altPos.locator[altPos.alternation]) break;
                lastAlt = lAltPos, alternation = maskset.validPositions[lastAlt].alternation, prevAltPos = altPos;
              }
          if (void 0 !== alternation) {
            decisionPos = parseInt(lastAlt), maskset.excludes[decisionPos] = maskset.excludes[decisionPos] || [],
              !0 !== maskPos && maskset.excludes[decisionPos].push((0, _validationTests.getDecisionTaker)(prevAltPos) + ":" + prevAltPos.alternation);
            var validInputs = [], resultPos = -1;
            for (i = decisionPos; i < _positioning.getLastValidPosition.call(this, void 0, !0) + 1; i++) -1 === resultPos && maskPos <= i && void 0 !== c && (validInputs.push(c),
              resultPos = validInputs.length - 1), validPos = maskset.validPositions[i], validPos && !0 !== validPos.generatedInput && (void 0 === selection || i < begin || end <= i) && validInputs.push(validPos.input),
              delete maskset.validPositions[i];
            for (-1 === resultPos && void 0 !== c && (validInputs.push(c), resultPos = validInputs.length - 1); void 0 !== maskset.excludes[decisionPos] && maskset.excludes[decisionPos].length < 10;) {
              for (maskset.tests = {}, _positioning.resetMaskSet.call(this, !0), isValidRslt = !0,
                i = 0; i < validInputs.length && (nextPos = isValidRslt.caret || _positioning.getLastValidPosition.call(this, void 0, !0) + 1,
                  input = validInputs[i], isValidRslt = isValid.call(this, nextPos, input, !1, fromIsValid, !0)); i++) i === resultPos && (returnRslt = isValidRslt),
                    1 == maskPos && isValidRslt && (returnRslt = {
                      caretPos: i
                    });
              if (isValidRslt) break;
              if (_positioning.resetMaskSet.call(this), prevAltPos = _validationTests.getTest.call(this, decisionPos),
                maskset.validPositions = $.extend(!0, {}, validPsClone), maskset.tests = $.extend(!0, {}, tstClone),
                !maskset.excludes[decisionPos]) {
                returnRslt = alternate.call(this, maskPos, c, strict, fromIsValid, decisionPos - 1, selection);
                break;
              }
              var decisionTaker = (0, _validationTests.getDecisionTaker)(prevAltPos);
              if (-1 !== maskset.excludes[decisionPos].indexOf(decisionTaker + ":" + prevAltPos.alternation)) {
                returnRslt = alternate.call(this, maskPos, c, strict, fromIsValid, decisionPos - 1, selection);
                break;
              }
              for (maskset.excludes[decisionPos].push(decisionTaker + ":" + prevAltPos.alternation),
                i = decisionPos; i < _positioning.getLastValidPosition.call(this, void 0, !0) + 1; i++) delete maskset.validPositions[i];
            }
          }
          return returnRslt && !1 === opts.keepStatic || delete maskset.excludes[decisionPos],
            returnRslt;
        }
        function casing(elem, test, pos) {
          var opts = this.opts, maskset = this.maskset;
          switch (opts.casing || test.casing) {
            case "upper":
              elem = elem.toUpperCase();
              break;

            case "lower":
              elem = elem.toLowerCase();
              break;

            case "title":
              var posBefore = maskset.validPositions[pos - 1];
              elem = 0 === pos || posBefore && posBefore.input === String.fromCharCode(_keycode.default.SPACE) ? elem.toUpperCase() : elem.toLowerCase();
              break;

            default:
              if ("function" == typeof opts.casing) {
                var args = Array.prototype.slice.call(arguments);
                args.push(maskset.validPositions), elem = opts.casing.apply(this, args);
              }
          }
          return elem;
        }
        function checkAlternationMatch(altArr1, altArr2, na) {
          for (var opts = this.opts, altArrC = opts.greedy ? altArr2 : altArr2.slice(0, 1), isMatch = !1, naArr = void 0 !== na ? na.split(",") : [], naNdx, i = 0; i < naArr.length; i++) -1 !== (naNdx = altArr1.indexOf(naArr[i])) && altArr1.splice(naNdx, 1);
          for (var alndx = 0; alndx < altArr1.length; alndx++) if (altArrC.includes(altArr1[alndx])) {
            isMatch = !0;
            break;
          }
          return isMatch;
        }
        function handleRemove(input, k, pos, strict, fromIsValid) {
          var inputmask = this, maskset = this.maskset, opts = this.opts;
          if ((opts.numericInput || this.isRTL) && (k === _keycode.default.BACKSPACE ? k = _keycode.default.DELETE : k === _keycode.default.DELETE && (k = _keycode.default.BACKSPACE),
            this.isRTL)) {
            var pend = pos.end;
            pos.end = pos.begin, pos.begin = pend;
          }
          var lvp = _positioning.getLastValidPosition.call(this, void 0, !0), offset;
          if (pos.end >= _positioning.getBuffer.call(this).length && lvp >= pos.end && (pos.end = lvp + 1),
            k === _keycode.default.BACKSPACE ? pos.end - pos.begin < 1 && (pos.begin = _positioning.seekPrevious.call(this, pos.begin)) : k === _keycode.default.DELETE && pos.begin === pos.end && (pos.end = _positioning.isMask.call(this, pos.end, !0, !0) ? pos.end + 1 : _positioning.seekNext.call(this, pos.end) + 1),
            !1 !== (offset = revalidateMask.call(this, pos))) {
            if (!0 !== strict && !1 !== opts.keepStatic || null !== opts.regex && -1 !== _validationTests.getTest.call(this, pos.begin).match.def.indexOf("|")) {
              var result = alternate.call(this, !0);
              if (result) {
                var newPos = void 0 !== result.caret ? result.caret : result.pos ? _positioning.seekNext.call(this, result.pos.begin ? result.pos.begin : result.pos) : _positioning.getLastValidPosition.call(this, -1, !0);
                (k !== _keycode.default.DELETE || pos.begin > newPos) && pos.begin;
              }
            }
            !0 !== strict && (maskset.p = k === _keycode.default.DELETE ? pos.begin + offset : pos.begin);
          }
        }
        function isComplete(buffer) {
          var inputmask = this, opts = this.opts, maskset = this.maskset;
          if ("function" == typeof opts.isComplete) return opts.isComplete(buffer, opts);
          if ("*" !== opts.repeat) {
            var complete = !1, lrp = _positioning.determineLastRequiredPosition.call(this, !0), aml = _positioning.seekPrevious.call(this, lrp.l);
            if (void 0 === lrp.def || lrp.def.newBlockMarker || lrp.def.optionality || lrp.def.optionalQuantifier) {
              complete = !0;
              for (var i = 0; i <= aml; i++) {
                var test = _validationTests.getTestTemplate.call(this, i).match;
                if (!0 !== test.static && void 0 === maskset.validPositions[i] && !0 !== test.optionality && !0 !== test.optionalQuantifier || !0 === test.static && buffer[i] !== _validationTests.getPlaceholder.call(this, i, test)) {
                  complete = !1;
                  break;
                }
              }
            }
            return complete;
          }
        }
        function isValid(pos, c, strict, fromIsValid, fromAlternate, validateOnly, fromCheckval) {
          var inputmask = this, $ = this.dependencyLib, opts = this.opts, el = inputmask.el, maskset = inputmask.maskset;
          function isSelection(posObj) {
            return inputmask.isRTL ? 1 < posObj.begin - posObj.end || posObj.begin - posObj.end == 1 : 1 < posObj.end - posObj.begin || posObj.end - posObj.begin == 1;
          }
          strict = !0 === strict;
          var maskPos = pos;
          function processCommandObject(commandObj) {
            if (void 0 !== commandObj) {
              if (void 0 !== commandObj.remove && (Array.isArray(commandObj.remove) || (commandObj.remove = [commandObj.remove]),
                commandObj.remove.sort(function (a, b) {
                  return b.pos - a.pos;
                }).forEach(function (lmnt) {
                  revalidateMask.call(inputmask, {
                    begin: lmnt,
                    end: lmnt + 1
                  });
                }), commandObj.remove = void 0), void 0 !== commandObj.insert && (Array.isArray(commandObj.insert) || (commandObj.insert = [commandObj.insert]),
                  commandObj.insert.sort(function (a, b) {
                    return a.pos - b.pos;
                  }).forEach(function (lmnt) {
                    "" !== lmnt.c && isValid.call(inputmask, lmnt.pos, lmnt.c, void 0 === lmnt.strict || lmnt.strict, void 0 !== lmnt.fromIsValid ? lmnt.fromIsValid : fromIsValid);
                  }), commandObj.insert = void 0), commandObj.refreshFromBuffer && commandObj.buffer) {
                var refresh = commandObj.refreshFromBuffer;
                refreshFromBuffer.call(inputmask, !0 === refresh ? refresh : refresh.start, refresh.end, commandObj.buffer),
                  commandObj.refreshFromBuffer = void 0;
              }
              void 0 !== commandObj.rewritePosition && (maskPos = commandObj.rewritePosition,
                commandObj = !0);
            }
            return commandObj;
          }
          function _isValid(position, c, strict) {
            var rslt = !1;
            return _validationTests.getTests.call(inputmask, position).every(function (tst, ndx) {
              var test = tst.match;
              if (_positioning.getBuffer.call(inputmask, !0), rslt = null != test.fn ? test.fn.test(c, maskset, position, strict, opts, isSelection(pos)) : (c === test.def || c === opts.skipOptionalPartCharacter) && "" !== test.def && {
                c: _validationTests.getPlaceholder.call(inputmask, position, test, !0) || test.def,
                pos: position
              }, !1 === rslt) return !0;
              var elem = void 0 !== rslt.c ? rslt.c : c, validatedPos = position;
              return elem = elem === opts.skipOptionalPartCharacter && !0 === test.static ? _validationTests.getPlaceholder.call(inputmask, position, test, !0) || test.def : elem,
                rslt = processCommandObject(rslt), !0 !== rslt && void 0 !== rslt.pos && rslt.pos !== position && (validatedPos = rslt.pos),
                !0 !== rslt && void 0 === rslt.pos && void 0 === rslt.c || !1 === revalidateMask.call(inputmask, pos, $.extend({}, tst, {
                  input: casing.call(inputmask, elem, test, validatedPos)
                }), fromIsValid, validatedPos) && (rslt = !1), !1;
            }), rslt;
          }
          void 0 !== pos.begin && (maskPos = inputmask.isRTL ? pos.end : pos.begin);
          var result = !0, positionsClone = $.extend(!0, {}, maskset.validPositions);
          if (!1 === opts.keepStatic && void 0 !== maskset.excludes[maskPos] && !0 !== fromAlternate && !0 !== fromIsValid) for (var i = maskPos; i < (inputmask.isRTL ? pos.begin : pos.end); i++) void 0 !== maskset.excludes[i] && (maskset.excludes[i] = void 0,
            delete maskset.tests[i]);
          if ("function" == typeof opts.preValidation && !0 !== fromIsValid && !0 !== validateOnly && (result = opts.preValidation.call(inputmask, _positioning.getBuffer.call(inputmask), maskPos, c, isSelection(pos), opts, maskset, pos, strict || fromAlternate),
            result = processCommandObject(result)), !0 === result) {
            if (void 0 === inputmask.maxLength || maskPos < _positioning.translatePosition.call(inputmask, inputmask.maxLength)) {
              if (result = _isValid(maskPos, c, strict), (!strict || !0 === fromIsValid) && !1 === result && !0 !== validateOnly) {
                var currentPosValid = maskset.validPositions[maskPos];
                if (!currentPosValid || !0 !== currentPosValid.match.static || currentPosValid.match.def !== c && c !== opts.skipOptionalPartCharacter) {
                  if (opts.insertMode || void 0 === maskset.validPositions[_positioning.seekNext.call(inputmask, maskPos)] || pos.end > maskPos) {
                    var skip = !1;
                    if (maskset.jitOffset[maskPos] && void 0 === maskset.validPositions[_positioning.seekNext.call(inputmask, maskPos)] && (result = isValid.call(inputmask, maskPos + maskset.jitOffset[maskPos], c, !0),
                      !1 !== result && (!0 !== fromAlternate && (result.caret = maskPos), skip = !0)),
                      pos.end > maskPos && (maskset.validPositions[maskPos] = void 0), !skip && !_positioning.isMask.call(inputmask, maskPos, opts.keepStatic && 0 === maskPos)) for (var nPos = maskPos + 1, snPos = _positioning.seekNext.call(inputmask, maskPos, !1, 0 !== maskPos); nPos <= snPos; nPos++) if (result = _isValid(nPos, c, strict),
                        !1 !== result) {
                        result = trackbackPositions.call(inputmask, maskPos, void 0 !== result.pos ? result.pos : nPos) || result,
                          maskPos = nPos;
                        break;
                      }
                  }
                } else result = {
                  caret: _positioning.seekNext.call(inputmask, maskPos)
                };
              }
            } else result = !1;
            !1 !== result || !opts.keepStatic || !isComplete.call(inputmask, _positioning.getBuffer.call(inputmask)) && 0 !== maskPos || strict || !0 === fromAlternate ? isSelection(pos) && maskset.tests[maskPos] && 1 < maskset.tests[maskPos].length && opts.keepStatic && !strict && !0 !== fromAlternate && (result = alternate.call(inputmask, !0)) : result = alternate.call(inputmask, maskPos, c, strict, fromIsValid, void 0, pos),
              !0 === result && (result = {
                pos: maskPos
              });
          }
          if ("function" == typeof opts.postValidation && !0 !== fromIsValid && !0 !== validateOnly) {
            var postResult = opts.postValidation.call(inputmask, _positioning.getBuffer.call(inputmask, !0), void 0 !== pos.begin ? inputmask.isRTL ? pos.end : pos.begin : pos, c, result, opts, maskset, strict, fromCheckval);
            void 0 !== postResult && (result = !0 === postResult ? result : postResult);
          }
          result && void 0 === result.pos && (result.pos = maskPos), !1 === result || !0 === validateOnly ? (_positioning.resetMaskSet.call(inputmask, !0),
            maskset.validPositions = $.extend(!0, {}, positionsClone)) : trackbackPositions.call(inputmask, void 0, maskPos, !0);
          var endResult = processCommandObject(result);
          return endResult;
        }
        function positionCanMatchDefinition(pos, testDefinition, opts) {
          for (var inputmask = this, maskset = this.maskset, valid = !1, tests = _validationTests.getTests.call(this, pos), tndx = 0; tndx < tests.length; tndx++) {
            if (tests[tndx].match && (!(tests[tndx].match.nativeDef !== testDefinition.match[opts.shiftPositions ? "def" : "nativeDef"] || opts.shiftPositions && testDefinition.match.static) || tests[tndx].match.nativeDef === testDefinition.match.nativeDef)) {
              valid = !0;
              break;
            }
            if (tests[tndx].match && tests[tndx].match.def === testDefinition.match.nativeDef) {
              valid = void 0;
              break;
            }
          }
          return !1 === valid && void 0 !== maskset.jitOffset[pos] && (valid = positionCanMatchDefinition.call(this, pos + maskset.jitOffset[pos], testDefinition, opts)),
            valid;
        }
        function refreshFromBuffer(start, end, buffer) {
          var inputmask = this, maskset = this.maskset, opts = this.opts, $ = this.dependencyLib, el = this.el, i, p, skipOptionalPartCharacter = opts.skipOptionalPartCharacter, bffr = this.isRTL ? buffer.slice().reverse() : buffer;
          if (opts.skipOptionalPartCharacter = "", !0 === start) _positioning.resetMaskSet.call(this),
            maskset.tests = {}, start = 0, end = buffer.length, p = _positioning.determineNewCaretPosition.call(this, {
              begin: 0,
              end: 0
            }, !1).begin; else {
            for (i = start; i < end; i++) delete maskset.validPositions[i];
            p = start;
          }
          var keypress = new $.Event("keypress");
          for (i = start; i < end; i++) {
            keypress.which = bffr[i].toString().charCodeAt(0), this.ignorable = !1;
            var valResult = _eventhandlers.EventHandlers.keypressEvent.call(el, keypress, !0, !1, !1, p);
            !1 !== valResult && (p = valResult.forwardPosition);
          }
          opts.skipOptionalPartCharacter = skipOptionalPartCharacter;
        }
        function trackbackPositions(originalPos, newPos, fillOnly) {
          var inputmask = this, maskset = this.maskset, $ = this.dependencyLib;
          if (void 0 === originalPos) for (originalPos = newPos - 1; 0 < originalPos && !maskset.validPositions[originalPos]; originalPos--);
          for (var ps = originalPos; ps < newPos; ps++) if (void 0 === maskset.validPositions[ps] && !_positioning.isMask.call(this, ps, !0)) {
            var vp = 0 == ps ? _validationTests.getTest.call(this, ps) : maskset.validPositions[ps - 1];
            if (vp) {
              var tests = _validationTests.getTests.call(this, ps).slice();
              "" === tests[tests.length - 1].match.def && tests.pop();
              var bestMatch = _validationTests.determineTestTemplate.call(this, ps, tests), np;
              if (bestMatch && (!0 !== bestMatch.match.jit || "master" === bestMatch.match.newBlockMarker && (np = maskset.validPositions[ps + 1]) && !0 === np.match.optionalQuantifier) && (bestMatch = $.extend({}, bestMatch, {
                input: _validationTests.getPlaceholder.call(this, ps, bestMatch.match, !0) || bestMatch.match.def
              }), bestMatch.generatedInput = !0, revalidateMask.call(this, ps, bestMatch, !0),
                !0 !== fillOnly)) {
                var cvpInput = maskset.validPositions[newPos].input;
                return maskset.validPositions[newPos] = void 0, isValid.call(this, newPos, cvpInput, !0, !0);
              }
            }
          }
        }
        function revalidateMask(pos, validTest, fromIsValid, validatedPos) {
          var inputmask = this, maskset = this.maskset, opts = this.opts, $ = this.dependencyLib;
          function IsEnclosedStatic(pos, valids, selection) {
            var posMatch = valids[pos];
            if (void 0 === posMatch || !0 !== posMatch.match.static || !0 === posMatch.match.optionality || void 0 !== valids[0] && void 0 !== valids[0].alternation) return !1;
            var prevMatch = selection.begin <= pos - 1 ? valids[pos - 1] && !0 === valids[pos - 1].match.static && valids[pos - 1] : valids[pos - 1], nextMatch = selection.end > pos + 1 ? valids[pos + 1] && !0 === valids[pos + 1].match.static && valids[pos + 1] : valids[pos + 1];
            return prevMatch && nextMatch;
          }
          var offset = 0, begin = void 0 !== pos.begin ? pos.begin : pos, end = void 0 !== pos.end ? pos.end : pos;
          if (pos.begin > pos.end && (begin = pos.end, end = pos.begin), validatedPos = void 0 !== validatedPos ? validatedPos : begin,
            begin !== end || opts.insertMode && void 0 !== maskset.validPositions[validatedPos] && void 0 === fromIsValid || void 0 === validTest) {
            var positionsClone = $.extend(!0, {}, maskset.validPositions), lvp = _positioning.getLastValidPosition.call(this, void 0, !0), i;
            for (maskset.p = begin, i = lvp; begin <= i; i--) delete maskset.validPositions[i],
              void 0 === validTest && delete maskset.tests[i + 1];
            var valid = !0, j = validatedPos, posMatch = j, t, canMatch;
            for (validTest && (maskset.validPositions[validatedPos] = $.extend(!0, {}, validTest),
              posMatch++, j++), i = validTest ? end : end - 1; i <= lvp; i++) {
              if (void 0 !== (t = positionsClone[i]) && !0 !== t.generatedInput && (end <= i || begin <= i && IsEnclosedStatic(i, positionsClone, {
                begin: begin,
                end: end
              }))) {
                for (; "" !== _validationTests.getTest.call(this, posMatch).match.def;) {
                  if (!1 !== (canMatch = positionCanMatchDefinition.call(this, posMatch, t, opts)) || "+" === t.match.def) {
                    "+" === t.match.def && _positioning.getBuffer.call(this, !0);
                    var result = isValid.call(this, posMatch, t.input, "+" !== t.match.def, "+" !== t.match.def);
                    if (valid = !1 !== result, j = (result.pos || posMatch) + 1, !valid && canMatch) break;
                  } else valid = !1;
                  if (valid) {
                    void 0 === validTest && t.match.static && i === pos.begin && offset++;
                    break;
                  }
                  if (!valid && posMatch > maskset.maskLength) break;
                  posMatch++;
                }
                "" == _validationTests.getTest.call(this, posMatch).match.def && (valid = !1), posMatch = j;
              }
              if (!valid) break;
            }
            if (!valid) return maskset.validPositions = $.extend(!0, {}, positionsClone), _positioning.resetMaskSet.call(this, !0),
              !1;
          } else validTest && _validationTests.getTest.call(this, validatedPos).match.cd === validTest.match.cd && (maskset.validPositions[validatedPos] = $.extend(!0, {}, validTest));
          return _positioning.resetMaskSet.call(this, !0), offset;
        }
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0;
        var _canUseDOM = _interopRequireDefault(__webpack_require__(6));
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var _default = _canUseDOM.default ? window : {};
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0;
        var canUseDOM = !("undefined" == typeof window || !window.document || !window.document.createElement), _default = canUseDOM;
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.applyInputValue = applyInputValue, exports.clearOptionalTail = clearOptionalTail,
          exports.checkVal = checkVal, exports.HandleNativePlaceholder = HandleNativePlaceholder,
          exports.unmaskedvalue = unmaskedvalue, exports.writeBuffer = writeBuffer;
        var _keycode = _interopRequireDefault(__webpack_require__(0)), _validationTests = __webpack_require__(3), _positioning = __webpack_require__(1), _validation = __webpack_require__(4), _environment = __webpack_require__(9), _eventhandlers = __webpack_require__(8);
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        function applyInputValue(input, value) {
          var inputmask = input ? input.inputmask : this, opts = inputmask.opts;
          input.inputmask.refreshValue = !1, "function" == typeof opts.onBeforeMask && (value = opts.onBeforeMask.call(inputmask, value, opts) || value),
            value = value.toString().split(""), checkVal(input, !0, !1, value), inputmask.undoValue = _positioning.getBuffer.call(inputmask).join(""),
            (opts.clearMaskOnLostFocus || opts.clearIncomplete) && input.inputmask._valueGet() === _positioning.getBufferTemplate.call(inputmask).join("") && -1 === _positioning.getLastValidPosition.call(inputmask) && input.inputmask._valueSet("");
        }
        function clearOptionalTail(buffer) {
          var inputmask = this;
          buffer.length = 0;
          for (var template = _validationTests.getMaskTemplate.call(this, !0, 0, !0, void 0, !0), lmnt; void 0 !== (lmnt = template.shift());) buffer.push(lmnt);
          return buffer;
        }
        function checkVal(input, writeOut, strict, nptvl, initiatingEvent) {
          var inputmask = input ? input.inputmask : this, maskset = inputmask.maskset, opts = inputmask.opts, $ = inputmask.dependencyLib, inputValue = nptvl.slice(), charCodes = "", initialNdx = -1, result = void 0, skipOptionalPartCharacter = opts.skipOptionalPartCharacter;
          function isTemplateMatch(ndx, charCodes) {
            for (var targetTemplate = _validationTests.getMaskTemplate.call(inputmask, !0, 0).slice(ndx, _positioning.seekNext.call(inputmask, ndx, !1, !1)).join("").replace(/'/g, ""), charCodeNdx = targetTemplate.indexOf(charCodes); 0 < charCodeNdx && " " === targetTemplate[charCodeNdx - 1];) charCodeNdx--;
            var match = 0 === charCodeNdx && !_positioning.isMask.call(inputmask, ndx) && (_validationTests.getTest.call(inputmask, ndx).match.nativeDef === charCodes.charAt(0) || !0 === _validationTests.getTest.call(inputmask, ndx).match.static && _validationTests.getTest.call(inputmask, ndx).match.nativeDef === "'" + charCodes.charAt(0) || " " === _validationTests.getTest.call(inputmask, ndx).match.nativeDef && (_validationTests.getTest.call(inputmask, ndx + 1).match.nativeDef === charCodes.charAt(0) || !0 === _validationTests.getTest.call(inputmask, ndx + 1).match.static && _validationTests.getTest.call(inputmask, ndx + 1).match.nativeDef === "'" + charCodes.charAt(0)));
            if (!match && 0 < charCodeNdx && !_positioning.isMask.call(inputmask, ndx, !1, !0)) {
              var nextPos = _positioning.seekNext.call(inputmask, ndx);
              inputmask.caretPos.begin < nextPos && (inputmask.caretPos = {
                begin: nextPos
              });
            }
            return match;
          }
          opts.skipOptionalPartCharacter = "", _positioning.resetMaskSet.call(inputmask),
            maskset.tests = {}, initialNdx = opts.radixPoint ? _positioning.determineNewCaretPosition.call(inputmask, {
              begin: 0,
              end: 0
            }).begin : 0, maskset.p = initialNdx, inputmask.caretPos = {
              begin: initialNdx
            };
          var staticMatches = [], prevCaretPos = inputmask.caretPos;
          if (inputValue.forEach(function (charCode, ndx) {
            if (void 0 !== charCode) if (void 0 === maskset.validPositions[ndx] && inputValue[ndx] === _validationTests.getPlaceholder.call(inputmask, ndx) && _positioning.isMask.call(inputmask, ndx, !0) && !1 === _validation.isValid.call(inputmask, ndx, inputValue[ndx], !0, void 0, void 0, !0)) maskset.p++; else {
              var keypress = new $.Event("_checkval");
              keypress.which = charCode.toString().charCodeAt(0), charCodes += charCode;
              var lvp = _positioning.getLastValidPosition.call(inputmask, void 0, !0);
              isTemplateMatch(initialNdx, charCodes) ? result = _eventhandlers.EventHandlers.keypressEvent.call(inputmask, keypress, !0, !1, strict, lvp + 1) : (result = _eventhandlers.EventHandlers.keypressEvent.call(inputmask, keypress, !0, !1, strict, inputmask.caretPos.begin),
                result && (initialNdx = inputmask.caretPos.begin + 1, charCodes = "")), result ? (void 0 !== result.pos && maskset.validPositions[result.pos] && !0 === maskset.validPositions[result.pos].match.static && void 0 === maskset.validPositions[result.pos].alternation && (staticMatches.push(result.pos),
                  inputmask.isRTL || (result.forwardPosition = result.pos + 1)), writeBuffer.call(inputmask, void 0, _positioning.getBuffer.call(inputmask), result.forwardPosition, keypress, !1),
                  inputmask.caretPos = {
                    begin: result.forwardPosition,
                    end: result.forwardPosition
                  }, prevCaretPos = inputmask.caretPos) : inputmask.caretPos = prevCaretPos;
            }
          }), 0 < staticMatches.length) {
            var sndx, validPos, nextValid = _positioning.seekNext.call(inputmask, -1, void 0, !1);
            if (!_validation.isComplete.call(inputmask, _positioning.getBuffer.call(inputmask)) && staticMatches.length <= nextValid || _validation.isComplete.call(inputmask, _positioning.getBuffer.call(inputmask)) && 0 < staticMatches.length && staticMatches.length !== nextValid && 0 === staticMatches[0]) for (var nextSndx = nextValid; void 0 !== (sndx = staticMatches.shift());) {
              var keypress = new $.Event("_checkval");
              if (validPos = maskset.validPositions[sndx], validPos.generatedInput = !0, keypress.which = validPos.input.charCodeAt(0),
                result = _eventhandlers.EventHandlers.keypressEvent.call(inputmask, keypress, !0, !1, strict, nextSndx),
                result && void 0 !== result.pos && result.pos !== sndx && maskset.validPositions[result.pos] && !0 === maskset.validPositions[result.pos].match.static) staticMatches.push(result.pos); else if (!result) break;
              nextSndx++;
            }
          }
          writeOut && writeBuffer.call(inputmask, input, _positioning.getBuffer.call(inputmask), result ? result.forwardPosition : inputmask.caretPos.begin, initiatingEvent || new $.Event("checkval"), initiatingEvent && "input" === initiatingEvent.type && inputmask.undoValue !== _positioning.getBuffer.call(inputmask).join("")),
            opts.skipOptionalPartCharacter = skipOptionalPartCharacter;
        }
        function HandleNativePlaceholder(npt, value) {
          var inputmask = npt ? npt.inputmask : this;
          if (_environment.ie) {
            if (npt.inputmask._valueGet() !== value && (npt.placeholder !== value || "" === npt.placeholder)) {
              var buffer = _positioning.getBuffer.call(inputmask).slice(), nptValue = npt.inputmask._valueGet();
              if (nptValue !== value) {
                var lvp = _positioning.getLastValidPosition.call(inputmask);
                -1 === lvp && nptValue === _positioning.getBufferTemplate.call(inputmask).join("") ? buffer = [] : -1 !== lvp && clearOptionalTail.call(inputmask, buffer),
                  writeBuffer(npt, buffer);
              }
            }
          } else npt.placeholder !== value && (npt.placeholder = value, "" === npt.placeholder && npt.removeAttribute("placeholder"));
        }
        function unmaskedvalue(input) {
          var inputmask = input ? input.inputmask : this, opts = inputmask.opts, maskset = inputmask.maskset;
          if (input) {
            if (void 0 === input.inputmask) return input.value;
            input.inputmask && input.inputmask.refreshValue && applyInputValue(input, input.inputmask._valueGet(!0));
          }
          var umValue = [], vps = maskset.validPositions;
          for (var pndx in vps) vps[pndx] && vps[pndx].match && (1 != vps[pndx].match.static || Array.isArray(maskset.metadata) && !0 !== vps[pndx].generatedInput) && umValue.push(vps[pndx].input);
          var unmaskedValue = 0 === umValue.length ? "" : (inputmask.isRTL ? umValue.reverse() : umValue).join("");
          if ("function" == typeof opts.onUnMask) {
            var bufferValue = (inputmask.isRTL ? _positioning.getBuffer.call(inputmask).slice().reverse() : _positioning.getBuffer.call(inputmask)).join("");
            unmaskedValue = opts.onUnMask.call(inputmask, bufferValue, unmaskedValue, opts);
          }
          return unmaskedValue;
        }
        function writeBuffer(input, buffer, caretPos, event, triggerEvents) {
          var inputmask = input ? input.inputmask : this, opts = inputmask.opts, $ = inputmask.dependencyLib;
          if (event && "function" == typeof opts.onBeforeWrite) {
            var result = opts.onBeforeWrite.call(inputmask, event, buffer, caretPos, opts);
            if (result) {
              if (result.refreshFromBuffer) {
                var refresh = result.refreshFromBuffer;
                _validation.refreshFromBuffer.call(inputmask, !0 === refresh ? refresh : refresh.start, refresh.end, result.buffer || buffer),
                  buffer = _positioning.getBuffer.call(inputmask, !0);
              }
              void 0 !== caretPos && (caretPos = void 0 !== result.caret ? result.caret : caretPos);
            }
          }
          if (void 0 !== input && (input.inputmask._valueSet(buffer.join("")), void 0 === caretPos || void 0 !== event && "blur" === event.type || _positioning.caret.call(inputmask, input, caretPos, void 0, void 0, void 0 !== event && "keydown" === event.type && (event.keyCode === _keycode.default.DELETE || event.keyCode === _keycode.default.BACKSPACE)),
            !0 === triggerEvents)) {
            var $input = $(input), nptVal = input.inputmask._valueGet();
            input.inputmask.skipInputEvent = !0, $input.trigger("input"), setTimeout(function () {
              nptVal === _positioning.getBufferTemplate.call(inputmask).join("") ? $input.trigger("cleared") : !0 === _validation.isComplete.call(inputmask, buffer) && $input.trigger("complete");
            }, 0);
          }
        }
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.EventHandlers = void 0;
        var _positioning = __webpack_require__(1), _keycode = _interopRequireDefault(__webpack_require__(0)), _environment = __webpack_require__(9), _validation = __webpack_require__(4), _inputHandling = __webpack_require__(7), _validationTests = __webpack_require__(3);
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var EventHandlers = {
          keydownEvent: function keydownEvent(e) {
            var inputmask = this.inputmask, opts = inputmask.opts, $ = inputmask.dependencyLib, maskset = inputmask.maskset, input = this, $input = $(input), k = e.keyCode, pos = _positioning.caret.call(inputmask, input), kdResult = opts.onKeyDown.call(this, e, _positioning.getBuffer.call(inputmask), pos, opts);
            if (void 0 !== kdResult) return kdResult;
            if (k === _keycode.default.BACKSPACE || k === _keycode.default.DELETE || _environment.iphone && k === _keycode.default.BACKSPACE_SAFARI || e.ctrlKey && k === _keycode.default.X && !("oncut" in input)) e.preventDefault(),
              _validation.handleRemove.call(inputmask, input, k, pos), (0, _inputHandling.writeBuffer)(input, _positioning.getBuffer.call(inputmask, !0), maskset.p, e, input.inputmask._valueGet() !== _positioning.getBuffer.call(inputmask).join("")); else if (k === _keycode.default.END || k === _keycode.default.PAGE_DOWN) {
                e.preventDefault();
                var caretPos = _positioning.seekNext.call(inputmask, _positioning.getLastValidPosition.call(inputmask));
                _positioning.caret.call(inputmask, input, e.shiftKey ? pos.begin : caretPos, caretPos, !0);
              } else k === _keycode.default.HOME && !e.shiftKey || k === _keycode.default.PAGE_UP ? (e.preventDefault(),
                _positioning.caret.call(inputmask, input, 0, e.shiftKey ? pos.begin : 0, !0)) : (opts.undoOnEscape && k === _keycode.default.ESCAPE || 90 === k && e.ctrlKey) && !0 !== e.altKey ? ((0,
                  _inputHandling.checkVal)(input, !0, !1, inputmask.undoValue.split("")), $input.trigger("click")) : !0 === opts.tabThrough && k === _keycode.default.TAB ? !0 === e.shiftKey ? (pos.end = _positioning.seekPrevious.call(inputmask, pos.end, !0),
                    !0 === _validationTests.getTest.call(inputmask, pos.end - 1).match.static && pos.end--,
                    pos.begin = _positioning.seekPrevious.call(inputmask, pos.end, !0), 0 <= pos.begin && 0 < pos.end && (e.preventDefault(),
                      _positioning.caret.call(inputmask, input, pos.begin, pos.end))) : (pos.begin = _positioning.seekNext.call(inputmask, pos.begin, !0),
                        pos.end = _positioning.seekNext.call(inputmask, pos.begin, !0), pos.end < maskset.maskLength && pos.end--,
                        pos.begin <= maskset.maskLength && (e.preventDefault(), _positioning.caret.call(inputmask, input, pos.begin, pos.end))) : e.shiftKey || opts.insertModeVisual && !1 === opts.insertMode && (k === _keycode.default.RIGHT ? setTimeout(function () {
                          var caretPos = _positioning.caret.call(inputmask, input);
                          _positioning.caret.call(inputmask, input, caretPos.begin);
                        }, 0) : k === _keycode.default.LEFT && setTimeout(function () {
                          var caretPos_begin = _positioning.translatePosition.call(inputmask, input.inputmask.caretPos.begin), caretPos_end = _positioning.translatePosition.call(inputmask, input.inputmask.caretPos.end);
                          inputmask.isRTL ? _positioning.caret.call(inputmask, input, caretPos_begin + (caretPos_begin === maskset.maskLength ? 0 : 1)) : _positioning.caret.call(inputmask, input, caretPos_begin - (0 === caretPos_begin ? 0 : 1));
                        }, 0));
            inputmask.ignorable = opts.ignorables.includes(k);
          },
          keypressEvent: function keypressEvent(e, checkval, writeOut, strict, ndx) {
            var inputmask = this.inputmask || this, opts = inputmask.opts, $ = inputmask.dependencyLib, maskset = inputmask.maskset, input = inputmask.el, $input = $(input), k = e.which || e.charCode || e.keyCode;
            if (!(!0 === checkval || e.ctrlKey && e.altKey) && (e.ctrlKey || e.metaKey || inputmask.ignorable)) return k === _keycode.default.ENTER && inputmask.undoValue !== _positioning.getBuffer.call(inputmask).join("") && (inputmask.undoValue = _positioning.getBuffer.call(inputmask).join(""),
              setTimeout(function () {
                $input.trigger("change");
              }, 0)), inputmask.skipInputEvent = !0, !0;
            if (k) {
              44 !== k && 46 !== k || 3 !== e.location || "" === opts.radixPoint || (k = opts.radixPoint.charCodeAt(0));
              var pos = checkval ? {
                begin: ndx,
                end: ndx
              } : _positioning.caret.call(inputmask, input), forwardPosition, c = String.fromCharCode(k);
              maskset.writeOutBuffer = !0;
              var valResult = _validation.isValid.call(inputmask, pos, c, strict, void 0, void 0, void 0, checkval);
              if (!1 !== valResult && (_positioning.resetMaskSet.call(inputmask, !0), forwardPosition = void 0 !== valResult.caret ? valResult.caret : _positioning.seekNext.call(inputmask, valResult.pos.begin ? valResult.pos.begin : valResult.pos),
                maskset.p = forwardPosition), forwardPosition = opts.numericInput && void 0 === valResult.caret ? _positioning.seekPrevious.call(inputmask, forwardPosition) : forwardPosition,
                !1 !== writeOut && (setTimeout(function () {
                  opts.onKeyValidation.call(input, k, valResult);
                }, 0), maskset.writeOutBuffer && !1 !== valResult)) {
                var buffer = _positioning.getBuffer.call(inputmask);
                (0, _inputHandling.writeBuffer)(input, buffer, forwardPosition, e, !0 !== checkval);
              }
              if (e.preventDefault(), checkval) return !1 !== valResult && (valResult.forwardPosition = forwardPosition),
                valResult;
            }
          },
          keyupEvent: function keyupEvent(e) {
            var inputmask = this.inputmask;
            !inputmask.isComposing || e.keyCode !== _keycode.default.KEY_229 && e.keyCode !== _keycode.default.ENTER || inputmask.$el.trigger("input");
          },
          pasteEvent: function pasteEvent(e) {
            var inputmask = this.inputmask, opts = inputmask.opts, input = this, inputValue = inputmask._valueGet(!0), caretPos = _positioning.caret.call(inputmask, this), tempValue;
            inputmask.isRTL && (tempValue = caretPos.end, caretPos.end = caretPos.begin, caretPos.begin = tempValue);
            var valueBeforeCaret = inputValue.substr(0, caretPos.begin), valueAfterCaret = inputValue.substr(caretPos.end, inputValue.length);
            if (valueBeforeCaret == (inputmask.isRTL ? _positioning.getBufferTemplate.call(inputmask).slice().reverse() : _positioning.getBufferTemplate.call(inputmask)).slice(0, caretPos.begin).join("") && (valueBeforeCaret = ""),
              valueAfterCaret == (inputmask.isRTL ? _positioning.getBufferTemplate.call(inputmask).slice().reverse() : _positioning.getBufferTemplate.call(inputmask)).slice(caretPos.end).join("") && (valueAfterCaret = ""),
              window.clipboardData && window.clipboardData.getData) inputValue = valueBeforeCaret + window.clipboardData.getData("Text") + valueAfterCaret; else {
              if (!e.clipboardData || !e.clipboardData.getData) return !0;
              inputValue = valueBeforeCaret + e.clipboardData.getData("text/plain") + valueAfterCaret;
            }
            var pasteValue = inputValue;
            if ("function" == typeof opts.onBeforePaste) {
              if (pasteValue = opts.onBeforePaste.call(inputmask, inputValue, opts), !1 === pasteValue) return e.preventDefault();
              pasteValue = pasteValue || inputValue;
            }
            return (0, _inputHandling.checkVal)(this, !0, !1, pasteValue.toString().split(""), e),
              e.preventDefault();
          },
          inputFallBackEvent: function inputFallBackEvent(e) {
            var inputmask = this.inputmask, opts = inputmask.opts, $ = inputmask.dependencyLib;
            function ieMobileHandler(input, inputValue, caretPos) {
              if (_environment.iemobile) {
                var inputChar = inputValue.replace(_positioning.getBuffer.call(inputmask).join(""), "");
                if (1 === inputChar.length) {
                  var iv = inputValue.split("");
                  iv.splice(caretPos.begin, 0, inputChar), inputValue = iv.join("");
                }
              }
              return inputValue;
            }
            function analyseChanges(inputValue, buffer, caretPos) {
              for (var frontPart = inputValue.substr(0, caretPos.begin).split(""), backPart = inputValue.substr(caretPos.begin).split(""), frontBufferPart = buffer.substr(0, caretPos.begin).split(""), backBufferPart = buffer.substr(caretPos.begin).split(""), fpl = frontPart.length >= frontBufferPart.length ? frontPart.length : frontBufferPart.length, bpl = backPart.length >= backBufferPart.length ? backPart.length : backBufferPart.length, bl, i, action = "", data = [], marker = "~", placeholder; frontPart.length < fpl;) frontPart.push("~");
              for (; frontBufferPart.length < fpl;) frontBufferPart.push("~");
              for (; backPart.length < bpl;) backPart.unshift("~");
              for (; backBufferPart.length < bpl;) backBufferPart.unshift("~");
              var newBuffer = frontPart.concat(backPart), oldBuffer = frontBufferPart.concat(backBufferPart);
              for (i = 0, bl = newBuffer.length; i < bl; i++) switch (placeholder = _validationTests.getPlaceholder.call(inputmask, _positioning.translatePosition.call(inputmask, i)),
                action) {
                  case "insertText":
                    oldBuffer[i - 1] === newBuffer[i] && caretPos.begin == newBuffer.length - 1 && data.push(newBuffer[i]),
                      i = bl;
                    break;

                  case "insertReplacementText":
                    "~" === newBuffer[i] ? caretPos.end++ : i = bl;
                    break;

                  case "deleteContentBackward":
                    "~" === newBuffer[i] ? caretPos.end++ : i = bl;
                    break;

                  default:
                    newBuffer[i] !== oldBuffer[i] && ("~" !== newBuffer[i + 1] && newBuffer[i + 1] !== placeholder && void 0 !== newBuffer[i + 1] || (oldBuffer[i] !== placeholder || "~" !== oldBuffer[i + 1]) && "~" !== oldBuffer[i] ? "~" === oldBuffer[i + 1] && oldBuffer[i] === newBuffer[i + 1] ? (action = "insertText",
                      data.push(newBuffer[i]), caretPos.begin--, caretPos.end--) : newBuffer[i] !== placeholder && "~" !== newBuffer[i] && ("~" === newBuffer[i + 1] || oldBuffer[i] !== newBuffer[i] && oldBuffer[i + 1] === newBuffer[i + 1]) ? (action = "insertReplacementText",
                        data.push(newBuffer[i]), caretPos.begin--) : "~" === newBuffer[i] ? (action = "deleteContentBackward",
                          !_positioning.isMask.call(inputmask, _positioning.translatePosition.call(inputmask, i), !0) && oldBuffer[i] !== opts.radixPoint || caretPos.end++) : i = bl : (action = "insertText",
                            data.push(newBuffer[i]), caretPos.begin--, caretPos.end--));
                    break;
                }
              return {
                action: action,
                data: data,
                caret: caretPos
              };
            }
            var input = this, inputValue = input.inputmask._valueGet(!0), buffer = (inputmask.isRTL ? _positioning.getBuffer.call(inputmask).slice().reverse() : _positioning.getBuffer.call(inputmask)).join(""), caretPos = _positioning.caret.call(inputmask, input, void 0, void 0, !0);
            if (buffer !== inputValue) {
              inputValue = ieMobileHandler(input, inputValue, caretPos);
              var changes = analyseChanges(inputValue, buffer, caretPos);
              switch ((input.inputmask.shadowRoot || document).activeElement !== input && input.focus(),
              (0, _inputHandling.writeBuffer)(input, _positioning.getBuffer.call(inputmask)),
              _positioning.caret.call(inputmask, input, caretPos.begin, caretPos.end, !0), changes.action) {
                case "insertText":
                case "insertReplacementText":
                  changes.data.forEach(function (entry, ndx) {
                    var keypress = new $.Event("keypress");
                    keypress.which = entry.charCodeAt(0), inputmask.ignorable = !1, EventHandlers.keypressEvent.call(input, keypress);
                  }), setTimeout(function () {
                    inputmask.$el.trigger("keyup");
                  }, 0);
                  break;

                case "deleteContentBackward":
                  var keydown = new $.Event("keydown");
                  keydown.keyCode = _keycode.default.BACKSPACE, EventHandlers.keydownEvent.call(input, keydown);
                  break;

                default:
                  (0, _inputHandling.applyInputValue)(input, inputValue);
                  break;
              }
              e.preventDefault();
            }
          },
          compositionendEvent: function compositionendEvent(e) {
            var inputmask = this.inputmask;
            inputmask.isComposing = !1, inputmask.$el.trigger("input");
          },
          setValueEvent: function setValueEvent(e, argument_1, argument_2) {
            var inputmask = this.inputmask, input = this, value = e && e.detail ? e.detail[0] : argument_1;
            void 0 === value && (value = this.inputmask._valueGet(!0)), (0, _inputHandling.applyInputValue)(this, value),
              (e.detail && void 0 !== e.detail[1] || void 0 !== argument_2) && _positioning.caret.call(inputmask, this, e.detail ? e.detail[1] : argument_2);
          },
          focusEvent: function focusEvent(e) {
            var inputmask = this.inputmask, opts = inputmask.opts, input = this, nptValue = this.inputmask._valueGet();
            opts.showMaskOnFocus && nptValue !== _positioning.getBuffer.call(inputmask).join("") && (0,
              _inputHandling.writeBuffer)(this, _positioning.getBuffer.call(inputmask), _positioning.seekNext.call(inputmask, _positioning.getLastValidPosition.call(inputmask))),
              !0 !== opts.positionCaretOnTab || !1 !== inputmask.mouseEnter || _validation.isComplete.call(inputmask, _positioning.getBuffer.call(inputmask)) && -1 !== _positioning.getLastValidPosition.call(inputmask) || EventHandlers.clickEvent.apply(this, [e, !0]),
              inputmask.undoValue = _positioning.getBuffer.call(inputmask).join("");
          },
          invalidEvent: function invalidEvent(e) {
            this.inputmask.validationEvent = !0;
          },
          mouseleaveEvent: function mouseleaveEvent() {
            var inputmask = this.inputmask, opts = inputmask.opts, input = this;
            inputmask.mouseEnter = !1, opts.clearMaskOnLostFocus && (this.inputmask.shadowRoot || document).activeElement !== this && (0,
              _inputHandling.HandleNativePlaceholder)(this, inputmask.originalPlaceholder);
          },
          clickEvent: function clickEvent(e, tabbed) {
            var inputmask = this.inputmask, input = this;
            if ((this.inputmask.shadowRoot || document).activeElement === this) {
              var newCaretPosition = _positioning.determineNewCaretPosition.call(inputmask, _positioning.caret.call(inputmask, this), tabbed);
              void 0 !== newCaretPosition && _positioning.caret.call(inputmask, this, newCaretPosition);
            }
          },
          cutEvent: function cutEvent(e) {
            var inputmask = this.inputmask, maskset = inputmask.maskset, input = this, pos = _positioning.caret.call(inputmask, this), clipboardData = window.clipboardData || e.clipboardData, clipData = inputmask.isRTL ? _positioning.getBuffer.call(inputmask).slice(pos.end, pos.begin) : _positioning.getBuffer.call(inputmask).slice(pos.begin, pos.end);
            clipboardData.setData("text", inputmask.isRTL ? clipData.reverse().join("") : clipData.join("")),
              document.execCommand && document.execCommand("copy"), _validation.handleRemove.call(inputmask, this, _keycode.default.DELETE, pos),
              (0, _inputHandling.writeBuffer)(this, _positioning.getBuffer.call(inputmask), maskset.p, e, inputmask.undoValue !== _positioning.getBuffer.call(inputmask).join(""));
          },
          blurEvent: function blurEvent(e) {
            var inputmask = this.inputmask, opts = inputmask.opts, $ = inputmask.dependencyLib, $input = $(this), input = this;
            if (this.inputmask) {
              (0, _inputHandling.HandleNativePlaceholder)(this, inputmask.originalPlaceholder);
              var nptValue = this.inputmask._valueGet(), buffer = _positioning.getBuffer.call(inputmask).slice();
              "" !== nptValue && (opts.clearMaskOnLostFocus && (-1 === _positioning.getLastValidPosition.call(inputmask) && nptValue === _positioning.getBufferTemplate.call(inputmask).join("") ? buffer = [] : _inputHandling.clearOptionalTail.call(inputmask, buffer)),
                !1 === _validation.isComplete.call(inputmask, buffer) && (setTimeout(function () {
                  $input.trigger("incomplete");
                }, 0), opts.clearIncomplete && (_positioning.resetMaskSet.call(inputmask), buffer = opts.clearMaskOnLostFocus ? [] : _positioning.getBufferTemplate.call(inputmask).slice())),
                (0, _inputHandling.writeBuffer)(this, buffer, void 0, e)), inputmask.undoValue !== _positioning.getBuffer.call(inputmask).join("") && (inputmask.undoValue = _positioning.getBuffer.call(inputmask).join(""),
                  $input.trigger("change"));
            }
          },
          mouseenterEvent: function mouseenterEvent() {
            var inputmask = this.inputmask, opts = inputmask.opts, input = this;
            inputmask.mouseEnter = !0, (this.inputmask.shadowRoot || document).activeElement !== this && (null == inputmask.originalPlaceholder && this.placeholder !== inputmask.originalPlaceholder && (inputmask.originalPlaceholder = this.placeholder),
              opts.showMaskOnHover && (0, _inputHandling.HandleNativePlaceholder)(this, (inputmask.isRTL ? _positioning.getBufferTemplate.call(inputmask).slice().reverse() : _positioning.getBufferTemplate.call(inputmask)).join("")));
          },
          submitEvent: function submitEvent() {
            var inputmask = this.inputmask, opts = inputmask.opts;
            inputmask.undoValue !== _positioning.getBuffer.call(inputmask).join("") && inputmask.$el.trigger("change"),
              opts.clearMaskOnLostFocus && -1 === _positioning.getLastValidPosition.call(inputmask) && inputmask._valueGet && inputmask._valueGet() === _positioning.getBufferTemplate.call(inputmask).join("") && inputmask._valueSet(""),
              opts.clearIncomplete && !1 === _validation.isComplete.call(inputmask, _positioning.getBuffer.call(inputmask)) && inputmask._valueSet(""),
              opts.removeMaskOnSubmit && (inputmask._valueSet(inputmask.unmaskedvalue(), !0),
                setTimeout(function () {
                  (0, _inputHandling.writeBuffer)(inputmask.el, _positioning.getBuffer.call(inputmask));
                }, 0));
          },
          resetEvent: function resetEvent() {
            var inputmask = this.inputmask;
            inputmask.refreshValue = !0, setTimeout(function () {
              (0, _inputHandling.applyInputValue)(inputmask.el, inputmask._valueGet(!0));
            }, 0);
          }
        };
        exports.EventHandlers = EventHandlers;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.iphone = exports.iemobile = exports.mobile = exports.ie = exports.ua = void 0;
        var _window = _interopRequireDefault(__webpack_require__(5));
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var ua = _window.default.navigator && _window.default.navigator.userAgent || "", ie = 0 < ua.indexOf("MSIE ") || 0 < ua.indexOf("Trident/"), mobile = "ontouchstart" in _window.default, iemobile = /iemobile/i.test(ua), iphone = /iphone/i.test(ua) && !iemobile;
        exports.iphone = iphone, exports.iemobile = iemobile, exports.mobile = mobile, exports.ie = ie,
          exports.ua = ua;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0;
        var _extend = _interopRequireDefault(__webpack_require__(13)), _window = _interopRequireDefault(__webpack_require__(5)), _data = _interopRequireDefault(__webpack_require__(19)), _events = __webpack_require__(20);
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var document = _window.default.document;
        function DependencyLib(elem) {
          return elem instanceof DependencyLib ? elem : this instanceof DependencyLib ? void (null != elem && elem !== _window.default && (this[0] = elem.nodeName ? elem : void 0 !== elem[0] && elem[0].nodeName ? elem[0] : document.querySelector(elem),
            void 0 !== this[0] && null !== this[0] && (this[0].eventRegistry = this[0].eventRegistry || {}))) : new DependencyLib(elem);
        }
        DependencyLib.prototype = {
          on: _events.on,
          off: _events.off,
          trigger: _events.trigger
        }, DependencyLib.extend = _extend.default, DependencyLib.data = _data.default, DependencyLib.Event = _events.Event;
        var _default = DependencyLib;
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.mask = mask;
        var _keycode = _interopRequireDefault(__webpack_require__(0)), _positioning = __webpack_require__(1), _inputHandling = __webpack_require__(7), _eventruler = __webpack_require__(12), _environment = __webpack_require__(9), _validation = __webpack_require__(4), _eventhandlers = __webpack_require__(8);
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        function mask() {
          var inputmask = this, opts = this.opts, el = this.el, $ = this.dependencyLib;
          function isElementTypeSupported(input, opts) {
            function patchValueProperty(npt) {
              var valueGet, valueSet;
              function patchValhook(type) {
                if ($.valHooks && (void 0 === $.valHooks[type] || !0 !== $.valHooks[type].inputmaskpatch)) {
                  var valhookGet = $.valHooks[type] && $.valHooks[type].get ? $.valHooks[type].get : function (elem) {
                    return elem.value;
                  }, valhookSet = $.valHooks[type] && $.valHooks[type].set ? $.valHooks[type].set : function (elem, value) {
                    return elem.value = value, elem;
                  };
                  $.valHooks[type] = {
                    get: function get(elem) {
                      if (elem.inputmask) {
                        if (elem.inputmask.opts.autoUnmask) return elem.inputmask.unmaskedvalue();
                        var result = valhookGet(elem);
                        return -1 !== _positioning.getLastValidPosition.call(inputmask, void 0, void 0, elem.inputmask.maskset.validPositions) || !0 !== opts.nullable ? result : "";
                      }
                      return valhookGet(elem);
                    },
                    set: function set(elem, value) {
                      var result = valhookSet(elem, value);
                      return elem.inputmask && (0, _inputHandling.applyInputValue)(elem, value), result;
                    },
                    inputmaskpatch: !0
                  };
                }
              }
              function getter() {
                return this.inputmask ? this.inputmask.opts.autoUnmask ? this.inputmask.unmaskedvalue() : -1 !== _positioning.getLastValidPosition.call(inputmask) || !0 !== opts.nullable ? (this.inputmask.shadowRoot || document.activeElement) === this && opts.clearMaskOnLostFocus ? (inputmask.isRTL ? _inputHandling.clearOptionalTail.call(inputmask, _positioning.getBuffer.call(inputmask).slice()).reverse() : _inputHandling.clearOptionalTail.call(inputmask, _positioning.getBuffer.call(inputmask).slice())).join("") : valueGet.call(this) : "" : valueGet.call(this);
              }
              function setter(value) {
                valueSet.call(this, value), this.inputmask && (0, _inputHandling.applyInputValue)(this, value);
              }
              function installNativeValueSetFallback(npt) {
                _eventruler.EventRuler.on(npt, "mouseenter", function () {
                  var input = this, value = this.inputmask._valueGet(!0);
                  value !== (inputmask.isRTL ? _positioning.getBuffer.call(inputmask).reverse() : _positioning.getBuffer.call(inputmask)).join("") && (0,
                    _inputHandling.applyInputValue)(this, value);
                });
              }
              if (!npt.inputmask.__valueGet) {
                if (!0 !== opts.noValuePatching) {
                  if (Object.getOwnPropertyDescriptor) {
                    var valueProperty = Object.getPrototypeOf ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(npt), "value") : void 0;
                    valueProperty && valueProperty.get && valueProperty.set ? (valueGet = valueProperty.get,
                      valueSet = valueProperty.set, Object.defineProperty(npt, "value", {
                        get: getter,
                        set: setter,
                        configurable: !0
                      })) : "input" !== npt.tagName.toLowerCase() && (valueGet = function valueGet() {
                        return this.textContent;
                      }, valueSet = function valueSet(value) {
                        this.textContent = value;
                      }, Object.defineProperty(npt, "value", {
                        get: getter,
                        set: setter,
                        configurable: !0
                      }));
                  } else document.__lookupGetter__ && npt.__lookupGetter__("value") && (valueGet = npt.__lookupGetter__("value"),
                    valueSet = npt.__lookupSetter__("value"), npt.__defineGetter__("value", getter),
                    npt.__defineSetter__("value", setter));
                  npt.inputmask.__valueGet = valueGet, npt.inputmask.__valueSet = valueSet;
                }
                npt.inputmask._valueGet = function (overruleRTL) {
                  return inputmask.isRTL && !0 !== overruleRTL ? valueGet.call(this.el).split("").reverse().join("") : valueGet.call(this.el);
                }, npt.inputmask._valueSet = function (value, overruleRTL) {
                  valueSet.call(this.el, null == value ? "" : !0 !== overruleRTL && inputmask.isRTL ? value.split("").reverse().join("") : value);
                }, void 0 === valueGet && (valueGet = function valueGet() {
                  return this.value;
                }, valueSet = function valueSet(value) {
                  this.value = value;
                }, patchValhook(npt.type), installNativeValueSetFallback(npt));
              }
            }
            "textarea" !== input.tagName.toLowerCase() && opts.ignorables.push(_keycode.default.ENTER);
            var elementType = input.getAttribute("type"), isSupported = "input" === input.tagName.toLowerCase() && opts.supportsInputType.includes(elementType) || input.isContentEditable || "textarea" === input.tagName.toLowerCase();
            if (!isSupported) if ("input" === input.tagName.toLowerCase()) {
              var el = document.createElement("input");
              el.setAttribute("type", elementType), isSupported = "text" === el.type, el = null;
            } else isSupported = "partial";
            return !1 !== isSupported ? patchValueProperty(input) : input.inputmask = void 0,
              isSupported;
          }
          _eventruler.EventRuler.off(el);
          var isSupported = isElementTypeSupported(el, opts);
          if (!1 !== isSupported) {
            inputmask.originalPlaceholder = el.placeholder, inputmask.maxLength = void 0 !== el ? el.maxLength : void 0,
              -1 === inputmask.maxLength && (inputmask.maxLength = void 0), "inputMode" in el && null === el.getAttribute("inputmode") && (el.inputMode = opts.inputmode,
                el.setAttribute("inputmode", opts.inputmode)), !0 === isSupported && (opts.showMaskOnFocus = opts.showMaskOnFocus && -1 === ["cc-number", "cc-exp"].indexOf(el.autocomplete),
                  _environment.iphone && (opts.insertModeVisual = !1), _eventruler.EventRuler.on(el, "submit", _eventhandlers.EventHandlers.submitEvent),
                  _eventruler.EventRuler.on(el, "reset", _eventhandlers.EventHandlers.resetEvent),
                  _eventruler.EventRuler.on(el, "blur", _eventhandlers.EventHandlers.blurEvent), _eventruler.EventRuler.on(el, "focus", _eventhandlers.EventHandlers.focusEvent),
                  _eventruler.EventRuler.on(el, "invalid", _eventhandlers.EventHandlers.invalidEvent),
                  _eventruler.EventRuler.on(el, "click", _eventhandlers.EventHandlers.clickEvent),
                  _eventruler.EventRuler.on(el, "mouseleave", _eventhandlers.EventHandlers.mouseleaveEvent),
                  _eventruler.EventRuler.on(el, "mouseenter", _eventhandlers.EventHandlers.mouseenterEvent),
                  _eventruler.EventRuler.on(el, "paste", _eventhandlers.EventHandlers.pasteEvent),
                  _eventruler.EventRuler.on(el, "cut", _eventhandlers.EventHandlers.cutEvent), _eventruler.EventRuler.on(el, "complete", opts.oncomplete),
                  _eventruler.EventRuler.on(el, "incomplete", opts.onincomplete), _eventruler.EventRuler.on(el, "cleared", opts.oncleared),
                  !0 !== opts.inputEventOnly && (_eventruler.EventRuler.on(el, "keydown", _eventhandlers.EventHandlers.keydownEvent),
                    _eventruler.EventRuler.on(el, "keypress", _eventhandlers.EventHandlers.keypressEvent),
                    _eventruler.EventRuler.on(el, "keyup", _eventhandlers.EventHandlers.keyupEvent)),
                  (_environment.mobile || opts.inputEventOnly) && el.removeAttribute("maxLength"),
                  _eventruler.EventRuler.on(el, "input", _eventhandlers.EventHandlers.inputFallBackEvent),
                  _eventruler.EventRuler.on(el, "compositionend", _eventhandlers.EventHandlers.compositionendEvent)),
              _eventruler.EventRuler.on(el, "setvalue", _eventhandlers.EventHandlers.setValueEvent),
              inputmask.undoValue = _positioning.getBufferTemplate.call(inputmask).join("");
            var activeElement = (el.inputmask.shadowRoot || document).activeElement;
            if ("" !== el.inputmask._valueGet(!0) || !1 === opts.clearMaskOnLostFocus || activeElement === el) {
              (0, _inputHandling.applyInputValue)(el, el.inputmask._valueGet(!0), opts);
              var buffer = _positioning.getBuffer.call(inputmask).slice();
              !1 === _validation.isComplete.call(inputmask, buffer) && opts.clearIncomplete && _positioning.resetMaskSet.call(inputmask),
                opts.clearMaskOnLostFocus && activeElement !== el && (-1 === _positioning.getLastValidPosition.call(inputmask) ? buffer = [] : _inputHandling.clearOptionalTail.call(inputmask, buffer)),
                (!1 === opts.clearMaskOnLostFocus || opts.showMaskOnFocus && activeElement === el || "" !== el.inputmask._valueGet(!0)) && (0,
                  _inputHandling.writeBuffer)(el, buffer), activeElement === el && _positioning.caret.call(inputmask, el, _positioning.seekNext.call(inputmask, _positioning.getLastValidPosition.call(inputmask)));
            }
          }
        }
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.EventRuler = void 0;
        var _inputmask = _interopRequireDefault(__webpack_require__(2)), _keycode = _interopRequireDefault(__webpack_require__(0)), _positioning = __webpack_require__(1), _inputHandling = __webpack_require__(7);
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var EventRuler = {
          on: function on(input, eventName, eventHandler) {
            var $ = input.inputmask.dependencyLib, ev = function ev(e) {
              e.originalEvent && (e = e.originalEvent || e, arguments[0] = e);
              var that = this, args, inputmask = that.inputmask, opts = inputmask ? inputmask.opts : void 0;
              if (void 0 === inputmask && "FORM" !== this.nodeName) {
                var imOpts = $.data(that, "_inputmask_opts");
                $(that).off(), imOpts && new _inputmask.default(imOpts).mask(that);
              } else {
                if (["submit", "reset", "setvalue"].includes(e.type) || "FORM" === this.nodeName || !(that.disabled || that.readOnly && !("keydown" === e.type && e.ctrlKey && 67 === e.keyCode || !1 === opts.tabThrough && e.keyCode === _keycode.default.TAB))) {
                  switch (e.type) {
                    case "input":
                      if (!0 === inputmask.skipInputEvent || e.inputType && "insertCompositionText" === e.inputType) return inputmask.skipInputEvent = !1,
                        e.preventDefault();
                      break;

                    case "keydown":
                      inputmask.skipKeyPressEvent = !1, inputmask.skipInputEvent = inputmask.isComposing = e.keyCode === _keycode.default.KEY_229;
                      break;

                    case "keyup":
                    case "compositionend":
                      inputmask.isComposing && (inputmask.skipInputEvent = !1);
                      break;

                    case "keypress":
                      if (!0 === inputmask.skipKeyPressEvent) return e.preventDefault();
                      inputmask.skipKeyPressEvent = !0;
                      break;

                    case "click":
                    case "focus":
                      return inputmask.validationEvent ? (inputmask.validationEvent = !1, input.blur(),
                        (0, _inputHandling.HandleNativePlaceholder)(input, (inputmask.isRTL ? _positioning.getBufferTemplate.call(inputmask).slice().reverse() : _positioning.getBufferTemplate.call(inputmask)).join("")),
                        setTimeout(function () {
                          input.focus();
                        }, 3e3)) : (args = arguments, setTimeout(function () {
                          input.inputmask && eventHandler.apply(that, args);
                        }, 0)), !1;
                  }
                  var returnVal = eventHandler.apply(that, arguments);
                  return !1 === returnVal && (e.preventDefault(), e.stopPropagation()), returnVal;
                }
                e.preventDefault();
              }
            };
            input.inputmask.events[eventName] = input.inputmask.events[eventName] || [], input.inputmask.events[eventName].push(ev),
              ["submit", "reset"].includes(eventName) ? null !== input.form && $(input.form).on(eventName, ev.bind(input)) : $(input).on(eventName, ev);
          },
          off: function off(input, event) {
            if (input.inputmask && input.inputmask.events) {
              var $ = input.inputmask.dependencyLib, events = input.inputmask.events;
              for (var eventName in event && (events = [], events[event] = input.inputmask.events[event]),
                events) {
                for (var evArr = events[eventName]; 0 < evArr.length;) {
                  var ev = evArr.pop();
                  ["submit", "reset"].includes(eventName) ? null !== input.form && $(input.form).off(eventName, ev) : $(input).off(eventName, ev);
                }
                delete input.inputmask.events[eventName];
              }
            }
          }
        };
        exports.EventRuler = EventRuler;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        function _typeof(obj) {
          return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function _typeof(obj) {
            return typeof obj;
          } : function _typeof(obj) {
            return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
          }, _typeof(obj);
        }
        function extend() {
          var options, name, src, copy, copyIsArray, clone, target = arguments[0] || {}, i = 1, length = arguments.length, deep = !1;
          for ("boolean" == typeof target && (deep = target, target = arguments[i] || {},
            i++), "object" !== _typeof(target) && "function" != typeof target && (target = {}); i < length; i++) if (null != (options = arguments[i])) for (name in options) src = target[name],
              copy = options[name], target !== copy && (deep && copy && ("[object Object]" === Object.prototype.toString.call(copy) || (copyIsArray = Array.isArray(copy))) ? (clone = copyIsArray ? (copyIsArray = !1,
                src && Array.isArray(src) ? src : []) : src && "[object Object]" === Object.prototype.toString.call(src) ? src : {},
                target[name] = extend(deep, clone, copy)) : void 0 !== copy && (target[name] = copy));
          return target;
        }
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = extend;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = _default;
        var escapeRegexRegex = new RegExp("(\\" + ["/", ".", "*", "+", "?", "|", "(", ")", "[", "]", "{", "}", "\\", "$", "^"].join("|\\") + ")", "gim");
        function _default(str) {
          return str.replace(escapeRegexRegex, "\\$1");
        }
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0, __webpack_require__(16), __webpack_require__(24),
          __webpack_require__(25), __webpack_require__(26);
        var _inputmask2 = _interopRequireDefault(__webpack_require__(2));
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var _default = _inputmask2.default;
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        var _inputmask = _interopRequireDefault(__webpack_require__(2));
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        _inputmask.default.extendDefinitions({
          A: {
            validator: "[A-Za-z\u0410-\u044f\u0401\u0451\xc0-\xff\xb5]",
            casing: "upper"
          },
          "&": {
            validator: "[0-9A-Za-z\u0410-\u044f\u0401\u0451\xc0-\xff\xb5]",
            casing: "upper"
          },
          "#": {
            validator: "[0-9A-Fa-f]",
            casing: "upper"
          }
        });
        var ipValidatorRegex = new RegExp("25[0-5]|2[0-4][0-9]|[01][0-9][0-9]");
        function ipValidator(chrs, maskset, pos, strict, opts) {
          return chrs = -1 < pos - 1 && "." !== maskset.buffer[pos - 1] ? (chrs = maskset.buffer[pos - 1] + chrs,
            -1 < pos - 2 && "." !== maskset.buffer[pos - 2] ? maskset.buffer[pos - 2] + chrs : "0" + chrs) : "00" + chrs,
            ipValidatorRegex.test(chrs);
        }
        _inputmask.default.extendAliases({
          cssunit: {
            regex: "[+-]?[0-9]+\\.?([0-9]+)?(px|em|rem|ex|%|in|cm|mm|pt|pc)"
          },
          url: {
            regex: "(https?|ftp)://.*",
            autoUnmask: !1,
            keepStatic: !1,
            tabThrough: !0
          },
          ip: {
            mask: "i[i[i]].j[j[j]].k[k[k]].l[l[l]]",
            definitions: {
              i: {
                validator: ipValidator
              },
              j: {
                validator: ipValidator
              },
              k: {
                validator: ipValidator
              },
              l: {
                validator: ipValidator
              }
            },
            onUnMask: function onUnMask(maskedValue, unmaskedValue, opts) {
              return maskedValue;
            },
            inputmode: "numeric"
          },
          email: {
            mask: "*{1,64}[.*{1,64}][.*{1,64}][.*{1,63}]@-{1,63}.-{1,63}[.-{1,63}][.-{1,63}]",
            greedy: !1,
            casing: "lower",
            onBeforePaste: function onBeforePaste(pastedValue, opts) {
              return pastedValue = pastedValue.toLowerCase(), pastedValue.replace("mailto:", "");
            },
            definitions: {
              "*": {
                validator: "[0-9\uff11-\uff19A-Za-z\u0410-\u044f\u0401\u0451\xc0-\xff\xb5!#$%&'*+/=?^_`{|}~-]"
              },
              "-": {
                validator: "[0-9A-Za-z-]"
              }
            },
            onUnMask: function onUnMask(maskedValue, unmaskedValue, opts) {
              return maskedValue;
            },
            inputmode: "email"
          },
          mac: {
            mask: "##:##:##:##:##:##"
          },
          vin: {
            mask: "V{13}9{4}",
            definitions: {
              V: {
                validator: "[A-HJ-NPR-Za-hj-npr-z\\d]",
                casing: "upper"
              }
            },
            clearIncomplete: !0,
            autoUnmask: !0
          },
          ssn: {
            mask: "999-99-9999",
            postValidation: function postValidation(buffer, pos, c, currentResult, opts, maskset, strict) {
              return /^(?!219-09-9999|078-05-1120)(?!666|000|9.{2}).{3}-(?!00).{2}-(?!0{4}).{4}$/.test(buffer.join(""));
            }
          }
        });
      }, function (module, exports, __webpack_require__) {
        "use strict";
        function _typeof(obj) {
          return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function _typeof(obj) {
            return typeof obj;
          } : function _typeof(obj) {
            return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
          }, _typeof(obj);
        }
        "function" != typeof Object.getPrototypeOf && (Object.getPrototypeOf = "object" === _typeof("test".__proto__) ? function (object) {
          return object.__proto__;
        } : function (object) {
          return object.constructor.prototype;
        });
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Array.prototype.includes || Object.defineProperty(Array.prototype, "includes", {
          value: function value(searchElement, fromIndex) {
            if (null == this) throw new TypeError('"this" is null or not defined');
            var o = Object(this), len = o.length >>> 0;
            if (0 == len) return !1;
            for (var n = 0 | fromIndex, k = Math.max(0 <= n ? n : len - Math.abs(n), 0); k < len;) {
              if (o[k] === searchElement) return !0;
              k++;
            }
            return !1;
          }
        });
      }, function (module, exports, __webpack_require__) {
        "use strict";
        function _default(owner, key, value) {
          if (void 0 === value) return owner.__data ? owner.__data[key] : null;
          owner.__data = owner.__data || {}, owner.__data[key] = value;
        }
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.on = on, exports.off = off, exports.trigger = trigger, exports.Event = void 0;
        var _extend = _interopRequireDefault(__webpack_require__(13)), _window = _interopRequireDefault(__webpack_require__(5)), _inputmask = _interopRequireDefault(__webpack_require__(10)), _canUseDOM = _interopRequireDefault(__webpack_require__(6)), Event;
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        function isValidElement(elem) {
          return elem instanceof Element;
        }
        function on(events, handler) {
          function addEvent(ev, namespace) {
            elem.addEventListener ? elem.addEventListener(ev, handler, !1) : elem.attachEvent && elem.attachEvent("on" + ev, handler),
              eventRegistry[ev] = eventRegistry[ev] || {}, eventRegistry[ev][namespace] = eventRegistry[ev][namespace] || [],
              eventRegistry[ev][namespace].push(handler);
          }
          if (isValidElement(this[0])) for (var eventRegistry = this[0].eventRegistry, elem = this[0], _events = events.split(" "), endx = 0; endx < _events.length; endx++) {
            var nsEvent = _events[endx].split("."), ev = nsEvent[0], namespace = nsEvent[1] || "global";
            addEvent(ev, namespace);
          }
          return this;
        }
        function off(events, handler) {
          var eventRegistry, elem;
          function removeEvent(ev, namespace, handler) {
            if (ev in eventRegistry == !0) if (elem.removeEventListener ? elem.removeEventListener(ev, handler, !1) : elem.detachEvent && elem.detachEvent("on" + ev, handler),
              "global" === namespace) for (var nmsp in eventRegistry[ev]) eventRegistry[ev][nmsp].splice(eventRegistry[ev][nmsp].indexOf(handler), 1); else eventRegistry[ev][namespace].splice(eventRegistry[ev][namespace].indexOf(handler), 1);
          }
          function resolveNamespace(ev, namespace) {
            var evts = [], hndx, hndL;
            if (0 < ev.length) if (void 0 === handler) for (hndx = 0, hndL = eventRegistry[ev][namespace].length; hndx < hndL; hndx++) evts.push({
              ev: ev,
              namespace: namespace && 0 < namespace.length ? namespace : "global",
              handler: eventRegistry[ev][namespace][hndx]
            }); else evts.push({
              ev: ev,
              namespace: namespace && 0 < namespace.length ? namespace : "global",
              handler: handler
            }); else if (0 < namespace.length) for (var evNdx in eventRegistry) for (var nmsp in eventRegistry[evNdx]) if (nmsp === namespace) if (void 0 === handler) for (hndx = 0,
              hndL = eventRegistry[evNdx][nmsp].length; hndx < hndL; hndx++) evts.push({
                ev: evNdx,
                namespace: nmsp,
                handler: eventRegistry[evNdx][nmsp][hndx]
              }); else evts.push({
                ev: evNdx,
                namespace: nmsp,
                handler: handler
              });
            return evts;
          }
          if (isValidElement(this[0])) {
            eventRegistry = this[0].eventRegistry, elem = this[0];
            for (var _events = events.split(" "), endx = 0; endx < _events.length; endx++) for (var nsEvent = _events[endx].split("."), offEvents = resolveNamespace(nsEvent[0], nsEvent[1]), i = 0, offEventsL = offEvents.length; i < offEventsL; i++) removeEvent(offEvents[i].ev, offEvents[i].namespace, offEvents[i].handler);
          }
          return this;
        }
        function trigger(events) {
          if (isValidElement(this[0])) for (var eventRegistry = this[0].eventRegistry, elem = this[0], _events = "string" == typeof events ? events.split(" ") : [events.type], endx = 0; endx < _events.length; endx++) {
            var nsEvent = _events[endx].split("."), ev = nsEvent[0], namespace = nsEvent[1] || "global";
            if (void 0 !== document && "global" === namespace) {
              var evnt, i, params = {
                bubbles: !0,
                cancelable: !0,
                detail: arguments[1]
              };
              if (document.createEvent) {
                try {
                  evnt = new CustomEvent(ev, params);
                } catch (e) {
                  evnt = document.createEvent("CustomEvent"), evnt.initCustomEvent(ev, params.bubbles, params.cancelable, params.detail);
                }
                events.type && (0, _extend.default)(evnt, events), elem.dispatchEvent(evnt);
              } else evnt = document.createEventObject(), evnt.eventType = ev, evnt.detail = arguments[1],
                events.type && (0, _extend.default)(evnt, events), elem.fireEvent("on" + evnt.eventType, evnt);
            } else if (void 0 !== eventRegistry[ev]) if (arguments[0] = arguments[0].type ? arguments[0] : _inputmask.default.Event(arguments[0]),
              arguments[0].detail = arguments.slice(1), "global" === namespace) for (var nmsp in eventRegistry[ev]) for (i = 0; i < eventRegistry[ev][nmsp].length; i++) eventRegistry[ev][nmsp][i].apply(elem, arguments); else for (i = 0; i < eventRegistry[ev][namespace].length; i++) eventRegistry[ev][namespace][i].apply(elem, arguments);
          }
          return this;
        }
        exports.Event = Event, "function" == typeof _window.default.CustomEvent ? exports.Event = Event = _window.default.CustomEvent : _canUseDOM.default && (exports.Event = Event = function Event(event, params) {
          params = params || {
            bubbles: !1,
            cancelable: !1,
            detail: void 0
          };
          var evt = document.createEvent("CustomEvent");
          return evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail),
            evt;
        }, Event.prototype = _window.default.Event.prototype);
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.generateMaskSet = generateMaskSet, exports.analyseMask = analyseMask;
        var _inputmask = _interopRequireDefault(__webpack_require__(10));
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        function generateMaskSet(opts, nocache) {
          var ms;
          function generateMask(mask, metadata, opts) {
            var regexMask = !1, masksetDefinition, maskdefKey;
            if (null !== mask && "" !== mask || (regexMask = null !== opts.regex, mask = regexMask ? (mask = opts.regex,
              mask.replace(/^(\^)(.*)(\$)$/, "$2")) : (regexMask = !0, ".*")), 1 === mask.length && !1 === opts.greedy && 0 !== opts.repeat && (opts.placeholder = ""),
              0 < opts.repeat || "*" === opts.repeat || "+" === opts.repeat) {
              var repeatStart = "*" === opts.repeat ? 0 : "+" === opts.repeat ? 1 : opts.repeat;
              mask = opts.groupmarker[0] + mask + opts.groupmarker[1] + opts.quantifiermarker[0] + repeatStart + "," + opts.repeat + opts.quantifiermarker[1];
            }
            return maskdefKey = regexMask ? "regex_" + opts.regex : opts.numericInput ? mask.split("").reverse().join("") : mask,
              !1 !== opts.keepStatic && (maskdefKey = "ks_" + maskdefKey), void 0 === Inputmask.prototype.masksCache[maskdefKey] || !0 === nocache ? (masksetDefinition = {
                mask: mask,
                maskToken: Inputmask.prototype.analyseMask(mask, regexMask, opts),
                validPositions: {},
                _buffer: void 0,
                buffer: void 0,
                tests: {},
                excludes: {},
                metadata: metadata,
                maskLength: void 0,
                jitOffset: {}
              }, !0 !== nocache && (Inputmask.prototype.masksCache[maskdefKey] = masksetDefinition,
                masksetDefinition = _inputmask.default.extend(!0, {}, Inputmask.prototype.masksCache[maskdefKey]))) : masksetDefinition = _inputmask.default.extend(!0, {}, Inputmask.prototype.masksCache[maskdefKey]),
              masksetDefinition;
          }
          if ("function" == typeof opts.mask && (opts.mask = opts.mask(opts)), Array.isArray(opts.mask)) {
            if (1 < opts.mask.length) {
              null === opts.keepStatic && (opts.keepStatic = !0);
              var altMask = opts.groupmarker[0];
              return (opts.isRTL ? opts.mask.reverse() : opts.mask).forEach(function (msk) {
                1 < altMask.length && (altMask += opts.groupmarker[1] + opts.alternatormarker + opts.groupmarker[0]),
                  void 0 !== msk.mask && "function" != typeof msk.mask ? altMask += msk.mask : altMask += msk;
              }), altMask += opts.groupmarker[1], generateMask(altMask, opts.mask, opts);
            }
            opts.mask = opts.mask.pop();
          }
          return null === opts.keepStatic && (opts.keepStatic = !1), ms = opts.mask && void 0 !== opts.mask.mask && "function" != typeof opts.mask.mask ? generateMask(opts.mask.mask, opts.mask, opts) : generateMask(opts.mask, opts.mask, opts),
            ms;
        }
        function analyseMask(mask, regexMask, opts) {
          var tokenizer = /(?:[?*+]|\{[0-9+*]+(?:,[0-9+*]*)?(?:\|[0-9+*]*)?\})|[^.?*+^${[]()|\\]+|./g, regexTokenizer = /\[\^?]?(?:[^\\\]]+|\\[\S\s]?)*]?|\\(?:0(?:[0-3][0-7]{0,2}|[4-7][0-7]?)?|[1-9][0-9]*|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|c[A-Za-z]|[\S\s]?)|\((?:\?[:=!]?)?|(?:[?*+]|\{[0-9]+(?:,[0-9]*)?\})\??|[^.?*+^${[()|\\]+|./g, escaped = !1, currentToken = new MaskToken(), match, m, openenings = [], maskTokens = [], openingToken, currentOpeningToken, alternator, lastMatch, closeRegexGroup = !1;
          function MaskToken(isGroup, isOptional, isQuantifier, isAlternator) {
            this.matches = [], this.openGroup = isGroup || !1, this.alternatorGroup = !1, this.isGroup = isGroup || !1,
              this.isOptional = isOptional || !1, this.isQuantifier = isQuantifier || !1, this.isAlternator = isAlternator || !1,
              this.quantifier = {
                min: 1,
                max: 1
              };
          }
          function insertTestDefinition(mtoken, element, position) {
            position = void 0 !== position ? position : mtoken.matches.length;
            var prevMatch = mtoken.matches[position - 1];
            if (regexMask) 0 === element.indexOf("[") || escaped && /\\d|\\s|\\w]/i.test(element) || "." === element ? mtoken.matches.splice(position++, 0, {
              fn: new RegExp(element, opts.casing ? "i" : ""),
              static: !1,
              optionality: !1,
              newBlockMarker: void 0 === prevMatch ? "master" : prevMatch.def !== element,
              casing: null,
              def: element,
              placeholder: void 0,
              nativeDef: element
            }) : (escaped && (element = element[element.length - 1]), element.split("").forEach(function (lmnt, ndx) {
              prevMatch = mtoken.matches[position - 1], mtoken.matches.splice(position++, 0, {
                fn: /[a-z]/i.test(opts.staticDefinitionSymbol || lmnt) ? new RegExp("[" + (opts.staticDefinitionSymbol || lmnt) + "]", opts.casing ? "i" : "") : null,
                static: !0,
                optionality: !1,
                newBlockMarker: void 0 === prevMatch ? "master" : prevMatch.def !== lmnt && !0 !== prevMatch.static,
                casing: null,
                def: opts.staticDefinitionSymbol || lmnt,
                placeholder: void 0 !== opts.staticDefinitionSymbol ? lmnt : void 0,
                nativeDef: (escaped ? "'" : "") + lmnt
              });
            })), escaped = !1; else {
              var maskdef = opts.definitions && opts.definitions[element] || opts.usePrototypeDefinitions && Inputmask.prototype.definitions[element];
              maskdef && !escaped ? mtoken.matches.splice(position++, 0, {
                fn: maskdef.validator ? "string" == typeof maskdef.validator ? new RegExp(maskdef.validator, opts.casing ? "i" : "") : new function () {
                  this.test = maskdef.validator;
                }() : new RegExp("."),
                static: maskdef.static || !1,
                optionality: !1,
                newBlockMarker: void 0 === prevMatch ? "master" : prevMatch.def !== (maskdef.definitionSymbol || element),
                casing: maskdef.casing,
                def: maskdef.definitionSymbol || element,
                placeholder: maskdef.placeholder,
                nativeDef: element,
                generated: maskdef.generated
              }) : (mtoken.matches.splice(position++, 0, {
                fn: /[a-z]/i.test(opts.staticDefinitionSymbol || element) ? new RegExp("[" + (opts.staticDefinitionSymbol || element) + "]", opts.casing ? "i" : "") : null,
                static: !0,
                optionality: !1,
                newBlockMarker: void 0 === prevMatch ? "master" : prevMatch.def !== element && !0 !== prevMatch.static,
                casing: null,
                def: opts.staticDefinitionSymbol || element,
                placeholder: void 0 !== opts.staticDefinitionSymbol ? element : void 0,
                nativeDef: (escaped ? "'" : "") + element
              }), escaped = !1);
            }
          }
          function verifyGroupMarker(maskToken) {
            maskToken && maskToken.matches && maskToken.matches.forEach(function (token, ndx) {
              var nextToken = maskToken.matches[ndx + 1];
              (void 0 === nextToken || void 0 === nextToken.matches || !1 === nextToken.isQuantifier) && token && token.isGroup && (token.isGroup = !1,
                regexMask || (insertTestDefinition(token, opts.groupmarker[0], 0), !0 !== token.openGroup && insertTestDefinition(token, opts.groupmarker[1]))),
                verifyGroupMarker(token);
            });
          }
          function defaultCase() {
            if (0 < openenings.length) {
              if (currentOpeningToken = openenings[openenings.length - 1], insertTestDefinition(currentOpeningToken, m),
                currentOpeningToken.isAlternator) {
                alternator = openenings.pop();
                for (var mndx = 0; mndx < alternator.matches.length; mndx++) alternator.matches[mndx].isGroup && (alternator.matches[mndx].isGroup = !1);
                0 < openenings.length ? (currentOpeningToken = openenings[openenings.length - 1],
                  currentOpeningToken.matches.push(alternator)) : currentToken.matches.push(alternator);
              }
            } else insertTestDefinition(currentToken, m);
          }
          function reverseTokens(maskToken) {
            function reverseStatic(st) {
              return st === opts.optionalmarker[0] ? st = opts.optionalmarker[1] : st === opts.optionalmarker[1] ? st = opts.optionalmarker[0] : st === opts.groupmarker[0] ? st = opts.groupmarker[1] : st === opts.groupmarker[1] && (st = opts.groupmarker[0]),
                st;
            }
            for (var match in maskToken.matches = maskToken.matches.reverse(), maskToken.matches) if (Object.prototype.hasOwnProperty.call(maskToken.matches, match)) {
              var intMatch = parseInt(match);
              if (maskToken.matches[match].isQuantifier && maskToken.matches[intMatch + 1] && maskToken.matches[intMatch + 1].isGroup) {
                var qt = maskToken.matches[match];
                maskToken.matches.splice(match, 1), maskToken.matches.splice(intMatch + 1, 0, qt);
              }
              void 0 !== maskToken.matches[match].matches ? maskToken.matches[match] = reverseTokens(maskToken.matches[match]) : maskToken.matches[match] = reverseStatic(maskToken.matches[match]);
            }
            return maskToken;
          }
          function groupify(matches) {
            var groupToken = new MaskToken(!0);
            return groupToken.openGroup = !1, groupToken.matches = matches, groupToken;
          }
          function closeGroup() {
            if (openingToken = openenings.pop(), openingToken.openGroup = !1, void 0 !== openingToken) if (0 < openenings.length) {
              if (currentOpeningToken = openenings[openenings.length - 1], currentOpeningToken.matches.push(openingToken),
                currentOpeningToken.isAlternator) {
                alternator = openenings.pop();
                for (var mndx = 0; mndx < alternator.matches.length; mndx++) alternator.matches[mndx].isGroup = !1,
                  alternator.matches[mndx].alternatorGroup = !1;
                0 < openenings.length ? (currentOpeningToken = openenings[openenings.length - 1],
                  currentOpeningToken.matches.push(alternator)) : currentToken.matches.push(alternator);
              }
            } else currentToken.matches.push(openingToken); else defaultCase();
          }
          function groupQuantifier(matches) {
            var lastMatch = matches.pop();
            return lastMatch.isQuantifier && (lastMatch = groupify([matches.pop(), lastMatch])),
              lastMatch;
          }
          for (regexMask && (opts.optionalmarker[0] = void 0, opts.optionalmarker[1] = void 0); match = regexMask ? regexTokenizer.exec(mask) : tokenizer.exec(mask);) {
            if (m = match[0], regexMask) switch (m.charAt(0)) {
              case "?":
                m = "{0,1}";
                break;

              case "+":
              case "*":
                m = "{" + m + "}";
                break;

              case "|":
                if (0 === openenings.length) {
                  var altRegexGroup = groupify(currentToken.matches);
                  altRegexGroup.openGroup = !0, openenings.push(altRegexGroup), currentToken.matches = [],
                    closeRegexGroup = !0;
                }
                break;
            }
            if (escaped) defaultCase(); else switch (m.charAt(0)) {
              case "$":
              case "^":
                regexMask || defaultCase();
                break;

              case "(?=":
                break;

              case "(?!":
                break;

              case "(?<=":
                break;

              case "(?<!":
                break;

              case opts.escapeChar:
                escaped = !0, regexMask && defaultCase();
                break;

              case opts.optionalmarker[1]:
              case opts.groupmarker[1]:
                closeGroup();
                break;

              case opts.optionalmarker[0]:
                openenings.push(new MaskToken(!1, !0));
                break;

              case opts.groupmarker[0]:
                openenings.push(new MaskToken(!0));
                break;

              case opts.quantifiermarker[0]:
                var quantifier = new MaskToken(!1, !1, !0);
                m = m.replace(/[{}]/g, "");
                var mqj = m.split("|"), mq = mqj[0].split(","), mq0 = isNaN(mq[0]) ? mq[0] : parseInt(mq[0]), mq1 = 1 === mq.length ? mq0 : isNaN(mq[1]) ? mq[1] : parseInt(mq[1]);
                "*" !== mq0 && "+" !== mq0 || (mq0 = "*" === mq1 ? 0 : 1), quantifier.quantifier = {
                  min: mq0,
                  max: mq1,
                  jit: mqj[1]
                };
                var matches = 0 < openenings.length ? openenings[openenings.length - 1].matches : currentToken.matches;
                if (match = matches.pop(), match.isAlternator) {
                  matches.push(match), matches = match.matches;
                  var groupToken = new MaskToken(!0), tmpMatch = matches.pop();
                  matches.push(groupToken), matches = groupToken.matches, match = tmpMatch;
                }
                match.isGroup || (match = groupify([match])), matches.push(match), matches.push(quantifier);
                break;

              case opts.alternatormarker:
                if (0 < openenings.length) {
                  currentOpeningToken = openenings[openenings.length - 1];
                  var subToken = currentOpeningToken.matches[currentOpeningToken.matches.length - 1];
                  lastMatch = currentOpeningToken.openGroup && (void 0 === subToken.matches || !1 === subToken.isGroup && !1 === subToken.isAlternator) ? openenings.pop() : groupQuantifier(currentOpeningToken.matches);
                } else lastMatch = groupQuantifier(currentToken.matches);
                if (lastMatch.isAlternator) openenings.push(lastMatch); else if (lastMatch.alternatorGroup ? (alternator = openenings.pop(),
                  lastMatch.alternatorGroup = !1) : alternator = new MaskToken(!1, !1, !1, !0), alternator.matches.push(lastMatch),
                  openenings.push(alternator), lastMatch.openGroup) {
                  lastMatch.openGroup = !1;
                  var alternatorGroup = new MaskToken(!0);
                  alternatorGroup.alternatorGroup = !0, openenings.push(alternatorGroup);
                }
                break;

              default:
                defaultCase();
            }
          }
          for (closeRegexGroup && closeGroup(); 0 < openenings.length;) openingToken = openenings.pop(),
            currentToken.matches.push(openingToken);
          return 0 < currentToken.matches.length && (verifyGroupMarker(currentToken), maskTokens.push(currentToken)),
            (opts.numericInput || opts.isRTL) && reverseTokens(maskTokens[0]), maskTokens;
        }
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0;
        var _default = {
          9: {
            validator: "[0-9\uff10-\uff19]",
            definitionSymbol: "*"
          },
          a: {
            validator: "[A-Za-z\u0410-\u044f\u0401\u0451\xc0-\xff\xb5]",
            definitionSymbol: "*"
          },
          "*": {
            validator: "[0-9\uff10-\uff19A-Za-z\u0410-\u044f\u0401\u0451\xc0-\xff\xb5]"
          }
        };
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        Object.defineProperty(exports, "__esModule", {
          value: !0
        }), exports.default = void 0;
        var _default = {
          _maxTestPos: 500,
          placeholder: "_",
          optionalmarker: ["[", "]"],
          quantifiermarker: ["{", "}"],
          groupmarker: ["(", ")"],
          alternatormarker: "|",
          escapeChar: "\\",
          mask: null,
          regex: null,
          oncomplete: function oncomplete() { },
          onincomplete: function onincomplete() { },
          oncleared: function oncleared() { },
          repeat: 0,
          greedy: !1,
          autoUnmask: !1,
          removeMaskOnSubmit: !1,
          clearMaskOnLostFocus: !0,
          insertMode: !0,
          insertModeVisual: !0,
          clearIncomplete: !1,
          alias: null,
          onKeyDown: function onKeyDown() { },
          onBeforeMask: null,
          onBeforePaste: function onBeforePaste(pastedValue, opts) {
            return "function" == typeof opts.onBeforeMask ? opts.onBeforeMask.call(this, pastedValue, opts) : pastedValue;
          },
          onBeforeWrite: null,
          onUnMask: null,
          showMaskOnFocus: !0,
          showMaskOnHover: !0,
          onKeyValidation: function onKeyValidation() { },
          skipOptionalPartCharacter: " ",
          numericInput: !1,
          rightAlign: !1,
          undoOnEscape: !0,
          radixPoint: "",
          _radixDance: !1,
          groupSeparator: "",
          keepStatic: null,
          positionCaretOnTab: !0,
          tabThrough: !1,
          supportsInputType: ["text", "tel", "url", "password", "search"],
          ignorables: [8, 9, 19, 27, 33, 34, 35, 36, 37, 38, 39, 40, 45, 46, 93, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 0, 229],
          isComplete: null,
          preValidation: null,
          postValidation: null,
          staticDefinitionSymbol: void 0,
          jitMasking: !1,
          nullable: !0,
          inputEventOnly: !1,
          noValuePatching: !1,
          positionCaretOnClick: "lvp",
          casing: null,
          inputmode: "text",
          importDataAttributes: !0,
          shiftPositions: !0,
          usePrototypeDefinitions: !0
        };
        exports.default = _default;
      }, function (module, exports, __webpack_require__) {
        "use strict";
        var _inputmask = _interopRequireDefault(__webpack_require__(2)), _keycode = _interopRequireDefault(__webpack_require__(0)), _escapeRegex = _interopRequireDefault(__webpack_require__(14)), _positioning = __webpack_require__(1);
        function _typeof(obj) {
          return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function _typeof(obj) {
            return typeof obj;
          } : function _typeof(obj) {
            return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
          }, _typeof(obj);
        }
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var $ = _inputmask.default.dependencyLib, currentYear = new Date().getFullYear(), formatCode = {
          d: ["[1-9]|[12][0-9]|3[01]", Date.prototype.setDate, "day", Date.prototype.getDate],
          dd: ["0[1-9]|[12][0-9]|3[01]", Date.prototype.setDate, "day", function () {
            return pad(Date.prototype.getDate.call(this), 2);
          }],
          ddd: [""],
          dddd: [""],
          m: ["[1-9]|1[012]", Date.prototype.setMonth, "month", function () {
            return Date.prototype.getMonth.call(this) + 1;
          }],
          mm: ["0[1-9]|1[012]", Date.prototype.setMonth, "month", function () {
            return pad(Date.prototype.getMonth.call(this) + 1, 2);
          }],
          mmm: [""],
          mmmm: [""],
          yy: ["[0-9]{2}", Date.prototype.setFullYear, "year", function () {
            return pad(Date.prototype.getFullYear.call(this), 2);
          }],
          yyyy: ["[0-9]{4}", Date.prototype.setFullYear, "year", function () {
            return pad(Date.prototype.getFullYear.call(this), 4);
          }],
          h: ["[1-9]|1[0-2]", Date.prototype.setHours, "hours", Date.prototype.getHours],
          hh: ["0[1-9]|1[0-2]", Date.prototype.setHours, "hours", function () {
            return pad(Date.prototype.getHours.call(this), 2);
          }],
          hx: [function (x) {
            return "[0-9]{".concat(x, "}");
          }, Date.prototype.setHours, "hours", function (x) {
            return Date.prototype.getHours;
          }],
          H: ["1?[0-9]|2[0-3]", Date.prototype.setHours, "hours", Date.prototype.getHours],
          HH: ["0[0-9]|1[0-9]|2[0-3]", Date.prototype.setHours, "hours", function () {
            return pad(Date.prototype.getHours.call(this), 2);
          }],
          Hx: [function (x) {
            return "[0-9]{".concat(x, "}");
          }, Date.prototype.setHours, "hours", function (x) {
            return function () {
              return pad(Date.prototype.getHours.call(this), x);
            };
          }],
          M: ["[1-5]?[0-9]", Date.prototype.setMinutes, "minutes", Date.prototype.getMinutes],
          MM: ["0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9]", Date.prototype.setMinutes, "minutes", function () {
            return pad(Date.prototype.getMinutes.call(this), 2);
          }],
          s: ["[1-5]?[0-9]", Date.prototype.setSeconds, "seconds", Date.prototype.getSeconds],
          ss: ["0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9]", Date.prototype.setSeconds, "seconds", function () {
            return pad(Date.prototype.getSeconds.call(this), 2);
          }],
          l: ["[0-9]{3}", Date.prototype.setMilliseconds, "milliseconds", function () {
            return pad(Date.prototype.getMilliseconds.call(this), 3);
          }],
          L: ["[0-9]{2}", Date.prototype.setMilliseconds, "milliseconds", function () {
            return pad(Date.prototype.getMilliseconds.call(this), 2);
          }],
          t: ["[ap]"],
          tt: ["[ap]m"],
          T: ["[AP]"],
          TT: ["[AP]M"],
          Z: [""],
          o: [""],
          S: [""]
        }, formatAlias = {
          isoDate: "yyyy-mm-dd",
          isoTime: "HH:MM:ss",
          isoDateTime: "yyyy-mm-dd'T'HH:MM:ss",
          isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
        };
        function formatcode(match) {
          var dynMatches = new RegExp("\\d+$").exec(match[0]);
          if (dynMatches && void 0 !== dynMatches[0]) {
            var fcode = formatCode[match[0][0] + "x"].slice("");
            return fcode[0] = fcode[0](dynMatches[0]), fcode[3] = fcode[3](dynMatches[0]), fcode;
          }
          if (formatCode[match[0]]) return formatCode[match[0]];
        }
        function getTokenizer(opts) {
          if (!opts.tokenizer) {
            var tokens = [], dyntokens = [];
            for (var ndx in formatCode) if (/\.*x$/.test(ndx)) {
              var dynToken = ndx[0] + "\\d+";
              -1 === dyntokens.indexOf(dynToken) && dyntokens.push(dynToken);
            } else -1 === tokens.indexOf(ndx[0]) && tokens.push(ndx[0]);
            opts.tokenizer = "(" + (0 < dyntokens.length ? dyntokens.join("|") + "|" : "") + tokens.join("+|") + ")+?|.",
              opts.tokenizer = new RegExp(opts.tokenizer, "g");
          }
          return opts.tokenizer;
        }
        function prefillYear(dateParts, currentResult, opts) {
          if (dateParts.year !== dateParts.rawyear) {
            var crrntyear = currentYear.toString(), enteredPart = dateParts.rawyear.replace(/[^0-9]/g, ""), currentYearPart = crrntyear.slice(0, enteredPart.length), currentYearNextPart = crrntyear.slice(enteredPart.length);
            if (2 === enteredPart.length && enteredPart === currentYearPart) {
              var entryCurrentYear = new Date(currentYear, dateParts.month - 1, dateParts.day);
              dateParts.day == entryCurrentYear.getDate() && (!opts.max || opts.max.date.getTime() >= entryCurrentYear.getTime()) && (dateParts.date.setFullYear(currentYear),
                dateParts.year = crrntyear, currentResult.insert = [{
                  pos: currentResult.pos + 1,
                  c: currentYearNextPart[0]
                }, {
                  pos: currentResult.pos + 2,
                  c: currentYearNextPart[1]
                }]);
            }
          }
          return currentResult;
        }
        function isValidDate(dateParts, currentResult, opts) {
          if (void 0 === dateParts.rawday || !isFinite(dateParts.rawday) && new Date(dateParts.date.getFullYear(), isFinite(dateParts.rawmonth) ? dateParts.month : dateParts.date.getMonth() + 1, 0).getDate() >= dateParts.day || "29" == dateParts.day && !isFinite(dateParts.rawyear) || new Date(dateParts.date.getFullYear(), isFinite(dateParts.rawmonth) ? dateParts.month : dateParts.date.getMonth() + 1, 0).getDate() >= dateParts.day) return currentResult;
          if ("29" == dateParts.day) {
            var tokenMatch = getTokenMatch(currentResult.pos, opts);
            if ("yyyy" === tokenMatch.targetMatch[0] && currentResult.pos - tokenMatch.targetMatchIndex == 2) return currentResult.remove = currentResult.pos + 1,
              currentResult;
          } else if ("02" == dateParts.month && "30" == dateParts.day) return dateParts.day = "03",
            dateParts.date.setDate(3), dateParts.date.setMonth(1), currentResult.insert = [{
              pos: currentResult.pos,
              c: "0"
            }, {
              pos: currentResult.pos + 1,
              c: currentResult.c
            }], currentResult.caret = _positioning.seekNext.call(this, currentResult.pos + 1),
            currentResult;
          return !1;
        }
        function isDateInRange(dateParts, result, opts, maskset, fromCheckval) {
          if (!result) return result;
          if (opts.min) {
            if (dateParts.rawyear) {
              var rawYear = dateParts.rawyear.replace(/[^0-9]/g, ""), minYear = opts.min.year.substr(0, rawYear.length), maxYear;
              if (rawYear < minYear) {
                var tokenMatch = getTokenMatch(result.pos, opts);
                if (rawYear = dateParts.rawyear.substr(0, result.pos - tokenMatch.targetMatchIndex + 1).replace(/[^0-9]/g, "0"),
                  minYear = opts.min.year.substr(0, rawYear.length), minYear <= rawYear) return result.remove = tokenMatch.targetMatchIndex + rawYear.length,
                    result;
                if (rawYear = "yyyy" === tokenMatch.targetMatch[0] ? dateParts.rawyear.substr(1, 1) : dateParts.rawyear.substr(0, 1),
                  minYear = opts.min.year.substr(2, 1), maxYear = opts.max ? opts.max.year.substr(2, 1) : rawYear,
                  1 === rawYear.length && minYear <= rawYear && rawYear <= maxYear && !0 !== fromCheckval) return "yyyy" === tokenMatch.targetMatch[0] ? (result.insert = [{
                    pos: result.pos + 1,
                    c: rawYear,
                    strict: !0
                  }], result.caret = result.pos + 2, maskset.validPositions[result.pos].input = opts.min.year[1]) : (result.insert = [{
                    pos: result.pos + 1,
                    c: opts.min.year[1],
                    strict: !0
                  }, {
                    pos: result.pos + 2,
                    c: rawYear,
                    strict: !0
                  }], result.caret = result.pos + 3, maskset.validPositions[result.pos].input = opts.min.year[0]),
                    result;
                result = !1;
              }
            }
            result && dateParts.year && dateParts.year === dateParts.rawyear && opts.min.date.getTime() == opts.min.date.getTime() && (result = opts.min.date.getTime() <= dateParts.date.getTime());
          }
          return result && opts.max && opts.max.date.getTime() == opts.max.date.getTime() && (result = opts.max.date.getTime() >= dateParts.date.getTime()),
            result;
        }
        function parse(format, dateObjValue, opts, raw) {
          var mask = "", match, fcode;
          for (getTokenizer(opts).lastIndex = 0; match = getTokenizer(opts).exec(format);) if (void 0 === dateObjValue) if (fcode = formatcode(match)) mask += "(" + fcode[0] + ")"; else switch (match[0]) {
            case "[":
              mask += "(";
              break;

            case "]":
              mask += ")?";
              break;

            default:
              mask += (0, _escapeRegex.default)(match[0]);
          } else if (fcode = formatcode(match)) if (!0 !== raw && fcode[3]) {
            var getFn = fcode[3];
            mask += getFn.call(dateObjValue.date);
          } else fcode[2] ? mask += dateObjValue["raw" + fcode[2]] : mask += match[0]; else mask += match[0];
          return mask;
        }
        function pad(val, len) {
          for (val = String(val), len = len || 2; val.length < len;) val = "0" + val;
          return val;
        }
        function analyseMask(maskString, format, opts) {
          var dateObj = {
            date: new Date(1, 0, 1)
          }, targetProp, mask = maskString, match, dateOperation;
          function setValue(dateObj, value, opts) {
            if (dateObj[targetProp] = value.replace(/[^0-9]/g, "0"), dateObj["raw" + targetProp] = value,
              void 0 !== dateOperation) {
              var datavalue = dateObj[targetProp];
              "day" === targetProp && 0 === parseInt(datavalue) && (datavalue = 1), "month" === targetProp && (datavalue = parseInt(datavalue),
                0 < datavalue) && (datavalue -= 1), dateOperation.call(dateObj.date, datavalue);
            }
          }
          if ("string" == typeof mask) {
            for (getTokenizer(opts).lastIndex = 0; match = getTokenizer(opts).exec(format);) {
              var dynMatches = new RegExp("\\d+$").exec(match[0]), fcode = dynMatches ? match[0][0] + "x" : match[0], value = void 0;
              if (dynMatches) {
                var lastIndex = getTokenizer(opts).lastIndex, tokanMatch = getTokenMatch(match.index, opts);
                getTokenizer(opts).lastIndex = lastIndex, value = mask.slice(0, mask.indexOf(tokanMatch.nextMatch[0]));
              } else value = mask.slice(0, fcode.length);
              Object.prototype.hasOwnProperty.call(formatCode, fcode) && (targetProp = formatCode[fcode][2],
                dateOperation = formatCode[fcode][1], setValue(dateObj, value, opts)), mask = mask.slice(value.length);
            }
            return dateObj;
          }
          if (mask && "object" === _typeof(mask) && Object.prototype.hasOwnProperty.call(mask, "date")) return mask;
        }
        function importDate(dateObj, opts) {
          return parse(opts.inputFormat, {
            date: dateObj
          }, opts);
        }
        function getTokenMatch(pos, opts) {
          var calcPos = 0, targetMatch, match, matchLength = 0;
          for (getTokenizer(opts).lastIndex = 0; match = getTokenizer(opts).exec(opts.inputFormat);) {
            var dynMatches = new RegExp("\\d+$").exec(match[0]);
            if (matchLength = dynMatches ? parseInt(dynMatches[0]) : match[0].length, calcPos += matchLength,
              pos <= calcPos) {
              targetMatch = match, match = getTokenizer(opts).exec(opts.inputFormat);
              break;
            }
          }
          return {
            targetMatchIndex: calcPos - matchLength,
            nextMatch: match,
            targetMatch: targetMatch
          };
        }
        _inputmask.default.extendAliases({
          datetime: {
            mask: function mask(opts) {
              return opts.numericInput = !1, formatCode.S = opts.i18n.ordinalSuffix.join("|"),
                opts.inputFormat = formatAlias[opts.inputFormat] || opts.inputFormat, opts.displayFormat = formatAlias[opts.displayFormat] || opts.displayFormat || opts.inputFormat,
                opts.outputFormat = formatAlias[opts.outputFormat] || opts.outputFormat || opts.inputFormat,
                opts.placeholder = "" !== opts.placeholder ? opts.placeholder : opts.inputFormat.replace(/[[\]]/, ""),
                opts.regex = parse(opts.inputFormat, void 0, opts), opts.min = analyseMask(opts.min, opts.inputFormat, opts),
                opts.max = analyseMask(opts.max, opts.inputFormat, opts), null;
            },
            placeholder: "",
            inputFormat: "isoDateTime",
            displayFormat: void 0,
            outputFormat: void 0,
            min: null,
            max: null,
            skipOptionalPartCharacter: "",
            i18n: {
              dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
              ordinalSuffix: ["st", "nd", "rd", "th"]
            },
            preValidation: function preValidation(buffer, pos, c, isSelection, opts, maskset, caretPos, strict) {
              if (strict) return !0;
              if (isNaN(c) && buffer[pos] !== c) {
                var tokenMatch = getTokenMatch(pos, opts);
                if (tokenMatch.nextMatch && tokenMatch.nextMatch[0] === c && 1 < tokenMatch.targetMatch[0].length) {
                  var validator = formatCode[tokenMatch.targetMatch[0]][0];
                  if (new RegExp(validator).test("0" + buffer[pos - 1])) return buffer[pos] = buffer[pos - 1],
                    buffer[pos - 1] = "0", {
                    fuzzy: !0,
                    buffer: buffer,
                    refreshFromBuffer: {
                      start: pos - 1,
                      end: pos + 1
                    },
                    pos: pos + 1
                  };
                }
              }
              return !0;
            },
            postValidation: function postValidation(buffer, pos, c, currentResult, opts, maskset, strict, fromCheckval) {
              var inputmask = this, tokenMatch, validator;
              if (strict) return !0;
              if (!1 === currentResult) return tokenMatch = getTokenMatch(pos + 1, opts), tokenMatch.targetMatch && tokenMatch.targetMatchIndex === pos && 1 < tokenMatch.targetMatch[0].length && void 0 !== formatCode[tokenMatch.targetMatch[0]] && (validator = formatCode[tokenMatch.targetMatch[0]][0],
                new RegExp(validator).test("0" + c)) ? {
                  insert: [{
                    pos: pos,
                    c: "0"
                  }, {
                    pos: pos + 1,
                    c: c
                  }],
                  pos: pos + 1
                } : currentResult;
              if (currentResult.fuzzy && (buffer = currentResult.buffer, pos = currentResult.pos),
                tokenMatch = getTokenMatch(pos, opts), tokenMatch.targetMatch && tokenMatch.targetMatch[0] && void 0 !== formatCode[tokenMatch.targetMatch[0]]) {
                validator = formatCode[tokenMatch.targetMatch[0]][0];
                var part = buffer.slice(tokenMatch.targetMatchIndex, tokenMatch.targetMatchIndex + tokenMatch.targetMatch[0].length);
                !1 === new RegExp(validator).test(part.join("")) && 2 === tokenMatch.targetMatch[0].length && maskset.validPositions[tokenMatch.targetMatchIndex] && maskset.validPositions[tokenMatch.targetMatchIndex + 1] && (maskset.validPositions[tokenMatch.targetMatchIndex + 1].input = "0");
              }
              var result = currentResult, dateParts = analyseMask(buffer.join(""), opts.inputFormat, opts);
              return result && dateParts.date.getTime() == dateParts.date.getTime() && (result = prefillYear(dateParts, result, opts),
                result = isValidDate.call(this, dateParts, result, opts), result = isDateInRange(dateParts, result, opts, maskset, fromCheckval)),
                pos && result && currentResult.pos !== pos ? {
                  buffer: parse(opts.inputFormat, dateParts, opts).split(""),
                  refreshFromBuffer: {
                    start: pos,
                    end: currentResult.pos
                  }
                } : result;
            },
            onKeyDown: function onKeyDown(e, buffer, caretPos, opts) {
              var input = this;
              e.ctrlKey && e.keyCode === _keycode.default.RIGHT && (this.inputmask._valueSet(importDate(new Date(), opts)),
                $(this).trigger("setvalue"));
            },
            onUnMask: function onUnMask(maskedValue, unmaskedValue, opts) {
              return unmaskedValue ? parse(opts.outputFormat, analyseMask(maskedValue, opts.inputFormat, opts), opts, !0) : unmaskedValue;
            },
            casing: function casing(elem, test, pos, validPositions) {
              return 0 == test.nativeDef.indexOf("[ap]") ? elem.toLowerCase() : 0 == test.nativeDef.indexOf("[AP]") ? elem.toUpperCase() : elem;
            },
            onBeforeMask: function onBeforeMask(initialValue, opts) {
              return "[object Date]" === Object.prototype.toString.call(initialValue) && (initialValue = importDate(initialValue, opts)),
                initialValue;
            },
            insertMode: !1,
            shiftPositions: !1,
            keepStatic: !1,
            inputmode: "numeric"
          }
        });
      }, function (module, exports, __webpack_require__) {
        "use strict";
        var _inputmask = _interopRequireDefault(__webpack_require__(2)), _keycode = _interopRequireDefault(__webpack_require__(0)), _escapeRegex = _interopRequireDefault(__webpack_require__(14));
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var $ = _inputmask.default.dependencyLib;
        function autoEscape(txt, opts) {
          for (var escapedTxt = "", i = 0; i < txt.length; i++) _inputmask.default.prototype.definitions[txt.charAt(i)] || opts.definitions[txt.charAt(i)] || opts.optionalmarker[0] === txt.charAt(i) || opts.optionalmarker[1] === txt.charAt(i) || opts.quantifiermarker[0] === txt.charAt(i) || opts.quantifiermarker[1] === txt.charAt(i) || opts.groupmarker[0] === txt.charAt(i) || opts.groupmarker[1] === txt.charAt(i) || opts.alternatormarker === txt.charAt(i) ? escapedTxt += "\\" + txt.charAt(i) : escapedTxt += txt.charAt(i);
          return escapedTxt;
        }
        function alignDigits(buffer, digits, opts, force) {
          if (0 < buffer.length && 0 < digits && (!opts.digitsOptional || force)) {
            var radixPosition = buffer.indexOf(opts.radixPoint), negationBack = !1;
            opts.negationSymbol.back === buffer[buffer.length - 1] && (negationBack = !0, buffer.length--),
              -1 === radixPosition && (buffer.push(opts.radixPoint), radixPosition = buffer.length - 1);
            for (var i = 1; i <= digits; i++) isFinite(buffer[radixPosition + i]) || (buffer[radixPosition + i] = "0");
          }
          return negationBack && buffer.push(opts.negationSymbol.back), buffer;
        }
        function findValidator(symbol, maskset) {
          var posNdx = 0;
          if ("+" === symbol) {
            for (posNdx in maskset.validPositions);
            posNdx = parseInt(posNdx);
          }
          for (var tstNdx in maskset.tests) if (tstNdx = parseInt(tstNdx), posNdx <= tstNdx) for (var ndx = 0, ndxl = maskset.tests[tstNdx].length; ndx < ndxl; ndx++) if ((void 0 === maskset.validPositions[tstNdx] || "-" === symbol) && maskset.tests[tstNdx][ndx].match.def === symbol) return tstNdx + (void 0 !== maskset.validPositions[tstNdx] && "-" !== symbol ? 1 : 0);
          return posNdx;
        }
        function findValid(symbol, maskset) {
          var ret = -1;
          for (var ndx in maskset.validPositions) {
            var tst = maskset.validPositions[ndx];
            if (tst && tst.match.def === symbol) {
              ret = parseInt(ndx);
              break;
            }
          }
          return ret;
        }
        function parseMinMaxOptions(opts) {
          void 0 === opts.parseMinMaxOptions && (null !== opts.min && (opts.min = opts.min.toString().replace(new RegExp((0,
            _escapeRegex.default)(opts.groupSeparator), "g"), ""), "," === opts.radixPoint && (opts.min = opts.min.replace(opts.radixPoint, ".")),
            opts.min = isFinite(opts.min) ? parseFloat(opts.min) : NaN, isNaN(opts.min) && (opts.min = Number.MIN_VALUE)),
            null !== opts.max && (opts.max = opts.max.toString().replace(new RegExp((0, _escapeRegex.default)(opts.groupSeparator), "g"), ""),
              "," === opts.radixPoint && (opts.max = opts.max.replace(opts.radixPoint, ".")),
              opts.max = isFinite(opts.max) ? parseFloat(opts.max) : NaN, isNaN(opts.max) && (opts.max = Number.MAX_VALUE)),
            opts.parseMinMaxOptions = "done");
        }
        function genMask(opts) {
          opts.repeat = 0, opts.groupSeparator === opts.radixPoint && opts.digits && "0" !== opts.digits && ("." === opts.radixPoint ? opts.groupSeparator = "," : "," === opts.radixPoint ? opts.groupSeparator = "." : opts.groupSeparator = ""),
            " " === opts.groupSeparator && (opts.skipOptionalPartCharacter = void 0), 1 < opts.placeholder.length && (opts.placeholder = opts.placeholder.charAt(0)),
            "radixFocus" === opts.positionCaretOnClick && "" === opts.placeholder && (opts.positionCaretOnClick = "lvp");
          var decimalDef = "0", radixPointDef = opts.radixPoint;
          !0 === opts.numericInput && void 0 === opts.__financeInput ? (decimalDef = "1",
            opts.positionCaretOnClick = "radixFocus" === opts.positionCaretOnClick ? "lvp" : opts.positionCaretOnClick,
            opts.digitsOptional = !1, isNaN(opts.digits) && (opts.digits = 2), opts._radixDance = !1,
            radixPointDef = "," === opts.radixPoint ? "?" : "!", "" !== opts.radixPoint && void 0 === opts.definitions[radixPointDef] && (opts.definitions[radixPointDef] = {},
              opts.definitions[radixPointDef].validator = "[" + opts.radixPoint + "]", opts.definitions[radixPointDef].placeholder = opts.radixPoint,
              opts.definitions[radixPointDef].static = !0, opts.definitions[radixPointDef].generated = !0)) : (opts.__financeInput = !1,
                opts.numericInput = !0);
          var mask = "[+]", altMask;
          if (mask += autoEscape(opts.prefix, opts), "" !== opts.groupSeparator ? (void 0 === opts.definitions[opts.groupSeparator] && (opts.definitions[opts.groupSeparator] = {},
            opts.definitions[opts.groupSeparator].validator = "[" + opts.groupSeparator + "]",
            opts.definitions[opts.groupSeparator].placeholder = opts.groupSeparator, opts.definitions[opts.groupSeparator].static = !0,
            opts.definitions[opts.groupSeparator].generated = !0), mask += opts._mask(opts)) : mask += "9{+}",
            void 0 !== opts.digits && 0 !== opts.digits) {
            var dq = opts.digits.toString().split(",");
            isFinite(dq[0]) && dq[1] && isFinite(dq[1]) ? mask += radixPointDef + decimalDef + "{" + opts.digits + "}" : (isNaN(opts.digits) || 0 < parseInt(opts.digits)) && (opts.digitsOptional ? (altMask = mask + radixPointDef + decimalDef + "{0," + opts.digits + "}",
              opts.keepStatic = !0) : mask += radixPointDef + decimalDef + "{" + opts.digits + "}");
          }
          return mask += autoEscape(opts.suffix, opts), mask += "[-]", altMask && (mask = [altMask + autoEscape(opts.suffix, opts) + "[-]", mask]),
            opts.greedy = !1, parseMinMaxOptions(opts), mask;
        }
        function hanndleRadixDance(pos, c, radixPos, maskset, opts) {
          return opts._radixDance && opts.numericInput && c !== opts.negationSymbol.back && pos <= radixPos && (0 < radixPos || c == opts.radixPoint) && (void 0 === maskset.validPositions[pos - 1] || maskset.validPositions[pos - 1].input !== opts.negationSymbol.back) && (pos -= 1),
            pos;
        }
        function decimalValidator(chrs, maskset, pos, strict, opts) {
          var radixPos = maskset.buffer ? maskset.buffer.indexOf(opts.radixPoint) : -1, result = -1 !== radixPos && new RegExp("[0-9\uff11-\uff19]").test(chrs);
          return opts._radixDance && result && null == maskset.validPositions[radixPos] ? {
            insert: {
              pos: radixPos === pos ? radixPos + 1 : radixPos,
              c: opts.radixPoint
            },
            pos: pos
          } : result;
        }
        function checkForLeadingZeroes(buffer, opts) {
          var numberMatches = new RegExp("(^" + ("" !== opts.negationSymbol.front ? (0, _escapeRegex.default)(opts.negationSymbol.front) + "?" : "") + (0,
            _escapeRegex.default)(opts.prefix) + ")(.*)(" + (0, _escapeRegex.default)(opts.suffix) + ("" != opts.negationSymbol.back ? (0,
              _escapeRegex.default)(opts.negationSymbol.back) + "?" : "") + "$)").exec(buffer.slice().reverse().join("")), number = numberMatches ? numberMatches[2] : "", leadingzeroes = !1;
          return number && (number = number.split(opts.radixPoint.charAt(0))[0], leadingzeroes = new RegExp("^[0" + opts.groupSeparator + "]*").exec(number)),
            !(!leadingzeroes || !(1 < leadingzeroes[0].length || 0 < leadingzeroes[0].length && leadingzeroes[0].length < number.length)) && leadingzeroes;
        }
        _inputmask.default.extendAliases({
          numeric: {
            mask: genMask,
            _mask: function _mask(opts) {
              return "(" + opts.groupSeparator + "999){+|1}";
            },
            digits: "*",
            digitsOptional: !0,
            enforceDigitsOnBlur: !1,
            radixPoint: ".",
            positionCaretOnClick: "radixFocus",
            _radixDance: !0,
            groupSeparator: "",
            allowMinus: !0,
            negationSymbol: {
              front: "-",
              back: ""
            },
            prefix: "",
            suffix: "",
            min: null,
            max: null,
            SetMaxOnOverflow: !1,
            step: 1,
            inputType: "text",
            unmaskAsNumber: !1,
            roundingFN: Math.round,
            inputmode: "numeric",
            shortcuts: {
              k: "000",
              m: "000000"
            },
            placeholder: "0",
            greedy: !1,
            rightAlign: !0,
            insertMode: !0,
            autoUnmask: !1,
            skipOptionalPartCharacter: "",
            definitions: {
              0: {
                validator: decimalValidator
              },
              1: {
                validator: decimalValidator,
                definitionSymbol: "9"
              },
              "+": {
                validator: function validator(chrs, maskset, pos, strict, opts) {
                  return opts.allowMinus && ("-" === chrs || chrs === opts.negationSymbol.front);
                }
              },
              "-": {
                validator: function validator(chrs, maskset, pos, strict, opts) {
                  return opts.allowMinus && chrs === opts.negationSymbol.back;
                }
              }
            },
            preValidation: function preValidation(buffer, pos, c, isSelection, opts, maskset, caretPos, strict) {
              if (!1 !== opts.__financeInput && c === opts.radixPoint) return !1;
              var pattern;
              if (pattern = opts.shortcuts && opts.shortcuts[c]) {
                if (1 < pattern.length) for (var inserts = [], i = 0; i < pattern.length; i++) inserts.push({
                  pos: pos + i,
                  c: pattern[i],
                  strict: !1
                });
                return {
                  insert: inserts
                };
              }
              var radixPos = buffer.indexOf(opts.radixPoint), initPos = pos;
              if (pos = hanndleRadixDance(pos, c, radixPos, maskset, opts), "-" === c || c === opts.negationSymbol.front) {
                if (!0 !== opts.allowMinus) return !1;
                var isNegative = !1, front = findValid("+", maskset), back = findValid("-", maskset);
                return -1 !== front && (isNegative = [front, back]), !1 !== isNegative ? {
                  remove: isNegative,
                  caret: initPos - opts.negationSymbol.front.length
                } : {
                    insert: [{
                      pos: findValidator("+", maskset),
                      c: opts.negationSymbol.front,
                      fromIsValid: !0
                    }, {
                      pos: findValidator("-", maskset),
                      c: opts.negationSymbol.back,
                      fromIsValid: void 0
                    }],
                    caret: initPos + opts.negationSymbol.back.length
                  };
              }
              if (c === opts.groupSeparator) return {
                caret: initPos
              };
              if (strict) return !0;
              if (-1 !== radixPos && !0 === opts._radixDance && !1 === isSelection && c === opts.radixPoint && void 0 !== opts.digits && (isNaN(opts.digits) || 0 < parseInt(opts.digits)) && radixPos !== pos) return {
                caret: opts._radixDance && pos === radixPos - 1 ? radixPos + 1 : radixPos
              };
              if (!1 === opts.__financeInput) if (isSelection) {
                if (opts.digitsOptional) return {
                  rewritePosition: caretPos.end
                };
                if (!opts.digitsOptional) {
                  if (caretPos.begin > radixPos && caretPos.end <= radixPos) return c === opts.radixPoint ? {
                    insert: {
                      pos: radixPos + 1,
                      c: "0",
                      fromIsValid: !0
                    },
                    rewritePosition: radixPos
                  } : {
                      rewritePosition: radixPos + 1
                    };
                  if (caretPos.begin < radixPos) return {
                    rewritePosition: caretPos.begin - 1
                  };
                }
              } else if (!opts.showMaskOnHover && !opts.showMaskOnFocus && !opts.digitsOptional && 0 < opts.digits && "" === this.__valueGet.call(this)) return {
                rewritePosition: radixPos
              };
              return {
                rewritePosition: pos
              };
            },
            postValidation: function postValidation(buffer, pos, c, currentResult, opts, maskset, strict) {
              if (!1 === currentResult) return currentResult;
              if (strict) return !0;
              if (null !== opts.min || null !== opts.max) {
                var unmasked = opts.onUnMask(buffer.slice().reverse().join(""), void 0, $.extend({}, opts, {
                  unmaskAsNumber: !0
                }));
                if (null !== opts.min && unmasked < opts.min && (unmasked.toString().length > opts.min.toString().length || unmasked < 0)) return !1;
                if (null !== opts.max && unmasked > opts.max) return !!opts.SetMaxOnOverflow && {
                  refreshFromBuffer: !0,
                  buffer: alignDigits(opts.max.toString().replace(".", opts.radixPoint).split(""), opts.digits, opts).reverse()
                };
              }
              return currentResult;
            },
            onUnMask: function onUnMask(maskedValue, unmaskedValue, opts) {
              if ("" === unmaskedValue && !0 === opts.nullable) return unmaskedValue;
              var processValue = maskedValue.replace(opts.prefix, "");
              return processValue = processValue.replace(opts.suffix, ""), processValue = processValue.replace(new RegExp((0,
                _escapeRegex.default)(opts.groupSeparator), "g"), ""), "" !== opts.placeholder.charAt(0) && (processValue = processValue.replace(new RegExp(opts.placeholder.charAt(0), "g"), "0")),
                opts.unmaskAsNumber ? ("" !== opts.radixPoint && -1 !== processValue.indexOf(opts.radixPoint) && (processValue = processValue.replace(_escapeRegex.default.call(this, opts.radixPoint), ".")),
                  processValue = processValue.replace(new RegExp("^" + (0, _escapeRegex.default)(opts.negationSymbol.front)), "-"),
                  processValue = processValue.replace(new RegExp((0, _escapeRegex.default)(opts.negationSymbol.back) + "$"), ""),
                  Number(processValue)) : processValue;
            },
            isComplete: function isComplete(buffer, opts) {
              var maskedValue = (opts.numericInput ? buffer.slice().reverse() : buffer).join("");
              return maskedValue = maskedValue.replace(new RegExp("^" + (0, _escapeRegex.default)(opts.negationSymbol.front)), "-"),
                maskedValue = maskedValue.replace(new RegExp((0, _escapeRegex.default)(opts.negationSymbol.back) + "$"), ""),
                maskedValue = maskedValue.replace(opts.prefix, ""), maskedValue = maskedValue.replace(opts.suffix, ""),
                maskedValue = maskedValue.replace(new RegExp((0, _escapeRegex.default)(opts.groupSeparator) + "([0-9]{3})", "g"), "$1"),
                "," === opts.radixPoint && (maskedValue = maskedValue.replace((0, _escapeRegex.default)(opts.radixPoint), ".")),
                isFinite(maskedValue);
            },
            onBeforeMask: function onBeforeMask(initialValue, opts) {
              var radixPoint = opts.radixPoint || ",";
              isFinite(opts.digits) && (opts.digits = parseInt(opts.digits)), "number" != typeof initialValue && "number" !== opts.inputType || "" === radixPoint || (initialValue = initialValue.toString().replace(".", radixPoint));
              var isNagtive = "-" === initialValue.charAt(0) || initialValue.charAt(0) === opts.negationSymbol.front, valueParts = initialValue.split(radixPoint), integerPart = valueParts[0].replace(/[^\-0-9]/g, ""), decimalPart = 1 < valueParts.length ? valueParts[1].replace(/[^0-9]/g, "") : "", forceDigits = 1 < valueParts.length;
              initialValue = integerPart + ("" !== decimalPart ? radixPoint + decimalPart : decimalPart);
              var digits = 0;
              if ("" !== radixPoint && (digits = opts.digitsOptional ? opts.digits < decimalPart.length ? opts.digits : decimalPart.length : opts.digits,
                "" !== decimalPart || !opts.digitsOptional)) {
                var digitsFactor = Math.pow(10, digits || 1);
                initialValue = initialValue.replace((0, _escapeRegex.default)(radixPoint), "."),
                  isNaN(parseFloat(initialValue)) || (initialValue = (opts.roundingFN(parseFloat(initialValue) * digitsFactor) / digitsFactor).toFixed(digits)),
                  initialValue = initialValue.toString().replace(".", radixPoint);
              }
              if (0 === opts.digits && -1 !== initialValue.indexOf(radixPoint) && (initialValue = initialValue.substring(0, initialValue.indexOf(radixPoint))),
                null !== opts.min || null !== opts.max) {
                var numberValue = initialValue.toString().replace(radixPoint, ".");
                null !== opts.min && numberValue < opts.min ? initialValue = opts.min.toString().replace(".", radixPoint) : null !== opts.max && numberValue > opts.max && (initialValue = opts.max.toString().replace(".", radixPoint));
              }
              return isNagtive && "-" !== initialValue.charAt(0) && (initialValue = "-" + initialValue),
                alignDigits(initialValue.toString().split(""), digits, opts, forceDigits).join("");
            },
            onBeforeWrite: function onBeforeWrite(e, buffer, caretPos, opts) {
              function stripBuffer(buffer, stripRadix) {
                if (!1 !== opts.__financeInput || stripRadix) {
                  var position = buffer.indexOf(opts.radixPoint);
                  -1 !== position && buffer.splice(position, 1);
                }
                if ("" !== opts.groupSeparator) for (; -1 !== (position = buffer.indexOf(opts.groupSeparator));) buffer.splice(position, 1);
                return buffer;
              }
              var result, leadingzeroes = checkForLeadingZeroes(buffer, opts);
              if (leadingzeroes) for (var caretNdx = buffer.join("").lastIndexOf(leadingzeroes[0].split("").reverse().join("")) - (leadingzeroes[0] == leadingzeroes.input ? 0 : 1), offset = leadingzeroes[0] == leadingzeroes.input ? 1 : 0, i = leadingzeroes[0].length - offset; 0 < i; i--) delete this.maskset.validPositions[caretNdx + i],
                delete buffer[caretNdx + i];
              if (e) switch (e.type) {
                case "blur":
                case "checkval":
                  if (null !== opts.min) {
                    var unmasked = opts.onUnMask(buffer.slice().reverse().join(""), void 0, $.extend({}, opts, {
                      unmaskAsNumber: !0
                    }));
                    if (null !== opts.min && unmasked < opts.min) return {
                      refreshFromBuffer: !0,
                      buffer: alignDigits(opts.min.toString().replace(".", opts.radixPoint).split(""), opts.digits, opts).reverse()
                    };
                  }
                  if (buffer[buffer.length - 1] === opts.negationSymbol.front) {
                    var nmbrMtchs = new RegExp("(^" + ("" != opts.negationSymbol.front ? (0, _escapeRegex.default)(opts.negationSymbol.front) + "?" : "") + (0,
                      _escapeRegex.default)(opts.prefix) + ")(.*)(" + (0, _escapeRegex.default)(opts.suffix) + ("" != opts.negationSymbol.back ? (0,
                        _escapeRegex.default)(opts.negationSymbol.back) + "?" : "") + "$)").exec(stripBuffer(buffer.slice(), !0).reverse().join("")), number = nmbrMtchs ? nmbrMtchs[2] : "";
                    0 == number && (result = {
                      refreshFromBuffer: !0,
                      buffer: [0]
                    });
                  } else "" !== opts.radixPoint && buffer[0] === opts.radixPoint && (result && result.buffer ? result.buffer.shift() : (buffer.shift(),
                    result = {
                      refreshFromBuffer: !0,
                      buffer: stripBuffer(buffer)
                    }));
                  if (opts.enforceDigitsOnBlur) {
                    result = result || {};
                    var bffr = result && result.buffer || buffer.slice().reverse();
                    result.refreshFromBuffer = !0, result.buffer = alignDigits(bffr, opts.digits, opts, !0).reverse();
                  }
              }
              return result;
            },
            onKeyDown: function onKeyDown(e, buffer, caretPos, opts) {
              var $input = $(this), bffr;
              if (e.ctrlKey) switch (e.keyCode) {
                case _keycode.default.UP:
                  return this.inputmask.__valueSet.call(this, parseFloat(this.inputmask.unmaskedvalue()) + parseInt(opts.step)),
                    $input.trigger("setvalue"), !1;

                case _keycode.default.DOWN:
                  return this.inputmask.__valueSet.call(this, parseFloat(this.inputmask.unmaskedvalue()) - parseInt(opts.step)),
                    $input.trigger("setvalue"), !1;
              }
              if (!e.shiftKey && (e.keyCode === _keycode.default.DELETE || e.keyCode === _keycode.default.BACKSPACE || e.keyCode === _keycode.default.BACKSPACE_SAFARI) && caretPos.begin !== buffer.length) {
                if (buffer[e.keyCode === _keycode.default.DELETE ? caretPos.begin - 1 : caretPos.end] === opts.negationSymbol.front) return bffr = buffer.slice().reverse(),
                  "" !== opts.negationSymbol.front && bffr.shift(), "" !== opts.negationSymbol.back && bffr.pop(),
                  $input.trigger("setvalue", [bffr.join(""), caretPos.begin]), !1;
                if (!0 === opts._radixDance) {
                  var radixPos = buffer.indexOf(opts.radixPoint);
                  if (opts.digitsOptional) {
                    if (0 === radixPos) return bffr = buffer.slice().reverse(), bffr.pop(), $input.trigger("setvalue", [bffr.join(""), caretPos.begin >= bffr.length ? bffr.length : caretPos.begin]),
                      !1;
                  } else if (-1 !== radixPos && (caretPos.begin < radixPos || caretPos.end < radixPos || e.keyCode === _keycode.default.DELETE && caretPos.begin === radixPos)) return caretPos.begin !== caretPos.end || e.keyCode !== _keycode.default.BACKSPACE && e.keyCode !== _keycode.default.BACKSPACE_SAFARI || caretPos.begin++,
                    bffr = buffer.slice().reverse(), bffr.splice(bffr.length - caretPos.begin, caretPos.begin - caretPos.end + 1),
                    bffr = alignDigits(bffr, opts.digits, opts).join(""), $input.trigger("setvalue", [bffr, caretPos.begin >= bffr.length ? radixPos + 1 : caretPos.begin]),
                    !1;
                }
              }
            }
          },
          currency: {
            prefix: "",
            groupSeparator: ",",
            alias: "numeric",
            digits: 2,
            digitsOptional: !1
          },
          decimal: {
            alias: "numeric"
          },
          integer: {
            alias: "numeric",
            digits: 0
          },
          percentage: {
            alias: "numeric",
            min: 0,
            max: 100,
            suffix: " %",
            digits: 0,
            allowMinus: !1
          },
          indianns: {
            alias: "numeric",
            _mask: function _mask(opts) {
              return "(" + opts.groupSeparator + "99){*|1}(" + opts.groupSeparator + "999){1|1}";
            },
            groupSeparator: ",",
            radixPoint: ".",
            placeholder: "0",
            digits: 2,
            digitsOptional: !1
          }
        });
      }, function (module, exports, __webpack_require__) {
        "use strict";
        var _window = _interopRequireDefault(__webpack_require__(5)), _inputmask = _interopRequireDefault(__webpack_require__(2)), _canUseDOM = _interopRequireDefault(__webpack_require__(6));
        function _typeof(obj) {
          return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function _typeof(obj) {
            return typeof obj;
          } : function _typeof(obj) {
            return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
          }, _typeof(obj);
        }
        function _classCallCheck(instance, Constructor) {
          if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
        }
        function _inherits(subClass, superClass) {
          if ("function" != typeof superClass && null !== superClass) throw new TypeError("Super expression must either be null or a function");
          subClass.prototype = Object.create(superClass && superClass.prototype, {
            constructor: {
              value: subClass,
              writable: !0,
              configurable: !0
            }
          }), superClass && _setPrototypeOf(subClass, superClass);
        }
        function _createSuper(Derived) {
          var hasNativeReflectConstruct = _isNativeReflectConstruct();
          return function _createSuperInternal() {
            var Super = _getPrototypeOf(Derived), result;
            if (hasNativeReflectConstruct) {
              var NewTarget = _getPrototypeOf(this).constructor;
              result = Reflect.construct(Super, arguments, NewTarget);
            } else result = Super.apply(this, arguments);
            return _possibleConstructorReturn(this, result);
          };
        }
        function _possibleConstructorReturn(self, call) {
          return !call || "object" !== _typeof(call) && "function" != typeof call ? _assertThisInitialized(self) : call;
        }
        function _assertThisInitialized(self) {
          if (void 0 === self) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
          return self;
        }
        function _wrapNativeSuper(Class) {
          var _cache = "function" == typeof Map ? new Map() : void 0;
          return _wrapNativeSuper = function _wrapNativeSuper(Class) {
            if (null === Class || !_isNativeFunction(Class)) return Class;
            if ("function" != typeof Class) throw new TypeError("Super expression must either be null or a function");
            if ("undefined" != typeof _cache) {
              if (_cache.has(Class)) return _cache.get(Class);
              _cache.set(Class, Wrapper);
            }
            function Wrapper() {
              return _construct(Class, arguments, _getPrototypeOf(this).constructor);
            }
            return Wrapper.prototype = Object.create(Class.prototype, {
              constructor: {
                value: Wrapper,
                enumerable: !1,
                writable: !0,
                configurable: !0
              }
            }), _setPrototypeOf(Wrapper, Class);
          }, _wrapNativeSuper(Class);
        }
        function _construct(Parent, args, Class) {
          return _construct = _isNativeReflectConstruct() ? Reflect.construct : function _construct(Parent, args, Class) {
            var a = [null];
            a.push.apply(a, args);
            var Constructor = Function.bind.apply(Parent, a), instance = new Constructor();
            return Class && _setPrototypeOf(instance, Class.prototype), instance;
          }, _construct.apply(null, arguments);
        }
        function _isNativeReflectConstruct() {
          if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
          if (Reflect.construct.sham) return !1;
          if ("function" == typeof Proxy) return !0;
          try {
            return Date.prototype.toString.call(Reflect.construct(Date, [], function () { })),
              !0;
          } catch (e) {
            return !1;
          }
        }
        function _isNativeFunction(fn) {
          return -1 !== Function.toString.call(fn).indexOf("[native code]");
        }
        function _setPrototypeOf(o, p) {
          return _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {
            return o.__proto__ = p, o;
          }, _setPrototypeOf(o, p);
        }
        function _getPrototypeOf(o) {
          return _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {
            return o.__proto__ || Object.getPrototypeOf(o);
          }, _getPrototypeOf(o);
        }
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule ? obj : {
            default: obj
          };
        }
        var document = _window.default.document;
        if (_canUseDOM.default && document && document.head && document.head.attachShadow && _window.default.customElements && void 0 === _window.default.customElements.get("input-mask")) {
          var InputmaskElement = function (_HTMLElement) {
            _inherits(InputmaskElement, _HTMLElement);
            var _super = _createSuper(InputmaskElement);
            function InputmaskElement() {
              var _this;
              _classCallCheck(this, InputmaskElement), _this = _super.call(this);
              var attributeNames = _this.getAttributeNames(), shadow = _this.attachShadow({
                mode: "closed"
              }), input = document.createElement("input");
              for (var attr in input.type = "text", shadow.appendChild(input), attributeNames) Object.prototype.hasOwnProperty.call(attributeNames, attr) && input.setAttribute(attributeNames[attr], _this.getAttribute(attributeNames[attr]));
              var im = new _inputmask.default();
              return im.dataAttribute = "", im.mask(input), input.inputmask.shadowRoot = shadow,
                _this;
            }
            return InputmaskElement;
          }(_wrapNativeSuper(HTMLElement));
          _window.default.customElements.define("input-mask", InputmaskElement);
        }
      }], installedModules = {}, __webpack_require__.m = modules, __webpack_require__.c = installedModules,
        __webpack_require__.d = function (exports, name, getter) {
          __webpack_require__.o(exports, name) || Object.defineProperty(exports, name, {
            enumerable: !0,
            get: getter
          });
        }, __webpack_require__.r = function (exports) {
          "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(exports, Symbol.toStringTag, {
            value: "Module"
          }), Object.defineProperty(exports, "__esModule", {
            value: !0
          });
        }, __webpack_require__.t = function (value, mode) {
          if (1 & mode && (value = __webpack_require__(value)), 8 & mode) return value;
          if (4 & mode && "object" == typeof value && value && value.__esModule) return value;
          var ns = Object.create(null);
          if (__webpack_require__.r(ns), Object.defineProperty(ns, "default", {
            enumerable: !0,
            value: value
          }), 2 & mode && "string" != typeof value) for (var key in value) __webpack_require__.d(ns, key, function (key) {
            return value[key];
          }.bind(null, key));
          return ns;
        }, __webpack_require__.n = function (module) {
          var getter = module && module.__esModule ? function getDefault() {
            return module.default;
          } : function getModuleExports() {
            return module;
          };
          return __webpack_require__.d(getter, "a", getter), getter;
        }, __webpack_require__.o = function (object, property) {
          return Object.prototype.hasOwnProperty.call(object, property);
        }, __webpack_require__.p = "", __webpack_require__(__webpack_require__.s = 15);
      function __webpack_require__(moduleId) {
        if (installedModules[moduleId]) return installedModules[moduleId].exports;
        var module = installedModules[moduleId] = {
          i: moduleId,
          l: !1,
          exports: {}
        };
        return modules[moduleId].call(module.exports, module, module.exports, __webpack_require__),
          module.l = !0, module.exports;
      }
      var modules, installedModules;
    });

  })));

  window.Inputmask = Inputmask;
})();
