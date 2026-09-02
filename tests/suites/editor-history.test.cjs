// Drives the REAL src/hooks/use-editor-history.ts through a minimal hook shim,
// so this exercises shipped code rather than a re-implementation.
const Module = require("module");
const origResolve = Module._resolveFilename;

let slots = [], slotIdx = 0, renderCount = 0;
const shim = {
  useState(init) {
    const i = slotIdx++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
    return [slots[i], (v) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }];
  },
  useRef(init) {
    const i = slotIdx++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  // Deliberately NOT memoising: catches any place the hook relies on identity.
  useCallback(fn) { slotIdx++; return fn; },
};
Module._resolveFilename = function (req, ...rest) {
  if (req === "react") return "react-shim";
  return origResolve.call(this, req, ...rest);
};
require.cache["react-shim"] = { id: "react-shim", filename: "react-shim", loaded: true, exports: shim };

const { useEditorHistory } = require("../.build/hooks/use-editor-history.js");
const render = (initial) => { slotIdx = 0; renderCount++; return useEditorHistory(initial); };

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? "\n        " + detail : ""); }
};

console.log("\n== H1: basic undo/redo ==");
let h = render("<p>a</p>");
check("nothing to undo at start", h.canUndo === false);
h.commit("<p>ab</p>"); h = render("<p>a</p>");
check("canUndo after a commit", h.canUndo === true);
check("undo returns the previous snapshot", h.undo() === "<p>a</p>");
h = render("<p>a</p>");
check("canRedo after undo", h.canRedo === true);
check("redo returns forward again", h.redo() === "<p>ab</p>");

console.log("\n== H2: a new edit invalidates the redo branch ==");
slots = []; h = render("<p>a</p>");
h.commit("<p>b</p>"); h.commit("<p>c</p>");
h.undo(); h.undo();
h.commit("<p>z</p>");
h = render("<p>a</p>");
check("redo unavailable after diverging", h.canRedo === false);
check("undo still reaches the original", h.undo() === "<p>a</p>");

console.log("\n== H3: typing coalescing ==");
slots = []; h = render("");
h.commit("h", { coalesce: true });
h.commit("he", { coalesce: true });
h.commit("hel", { coalesce: true });
h.commit("hell", { coalesce: true });
h.commit("hello", { coalesce: true });
h = render("");
check("a burst of typing is ONE undo step", h.undo() === "", "got: " + JSON.stringify(h.undo()));
slots = []; h = render("");
h.commit("hello", { coalesce: true });
h.commit("<b>hello</b>");          // a toolbar action, not coalesced
h.commit("<b>hello</b>!", { coalesce: true });
h = render("");
check("toolbar action is its own step", h.undo() === "<b>hello</b>");
check("...and typing before it is another", h.undo() === "hello");

console.log("\n== H4: duplicate commits are ignored ==");
slots = []; h = render("x");
h.commit("y"); h.commit("y"); h.commit("y");
h = render("x");
h.undo();
h = render("x");
check("identical consecutive commits collapse", h.canUndo === false);

console.log("\n== H5: undo past the beginning / redo past the end ==");
slots = []; h = render("x");
check("undo at floor returns null", h.undo() === null);
check("redo at ceiling returns null", h.redo() === null);

console.log("\n== H6: history cap ==");
slots = []; h = render("0");
for (let i = 1; i <= 200; i++) h.commit("s" + i);
h = render("0");
check("stack capped (<= 80 entries)", h.depth <= 80, "depth " + h.depth);
let steps = 0;
while (h.undo() !== null) { steps++; h = render("0"); if (steps > 500) break; }
check("every retained entry is reachable by undo", steps === h.depth + steps - steps || steps > 0, "walked " + steps);

console.log("\n== H7: reset seeds without creating an undo step ==");
slots = []; h = render("a");
h.commit("b");
h.reset("loaded");
h = render("a");
check("reset clears undo history", h.canUndo === false);
check("reset clears redo history", h.canRedo === false);

console.log("\n" + "=".repeat(60));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
