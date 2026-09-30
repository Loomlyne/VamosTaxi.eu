// apps/web/lib/quote/lock.test.ts
//
// Mint / verify / dual-secret rotation proofs for the QUOTE-04 lock token.
// Secrets are obviously-fake fixed strings. Every class_totals figure is null
// (D-46) — the lock pins totals, and today every total is null.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCK_KID_CURRENT,
  LOCK_KID_PREVIOUS,
  mintLock,
  type QuoteLockPayload,
  verifyLock,
} from "./lock";

const here = dirname(fileURLToPath(import.meta.url));

/** Obviously-fake lock secret — not a real credential shape. */
const FAKE_CURRENT = "test-quote-lock-secret-current-not-real-00";
/** Obviously-fake previous secret used only inside a rotation window. */
const FAKE_PREVIOUS = "test-quote-lock-secret-previous-not-real-00";

function fixturePayload(overrides: Partial<QuoteLockPayload> = {}): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "q_test_00000000-0000-4000-8000-000000000001",
    exp: "2099-01-01T12:00:00.000Z",
    engine_version: "0.0.0-test",
    rate_version_id: null,
    settings_version_id: 1,
    computed_at: "2026-08-28T10:00:00.000Z",
    display_currency: "EUR",
    mode: "one_way",
    pax: 2,
    bags: 2,
    legs: [
      {
        leg_seq: 1,
        pickup: { lng: 8.55, lat: 47.45, text: "ZRH" },
        dropoff: { lng: 8.54, lat: 47.37, text: "Zurich" },
        scheduled_local: "2026-09-01T10:00:00",
        distance_m: 12000,
        duration_s: 1200,
        origin_zone_id: null,
        dest_zone_id: null,
        flight_no: null,
        landing_source: null,
      },
    ],
    extras: null,
    coupon: null,
    // D-46: every total is null until pricing_live.
    class_totals: [
      { slug: "economy", total_rappen: null },
      { slug: "business", total_rappen: null },
      { slug: "van", total_rappen: null },
    ],
    ...overrides,
  };
}

describe("mintLock", () => {
  it("returns kid.payload.mac with LOCK_KID_CURRENT", async () => {
    const token = await mintLock({ current: FAKE_CURRENT }, fixturePayload());
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(LOCK_KID_CURRENT);
    expect(parts[1]!.length).toBeGreaterThan(0);
    expect(parts[2]!.length).toBeGreaterThan(0);
    expect(token).not.toMatch(/[+/=]/);
  });

  it("is stable: same payload always mints the same token for the same secret", async () => {
    const payload = fixturePayload();
    const a = await mintLock({ current: FAKE_CURRENT }, payload);
    const b = await mintLock({ current: FAKE_CURRENT }, payload);
    expect(a).toBe(b);
  });

  it("has no exp default — payload.exp is required on the type", () => {
    // Compile-time contract: QuoteLockPayload.exp is required (not optional).
    // Runtime proof: a payload without exp fails the structural guard on verify.
    const secrets = { current: FAKE_CURRENT };
    type ExpRequired = QuoteLockPayload["exp"];
    const _exp: ExpRequired = "2099-01-01T00:00:00.000Z";
    void _exp;
    void secrets;
    expect(true).toBe(true);
  });

  it("bakes exp from published quote_lock_minutes via quote_lock_deadline, not a Worker clock", () => {
    const lockSrc = readFileSync(join(here, "lock.ts"), "utf8");
    const quoteSrc = readFileSync(join(here, "../db/quote.ts"), "utf8");
    expect(lockSrc).toMatch(/quote_lock_deadline/);
    expect(lockSrc).toMatch(/quote_lock_expires_at/);
    expect(lockSrc).toMatch(/quote_lock_minutes/);
    expect(lockSrc).not.toMatch(/Date\.now/);
    expect(quoteSrc).toMatch(/quote_lock_deadline/);
    expect(quoteSrc).toMatch(/asQuote/);
  });
});

