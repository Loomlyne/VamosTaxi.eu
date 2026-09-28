// apps/web/lib/checkout/stripe-sandbox-only.test.ts
//
// INT-01 repo-side pin (26.1-CONTEXT D-01/D-02). Only the Vamos Taxi sandbox
// (acct_1UIZmqHcNp9GZYjz) is used. No sk_live_ outside the refusal-guard
// shape. No retired-account suffix. No vamostaxi.eu route. Never reads a
// secret, `.dev.vars`, or `.env*` file — asserts prefixes and shapes only.
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
const RETIRED_ACCOUNT_SUFFIX = "AJS2YBf21S";
const GUARD_SHAPE = 'startsWith("sk_live_")';

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
  it("wrangler.jsonc env.staging publishable key is the Vamos Taxi sandbox", () => {
    const key = wranglerConfig().env.staging.vars?.STRIPE_PUBLISHABLE_KEY ?? "";
    expect(key.startsWith(SANDBOX_PUBLISHABLE_PREFIX)).toBe(true);
  });

  it("wrangler.jsonc itself has no sk_live_", () => {
    expect(source("wrangler.jsonc")).not.toMatch(/sk_live_/);
  });

  it(
    "no sk_live_ outside the refusal-guard shape under lib/ and app/",
    () => {
      const offenders: string[] = [];
      for (const dir of ["lib", "app"]) {
        for (const rel of walk(dir)) {
          if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
          if (isThisTest(rel)) continue;
          const src = source(rel);
          if (!src.includes("sk_live_")) continue;
          // Allow exactly the refusal-guard shape; any other occurrence fails.
          const withoutGuard = src.split(GUARD_SHAPE).join("");
          if (withoutGuard.includes("sk_live_")) offenders.push(rel);
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
