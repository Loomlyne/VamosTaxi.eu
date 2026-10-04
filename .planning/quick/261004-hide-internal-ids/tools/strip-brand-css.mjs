// F3 (reviewer, 2026-10-04): apps/web/public/brand/tokens/*.css is committed and served as-is
// (/brand/tokens/*.css). Strip its developer comments in the source. Run from the repo root.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripCss } from "../../../../scripts/strip-public-comments.mjs";

const dir = "apps/web/public/brand/tokens";
for (const f of readdirSync(dir).filter((x) => x.endsWith(".css"))) {
  const p = join(dir, f);
  const src = readFileSync(p, "utf8");
  const out = stripCss(src);
  if (out !== src) { writeFileSync(p, out); console.log("stripped", p); }
}
