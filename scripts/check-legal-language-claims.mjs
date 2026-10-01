#!/usr/bin/env node
// scripts/check-legal-language-claims.mjs
//
// Plan 05-23 / I18N-08 / D-12 / D-29. Blocking CI gate over the five legal pages.
// Shape follows `check-i18n-coverage.mjs` and `check-db-access-fences.mjs`: walk /
// loadAllowlist / reportCheck, one line per violation as `  - …`, one pass/fail
// summary per check, `process.exit(allOk ? 0 : 1)`.
//
// Three checks, each naming the requirement it enforces:
//
//   1. Declaration (D-27)     — LEGAL_LANGUAGES.imprint is exactly ["en","de","fr","ar"],
//                                matching the served mock's data-vt-legal on
//                                app/pages/imprint.dc.html. Owner 2026-10-01 (replaces
//                                D-05): the imprint reads in all four languages.
//   2. Positive coverage (D-29)— every key the page source actually renders exists
//                                and is non-empty in every language the page claims.
//   3. No over-claim (I18N-08) — a claimed language whose derived keys (excluding
//                                $meta.pendingValueKeys and $meta.nonTranslatableKeys)
//                                are identical to English above the JSON allowlist
//                                threshold is an untranslated page wearing a claim.
//
// Threshold and named exceptions live in scripts/legal-language-claims-allowlist.json,
// never inline.

import { readFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const allowlistPath = join(scriptDir, "legal-language-claims-allowlist.json");
const legalLanguagesPath = join(repoRoot, "apps/web/lib/legal-languages.ts");
const messagesDir = join(repoRoot, "apps/web/i18n/messages");

const LEGAL_PAGE_IDS = ["terms", "privacy", "cookies", "cancellation", "imprint"];
const AUTHORITY = "en";

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  if (typeof raw.identical_to_en_max_ratio !== "number") {
    console.error(`${relative(repoRoot, allowlistPath)} must declare numeric identical_to_en_max_ratio.`);
    process.exit(1);
  }
  if (!Array.isArray(raw.overclaim_exempt)) {
    console.error(`${relative(repoRoot, allowlistPath)} must declare an "overclaim_exempt" array.`);
    process.exit(1);
  }
  for (const entry of raw.overclaim_exempt) {
    if (!entry || typeof entry.page !== "string" || !entry.reason || !String(entry.reason).trim()) {
      console.error(
        `${relative(repoRoot, allowlistPath)} overclaim_exempt entries need a page and a non-empty reason.`,
      );
      process.exit(1);
    }
  }
  return raw;
}

function loadLocale(locale) {
  const p = join(messagesDir, `${locale}.json`);
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, "utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

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

/** Strip line and block comments, preserving line count (same discipline as the fence script). */
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
  return out.join("\n");
}

