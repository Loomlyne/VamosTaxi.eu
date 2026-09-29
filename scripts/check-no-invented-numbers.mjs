#!/usr/bin/env node
// scripts/check-no-invented-numbers.mjs
//
// Law 04 / D-46 / D-40 / D-29 / ADR-011. Four blocking checks.
// Kernel *.test.ts files may use synthetic rappen/policy values to prove
// arithmetic; production TypeScript under pricing/ and quote/ may not.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

const POLICY_ALLOW = {
  "apps/web/lib/quote/intent.ts": {
    "60": "seconds in a minute for duration_s → estimated minutes; not D-42 waiting",
  },
};

// Owner decision 2026-09-27 (docs/audit §6): formatter and parser tests may use synthetic
// CHF amounts to prove arithmetic; each file needs a written reason. Not for production code.
const CHF_ALLOW = {
  "apps/web/lib/fx/convert.test.ts": "formatter test: synthetic rappen to prove CHF formatting, not a fare",
  "apps/web/lib/ops/ops-pricing-tabs.test.ts": "asserts the retired 'CHF 0' copy is absent from the ops page",
  "apps/web/lib/ops/rappen.test.ts": "parser test: CHF 0 stays 0 rappen, not a TBC gap",
  "apps/web/lib/ops/rate-book-draft.test.ts": "parser test: a CHF 0 start fare is a value, not a gap",
  "packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql":
    "internal column comment on free_wait_minutes (no extra charge inside the free wait), not customer copy",
};

const failures = [];

function walk(dir, out, pred) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".worktrees") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out, pred);
    else if (pred(p)) out.push(p);
  }
}

function rel(p) {
  return relative(repoRoot, p).split("\\").join("/");
}

function isTest(pathRel) {
  return /\.test\.(ts|tsx|js)$/.test(pathRel) || /\.spec\.(ts|tsx)$/.test(pathRel);
}

function allow(pathRel, token) {
  const reasons = POLICY_ALLOW[pathRel];
  if (!reasons) return false;
  const reason = reasons[token];
  if (reason === undefined) return false;
  if (!String(reason).trim()) {
    failures.push(`${pathRel}: allowlist reason for ${token} is empty`);
    return false;
  }
  return true;
}

function commentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("--");
}

function checkChfAndRappen() {
  const roots = [
    "apps/web/lib",
    "apps/web/components",
    "apps/web/app",
    "packages/db/supabase/migrations",
    "packages/db/supabase/tests",
    "packages/db/seed",
  ];
  const files = [];
  for (const r of roots) {
    walk(join(repoRoot, r), files, (p) => /\.(ts|tsx|js|mjs|sql)$/.test(p));
  }
  const chf = /CHF\s+(?!000\b)\d+/;
  const rappenAssign = /(\w*_rappen)\s*:\s*(-?\d+)/;
  for (const file of files) {
    const pathRel = rel(file);
    readFileSync(file, "utf8").split(/\n/).forEach((line, i) => {
      if (commentLine(line)) return;
      if (chf.test(line) && !(CHF_ALLOW[pathRel] && String(CHF_ALLOW[pathRel]).trim())) {
        failures.push(`${pathRel}:${i + 1}: invented CHF figure (Law 04 / D-46)`);
      }
      if (isTest(pathRel)) return;
      const m = line.match(rappenAssign);
      if (m && m[2] !== "0") {
        failures.push(
          `${pathRel}:${i + 1}: ${m[1]} assigned ${m[2]} — only null or 0 is legal (D-46)`,
        );
      }
    });
  }
}

function checkPolicyLiterals() {
  const files = [];
  walk(join(repoRoot, "apps/web/lib/pricing"), files, (p) => extname(p) === ".ts");
  walk(join(repoRoot, "apps/web/lib/quote"), files, (p) => extname(p) === ".ts");
  const patterns = [
    { token: "180", re: /\b180\b/ },
    { token: "10%", re: /\b10\s*%/ },
    { token: "60", re: /\b60\b/ },
    { token: "15", re: /\b15\b/ },
    { token: "24", re: /\b24\b/ },
    { token: "night", re: /\b20:00\b|\b06:00\b/ },
    { token: "30", re: /\b30\b/ },
  ];
  for (const file of files) {
    const pathRel = rel(file);
    if (isTest(pathRel)) continue;
    readFileSync(file, "utf8").split(/\n/).forEach((line, i) => {
      if (commentLine(line)) return;
      for (const { token, re } of patterns) {
        if (!re.test(line)) continue;
        if (allow(pathRel, token) || allow(pathRel, "60")) continue;
        if (token === "60" && allow(pathRel, "60")) continue;
        failures.push(
          `${pathRel}:${i + 1}: policy literal ${token} belongs on settings_versions, not TypeScript (D-40)`,
        );
      }
    });
  }
}

function checkNoSnapshotCron() {
  const worker = join(repoRoot, "apps/web/worker.ts");
  if (existsSync(worker)) {
    const text = readFileSync(worker, "utf8");
    const start = text.indexOf("async scheduled");
    const end = text.indexOf("async queue");
    const scheduled = start >= 0 ? text.slice(start, end > start ? end : undefined) : "";
    if (/price_snapshots/.test(scheduled)) {
      failures.push(
        "apps/web/worker.ts: scheduled handler references price_snapshots — expires_at <= now() AND booking_id IS NULL already IS expired (D-29)",
      );
    }
  }
  const files = [];
  walk(join(repoRoot, "packages/db/supabase/migrations"), files, (p) => extname(p) === ".sql");
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/cron\.schedule/i.test(text) || /pg_cron/i.test(text)) {
      failures.push(
        `${rel(file)}: pg_cron job — D-29 forbids a sweep mutating price_snapshots`,
      );
    }
  }
}

function checkDataTok() {
  const files = [];
  walk(join(repoRoot, "apps/web"), files, (p) => /\.(ts|tsx)$/.test(p));
  const bare = /(?<!\$)\{TOKEN\}/;
  for (const file of files) {
    const pathRel = rel(file);
    if (isTest(pathRel)) continue;
    readFileSync(file, "utf8").split(/\n/).forEach((line, i) => {
      if (commentLine(line)) return;
      if (/data-tok/.test(line)) return;
      if (bare.test(line)) {
        failures.push(
          `${pathRel}:${i + 1}: bare {TOKEN} pending value — use data-tok (Law 04 / ADR-011)`,
        );
      }
    });
  }
}

checkChfAndRappen();
checkPolicyLiterals();
checkNoSnapshotCron();
checkDataTok();

if (failures.length) {
  console.error("check-no-invented-numbers: FAILED");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log("check-no-invented-numbers: ok");
