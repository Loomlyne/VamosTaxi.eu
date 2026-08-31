#!/usr/bin/env node
// scripts/pull-content-strings.mjs
//
// T-06-63 / T-06-108: DB → JSON reconciliation. generate-seed.mjs is the
// JSON → SQL direction; this is the reverse. A db push runs seed.sql with
// `on conflict (key) do update set`, so console edits are overwritten unless
// this script has been run and committed first.
//
// Never invents a key. A database-only row is reported, not added. A JSON key
// with no database row is reported, not deleted. Idempotent when the table
// matches the dictionary: pull then db:seed:gen leaves git clean.
//
// Usage:
//   node scripts/pull-content-strings.mjs [--check] [postgres://…]
//   CONTENT_STRINGS_DATABASE_URL / DATABASE_URL / OPS_FIXTURE_DB_URL also accepted.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const MESSAGES_DIR = join(repoRoot, "apps/web/i18n/messages");
const LOCALES = ["en", "de", "fr", "ar"];
const CHECK = process.argv.includes("--check");
const SKIP_HINT = "local Postgres is down — run pnpm db:start && pnpm db:reset from packages/db";

function flatten(obj) {
  const out = {};
  for (const topKey of Object.keys(obj)) {
    if (topKey.startsWith("$")) continue;
    walk(topKey, obj[topKey], out);
  }
  return out;
}

function walk(prefix, value, out) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const k of Object.keys(value)) walk(`${prefix}.${k}`, value[k], out);
    return;
  }
  out[prefix] = value;
}

function applyFlat(tree, prefix, flat) {
  for (const k of Object.keys(tree)) {
    if (k.startsWith("$")) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    const value = tree[k];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      applyFlat(value, path, flat);
    } else if (Object.prototype.hasOwnProperty.call(flat, path) && flat[path] != null) {
      tree[k] = flat[path];
    }
  }
}

function mergeList(original, dbKeys, trueSet) {
  const out = [];
  for (const key of original ?? []) {
    if (!dbKeys.has(key) || trueSet.has(key)) out.push(key);
  }
  for (const key of [...trueSet].sort()) {
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

function mergeNoParam(original, dbKeys, nextMap) {
  const out = {};
  for (const key of Object.keys(original ?? {})) {
    if (!dbKeys.has(key)) out[key] = original[key];
    else if (nextMap.has(key)) out[key] = nextMap.get(key);
  }
  for (const key of [...nextMap.keys()].sort()) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = nextMap.get(key);
  }
  return out;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadPostgres() {
  let dir = scriptDir;
  for (let i = 0; i < 10; i++) {
    for (const rel of [
      "node_modules/postgres/src/index.js",
      "node_modules/postgres/cjs/src/index.js",
      "packages/db/node_modules/postgres/src/index.js",
    ]) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) {
        return (await import(pathToFileURL(candidate).href)).default;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("pull-content-strings: cannot resolve the postgres package");
}

function connectionString() {
  const fromArg = process.argv.find(
    (a) => a.startsWith("postgres://") || a.startsWith("postgresql://"),
  );
  return (
    fromArg ||
    process.env.CONTENT_STRINGS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.OPS_FIXTURE_DB_URL ||
    "postgres://postgres:postgres@127.0.0.1:54322/postgres"
  );
}

function loadLocale(locale) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

async function main() {
  const postgres = await loadPostgres();
  const sql = postgres(connectionString(), { max: 1 });
  let rows;
  try {
    rows = await sql`
      select key, en, de, fr, ar, pending_value, non_translatable, no_param_reason
        from public.content_strings
    `;
  } catch (err) {
    console.error(SKIP_HINT);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }

  if (!rows.length) {
    console.error("content_strings is empty — " + SKIP_HINT);
    process.exit(1);
  }

  const trees = {};
  for (const locale of LOCALES) trees[locale] = loadLocale(locale);
  const jsonKeys = new Set(Object.keys(flatten(trees.en)));
  const dbKeys = new Set(rows.map((r) => r.key));

  const extra = [...dbKeys].filter((k) => !jsonKeys.has(k)).sort();
  const missing = [...jsonKeys].filter((k) => !dbKeys.has(k)).sort();

  const pending = new Set();
  const nonTranslatable = new Set();
  const noParam = new Map();
  const byLocale = { en: {}, de: {}, fr: {}, ar: {} };
  for (const row of rows) {
    if (!jsonKeys.has(row.key)) continue;
    for (const locale of LOCALES) {
      if (row[locale] != null) byLocale[locale][row.key] = row[locale];
    }
    if (row.pending_value) pending.add(row.key);
    if (row.non_translatable) nonTranslatable.add(row.key);
    if (row.no_param_reason) noParam.set(row.key, row.no_param_reason);
  }

  const next = {};
  let dirty = false;
  for (const locale of LOCALES) {
    const updated = clone(trees[locale]);
    applyFlat(updated, "", byLocale[locale]);
    if (locale === "en") {
      const meta = updated.$meta ?? {
        pendingValueKeys: [],
        nonTranslatableKeys: [],
        noParamKeys: {},
      };
      updated.$meta = {
        pendingValueKeys: mergeList(meta.pendingValueKeys, dbKeys, pending),
        nonTranslatableKeys: mergeList(meta.nonTranslatableKeys, dbKeys, nonTranslatable),
        noParamKeys: mergeNoParam(meta.noParamKeys, dbKeys, noParam),
      };
    }
    next[locale] = updated;
    if (!deepEqual(updated, trees[locale])) {
      dirty = true;
      console.error(`pull-content-strings: ${locale}.json would change`);
    }
  }

  if (extra.length) {
    console.error(`database-only keys (${extra.length}), not added:`);
    for (const key of extra) console.error(`  ${key}`);
  }
  if (missing.length) {
    console.error(`JSON keys missing from content_strings (${missing.length}):`);
    for (const key of missing) console.error(`  ${key}`);
  }

  if (CHECK) {
    if (extra.length || missing.length || dirty) {
      console.error("pull-content-strings --check: drift.");
      process.exit(1);
    }
    console.log("pull-content-strings --check: no drift.");
    return;
  }

  if (dirty) {
    for (const locale of LOCALES) {
      writeFileSync(
        join(MESSAGES_DIR, `${locale}.json`),
        `${JSON.stringify(next[locale], null, 2)}\n`,
      );
    }
    console.log(`Wrote ${LOCALES.map((l) => `${l}.json`).join(", ")}`);
  } else {
    console.log("pull-content-strings: dictionary already matches content_strings.");
  }

  if (extra.length || missing.length) process.exit(1);
}

main();
