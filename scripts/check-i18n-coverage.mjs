#!/usr/bin/env node
// scripts/check-i18n-coverage.mjs
//
// D-17's build-time replacement for `VamosLocale.coverage()` (app/vamos-locale.js), which
// has no server-side equivalent because it walked the rendered DOM. Three checks, all
// blocking (D-39) — each names the requirement it enforces in its own failure output:
//
//   1. Coverage (I18N-01)        — every key in en.json (the authority) exists in
//                                   de.json/fr.json/ar.json, and no non-English file
//                                   carries an orphaned key en.json no longer has.
//   2. Usage (I18N-01)           — every literal-keyed useTranslations()/getTranslations()
//                                   + t() call site under apps/web/{app,components,lib}
//                                   resolves to a key that exists in at least one locale
//                                   file.
//   3. Parameterisation (I18N-06) — an English message with a bare digit run and no ICU
//                                   `{placeholder}` is the exact bug class the mocks'
//                                   `patterns` regex array (app/vamos-i18n-dict.js) existed
//                                   to catch after the fact; D-13 catches it at authoring
//                                   time instead.
//
// RESEARCH's package audit rates the off-the-shelf candidate for check 1
// (`@lingual/i18n-check`) SUS — created 2025, single-vendor, narrow purpose — and its own
// "Don't Hand-Roll" table names cross-locale key coverage as the honest exception where a
// small in-repo script beats a young dependency. No package is installed for this gate.
//
// ── ADR-011 / ADR-012 / D-18 exclusions ─────────────────────────────────────────────────
// en.json may carry a reserved `$meta` top-level object (never a real message namespace —
// every check below skips any top-level key starting with "$" when flattening):
//
//   "$meta": {
//     "pendingValueKeys":    ["dotted.key", ...],            // ADR-011 data-tok pill copy:
//                                                             // stays English on purpose,
//                                                             // excused from the coverage
//                                                             // check's "must exist in
//                                                             // de/fr/ar" requirement.
//     "nonTranslatableKeys": ["dotted.key", ...],             // D-18 product names (Vamos
//                                                             // Taxi, Economy, Business,
//                                                             // Van): excluded from all
//                                                             // three checks.
//     "noParamKeys": { "dotted.key": "reason, required" }     // I18N-06 opt-out for a
//                                                             // genuine non-parameterised
//                                                             // number (a booking
//                                                             // reference, a phone
//                                                             // number) — the reason is
//                                                             // mandatory, an empty one
//                                                             // fails the gate rather than
//                                                             // silently accepting it.
//   }
//
// Nothing here hardcodes a product name or a pill string — the exclusion lists are read
// from the message files themselves, so the two lists (this script, and whatever Plan 10's
// migration actually marks) cannot drift apart.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

const LOCALES = ["en", "de", "fr", "ar"];
const AUTHORITY = "en";

function parseArgs(argv) {
  const out = { messagesDir: join(repoRoot, "apps/web/i18n/messages") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--messages-dir" && argv[i + 1]) {
      out.messagesDir = argv[i + 1];
      i++;
    }
  }
  return out;
}

/** Loads one locale's JSON file. Returns {} if the file does not exist — a missing locale
 *  file (or an entirely empty messages directory) is a pass, not a crash: the tracer seeded
 *  only a handful of keys and the full migration lands in Plan 10. */
function loadLocale(messagesDir, locale) {
  const p = join(messagesDir, `${locale}.json`);
  if (!existsSync(p)) return { data: {}, existed: false };
  const raw = readFileSync(p, "utf8");
  if (!raw.trim()) return { data: {}, existed: true };
  try {
    return { data: JSON.parse(raw), existed: true };
  } catch (e) {
    throw new Error(`${p} is not valid JSON: ${e.message}`);
  }
}

/** Flattens a nested message object to dotted key -> string value pairs. Any top-level key
 *  starting with "$" is metadata (see $meta above), never a real message namespace, and is
 *  skipped entirely — it must never be reported as a coverage gap or a usage miss. */
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

/** Recursively collects file paths under `dir`, skipping build/dependency output. Missing
 *  directories (e.g. apps/web/lib does not exist yet) are silently skipped. */