function parseLegalLanguages(src) {
  const stripped = stripComments(src);
  const block = /export\s+const\s+LEGAL_LANGUAGES\s*(?::[^=]+)?=\s*\{([\s\S]*?)\n\};/.exec(stripped);
  if (!block) {
    throw new Error("Could not parse export const LEGAL_LANGUAGES from apps/web/lib/legal-languages.ts");
  }
  const out = {};
  const entryRe = /(\w+)\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = entryRe.exec(block[1]))) {
    const langs = [...m[2].matchAll(/["'](\w+)["']/g)].map((x) => x[1]);
    out[m[1]] = langs;
  }
  return out;
}

function pagePath(pageId) {
  return join(repoRoot, "apps/web/app/[locale]", pageId, "page.tsx");
}

/**
 * Derive the message keys a legal page renders from its source:
 *   - LegalSection[] titleKey / LegalPage titleKey / standfirstKey / kickerKey
 *   - literal t("…") / getTranslations usage (string and { namespace } forms)
 */
function deriveKeys(file, relPath) {
  const text = readFileSync(file, "utf8");
  const keys = new Set();

  const attrRe = /\b(?:titleKey|standfirstKey|kickerKey)\s*[:=]\s*["']([^"']+)["']/g;
  let am;
  while ((am = attrRe.exec(text))) keys.add(am[1]);

  const bindingRe =
    /\bconst\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:(['"`])([^'"`]*)\2|\{[^}]*namespace:\s*(['"`])([^'"`]*)\4[^}]*\})\s*\)/g;
  const bindings = new Map();
  let m;
  while ((m = bindingRe.exec(text))) {
    bindings.set(m[1], m[3] ?? m[5] ?? "");
  }

  for (const [varName, namespace] of bindings) {
    const callRe = new RegExp(`\\b${varName}\\(\\s*([^)]*?)(?:,|\\))`, "g");
    let cm;
    while ((cm = callRe.exec(text))) {
      const firstArg = cm[1].trim();
      const literalMatch = /^(['"`])((?:[^\\]|\\.)*?)\1$/.exec(firstArg);
      if (literalMatch) {
        const subKey = literalMatch[2];
        keys.add(namespace ? `${namespace}.${subKey}` : subKey);
      }
    }
  }

  return { keys, relPath };
}

function reportCheck(name, violations) {
  if (violations.length === 0) {
    console.log(`check-legal-claims: ${name} — pass.`);
    return true;
  }
  console.error(`check-legal-claims: ${name} — FAIL:`);
  for (const v of violations) console.error(`  - ${v}`);
  return false;
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function isExemptOverclaim(exempt, pageId, locale) {
  return exempt.some(
    (e) => e.page === pageId && (!e.locale || e.locale === locale),
  );
}

function main() {
  const allowlist = loadAllowlist();
  const legalSrc = readFileSync(legalLanguagesPath, "utf8");
  const LEGAL_LANGUAGES = parseLegalLanguages(legalSrc);

  const byLocale = {};
  for (const locale of ["en", "de", "fr", "ar"]) {
    byLocale[locale] = loadLocale(locale);
  }
  const meta = (byLocale[AUTHORITY] && byLocale[AUTHORITY].$meta) || {};
  const pendingValueKeys = new Set(meta.pendingValueKeys || []);
  const nonTranslatableKeys = new Set(meta.nonTranslatableKeys || []);
  const flattened = {};
  for (const locale of ["en", "de", "fr", "ar"]) flattened[locale] = flatten(byLocale[locale] || {});

  // ── Check 1: D-12 imprint declaration ────────────────────────────────────────
  const imprintLangs = LEGAL_LANGUAGES.imprint || [];
  const IMPRINT_LANGS = ["en", "de", "fr", "ar"];
  const imprintOk =
    imprintLangs.length === IMPRINT_LANGS.length &&
    IMPRINT_LANGS.every((lang, i) => imprintLangs[i] === lang);
  const d12 = [];
  if (!imprintOk) {
    d12.push(
      `apps/web/lib/legal-languages.ts LEGAL_LANGUAGES.imprint is ${JSON.stringify(imprintLangs)}, ` +
        `must be exactly ${JSON.stringify(IMPRINT_LANGS)} (owner 2026-10-01, replaces D-05).`,
    );
  }
  const imprintMock = readFileSync(join(repoRoot, "app/pages/imprint.dc.html"), "utf8");
  const declared = (imprintMock.match(/data-vt-legal="([^"]*)"/) || [])[1] || "";
  if (declared.split(/\s+/).join(",") !== IMPRINT_LANGS.join(",")) {
    d12.push(`app/pages/imprint.dc.html declares data-vt-legal="${declared}", not "${IMPRINT_LANGS.join(" ")}".`);
  }
  const check1 = reportCheck("declaration matches known facts (D-27)", d12);

  // ── Check 2: D-29 positive key coverage ──────────────────────────────────────
  const d29 = [];
  const derivedByPage = {};
  for (const pageId of LEGAL_PAGE_IDS) {
    const abs = pagePath(pageId);
    const rel = relative(repoRoot, abs);
    if (!existsSync(abs)) {
      d29.push(`${rel} is missing — cannot derive keys for ${pageId}.`);
      derivedByPage[pageId] = new Set();
      continue;
    }
    const { keys } = deriveKeys(abs, rel);
    derivedByPage[pageId] = keys;
    const claimed = LEGAL_LANGUAGES[pageId];
    if (!claimed || claimed.length === 0) {
      d29.push(`${rel} has no LEGAL_LANGUAGES.${pageId} declaration.`);
      continue;
    }
    for (const key of [...keys].sort()) {
      for (const locale of claimed) {
        if (!(key in flattened[locale]) || isEmptyValue(flattened[locale][key])) {
          d29.push(
            `${pageId}: key "${key}" is missing or empty in ${locale}.json (claimed by LEGAL_LANGUAGES.${pageId}).`,
          );
        }
      }
    }
  }
  const check2 = reportCheck("positive key coverage (D-29)", d29);

  // ── Check 3: I18N-08 no over-claim ───────────────────────────────────────────
  const i18n08 = [];
  const threshold = allowlist.identical_to_en_max_ratio;
  for (const pageId of LEGAL_PAGE_IDS) {
    const claimed = LEGAL_LANGUAGES[pageId] || [];
    const keys = [...(derivedByPage[pageId] || [])].filter(
      (k) => !pendingValueKeys.has(k) && !nonTranslatableKeys.has(k),
    );
    for (const locale of claimed) {
      if (locale === AUTHORITY) continue;
      if (keys.length === 0) continue;
      let identical = 0;
      for (const key of keys) {
        const en = flattened[AUTHORITY][key];
        const other = flattened[locale][key];
        if (typeof en === "string" && typeof other === "string" && en === other) identical++;
      }
      const ratio = identical / keys.length;
      if (ratio > threshold && !isExemptOverclaim(allowlist.overclaim_exempt, pageId, locale)) {
        i18n08.push(
          `${pageId} claims "${locale}" but ${identical}/${keys.length} derived keys ` +
            `(${(ratio * 100).toFixed(1)}%) are identical to English — over identical_to_en_max_ratio ` +
            `${threshold} (I18N-08). Add a named overclaim_exempt entry with a reason, never loosen the threshold.`,
        );
      }
    }
  }
  const check3 = reportCheck("no over-claiming (I18N-08)", i18n08);

  const allOk = check1 && check2 && check3;
  if (allOk) {
    console.log("check-legal-claims: all 3 checks passed.");
  } else {
    console.error("check-legal-claims: one or more checks failed — see above.");
  }
  process.exit(allOk ? 0 : 1);
}

main();
