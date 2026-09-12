// apps/web/lib/legal/extract-no-invent.test.ts
//
// Wave 0 (11-01): no-invent legal/host/mail lock (D-01 D-06 D-11 D-25 D-26 D-28).
// UID stays PendingSlot / data-tok. Do not fill CHE-296.035.710.
// No info@vamostaxi.eu. No partner route. wrangler does not bind .eu.
// Stripe publishable stays pk_test_. No sk_live_. Do not extract .eu copy here.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { should404MockLeak } from "../dc-mock-urls";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

const PUBLIC_LEGAL = [
  "app/[locale]/imprint/page.tsx",
  "app/[locale]/about/page.tsx",
  "app/[locale]/faq/page.tsx",
  "app/[locale]/contact/page.tsx",
  "app/[locale]/terms/page.tsx",
  "app/[locale]/privacy/page.tsx",
  "app/[locale]/cookies/page.tsx",
  "app/[locale]/cancellation/page.tsx",
  "lib/contact-channels.ts",
  "i18n/messages/en.json",
  "i18n/messages/de.json",
  "i18n/messages/fr.json",
  "i18n/messages/ar.json",
] as const;

describe("imprint UID stays TBC (D-26 D-28)", () => {
  it("Uid number is a PendingSlot, not an invented CHE number", () => {
    const imprint = source("app/[locale]/imprint/page.tsx");
    const slot = source("components/legal/PendingSlot.tsx");
    expect(imprint).toContain('<PendingSlot label="Uid number" />');
    expect(slot).toMatch(/data-tok/);
    expect(imprint).not.toMatch(/CHE-296\.035\.710/);
    expect(imprint).not.toMatch(/CHE-\d{3}\.\d{3}\.\d{3}/);
  });
});

describe("no info@vamostaxi.eu (D-06)", () => {
  it("public/legal/i18n sources keep info@vamostaxi.site and never the .eu mailbox", () => {
    const channels = source("lib/contact-channels.ts");
    expect(channels).toContain('export const SUPPORT_EMAIL = "info@vamostaxi.site";');
    expect(channels).not.toContain("info@vamostaxi.eu");
    for (const rel of PUBLIC_LEGAL) {
      const src = source(rel);
      expect(src, rel).not.toContain("info@vamostaxi.eu");
    }
  });
});

describe("no become-a-partner route (D-25)", () => {
  it("partner page and API are gone; leftover URL 404s", () => {
    expect(existsSync(join(webRoot, "app/[locale]/become-a-partner"))).toBe(false);
    expect(existsSync(join(webRoot, "app/api/partner-application"))).toBe(false);
    expect(should404MockLeak("/become-a-partner")).toBe(true);
    const metadata = source("lib/metadata.ts");
    expect(metadata).not.toMatch(/become-a-partner/);
    expect(metadata).not.toMatch(/partner-application/);
  });
});

describe("wrangler host and Stripe test (D-01 D-11)", () => {
  it("custom domains do not include vamostaxi.eu", () => {
    const wrangler = source("wrangler.jsonc");
    const domains = [
      ...wrangler.matchAll(/"pattern":\s*"([^"]+)",\s*"custom_domain":\s*true/g),
    ].map((m) => m[1]);
    expect(domains.length).toBeGreaterThan(0);
    for (const domain of domains) {
      expect(domain).not.toMatch(/vamostaxi\.eu/);
    }
  });

  it("env.staging publishable stays pk_test_; repo wrangler has no sk_live_", () => {
    const wrangler = source("wrangler.jsonc");
    expect(wrangler).not.toMatch(/sk_live_/);
    const staging = wrangler.slice(wrangler.indexOf('"staging"'));
    expect(staging).toMatch(/"STRIPE_PUBLISHABLE_KEY":\s*"pk_test_/);
  });
});