const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".open-next", ".git", ".wrangler"]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walkSourceFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    // `.next-<name>`: extra Next build output (git-ignored), never source.
    if (EXCLUDED_DIRS.has(entry) || entry.startsWith(".next")) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkSourceFiles(full, files);
    } else if (stats.isFile() && SOURCE_EXT.has(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

/** Finds every literal-keyed translation-lookup call in one file's source text.
 *
 *  Detection is intentionally two-pass and conservative rather than a full AST parse:
 *    1. Find every `const X = useTranslations('Namespace')` / `getTranslations('Namespace')`
 *       (optionally `await`ed) binding, capturing the variable name and its namespace.
 *    2. For each bound variable, find every `X('key', ...)` call. A literal string first
 *       argument resolves to `Namespace.key` (or just `key` if the binding declared no
 *       namespace). A non-literal first argument (a variable) cannot be resolved statically
 *       — it is reported as skipped, not silently ignored, so the gap in this check's own
 *       coverage stays visible.
 *
 *  Returns { resolved: [{key, file, line}], skipped: [{file, line, raw}] }.
 */
function findUsages(file, relPath) {
  const text = readFileSync(file, "utf8");
  const resolved = [];
  const skipped = [];

  const bindingRe =
    /\bconst\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:(['"`])([^'"`]*)\2)?\s*\)/g;
  const bindings = new Map(); // varName -> namespace ('' = no namespace)
  let m;
  while ((m = bindingRe.exec(text))) {
    bindings.set(m[1], m[3] ?? "");
  }
  if (bindings.size === 0) return { resolved, skipped };

  for (const [varName, namespace] of bindings) {
    const callRe = new RegExp(`\\b${varName}\\(\\s*([^)]*?)(?:,|\\))`, "g");
    let cm;
    while ((cm = callRe.exec(text))) {
      const firstArg = cm[1].trim();
      const line = text.slice(0, cm.index).split("\n").length;
      const literalMatch = /^(['"`])((?:[^\\]|\\.)*?)\1$/.exec(firstArg);
      if (literalMatch) {
        const subKey = literalMatch[2];
        const key = namespace ? `${namespace}.${subKey}` : subKey;
        resolved.push({ key, file: relPath, line });
      } else if (firstArg.length > 0) {
        skipped.push({ file: relPath, line, raw: firstArg });
      }
    }
  }
  return { resolved, skipped };
}

/** I18N-06: a bare digit run with no ICU `{placeholder}` in the same message. Intentionally
 *  naive (any digit, not just a "meaningful" one) — the genuine non-parameterised cases
 *  (a booking reference like VT-4821, a phone number) are expected to opt out explicitly
 *  via `$meta.noParamKeys`, not to be pattern-matched around. */
function hasUnparameterisedNumber(value) {
  if (typeof value !== "string") return false;
  if (!/\d/.test(value)) return false;
  if (value.includes("{")) return false; // an ICU placeholder is present somewhere
  return true;
}

function main() {
  const { messagesDir } = parseArgs(process.argv.slice(2));

  const byLocale = {};
  let anyLocaleFileExists = false;
  for (const locale of LOCALES) {
    const loaded = loadLocale(messagesDir, locale);
    byLocale[locale] = loaded.data;
    if (loaded.existed) anyLocaleFileExists = true;
  }

  const rawAuthority = byLocale[AUTHORITY];
  const meta = (rawAuthority && rawAuthority.$meta) || {};
  const pendingValueKeys = new Set(meta.pendingValueKeys || []);
  const nonTranslatableKeys = new Set(meta.nonTranslatableKeys || []);
  const noParamKeys = meta.noParamKeys || {};

  const errors = [];

  // Validate the opt-out marker itself: a key without a real reason is not an opt-out,
  // it is a silent hole, so this fails the gate rather than accepting it.
  for (const [key, reason] of Object.entries(noParamKeys)) {
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      errors.push(
        `[I18N-06] $meta.noParamKeys["${key}"] has no reason. The opt-out marker requires ` +
          `a non-empty reason (e.g. "booking reference, not a live count") — an empty one is a ` +
          `silent hole in the gate, not a documented exception.`,
      );
    }
  }

  const flattened = {};
  for (const locale of LOCALES) flattened[locale] = flatten(byLocale[locale] || {});

  // ── Check 1: coverage (I18N-01) ─────────────────────────────────────────────────────
  const authorityKeys = new Set(Object.keys(flattened[AUTHORITY]));
  let coverageChecked = 0;

  for (const key of authorityKeys) {
    if (nonTranslatableKeys.has(key)) continue;
    coverageChecked++;
    for (const locale of LOCALES) {
      if (locale === AUTHORITY) continue;
      if (pendingValueKeys.has(key)) continue; // ADR-011: pending-value pill, English-only on purpose
      if (!(key in flattened[locale])) {
        errors.push(
          `[I18N-01] Key "${key}" exists in en.json but is missing from ${locale}.json.`,
        );
      }
    }
  }

  for (const locale of LOCALES) {
    if (locale === AUTHORITY) continue;
    for (const key of Object.keys(flattened[locale])) {
      if (nonTranslatableKeys.has(key)) continue;
      if (!authorityKeys.has(key)) {
        errors.push(
          `[I18N-01] Key "${key}" exists in ${locale}.json but not in en.json — an orphan ` +
            `left behind by a rename.`,
        );
      }
    }
  }

  // ── Check 2: usage (I18N-01) ────────────────────────────────────────────────────────
  // Only runs when at least one locale file actually exists on disk. Pointed at a
  // messages directory with no locale files at all (a totally uninitialized i18n
  // system — the empty-directory case this gate must pass, not crash, per D-17), there
  // is nothing to resolve real source call-sites against; scanning the real apps/web
  // tree in that state would flag the tracer's own already-correct calls as failures
  // whenever a caller points --messages-dir at an empty scratch directory for testing.
  let usageChecked = 0;
  let usageSkipped = 0;
  if (anyLocaleFileExists) {
    const allKnownKeys = new Set();
    for (const locale of LOCALES) for (const k of Object.keys(flattened[locale])) allKnownKeys.add(k);

    const sourceRoots = ["app", "components", "lib"].map((d) => join(repoRoot, "apps/web", d));
    const sourceFiles = sourceRoots.flatMap((root) =>
      walkSourceFiles(root).map((f) => ({ abs: f, rel: relative(repoRoot, f) })),
    );

    for (const { abs, rel } of sourceFiles) {
      const { resolved, skipped } = findUsages(abs, rel);
      for (const { key, file, line } of resolved) {
        usageChecked++;
        if (nonTranslatableKeys.has(key)) continue;
        if (!allKnownKeys.has(key)) {
          errors.push(
            `[I18N-01] ${file}:${line} calls t("${key.split(".").slice(-1)[0]}") which resolves ` +
              `to "${key}" — that key exists in no message file.`,
          );
        }
      }
      for (const { file, line, raw } of skipped) {
        usageSkipped++;
        console.warn(
          `[i18n:check] ${file}:${line} calls a translation lookup with a non-literal key ` +
            `(${raw}) — not statically resolvable, skipped rather than silently ignored.`,
        );
      }
    }
  }

  // ── Check 3: parameterisation (I18N-06) ─────────────────────────────────────────────
  let paramChecked = 0;
  for (const [key, value] of Object.entries(flattened[AUTHORITY])) {
    if (nonTranslatableKeys.has(key)) continue;
    if (typeof value !== "string") continue;
    paramChecked++;
    if (noParamKeys[key]) continue; // documented, reasoned opt-out
    if (hasUnparameterisedNumber(value)) {
      errors.push(
        `[I18N-06] en.json key "${key}" ("${value}") contains a bare digit with no ICU ` +
          `placeholder. If this is a genuine non-parameterised number (a booking reference, a ` +
          `phone number), add it to $meta.noParamKeys with a reason instead of leaving it flagged.`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(`\ni18n:check found ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    process.exit(1);
  }

  console.log(
    `i18n:check passed — ${coverageChecked} keys checked for cross-locale coverage, ` +
      `${usageChecked} literal call sites resolved (${usageSkipped} non-literal skipped), ` +
      `${paramChecked} English messages checked for parameterisation.`,
  );
}

main();
