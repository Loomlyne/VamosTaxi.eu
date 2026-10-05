#!/usr/bin/env node
// Builds a "before" side: the two dashboard files this job changes, as of a git ref (default origin/main 16f1cfa7).
//   node before-tree.mjs <scratch dir>              # before the whole job
//   BEFORE_REF=8756fd1a node before-tree.mjs <dir>  # before the poll hold (items 1-4 in, the poll still redirects)
// <scratch>/before-public is a copy of the synced apps/web/public of this branch with app/vamos-ops-api.js and
// app/vamos-ops-data.js put back to their text at that ref (raw, comments not stripped: the same code). The synced public
// tree is gitignored: run `node scripts/sync-dc-mock-to-public.mjs` first.
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const scratch = resolve(process.argv[2]);
const BASE = process.env.BEFORE_REF || "16f1cfa7";
rmSync(join(scratch, "before-public"), { recursive: true, force: true });
cpSync(join(repo, "apps/web/public"), join(scratch, "before-public"), { recursive: true });
for (const f of ["app/vamos-ops-api.js", "app/vamos-ops-data.js"]) {
  const text = execFileSync("git", ["show", `${BASE}:${f}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(scratch, "before-public", f), text);
}
console.log("before tree ready:", join(scratch, "before-public"), "at", BASE);
