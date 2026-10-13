#!/usr/bin/env node
// scripts/i18n-fill.mjs
//
// Phase 32 (plan 09): authoring-time filler for the repo catalogs. Lists every de/fr/ar gap in the
// site dictionary (app/vamos-i18n-dict.js), the Next messages (apps/web/i18n/messages/*.json) and the
// e-mail messages (packages/emails/src/messages/*.json), and with --write --yes-billed fills only
// those gaps through the shared translator (apps/web/lib/translate/translate.ts, Gemma 4 on Workers AI).
//
// Safety (F-01, F-05, F-06):
//   - a value that exists, even one equal to English, is never overwritten;
//   - legal pages (data-vt-legal), the cookie banner, data-tok copy, owner-approved lines quoted in
//     .planning/decisions, $meta-protected keys, scripts/i18n-machine-denylist.json and dictionary
//     patterns are never sent to the model;
//   - a rejected or failed translation leaves the gap and is reported;
//   - nothing runs at page load or e-mail render: the filled text is committed to git.
//
// --write calls the live Cloudflare account (billed, cents). It needs the explicit second flag
// --yes-billed. Batches of up to 25 strings; each string is its own guarded translateText call (one
// source text per call), at most 2 calls in flight. Never logs string contents, only keys and counts.
//
// Usage:
//   node scripts/i18n-fill.mjs [--check]                       list gaps (default, read-only)
//   node scripts/i18n-fill.mjs --write --yes-billed            fill gaps
//   --only dict|messages|emails                                 limit to one catalog
//   --root <dir>                                                catalog root (tests)
//   --ai-stub <module>                                          test-only: export `ai` (AiLike) from a file
//                                                               (still needs --yes-billed, so no flag set is a silent bill)

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const BATCH = 25;
const CONCURRENCY = 2;
const LANGS = ["de", "fr", "ar"];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

const WRITE = has("--write");
const BILLED_OK = has("--yes-billed");
const ONLY = arg("--only");
const ROOT = resolve(arg("--root") ?? repoRoot);
const STUB = arg("--ai-stub");

if (has("--write") && has("--check")) fail("use either --check or --write, not both");
if (ONLY && !["dict", "messages", "emails"].includes(ONLY)) fail("--only takes dict, messages or emails");
if (WRITE && !BILLED_OK) {
  fail(
    "--write calls the live Workers AI account (billed). Add --yes-billed to confirm, " +
      "or run without --write to list the gaps.",
  );
}