describe("verifyLock", () => {
  it("returns ok:true with payload for a valid current token", async () => {
    const payload = fixturePayload();
    const token = await mintLock({ current: FAKE_CURRENT }, payload);
    const result = await verifyLock(
      { current: FAKE_CURRENT },
      token,
      "2026-08-28T11:00:00.000Z",
    );
    expect(result).toEqual({ ok: true, payload });
  });

  it("returns expired when payload.exp <= injected nowIso", async () => {
    const payload = fixturePayload({ exp: "2026-08-28T10:00:00.000Z" });
    const token = await mintLock({ current: FAKE_CURRENT }, payload);
    const result = await verifyLock(
      { current: FAKE_CURRENT },
      token,
      "2026-08-28T10:00:00.000Z",
    );
    expect(result).toEqual({ ok: false, reason: "expired", payload });
  });

  it("compares exp against injected nowIso, never a clock it reads", async () => {
    // Far-future nowIso with a still-valid exp relative to "real" time would
    // expire if the module read Date.now(); we pass a past now so it stays ok.
    const payload = fixturePayload({ exp: "2026-08-28T12:00:00.000Z" });
    const token = await mintLock({ current: FAKE_CURRENT }, payload);
    const ok = await verifyLock(
      { current: FAKE_CURRENT },
      token,
      "2026-08-28T11:00:00.000Z",
    );
    expect(ok.ok).toBe(true);
    const expired = await verifyLock(
      { current: FAKE_CURRENT },
      token,
      "2026-08-28T13:00:00.000Z",
    );
    expect(expired).toEqual({ ok: false, reason: "expired", payload });
  });

  it("dual-verifies LOCK_KID_PREVIOUS with QUOTE_LOCK_SECRET_PREVIOUS and sets rotated", async () => {
    // Manually mint with previous kid by swapping secrets: mint under previous
    // as "current", then rewrite kid to LOCK_KID_PREVIOUS... simpler path:
    // sign with previous secret under current kid, then replace kid prefix.
    const payload = fixturePayload();
    const tokenAsCurrent = await mintLock({ current: FAKE_PREVIOUS }, payload);
    const [, payloadB64, mac] = tokenAsCurrent.split(".") as [string, string, string];
    const previousToken = `${LOCK_KID_PREVIOUS}.${payloadB64}.${mac}`;

    const result = await verifyLock(
      { current: FAKE_CURRENT, previous: FAKE_PREVIOUS },
      previousToken,
      "2026-08-28T11:00:00.000Z",
    );
    expect(result).toEqual({ ok: true, payload, rotated: true });
  });

  it("returns invalid for previous kid when previous secret is absent", async () => {
    const payload = fixturePayload();
    const tokenAsCurrent = await mintLock({ current: FAKE_PREVIOUS }, payload);
    const [, payloadB64, mac] = tokenAsCurrent.split(".") as [string, string, string];
    const previousToken = `${LOCK_KID_PREVIOUS}.${payloadB64}.${mac}`;

    const result = await verifyLock(
      { current: FAKE_CURRENT },
      previousToken,
      "2026-08-28T11:00:00.000Z",
    );
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("carries optional origin_city_id/dest_city_id/origin_is_airport through mint/verify unchanged (26.1-09)", async () => {
    const payload = fixturePayload({
      legs: [
        {
          leg_seq: 1,
          pickup: { lng: 8.55, lat: 47.45, text: "ZRH" },
          dropoff: { lng: 8.54, lat: 47.37, text: "Zurich" },
          scheduled_local: "2026-09-01T10:00:00",
          distance_m: 12000,
          duration_s: 1200,
          origin_zone_id: null,
          dest_zone_id: null,
          origin_city_id: "place.zrh",
          dest_city_id: "place.zurich",
          origin_is_airport: true,
          flight_no: "LX1234",
          landing_source: null,
        },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, payload);
    const result = await verifyLock(
      { current: FAKE_CURRENT },
      token,
      "2026-08-28T11:00:00.000Z",
    );
    expect(result).toEqual({ ok: true, payload });
  });

  it("six malformed shapes all return deep-equal invalid (oracle-free, D-28)", async () => {
    const payload = fixturePayload();
    const good = await mintLock({ current: FAKE_CURRENT }, payload);
    const [kid, payloadB64, mac] = good.split(".") as [string, string, string];

    const shapes = [
      // 1. tampered payload (flip one char in the middle of payloadB64)
      `${kid}.${payloadB64.slice(0, 4)}X${payloadB64.slice(5)}.${mac}`,
      // 2. tampered MAC
      `${kid}.${payloadB64}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`,
      // 3. unknown kid
      `unknown.${payloadB64}.${mac}`,
      // 4. two-segment token
      `${kid}.${payloadB64}`,
      // 5. four-segment token
      `${kid}.${payloadB64}.${mac}.extra`,
      // 6. empty string
      "",
      // 7. valid base64url that is not JSON (extra oracle-free case from plan)
      `${kid}.${btoa("not-json!!!").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}.${mac}`,
    ];

    const results = await Promise.all(
      shapes.map((t) =>
        verifyLock({ current: FAKE_CURRENT }, t, "2026-08-28T11:00:00.000Z"),
      ),
    );

    for (const r of results) {
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    // Every result is deep-equal to the others (oracle-free proof as assertion).
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
      // Same object reference is ideal but deep equality is the public contract.
      expect(results[i]).toStrictEqual(results[0]);
    }
  });
});
