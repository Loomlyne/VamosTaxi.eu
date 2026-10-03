#!/usr/bin/env node
// scripts/check-db-access-fences.mjs
//
// Plan 03-06 / D-05, D-06, D-08, D-10, D-20, D-31: the CI-grep half of DATA-06's compile-time
// fences. `eslint.config.mjs` catches two of these (a raw `postgres` import, `return tx`) as
// you type; this script catches the rest — the ones ESLint's `no-restricted-imports`/
// `no-restricted-syntax` cannot express (a module-scope client, a statically-rendered route
// importing an identity wrapper, a session-scoped `set_config`, an unfenced `sql.unsafe(`) —
// and re-checks the two ESLint already covers as a second, independent proof, matching
// `scripts/check-next-public-allowlist.mjs`'s own two-layer pattern (source scan + a second,
// narrower scan) for D-35.
//
// Shape follows `check-next-public-allowlist.mjs` exactly: `walk()` recursively collects
// non-binary, non-excluded files; a JSON allowlist is loaded, never inlined; each check prints
// one line per violation as `  - ${relativePath}:${line}`, plus one pass/fail summary line;
// `process.exit(allOk ? 0 : 1)`.
//
// Every exception below is a NAMED entry in scripts/db-access-fence-allowlist.json — when a
// check fires on code that is actually correct, the fix is a new named entry there, never a
// looser regex here (the same discipline `packages/db/scripts/mutation-gate.mjs` applies to
// its own mutants: a control that cannot go red is not a control).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const allowlistPath = join(repoRoot, "scripts/db-access-fence-allowlist.json");

const EXCLUDED_DIRS = new Set([
  "node_modules", ".next", ".open-next", ".git", ".wrangler", "dist", "test-results",
]);
const BINARY_EXT = new Set([
  ".ttf", ".otf", ".woff", ".woff2",
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif",
  ".mp4", ".mov", ".pdf",
]);

// The four roots every check below scans, reused across checks — application code
// (apps/web), the staging probe (apps/isolation-probe), the identity/public core
// (packages/db/src) and the local isolation test suite (packages/db/test), which
// legitimately constructs raw postgres.js clients to drive the SHIPPED `withIdentity`
// through a pinned connection (D-16). `packages/db/scripts/**` is deliberately NOT a root:
// `local-role-passwords.mjs` and `mutation-gate.mjs` are trusted, superuser-only local CLI
// tooling, not request-path application or query code, and are outside every ban's own
// stated scope ("apps/**", "packages/db/src/**").
const ROOTS = ["apps/web", "apps/isolation-probe", "packages/db/src", "packages/db/test"];

/** Recursively collect readable (non-binary, non-excluded) file paths under `dir`. */
function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    // `.next-<name>`: extra Next build output (git-ignored), never source.
    if (EXCLUDED_DIRS.has(entry) || entry.startsWith(".next")) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, files);
    } else if (stats.isFile() && !BINARY_EXT.has(extname(entry).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

function collectSourceFiles() {
  const files = [];
  for (const root of ROOTS) walk(join(repoRoot, root), files);
  return files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  for (const key of [
    "allowed_postgres_importers", "allowed_reserve", "allowed_end",
    "allowed_unsafe", "allowed_session_set", "force_dynamic_exempt",
    "isolate_memoisation_exempt",
  ]) {
    if (!Array.isArray(raw[key])) {
      console.error(`${relative(repoRoot, allowlistPath)} must declare a "${key}" array.`);
      process.exit(1);
    }
  }
  return raw;
}

/**
 * Strips `//` line comments and `/* *\/` block comments while preserving line count and
 * leading whitespace on non-comment lines (module-scope-client detection depends on
 * indentation surviving intact) — a naive, line-oriented stripper, not a real parser; good
 * enough for this repo's own comment style (every multi-line block uses `//` or a ` * `
 * JSDoc continuation, never a string literal containing `//` or `/*`).
 */
function stripComments(content) {
  const lines = content.split("\n");
  const out = [];
  let inBlock = false;
  for (let line of lines) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      line = line.slice(end + 2);
      inBlock = false;
    }
    let changed = true;
    while (changed) {
      changed = false;
      const start = line.indexOf("/*");
      if (start !== -1) {
        const end = line.indexOf("*/", start + 2);
        if (end !== -1) {
          line = line.slice(0, start) + line.slice(end + 2);
          changed = true;
        } else {
          line = line.slice(0, start);
          inBlock = true;
        }
      }
    }
    const lc = line.indexOf("//");
    if (lc !== -1) line = line.slice(0, lc);
    out.push(line);
  }
  return out;
}