function fail(message) {
  console.error(`i18n:fill: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------- catalogs

const P = {
  dict: join(ROOT, "app/vamos-i18n-dict.js"),
  messages: (l) => join(ROOT, `apps/web/i18n/messages/${l}.json`),
  emails: (l) => join(ROOT, `packages/emails/src/messages/${l}.json`),
};
const ALL = ["en", "de", "fr", "ar"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadDict(source) {
  const win = {};
  runInNewContext(source, { window: win, document: undefined, console });
  const dict = win.VamosI18n;
  if (!dict || typeof dict.strings !== "object") fail("app/vamos-i18n-dict.js did not define window.VamosI18n.strings");
  const patterns = (dict.patterns ?? []).map((p) => p.re).filter((re) => Object.prototype.toString.call(re) === "[object RegExp]"); // vm realm: no instanceof
  return { strings: dict.strings, patterns };
}

// ---------------------------------------------------------------- never-translate scan

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, ext, out);
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&middot;": "·" };

function textChunks(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n");
  return body
    .split(/<[^>]*>/)
    .map((s) => s.replace(/&[#\w]+;/g, (m) => ENTITIES[m] ?? m).replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0 && !/\{\{/.test(s));
}

/** English texts that must never reach the model, found by scanning the tree at run time. */
function scanDeniedTexts() {
  const texts = new Set();
  const pages = walk(join(ROOT, "app"), ".html");
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    const isLegal = /data-vt-legal/.test(html);
    const isBanner = /CookieBanner\.dc\.html$/.test(file);
    if (isLegal || isBanner) for (const c of textChunks(html)) texts.add(c);
    for (const m of html.matchAll(/<span\b[^>]*\bdata-tok\b[^>]*>([\s\S]*?)<\/span>/g)) {
      for (const c of textChunks(m[1])) texts.add(c);
    }
  }
  // Owner-approved wording quoted in the decisions: table rows `| en | text |`.
  for (const file of walk(join(ROOT, ".planning/decisions"), ".md")) {
    for (const m of readFileSync(file, "utf8").matchAll(/^\| en \| (.+?) \|\s*$/gm)) {
      texts.add(m[1].replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim());
    }
  }
  return [...texts];
}

function loadDeny() {
  const local = join(ROOT, "scripts/i18n-machine-denylist.json");
  const file = existsSync(local) ? local : join(scriptDir, "i18n-machine-denylist.json");
  const d = readJson(file);
  return {
    keys: d.keys ?? [],
    prefixes: d.prefixes ?? [],
    texts: [...(d.texts ?? []), ...scanDeniedTexts()],
  };
}

// ---------------------------------------------------------------- main

async function loadEngine() {
  const { register } = await import("./i18n-ts-hook.mjs");
  register();
  const catalog = await import(pathToFileURL(join(repoRoot, "apps/web/lib/translate/catalog.ts")).href);
  return { catalog, repoRoot };
}

async function loadAi() {
  if (STUB) {
    const mod = await import(pathToFileURL(resolve(STUB)).href);
    return { ai: mod.ai ?? mod.default, dispose: async () => {} };
  }
  const webRequire = join(repoRoot, "apps/web/package.json");
  const { createRequire } = await import("node:module");
  const { getPlatformProxy } = createRequire(webRequire)("wrangler");
  const proxy = await getPlatformProxy({
    environment: "staging",
    configPath: join(repoRoot, "apps/web/wrangler.jsonc"),
    // The AI binding has no local simulator: it must run remote.
    remoteBindings: true,
  });
  if (!proxy.env.AI) {
    await proxy.dispose();
    fail("no AI binding in the staging environment of apps/web/wrangler.jsonc");
  }
  return { ai: proxy.env.AI, dispose: () => proxy.dispose() };
}

async function main() {
  const { catalog } = await loadEngine();
  const deny = loadDeny();

  const dictSource = readFileSync(P.dict, "utf8");
  const { strings, patterns } = loadDict(dictSource);
  const trees = (pathOf) => Object.fromEntries(ALL.map((l) => [l, readJson(pathOf(l))]));
  const catalogs = {
    dict: strings,
    messages: trees(P.messages),
    emails: trees(P.emails),
    dictPatterns: patterns,
  };

  let gaps = catalog.findGaps(catalogs, deny);
  if (ONLY) gaps = gaps.filter((g) => g.source === ONLY);

  if (!WRITE) {
    for (const g of gaps) console.log(`${g.source}\t${g.key}\t${g.langs.join(",")}`);
    const per = { dict: 0, messages: 0, emails: 0 };
    for (const g of gaps) per[g.source] += g.langs.length;
    console.log(
      `total: ${gaps.length} strings, ${gaps.reduce((n, g) => n + g.langs.length, 0)} language gaps ` +
        `(dict ${per.dict}, messages ${per.messages}, emails ${per.emails})`,
    );
    return;
  }

  const { translateText } = await import(pathToFileURL(join(repoRoot, "apps/web/lib/translate/translate.ts")).href);
  const { ai, dispose } = await loadAi();

  // In-memory file texts, written after every batch so a crash never loses paid work.
  const files = {
    dict: dictSource,
    messages: Object.fromEntries(LANGS.map((l) => [l, readFileSync(P.messages(l), "utf8")])),
    emails: Object.fromEntries(LANGS.map((l) => [l, readFileSync(P.emails(l), "utf8")])),
  };
  const stats = { filled: 0, rejected: 0, failed: 0 };
  const problems = [];

  const flush = (fills) => {
    if (Object.keys(fills.dict).length > 0) {
      files.dict = catalog.applyDict(files.dict, fills.dict);
      writeFileSync(P.dict, files.dict);
    }
    for (const [source, apply, pathOf] of [
      ["messages", catalog.applyMessages, P.messages],
      ["emails", catalog.applyEmails, P.emails],
    ]) {
      for (const lang of LANGS) {
        const f = fills[source][lang];
        if (!f || Object.keys(f).length === 0) continue;
        files[source][lang] = apply(files[source][lang], lang, f);
        writeFileSync(pathOf(lang), files[source][lang]);
      }
    }
  };

  const total = Math.ceil(gaps.length / BATCH);
  try {
    for (let b = 0; b < total; b++) {
      const batch = gaps.slice(b * BATCH, (b + 1) * BATCH);
      const fills = { dict: {}, messages: { de: {}, fr: {}, ar: {} }, emails: { de: {}, fr: {}, ar: {} } };
      let next = 0;
      const worker = async () => {
        while (next < batch.length) {
          const g = batch[next++];
          const r = await translateText(ai, { text: g.en, from: "en", to: g.langs, timeoutMs: 30_000 });
          if (!r.ok) {
            stats.failed += g.langs.length;
            problems.push(`${g.source} ${g.key} failed: ${r.reason}`);
            continue;
          }
          for (const lang of g.langs) {
            const out = r.out[lang];
            if (!catalog.acceptFill(lang, out)) {
              stats.rejected += 1;
              problems.push(`${g.source} ${g.key} ${lang} rejected`);
              continue;
            }
            stats.filled += 1;
            if (g.source === "dict") (fills.dict[g.key] ??= {})[lang] = out;
            else fills[g.source][lang][g.key] = out;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
      flush(fills);
      console.log(`batch ${b + 1}/${total}: ${batch.length} strings, filled ${stats.filled} so far`);
    }
  } finally {
    await dispose();
  }

  for (const line of problems) console.log(`left as gap: ${line}`);
  console.log(`done: filled ${stats.filled}, rejected ${stats.rejected}, failed ${stats.failed}`);
  console.log("next: run `pnpm db:seed:gen` and `pnpm i18n:check`, then review `git diff`.");
}

main().catch((err) => {
  console.error(`i18n:fill: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
