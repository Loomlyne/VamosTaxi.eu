// apps/web/lib/cache/static-headers.test.ts
//
// public/_headers may only put a public Cache-Control on static files: the same bytes for
// every visitor. Pages, /api/*, and anything that varies by cookie are answered by the
// Worker and must never match a rule here. A new deploy must reach a returning visitor
// within the short time, so the short rules carry no stale-while-revalidate.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../public/_headers"), "utf8");

type Rule = { pattern: string; lines: string[] };

function rules(): Rule[] {
  const out: Rule[] = [];
  let cur: Rule | null = null;
  for (const raw of src.split("\n")) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    if (/^\S/.test(raw)) {
      cur = { pattern: raw.trim(), lines: [] };
      out.push(cur);
    } else cur?.lines.push(raw.trim());
  }
  return out;
}

const cacheRules = rules().filter((r) => r.lines.some((l) => /cache-control/i.test(l)));

// Static trees the Worker's asset binding serves. Everything else is dynamic.
const STATIC_PREFIXES = ["/app/", "/assets/", "/_ds/", "/brand/"];
const PER_VISITOR = [
  "/api", "/account", "/bookings", "/booking-detail", "/checkout", "/confirmation", "/manage-booking",
  "/sign-in", "/sign-up", "/reset-password", "/ops", "/dashboard", "/review", "/photos", "/de", "/fr", "/ar", "/en",
];

describe("public/_headers cache rules", () => {
  it("has cache rules", () => {
    expect(cacheRules.length).toBeGreaterThan(0);
  });

  it("only ever matches a static file tree, never a page, API or per-visitor path", () => {
    for (const r of cacheRules) {
      expect(r.pattern, r.pattern).not.toBe("/*");
      expect(STATIC_PREFIXES.some((p) => r.pattern.startsWith(p)), `${r.pattern} is not under a static tree`).toBe(true);
      for (const v of PER_VISITOR) expect(r.pattern.startsWith(v), `${r.pattern} names ${v}`).toBe(false);
    }
  });

  it("long rules are immutable and only on versioned or fixed-name files", () => {
    const long = cacheRules.filter((r) => r.lines.some((l) => /max-age=31536000/.test(l)));
    expect(long.map((r) => r.pattern).sort()).toEqual(["/_ds/:pack/assets/fonts/*", "/assets/photography/*", "/assets/vendor/*"]);
    for (const r of long) {
      expect(r.lines.some((l) => /immutable/.test(l))).toBe(true);
      expect(r.lines[0]).toBe("! Cache-Control"); // detach the short rule first
    }
  });

  it("short rules are 5 minutes with no stale-while-revalidate", () => {
    const short = cacheRules.filter((r) => !r.lines.some((l) => /31536000/.test(l)));
    expect(short.map((r) => r.pattern).sort()).toEqual(["/_ds/*", "/app/*", "/assets/*", "/brand/*"]);
    for (const r of short) expect(r.lines).toEqual(["Cache-Control: public, max-age=300"]);
    expect(src.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")).not.toMatch(/stale-while-revalidate/);
  });
});