function relPath(absPath) {
  return relative(repoRoot, absPath);
}

function reportCheck(name, violations) {
  if (violations.length === 0) {
    console.log(`check-db-access-fences: ${name} — pass.`);
    return true;
  }
  console.error(`check-db-access-fences: ${name} — FAIL:`);
  for (const v of violations) console.error(`  - ${v}`);
  return false;
}

// ── Ban #1 (D-10): raw `postgres` import outside the named allow-list ─────────────────────
// `import type postgres from "postgres"` (or a type-only named import) is exempt everywhere —
// D-10's real target is a VALUE import that can construct a raw client bypassing the wrapper;
// a type-only reference for a signature (e.g. `apps/web/lib/db/identity.ts`'s
// `postgres.TransactionSql` parameter annotation, plan 03-03's own deviation) is not that.
// Matched against the whole comment-stripped file, not line by line, so an `import { ... }
// from "postgres"` split over several lines cannot slip past; `export ... from`, `require()` and
// a dynamic `import()` are value imports too. The clause class excludes quotes so a match never
// runs on from one statement into the next in semicolon-less code. Anchored at column 0 like
// before, so code held inside a template string (the spec files spawn scripts) is not read.
const POSTGRES_IMPORT_RE =
  /^(?:import|export)\s+(?!type\s)[^;'"]*?\bfrom\s+["']postgres["']|\brequire\(\s*["']postgres["']\s*\)|\bimport\(\s*["']postgres["']\s*\)/gm;

function checkPostgresImports(files, allowlist) {
  const allowed = new Set(allowlist.allowed_postgres_importers);
  const violations = [];
  for (const file of files) {
    const rel = relPath(file);
    if (allowed.has(rel)) continue;
    const text = stripComments(readFileSync(file, "utf8")).join("\n");
    for (const m of text.matchAll(POSTGRES_IMPORT_RE)) {
      violations.push(`${rel}:${text.slice(0, m.index).split("\n").length}`);
    }
  }
  return reportCheck("raw `postgres` import outside the allow-list (D-10)", violations);
}

// ── Ban #2 (D-05): a module-scope postgres.js client ───────────────────────────────────────
// A top-level (column-0) `const`/`let` declaration whose initializer calls `postgres(` — this
// failure is silent on the first request and a hard Workers error that only surfaces once the
// isolate is reused for a second request, which is exactly why a static check is the real
// gate here, not a review that never reproduces it locally (Pitfall 1). Scoped to `apps/**`
// and `packages/db/src/**` only (D-05's own stated scope) — `packages/db/test/**`'s
// `describe`/`beforeAll` callbacks legitimately construct a client, but always nested inside a
// function body, never at column 0.
const MODULE_SCOPE_CLIENT_RE = /^(export\s+)?(const|let|var)\s+\S+[^=]*=\s*postgres\(/;

function checkModuleScopeClient(files) {
  const scoped = files.filter((f) => {
    const rel = relPath(f);
    return rel.startsWith("apps" + "/") || rel.startsWith(join("packages", "db", "src") + "/");
  });
  const violations = [];
  for (const file of scoped) {
    const rel = relPath(file);
    const lines = stripComments(readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      if (MODULE_SCOPE_CLIENT_RE.test(line)) violations.push(`${rel}:${i + 1}`);
    });
  }
  return reportCheck("no module-scope postgres.js client (D-05)", violations);
}

// ── Ban #3 (Pitfall 9): `sql.reserve()` in application code ───────────────────────────────
function checkReserve(files, allowlist) {
  const allowed = new Set(allowlist.allowed_reserve);
  const violations = [];
  for (const file of files) {
    const rel = relPath(file);
    if (allowed.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      if (/\.reserve\(/.test(line)) violations.push(`${rel}:${i + 1}`);
    });
  }
  return reportCheck("no `sql.reserve()` outside the allow-list (Pitfall 9)", violations);
}

// ── Ban #4 (D-05): `sql.end()` in apps/** or packages/db/src/** ───────────────────────────
function checkEnd(files, allowlist) {
  const allowed = new Set(allowlist.allowed_end);
  const violations = [];
  for (const file of files) {
    const rel = relPath(file);
    if (allowed.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      if (/\.end\(\s*\)/.test(line)) violations.push(`${rel}:${i + 1}`);
    });
  }
  return reportCheck("no `sql.end()` outside the allow-list (D-05)", violations);
}

// ── Ban #7: `sql.unsafe(` outside the identity ENTRY_PROBE and the probe's mutants ────────
function checkUnsafe(files, allowlist) {
  const allowed = new Set(allowlist.allowed_unsafe);
  const violations = [];
  for (const file of files) {
    const rel = relPath(file);
    if (allowed.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      if (/\.unsafe\(/.test(line)) violations.push(`${rel}:${i + 1}`);
    });
  }
  return reportCheck("no `sql.unsafe(` outside the allow-list (ban #7)", violations);
}

// ── Ban #6: `set_config(…, false)` and a bare `SET ROLE` / `SET SESSION` ──────────────────
// The bare-SET regex explicitly excludes `SET LOCAL` — Postgres's own transaction-scoped form
// is exactly what `withIdentity` is required to use (D-33); only the SESSION-scoped forms
// (`SET ROLE`, `SET SESSION`, and `set_config(..., false)`, whose third argument controls the
// same is_local flag `SET LOCAL` sets implicitly) leak identity past COMMIT.
const SET_CONFIG_FALSE_RE = /set_config\([^)]*,\s*false\s*\)/;
const BARE_SET_RE = /\bSET\s+(?!LOCAL\b)(ROLE|SESSION)\b/i;

