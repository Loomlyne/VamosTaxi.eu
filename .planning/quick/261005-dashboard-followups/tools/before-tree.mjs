#!/usr/bin/env node
// Builds the "before" side: origin/main as of 16f1cfa7, for the one dashboard file this job changes.
//   node before-tree.mjs <scratch dir>
// <scratch>/before-public is a copy of the synced apps/web/public of this branch with app/vamos-ops-api.js put back to its
// 16f1cfa7 text (raw, comments not stripped: the same code). The synced public tree is gitignored: run
// `node scripts/sync-dc-mock-to-public.mjs` first.
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const scratch = resolve(process.argv[2]);
const BASE = "16f1cfa7";
rmSync(join(scratch, "before-public"), { recursive: true, force: true });
cpSync(join(repo, "apps/web/public"), join(scratch, "before-public"), { recursive: true });
const text = execFileSync("git", ["show", `${BASE}:app/vamos-ops-api.js`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
writeFileSync(join(scratch, "before-public", "app/vamos-ops-api.js"), text);
console.log("before tree ready:", join(scratch, "before-public"));
