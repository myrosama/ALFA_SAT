const katex = require("katex");

try {
    console.log("Single backslash:");
    console.log(katex.renderToString("\\overline{RS}"));
} catch (e) { console.error(e.message); }

try {
    console.log("Double backslash:");
    console.log(katex.renderToString("\\\\overline{RS}"));
} catch (e) { console.error(e.message); }
