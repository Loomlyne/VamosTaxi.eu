// apps/web/lib/meta/legal-gate.test.ts
//
// Wave 0 pins. Flag stays false. Do not place owner lines. Do not read a token.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { META_LEGAL_GATE_OPEN, metaMeasurementAllowed } from "./legal-gate";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

const PIXEL_ID = "1595596972063765";
// Build output (.open-next, the harness's .next-* dirs), Playwright output and
// screenshot baselines are generated, not source; walking them pushed this file
// past vitest's 5 s timeout.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".open-next",
  ".wrangler",
  "test-results",
  "playwright-report",
]);

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function walk(relDir: string): string[] {
  const abs = join(webRoot, relDir);
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (
      SKIP_DIRS.has(entry.name) ||
      (entry.isDirectory() &&
        (entry.name.endsWith("-snapshots") || entry.name.startsWith(".next-"))) ||
      entry.name.startsWith(".dev.vars") ||
      entry.name.startsWith(".env") ||
      entry.isSymbolicLink()
    ) {
      continue;
    }
    const rel = relDir ? join(relDir, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function productFiles(): string[] {
  return ["app", "components", "lib", "public"].flatMap((dir) => walk(dir));
}

function isThisTest(rel: string): boolean {
  return rel.endsWith("legal-gate.test.ts");
}

function openTag(src: string, hook: string): string {
  const tags = src.match(
    new RegExp(`<div\\b[^>]*data-meta-slot="${hook}"[^>]*>`, "g"),
  );
  expect(tags ?? [], hook).toHaveLength(1);
  return tags![0];
}

function classNameOf(tag: string): string {
  const found = tag.match(/className="([^"]*)"/);
  expect(found, "className").not.toBeNull();
  return found![1]!;
}

/** Inner markup of the one Meta slot wrapper (the wrapper holds a single paragraph). */
function slotBody(src: string, className: string, hook: string): string {
  const pattern = `<div\\s+(?:className="${className}"\\s+data-meta-slot="${hook}"|data-meta-slot="${hook}"\\s+className="${className}")\\s*>([\\s\\S]*?)</div>`;
  const found = src.match(new RegExp(pattern));
  expect(found, hook).not.toBeNull();
  return found![1]!.trim();
}

describe("meta legal gate", () => {
  it("banner title is you-choose-what-we-measure and body is meta-banner", () => {
    const banner = source("components/consent/CookieBanner.tsx");
    expect(banner).toContain('{t("you-choose-what-we-measure")}');
    expect(banner).toContain('t.rich("meta-banner"');
    for (const locale of ["en", "de", "fr", "ar"]) {
      const messages = source(`i18n/messages/${locale}.json`);
      expect(messages, locale).toContain('"you-choose-what-we-measure"');
      expect(messages, locale).toContain('"meta-banner"');
    }
  });

  it("policy version unchanged", () => {
    const policy = source("lib/consent/policy.ts");
    expect(policy).toContain('export const CONSENT_POLICY_VERSION = "2026-09-12"');
    const assignment = /CONSENT_POLICY_VERSION\s*=(?!=)\s*(["'])([^"']+)\1/g;
    const found: string[] = [];
    for (const rel of walk("")) {
      if (isThisTest(rel)) continue;
      for (const match of source(rel).matchAll(assignment)) {
        found.push(`${rel} ${match[2]}`);
      }
    }
    expect(found).toEqual(["lib/consent/policy.ts 2026-09-12"]);
  });

  it("no fbevents.js", () => {
    const needles = [
      "fbevents.js",
      "connect.facebook.net",
      "fbq(",
      "facebook.com/tr",
      "graph.facebook.com",
      PIXEL_ID,
      "META_CAPI_ACCESS_TOKEN",
    ];
    const hits: string[] = [];
    for (const rel of productFiles()) {
      if (isThisTest(rel)) continue;
      const src = source(rel);
      for (const needle of needles) {
        if (src.includes(needle)) hits.push(`${rel} ${needle}`);
      }
    }
    expect(hits).toEqual([]);
    expect(source("lib/security/headers.ts")).not.toContain("connect.facebook.net");
  });

  it("flag off", () => {
    expect(META_LEGAL_GATE_OPEN).toBe(false);
    expect(metaMeasurementAllowed()).toBe(false);
    const gate = source("lib/meta/legal-gate.ts");
    expect(gate).toContain("= false");
    expect(gate).toContain("META_LEGAL_GATE_OPEN === true");
    for (const forbidden of [
      "process.env",
      "fetch(",
      "PendingSlot",
      "fbevents",
      "fbq",
      PIXEL_ID,
    ]) {
      expect(gate, forbidden).not.toContain(forbidden);
    }
    const assignment = /META_LEGAL_GATE_OPEN\s*=(?!=)/g;
    let count = 0;
    for (const rel of walk("")) {
      if (isThisTest(rel)) continue;
      count += source(rel).match(assignment)?.length ?? 0;
    }
    expect(count).toBe(1);
  });

  it("categories come from the choice, one policy version (27 D-05, D-18)", () => {
    const bind = source("lib/consent/bind.ts");
    expect(bind).not.toContain("marketing: false");
    expect(bind).not.toContain("policyVersion");
    expect(bind).toContain("CONSENT_POLICY_VERSION");
    expect(bind).toContain("record_consent");
    expect(bind).not.toMatch(/update\s+consent_log/i);
    expect(source("app/api/consent/route.ts")).toContain("categoriesForChoice(");
  });

  it("slots exist", () => {
    const cookies = source("app/[locale]/cookies/page.tsx");
    const privacy = source("app/[locale]/privacy/page.tsx");
    const imprint = source("app/[locale]/imprint/page.tsx");

    expect(cookies).toContain('<PendingSlot label="Language cookie duration" />');
    expect(cookies).toContain('<PendingSlot label="Session duration" />');
    expect(cookies).toContain('<PendingSlot label="Consent duration" />');
    expect(cookies).not.toMatch(/label="Meta [^"]*(?:name|purpose|duration)/i);
    expect(cookies).not.toMatch(/label="Meta name"/);
    expect(cookies).not.toMatch(/label="Meta purpose"/);
    expect(cookies).not.toMatch(/label="Meta duration"/);

    expect(privacy).toContain('<PendingSlot label="Analytics provider" />');
    expect(privacy).toContain('<PendingSlot label="Analytics region" />');
    expect(imprint).toContain('<PendingSlot label="Photography credit" />');

    expect(cookies).not.toContain('label="Meta cookie row"');
    expect(privacy).not.toContain('label="Meta privacy line"');
    expect(cookies).toContain('className="vt-legal-blank--row"');
    expect(cookies).toContain('data-meta-slot="cookies"');
    expect(classNameOf(openTag(cookies, "cookies"))).toBe("vt-legal-blank--row");
    expect(slotBody(cookies, "vt-legal-blank--row", "cookies")).toContain('"meta-row"');

    expect(privacy).toContain('className="vt-legal-blank"');
    expect(privacy).toContain('data-meta-slot="privacy"');
    expect(classNameOf(openTag(privacy, "privacy"))).toBe("vt-legal-blank");
    expect(slotBody(privacy, "vt-legal-blank", "privacy")).toContain('"meta-privacy-line"');
  });

  it("owner texts, not agent sentences", () => {
    for (const rel of [
      "components/consent/CookieBanner.tsx",
      "app/[locale]/cookies/page.tsx",
      "app/[locale]/privacy/page.tsx",
    ]) {
      const src = source(rel);
      for (const needle of ["fbevents", "fbq(", PIXEL_ID, "graph.facebook.com"]) {
        expect(src, rel).not.toContain(needle);
      }
    }
    for (const [rel, cls, hook, key] of [
      ["app/[locale]/cookies/page.tsx", "vt-legal-blank--row", "cookies", "meta-row"],
      ["app/[locale]/privacy/page.tsx", "vt-legal-blank", "privacy", "meta-privacy-line"],
    ] as const) {
      const body = slotBody(source(rel), cls, hook);
      // Only the t.rich call: no literal prose in the slot.
      const flat = body.replace(/\s+/g, " ");
      expect(flat).toMatch(new RegExp(`^<p> \\{t(?:Cookies)?\\.rich\\("${key}", \\{ `));
      expect(flat.endsWith(", })} </p>")).toBe(true);
      expect(flat.match(/\.rich\(/g)).toHaveLength(1);
    }
  });
});
