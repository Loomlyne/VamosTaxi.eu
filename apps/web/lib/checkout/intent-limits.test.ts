import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { intentIpAllowed, intentLimitResponse, payPressAllowed } from "./intent-limits";

const here = dirname(fileURLToPath(import.meta.url));

/** A limiter that allows `limit` calls per key, like the 8/60 binding. */
function limiter(limit: number): RateLimit {
  const seen = new Map<string, number>();
  return {
    limit: async ({ key }: { key: string }) => {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return { success: n <= limit };
    },
  } as RateLimit;
}

/** In-memory twin of public.checkout_note_pay_press (ok / replay / limit). */
function fakeNote() {
  const keys = new Map<string, Set<string>>();
  return async (quoteId: string, key: string) => {
    const set = keys.get(quoteId) ?? new Set<string>();
    keys.set(quoteId, set);
    if (set.has(key)) return "replay";
    if (set.size >= 5) return "limit";
    set.add(key);
    return "ok";
  };
}

describe("D-20 per-IP limit", () => {
  it("allows 8 presses a minute from one IP and refuses the 9th", async () => {
    const l = limiter(8);
    const results: boolean[] = [];
    for (let i = 0; i < 9; i++) results.push(await intentIpAllowed(l, "203.0.113.5"));
    expect(results.slice(0, 8).every(Boolean)).toBe(true);
    expect(results[8]).toBe(false);
    expect(await intentIpAllowed(l, "203.0.113.6")).toBe(true);
  });
  it("uses its own key, and a throwing binding refuses", async () => {
    const keys: string[] = [];
    await intentIpAllowed({ limit: async ({ key }: { key: string }) => (keys.push(key), { success: true }) } as RateLimit, "1.2.3.4");
    expect(keys).toEqual(["intent:1.2.3.4"]);
    expect(await intentIpAllowed({ limit: async () => { throw new Error("x"); } } as unknown as RateLimit, "1.2.3.4")).toBe(false);
  });
  it("a missing binding (local) allows", async () => {
    expect(await intentIpAllowed(undefined, "1.2.3.4")).toBe(true);
  });
});

describe("D-20 per-quote cap", () => {
  it("allows five presses on one price and refuses the sixth", async () => {
    const note = fakeNote();
    const out: boolean[] = [];
    for (let i = 1; i <= 6; i++) out.push(await payPressAllowed(note, "q1", `k${i}`));
    expect(out).toEqual([true, true, true, true, true, false]);
  });
  it("a replay with the same idempotency key is not counted", async () => {
    const note = fakeNote();
    for (let i = 0; i < 20; i++) expect(await payPressAllowed(note, "q1", "same")).toBe(true);
    for (let i = 2; i <= 5; i++) expect(await payPressAllowed(note, "q1", `k${i}`)).toBe(true);
    expect(await payPressAllowed(note, "q1", "k6")).toBe(false);
    expect(await payPressAllowed(note, "q1", "same")).toBe(true);
  });
  it("another price counts on its own", async () => {
    const note = fakeNote();
    for (let i = 1; i <= 6; i++) await payPressAllowed(note, "q1", `k${i}`);
    expect(await payPressAllowed(note, "q2", "k1")).toBe(true);
  });
});

describe("D-20 answers and order", () => {
  it("both codes answer 429 { ok:false, code }", async () => {
    for (const code of ["rate_limited", "pay_limit"] as const) {
      const res = intentLimitResponse(code);
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ ok: false, code });
    }
  });
  it("the route runs CSRF, IP limit, validation, quote cap, then everything else", () => {
    const route = readFileSync(join(here, "../../app/api/checkout/intent/route.ts"), "utf8");
    const at = (s: string) => route.indexOf(s);
    const order = [
      "const blocked = await csrfForbiddenPublicOrStaff(request",
      "intentIpAllowed(",
      "checkoutIntentSchema.safeParse",
      "payPressAllowed(",
      "const { postgresNowIso, vehicleClassId }",
      "gateAccountForRequest({",
      "return runCheckoutIntent(",
    ].map(at);
    expect(order.every((n) => n > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("the binding is declared in both wrangler blocks", () => {
    const wr = readFileSync(join(here, "../../wrangler.jsonc"), "utf8");
    expect(wr.match(/"name": "INTENT_RATE_LIMITER"/g)).toHaveLength(2);
    expect(wr.match(/"namespace_id": "1004"/g)).toHaveLength(2);
  });
  it("the two messages exist in four languages", () => {
    for (const l of ["en", "de", "fr", "ar"]) {
      const m = JSON.parse(readFileSync(join(here, `../../i18n/messages/${l}.json`), "utf8"));
      expect(m.checkout.payLimit, l).toBeTruthy();
      expect(m.checkout.payRateLimited, l).toBeTruthy();
    }
  });
});
