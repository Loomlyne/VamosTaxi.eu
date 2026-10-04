// One-off: stripCss equals a naive comment removal on every <style> body under app/ (no string holds "/*").
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripCss } from "../../../../scripts/strip-public-comments.mjs";

let n = 0;
let bad = 0;
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) {
      for (const m of readFileSync(p, "utf8").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
        n += 1;
        if (stripCss(m[1]) !== m[1].replace(/\/\*[\s\S]*?\*\//g, " ")) { bad += 1; console.log("DIFF", p); }
      }
    }
  }
};
walk("app");
console.log(`${n} style blocks, ${bad} differ`);
process.exit(bad ? 1 : 0);
