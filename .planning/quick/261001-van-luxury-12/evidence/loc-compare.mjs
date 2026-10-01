// Old vs new vamos-locale.js on every dictionary pattern: fill each language's template with sample values and
// translate to every other language. Prints only the cases where the two runtimes disagree.
import fs from "node:fs";
function load(dir) {
  const store = {};
  const el = () => ({ setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, style: { removeProperty() {}, setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} });
  const document = { documentElement: el(), head: el(), body: el(), readyState: "complete", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, createElement: el, createTreeWalker: () => ({ nextNode: () => null }), cookie: "" };
  const window = { document, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { pathname: "/", search: "", hostname: "localhost" }, navigator: { language: "en" }, matchMedia: () => ({ matches: false, addEventListener() {} }), setTimeout, clearTimeout, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } }, MutationObserver: class { observe() {} disconnect() {} }, NodeFilter: { SHOW_TEXT: 4 }, fetch: () => Promise.reject(new Error("no")) };
  window.window = window;
  const run = (f) => new Function("window", "document", "localStorage", "navigator", "location", "CustomEvent", "MutationObserver", "NodeFilter", "fetch", fs.readFileSync(dir + f, "utf8"))(window, document, window.localStorage, window.navigator, window.location, window.CustomEvent, window.MutationObserver, window.NodeFilter, window.fetch);
  run("vamos-i18n-dict.js");
  run("vamos-locale.js");
  return window;
}
const oldW = load(process.env.OLD_DIR), newW = load(process.env.NEW_DIR);
/** Same reading as vamos-locale.js englishTemplate: top-level groups become $1.., escapes are dropped. */
function englishTemplate(src) {
  src = src.replace(/^\^/, "").replace(/\$$/, "");
  let out = "", depth = 0, gi = 0;
  for (let c = 0; c < src.length; c++) {
    const ch = src.charAt(c);
    if (ch === "\\") { if (depth === 0) out += src.charAt(c + 1); c++; continue; }
    if (ch === "(") { depth++; if (depth === 1) { gi++; out += "$" + gi; } continue; }
    if (ch === ")") { depth--; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}
const LANGS = ["en", "de", "fr", "ar"];
const cands = ["7", "12", "1", "3", "10", "VT-4821", "Zurich HB", "Tue 29 Sept", "CHF 12.00", "60 minutes", "2026"];
let n = 0, diff = 0, skipped = 0;
for (const p of newW.VamosI18n.patterns) {
  const enTpl = p.re.source.replace(/^\^|\$$/g, "");
  const groups = Math.max(0, ...(Object.values(p).filter((v) => typeof v === "string").join(" ").match(/\$(\d)/g) || ["$0"]).map((s) => +s.slice(1)));
  // Value sets that the pattern's own regex accepts once put into a candidate English string.
  const combos = [];
  const rec = (vals) => {
    if (combos.length >= 4) return;
    if (vals.length === groups) {
      const filled = {}; vals.forEach((v, i) => { filled[i + 1] = v; });
      // Rebuild the English the way the runtime would and keep it only if the real regex agrees.
      const keyFor = (tpl) => tpl.replace(/\$(\d)/g, (_x, d) => filled[+d] ?? "");
      const en = keyFor(englishTemplate(p.re.source));
      p.re.lastIndex = 0;
      if (typeof en === "string" && p.re.test(en)) combos.push({ keyFor, filled });
      p.re.lastIndex = 0;
      return;
    }
    for (const c of cands) rec([...vals, c]);
  };
  if (groups <= 3) rec([]); else skipped++;
  for (const from of ["de", "fr", "ar"]) {
    const tpl = p[from];
    if (!tpl) continue;
    for (const { keyFor } of combos) {
      const key = keyFor(tpl);
      for (const to of LANGS) {
        if (to === from) continue;
        n++;
        const a = oldW.VamosLocale.t(key, to), b = newW.VamosLocale.t(key, to);
        if (a !== b) { diff++; console.log(`${from}→${to} ${JSON.stringify(key)}: old ${JSON.stringify(a)} new ${JSON.stringify(b)}`); }
      }
    }
  }
}
console.log(`compared ${n}, differ ${diff}`);
