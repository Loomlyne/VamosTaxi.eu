// One-off proof (not a gate): for every JS file and every JS <script> body under app/,
// the token stream acorn reads before and after stripJs is identical, and no comment
// (other than license notices) survives. Run from the repo root:
//   node .planning/quick/261004-hide-internal-ids/evidence/verify-strip.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as acorn from "../../../../node_modules/.pnpm/acorn@8.18.0/node_modules/acorn/dist/acorn.mjs";
import { stripJs, stripHtml } from "../../../../scripts/strip-public-comments.mjs";

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name) && e.name !== "support.js") files.push(p);
  }
};
walk("app");

function tokens(src, comments) {
  const out = [];
  const opts = { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, onComment: comments };
  for (const t of acorn.tokenizer(src, opts)) out.push(`${t.type.label}:${t.value ?? ""}`);
  return out;
}

let checked = 0, bad = 0, skipped = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const bodies = [];
  if (f.endsWith(".js")) bodies.push(src);
  else {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(src))) if (!/src=/.test(m[1]) && !/ld\+json/.test(m[1])) bodies.push(m[2]);
  }
  for (const b of bodies) {
    let a;
    try { a = tokens(b); } catch (e) { skipped += 1; console.log("SKIP (acorn cannot read original)", f, e.message); continue; }
    const left = [];
    const s = stripJs(b);
    let z;
    try { z = tokens(s, (block, text) => { if (!/^!|@license|@preserve/.test(text)) left.push(text.slice(0, 60)); }); }
    catch (e) { bad += 1; console.log("BROKEN", f, e.message); continue; }
    checked += 1;
    if (a.join("\n") !== z.join("\n")) { bad += 1; console.log("TOKENS DIFFER", f); }
    if (left.length) { bad += 1; console.log("COMMENT LEFT", f, left[0]); }
  }
  if (f.endsWith(".html")) {
    const h = stripHtml(src);
    if (h.includes("<!--")) { bad += 1; console.log("HTML COMMENT LEFT", f); }
    // Markup outside script/style must be byte-identical once HTML comments are removed.
    const outside = (x) => x.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
    if (outside(src) !== outside(h)) { bad += 1; console.log("MARKUP CHANGED", f); }
  }
}
console.log(`checked ${checked} script bodies in ${files.length} files, ${skipped} skipped, ${bad} problems`);
process.exit(bad ? 1 : 0);