function checkSessionSet(files, allowlist) {
  const allowed = new Set(allowlist.allowed_session_set);
  const violations = [];
  for (const file of files) {
    const rel = relPath(file);
    if (allowed.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      if (SET_CONFIG_FALSE_RE.test(line) || BARE_SET_RE.test(line)) {
        violations.push(`${rel}:${i + 1}`);
      }
    });
  }
  return reportCheck(
    "no session-scoped `set_config(..., false)` / bare `SET ROLE`/`SET SESSION` (ban #6)",
    violations,
  );
}

// ── Ban #5 (D-06): every identity-wrapper importer is a Route Handler or force-dynamic ────
// Scans apps/web/app/** and apps/web/lib/** for a `from "@/lib/db/identity"`,
// `from "@vamos/db"` (bare or a `@vamos/db/*` subpath), or `from "@/lib/db/public"` import.
// The two wrapper-DEFINITION files themselves (apps/web/lib/db/identity.ts,
// apps/web/lib/db/public.ts) are excluded from this check by construction, not by the JSON
// allow-list: `force-dynamic` is a Next.js page/layout/route-handler export and is
// meaningless on a plain library module that only ever DEFINES the wrapper, never renders a
// route. `force_dynamic_exempt` stays reserved for a future publicSql content page that is
// deliberately static (D-11) — that is a different exemption from this structural one.
const WRAPPER_IMPORT_RE =
  /from\s+["'](@\/lib\/db\/identity|@vamos\/db(\/[^"']*)?|@\/lib\/db\/public)["']/;
