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
const SKIP_DIRS = new Set(["node_modules", ".next", ".wrangler"]);

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function walk(relDir: string): string[] {
  const abs = join(webRoot, relDir);
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (
      SKIP_DIRS.has(entry.name) ||
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
  return found![1];
}

function onlySlot(src: string, className: string, hook: string, label: string): void {
  const pattern = `<div\\s+(?:className="${className}"\\s+data-meta-slot="${hook}"|data-meta-slot="${hook}"\\s+className="${className}")\\s*>\\s*<PendingSlot\\s+label="${label}"\\s*/>\\s*</div>`;
  const matches = src.match(new RegExp(pattern, "g"));
  expect(matches ?? [], hook).toHaveLength(1);
}

describe("meta legal gate", () => {
  it("necessary-cookies-only remains", () => {
    const banner = source("components/consent/CookieBanner.tsx");
    expect(banner).toContain(
      '<h2 className="vt-ck-title">{t("necessary-cookies-only")}</h2>',
    );
    for (const locale of ["en", "de", "fr", "ar"]) {
      expect(source(`i18n/messages/${locale}.json`), locale).toContain(
        '"necessary-cookies-only"',
      );
    }
    expect(source("i18n/messages/en.json")).toContain(
      '"necessary-cookies-only": "Necessary cookies only"',
    );
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

  it("marketing stays false", () => {
    const bind = source("lib/consent/bind.ts");
    expect(bind).toContain("marketing: false");
    expect(bind).toContain(
      "policyVersion = input.policyVersion ?? CONSENT_POLICY_VERSION",
    );
    expect(bind).toContain("record_consent");
    expect(bind).not.toMatch(/update\s+consent_log/i);
  });

  it("slots exist", () => {
    const banner = source("components/consent/CookieBanner.tsx");
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
    expect(imprint).toContain('<PendingSlot label="Uid number" />');
    expect(imprint).toContain('<PendingSlot label="Photography credit" />');

    expect(banner).toContain('className="vt-ck-meta"');
    expect(banner).toContain('data-meta-slot="banner"');
    expect(banner).toContain('<PendingSlot label="Meta banner line" />');
    expect(classNameOf(openTag(banner, "banner"))).toBe("vt-ck-meta");

    expect(cookies.match(/Meta cookie row/g) ?? []).toHaveLength(1);
    expect(cookies).toContain('className="vt-legal-blank--row"');
    expect(cookies).toContain('data-meta-slot="cookies"');
    expect(classNameOf(openTag(cookies, "cookies"))).toBe("vt-legal-blank--row");

    expect(privacy).toContain('className="vt-legal-blank"');
    expect(privacy).toContain('data-meta-slot="privacy"');
    expect(privacy).toContain('<PendingSlot label="Meta privacy line" />');
    expect(classNameOf(openTag(privacy, "privacy"))).toBe("vt-legal-blank");
  });

  it("no sentence", () => {
    for (const label of ["Meta banner line", "Meta cookie row", "Meta privacy line"]) {
      expect(label).not.toMatch(/[.!?]/);
    }
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
    onlySlot(source("components/consent/CookieBanner.tsx"), "vt-ck-meta", "banner", "Meta banner line");
    onlySlot(source("app/[locale]/cookies/page.tsx"), "vt-legal-blank--row", "cookies", "Meta cookie row");
    onlySlot(source("app/[locale]/privacy/page.tsx"), "vt-legal-blank", "privacy", "Meta privacy line");
  });
});
