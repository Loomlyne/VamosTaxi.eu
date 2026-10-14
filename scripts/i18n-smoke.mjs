#!/usr/bin/env node
// scripts/i18n-smoke.mjs
//
// Phase 32 (plan 09): manual five-string smoke check of the real model. Sends five fixed English
// strings through the shared translator (guarded, one text per call) and prints the German, French and
// Arabic result of each plus the guard verdict, so a person can read them.
//
// Calls the live Workers AI account (billed, a few cents). Needs --yes-billed. Not part of any gate.
//
// Usage: node scripts/i18n-smoke.mjs --yes-billed [--ai-stub <module>]   (the stub is for tests)

import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const stubAt = process.argv.indexOf("--ai-stub");
const STUB = stubAt >= 0 ? process.argv[stubAt + 1] : undefined;

if (!process.argv.includes("--yes-billed")) {
  console.error("i18n:smoke: this calls the live Workers AI account (billed). Add --yes-billed to confirm.");
  process.exit(2);
}

/** Fixed strings: brand, amount placeholder, booking reference, airport code, flight number, a ß-prone word. */
const SAMPLES = [
  "Your Vamos Taxi driver is waiting at the arrivals exit.",
  "The fare for this transfer is CHF 000. No charge until the last step.",
  "Booking VT-26-0753 is confirmed. Show this voucher at the pickup point.",
  "Pickup at ZRH, terminal 1, for flight LX 318.",
  "Please keep to the street and the main road, the driver will greet you at the gate.",
];
const LANGS = ["de", "fr", "ar"];

const { proxyAi } = await import("./i18n-proxy-ai.mjs");
const { register } = await import("./i18n-ts-hook.mjs");
register();
const { translateText } = await import(pathToFileURL(join(repoRoot, "apps/web/lib/translate/translate.ts")).href);

let ai;
let dispose = async () => {};
if (STUB) {
  const mod = await import(pathToFileURL(resolve(STUB)).href);
  ai = mod.ai ?? mod.default;
} else {
  const { getPlatformProxy } = createRequire(join(repoRoot, "apps/web/package.json"))("wrangler");
  const proxy = await getPlatformProxy({
    environment: "staging",
    configPath: join(repoRoot, "apps/web/wrangler.jsonc"),
    remoteBindings: true,
  });
  // The proxy cannot carry run()'s AbortSignal: see scripts/i18n-proxy-ai.mjs.
  ai = proxy.env.AI ? proxyAi(proxy.env.AI) : null;
  dispose = () => proxy.dispose();
  if (!ai) {
    await dispose();
    console.error("i18n:smoke: no AI binding in the staging environment of apps/web/wrangler.jsonc");
    process.exit(1);
  }
}

let bad = 0;
try {
  for (const [i, text] of SAMPLES.entries()) {
    const r = await translateText(ai, { text, from: "en", to: LANGS, timeoutMs: 30_000 });
    console.log(`\n${i + 1}. ${text}`);
    if (!r.ok) {
      bad += LANGS.length;
      console.log(`   guard: failed (${r.reason})`);
      continue;
    }
    for (const lang of LANGS) {
      const out = r.out[lang];
      if (out === undefined) {
        bad += 1;
        console.log(`   ${lang}: REJECTED by the guard`);
      } else {
        const ss = lang === "de" && out.includes("ß") ? " (contains ß: FAIL)" : "";
        if (ss) bad += 1;
        console.log(`   ${lang}: ${out}  [guard ok]${ss}`);
      }
    }
  }
} finally {
  await dispose();
}
console.log(`\nsmoke: ${bad === 0 ? "all 15 translations accepted" : `${bad} of 15 not accepted`}`);
process.exit(bad === 0 ? 0 : 1);
