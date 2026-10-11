// apps/web/lib/checkout/stripe-sandbox-only.test.ts
//
// INT-01 repo-side pin (26.1-CONTEXT D-01/D-02), reworked in J1 (2026-10-09): Worker `vamos`
// runs Stripe LIVE mode on the owner's word. What stays pinned: the publishable key is one of
// the two known Vamos keys (sandbox or live), no secret or restricted key literal sits in
// source or in wrangler.jsonc, no retired-account suffix, no vamostaxi.eu route. J10 removed the
// product's test-only refusal; `sk_test_` fixtures stay in tests and the local lab, and the mode
// guard still reads a test key so that lab can run. Never reads a secret, `.dev.vars`, or `.env*`
// file — asserts prefixes and shapes only.
// The webhook signing secret is owner-only and is checked in 26.1-13, not here.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

// Build caches and vendor trees only — never a place source facts would live.
const SKIP_DIRS = new Set(["node_modules", ".next", ".open-next", ".wrangler"]);

// Binary/media/build-artifact extensions. A retired account suffix cannot
// meaningfully appear inside a PNG's bytes; reading ~1,200 visual-baseline
// snapshots as utf8 text is the exact trap that timed out lib/meta/legal-gate
// .test.ts's full-tree walk after this plan's PR #60 merge added them. This
// walk stays a source-file check, not an image-content check.
const SKIP_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "ico",
  "ttf",
  "woff",
  "woff2",
  "gz",
  "sqlite",
  "sqlite-wal",
  "sqlite-shm",
  "pack",
  "rscinfo",
  "tsbuildinfo",
]);

const SANDBOX_PUBLISHABLE_PREFIX = "pk_test_51UIZmqHcNp9GZYjz";
const LIVE_PUBLISHABLE_PREFIX = "pk_live_51UIZmAQbJiSLxJfu";
const RETIRED_ACCOUNT_SUFFIX = "AJS2YBf21S";
// Built from parts so this file itself carries no key-prefix literal.
const SECRET_KEY_LITERAL = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]/;
const LIVE_SECRET_KEY_LITERAL = /\b(?:sk|rk)_live_[A-Za-z0-9]/;

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

/** Full-line `//` comments stripped so a comment mentioning a pattern is not misread. */
function stripJsoncLineComments(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, "");
}

function wranglerConfig(): {
  env: {
    staging: {
      routes?: Array<{ pattern: string; custom_domain?: boolean }>;
      vars?: { STRIPE_PUBLISHABLE_KEY?: string };
    };
  };
} {
  return JSON.parse(stripJsoncLineComments(source("wrangler.jsonc"))) as ReturnType<
    typeof wranglerConfig
  >;
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1);
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
    if (entry.isDirectory()) {
      out.push(...walk(rel));
    } else if (entry.isFile() && !SKIP_EXTENSIONS.has(extensionOf(entry.name))) {
      out.push(rel);
    }
  }
  return out;
}

function isThisTest(rel: string): boolean {
  return rel.endsWith("stripe-sandbox-only.test.ts");
}

describe("INT-01 sandbox-only Stripe facts (repo side)", () => {
  it("wrangler.jsonc env.staging publishable key is a known Vamos key (sandbox or live)", () => {
    const key = wranglerConfig().env.staging.vars?.STRIPE_PUBLISHABLE_KEY ?? "";
    expect(
      key.startsWith(SANDBOX_PUBLISHABLE_PREFIX) || key.startsWith(LIVE_PUBLISHABLE_PREFIX),
    ).toBe(true);
  });

  it("wrangler.jsonc itself carries no secret or restricted key", () => {
    expect(source("wrangler.jsonc")).not.toMatch(SECRET_KEY_LITERAL);
  });

  it(
    "no live secret or restricted key literal in non-test source under lib/ and app/",
    () => {
      const offenders: string[] = [];
      for (const dir of ["lib", "app"]) {
        for (const rel of walk(dir)) {
          if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
          if (isThisTest(rel)) continue;
          if (LIVE_SECRET_KEY_LITERAL.test(source(rel))) offenders.push(rel);
        }
      }
      expect(offenders).toEqual([]);
    },
    30_000,
  );

  it(
    "no file under apps/web carries the retired account suffix",
    () => {
      const offenders: string[] = [];
      for (const rel of walk("")) {
        if (isThisTest(rel)) continue;
        if (source(rel).includes(RETIRED_ACCOUNT_SUFFIX)) offenders.push(rel);
      }
      expect(offenders).toEqual([]);
    },
    30_000,
  );

  it("env.staging routes are vamostaxi.site only, never .eu", () => {
    const routes = wranglerConfig().env.staging.routes ?? [];
    expect(routes.length).toBeGreaterThan(0);
    const patterns = routes.map((route) => route.pattern);
    expect(patterns).toContain("vamostaxi.site");
    for (const pattern of patterns) {
      expect(pattern).not.toMatch(/vamostaxi\.eu/);
    }
  });
});
