// apps/web/lib/meta/legal-gate.test.ts
//
// Pins for the Meta gate. Phase 28 plan 28-03: two flags (legal texts live, Events Manager switches off),
// both false until plan 28-07. The needle scan allows Meta strings in exactly the loader and the
// security-header file. Do not place owner lines. Do not read a token.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADER_PAIRS } from "../security/headers";
import {
  META_EVENTS_MANAGER_SWITCHES_OFF,
  META_LEGAL_GATE_OPEN,
  metaMeasurementAllowed,
} from "./legal-gate";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

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

function walk(relDir: string, base = webRoot): string[] {
  const abs = join(base, relDir);
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
    if (entry.isDirectory()) out.push(...walk(rel, base));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** Repo-root-relative paths of everything the Meta scan reads. */
function scannedFiles(): string[] {
  const web = ["app", "components", "lib", "public"].flatMap((dir) =>
    walk(dir).map((rel) => join("apps/web", rel)),
  );
  const extra = ["apps/web/middleware.ts", "apps/web/worker.ts"].filter((rel) =>
    existsSync(join(repoRoot, rel)),
  );
  const mocks = walk("app", repoRoot);
  return [...web, ...extra, ...mocks];
}

function repoSource(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
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

  it("policy version is the consent date", () => {
    const assignment = /CONSENT_POLICY_VERSION\s*=(?!=)\s*(["'])([^"']+)\1/g;
    const found: string[] = [];
    for (const rel of walk("")) {
      if (isThisTest(rel)) continue;
      for (const match of source(rel).matchAll(assignment)) {
        found.push(`${rel} ${match[2]}`);
      }
    }
    expect(found).toHaveLength(1);
    const [file, version] = found[0]!.split(" ");
    expect(file).toBe("lib/consent/policy.ts");
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(version! > "2026-09-12").toBe(true);
    const mock = readFileSync(join(webRoot, "../../app/vamos-legal-updated.js"), "utf8");
    const consent = /var CONSENT_UPDATED = '(\d{4}-\d{2}-\d{2})';/.exec(mock);
    expect(consent?.[1]).toBe(version);
  }, 30_000);

  it("Meta strings only where allowed (Phase 28 per-needle allow map)", () => {
    const LOADER = ["app/vamos-meta.js", "apps/web/public/app/vamos-meta.js"];
    const allow: Record<string, string[]> = {
      "fbevents.js": LOADER,
      "fbq(": LOADER,
      [PIXEL_ID]: LOADER,
      "connect.facebook.net": [...LOADER, "apps/web/lib/security/headers.ts"],
      "facebook.com/tr": [],
      "graph.facebook.com": [],
      META_CAPI_ACCESS_TOKEN: [],
    };
    const hits: string[] = [];
    for (const rel of scannedFiles()) {
      if (isThisTest(rel)) continue;
      const src = repoSource(rel);
      for (const [needle, where] of Object.entries(allow)) {
        if (src.includes(needle) && !where.includes(rel)) hits.push(`${rel} ${needle}`);
      }
      // A noscript image near a Meta address is banned everywhere (D-07).
      for (const m of src.matchAll(/<noscript/gi)) {
        const around = src.slice(Math.max(0, m.index - 300), m.index + 300).toLowerCase();
        if (around.includes("facebook")) hits.push(`${rel} noscript near facebook`);
      }
    }
    expect(hits).toEqual([]);
  }, 30_000);

  it("the Next policy never names a Meta host (only the mock-page builder may)", () => {
    expect(SECURITY_HEADER_PAIRS.map(([, v]) => v).join("\n")).not.toMatch(/facebook|instagram/i);
  });

  it("flags: both open (Phase 28 plan 28-07), together they decide", () => {
    expect(META_LEGAL_GATE_OPEN).toBe(true);
    expect(META_EVENTS_MANAGER_SWITCHES_OFF).toBe(true);
    expect(metaMeasurementAllowed()).toBe(true);
    const gate = source("lib/meta/legal-gate.ts");
    expect(gate).toContain("META_LEGAL_GATE_OPEN === true");
    expect(gate).toContain("META_EVENTS_MANAGER_SWITCHES_OFF === true");
    for (const forbidden of ["process.env", "fetch(", "PendingSlot", "fbevents", "fbq", PIXEL_ID]) {
      expect(gate, forbidden).not.toContain(forbidden);
    }
    // Each flag is assigned exactly once in the whole scanned tree (comparisons do not count).
    for (const name of ["META_LEGAL_GATE_OPEN", "META_EVENTS_MANAGER_SWITCHES_OFF"]) {
      const assignment = new RegExp(`${name}\\s*=(?!=)`, "g");
      let count = 0;
      for (const rel of scannedFiles()) {
        if (isThisTest(rel)) continue;
        count += repoSource(rel).match(assignment)?.length ?? 0;
      }
      expect(count, name).toBe(1);
    }
  }, 30_000);

  it("the loader's baked flags equal the TypeScript flags", () => {
    const js = repoSource("app/vamos-meta.js");
    expect(/var GATE_OPEN = (true|false);/.exec(js)?.[1]).toBe(String(META_LEGAL_GATE_OPEN));
    expect(/var SWITCHES_OFF = (true|false);/.exec(js)?.[1]).toBe(
      String(META_EVENTS_MANAGER_SWITCHES_OFF),
    );
  });

  it("the switch flag is tied to the owner's decision file", () => {
    const decision = repoSource(".planning/decisions/2026-10-01-meta-events-manager-switches.md");
    expect(decision).toContain("Both are off");
    expect(decision).toContain('"Automatic advanced matching": off');
    expect(decision).toContain('"Track events automatically without code": off');
    if (META_EVENTS_MANAGER_SWITCHES_OFF === (true as boolean)) {
      expect(decision).toContain("## Addendum 2026-10-03");
    }
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
