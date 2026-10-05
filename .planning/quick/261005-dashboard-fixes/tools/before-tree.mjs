#!/usr/bin/env node
// Builds the "before" side of the pictures: origin/main as of 328b133c.
//   node before-tree.mjs <scratch dir>
// - <scratch>/before-public: a copy of the synced apps/web/public of this branch with the dashboard files this job changed
//   put back to their 328b133c text (raw, comments not stripped: the same code).
// - <scratch>/before-src:    apps/web/lib at 328b133c, for the real mapBoardBooking of that day.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const scratch = resolve(process.argv[2]);
const BASE = "328b133c";
const FILES = [
  "app/vamos-ops-api.js", "app/vamos-ops-data.js", "app/vamos-i18n-dict.js",
  "app/ops/OpsBoard.dc.html", "app/ops/OpsDash.dc.html", "app/ops/OpsDetail.dc.html", "app/ops/OpsFleet.dc.html", "app/ops/OpsReviews.dc.html",
];
rmSync(join(scratch, "before-public"), { recursive: true, force: true });
rmSync(join(scratch, "before-src"), { recursive: true, force: true });
cpSync(join(repo, "apps/web/public"), join(scratch, "before-public"), { recursive: true });
for (const f of FILES) {
  const text = execFileSync("git", ["show", `${BASE}:${f}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(scratch, "before-public", f), text);
}
mkdirSync(join(scratch, "before-src"), { recursive: true });
const tar = execFileSync("git", ["archive", BASE, "apps/web/lib"], { cwd: repo, maxBuffer: 256 * 1024 * 1024 });
execFileSync("tar", ["-x", "-C", join(scratch, "before-src")], { input: tar });
console.log("before tree ready:", join(scratch, "before-public"));