const FORCE_DYNAMIC_RE = /dynamic\s*=\s*["']force-dynamic["']/;
const ROUTE_HANDLER_RE = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/;
const WRAPPER_DEFINITION_FILES = new Set(["apps/web/lib/db/identity.ts", "apps/web/lib/db/public.ts"]);

function checkForceDynamic(allowlist) {
  const files = [];
  walk(join(repoRoot, "apps/web/app"), files);
  walk(join(repoRoot, "apps/web/lib"), files);
  const exempt = new Set(allowlist.force_dynamic_exempt);
  const violations = [];
  for (const file of files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
    const rel = relPath(file);
    if (WRAPPER_DEFINITION_FILES.has(rel) || exempt.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    if (!WRAPPER_IMPORT_RE.test(content)) continue;
    if (FORCE_DYNAMIC_RE.test(content) || ROUTE_HANDLER_RE.test(content)) continue;
    violations.push(`${rel} (imports an identity wrapper without force-dynamic or a Route Handler export)`);
  }
  return reportCheck(
    "every identity-wrapper importer is a Route Handler or force-dynamic (D-06)",
    violations,
  );
}

// ── Isolate memoisation (U31/ISOL-08 CI-grep half — closed in plan 05-23) ──────────────────
// Phase 5 plan 05-23 closed the D-20 forward-grep half of U31/ISOL-08: a full blocking ban
// on `unstable_cache`, `React.cache`, `'use cache'`, and a module-scope Map/Set/WeakMap/WeakSet
// under `apps/web/app` and `apps/web/lib` only — no longer conditioned on a wrapper import.
// Test files (`*.test.*` / `*.spec.*` and `**/tests/**`) are excluded structurally, not by
// allowlist, because a whole test tree is not a named exception. A module-scope object
// literal used as a lookup table is not banned: this repo writes those as frozen config
// (`NATIVE_LANG`, `QUOTE_ERRORS`), not as request-scoped stores, and loosening-by-omission
// beats a regex that cannot tell a store from a table. The harness half is NOT closed here.
const CACHE_PATTERNS = [/\bunstable_cache\b/, /\bReact\.cache\b/, /(['"])use cache\1/];
const MODULE_SCOPE_COLLECTION_RE =
  /^(export\s+)?(const|let)\s+\S+\s*=\s*new\s+(Map|Set|WeakMap|WeakSet)\(/;

function isTestFile(rel) {
  return /(^|\/)tests\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

function checkIsolateMemoisation(allowlist) {
  const files = [];
  walk(join(repoRoot, "apps/web/app"), files);
  walk(join(repoRoot, "apps/web/lib"), files);
  const exempt = new Set(allowlist.isolate_memoisation_exempt);
  const violations = [];
  for (const file of files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
    const rel = relPath(file);
    if (isTestFile(rel) || exempt.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      const hit =
        CACHE_PATTERNS.some((re) => re.test(line)) || MODULE_SCOPE_COLLECTION_RE.test(line);
      if (hit) {
        violations.push(
          `${rel}:${i + 1} (isolate-memoisation pattern — module-scope Map/Set/WeakMap/WeakSet, unstable_cache, React.cache, or 'use cache')`,
        );
      }
    });
  }
  return reportCheck(
    "no isolate-level memoisation under apps/web/app and apps/web/lib (U31/ISOL-08 CI-grep)",
    violations,
  );
}

// ── Run every check, aggregate the exit code ───────────────────────────────────────────────
const allowlist = loadAllowlist();
const files = collectSourceFiles();

const results = [
  checkPostgresImports(files, allowlist),
  checkModuleScopeClient(files),
  checkReserve(files, allowlist),
  checkEnd(files, allowlist),
  checkUnsafe(files, allowlist),
  checkSessionSet(files, allowlist),
  checkForceDynamic(allowlist),
  checkIsolateMemoisation(allowlist),
];

const allOk = results.every(Boolean);
if (allOk) {
  console.log(`check-db-access-fences: all ${results.length} checks passed (${files.length} files scanned).`);
} else {
  console.error("check-db-access-fences: one or more fences failed — see above.");
}
process.exit(allOk ? 0 : 1);
