// apps/web/lib/quote/intent.test.ts
//
// §6 ladder proofs. Stubs only — no Docker. The D-49 probe is the only
// database touch in this plan.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkIntentAgainstLock,
  INTENT_LADDER,
  type CheckIntentDeps,
  type IntentBody,
  type IntentRecompute,
} from "./intent";
import { mintLock, type QuoteLockPayload } from "./lock";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../");

const FAKE_CURRENT = "test-quote-lock-secret-current-not-real-00";

const FUTURE = "2099-01-01T12:00:00.000Z";
const PAST = "2020-01-01T12:00:00.000Z";
const NOW = "2026-08-28T12:00:00.000Z";

function fixturePayload(
  overrides: Partial<QuoteLockPayload> = {},
): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "q_test_00000000-0000-4000-8000-000000000001",
    exp: FUTURE,
    engine_version: "quote-engine@test",
    rate_version_id: null,
    settings_version_id: 1,
    computed_at: "2026-08-28T10:00:00.000Z",
    display_currency: "CHF",
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
        waypoints: [],
        flight_no: null,
        landing_source: null,
      },
    ],
    extras: null,
    coupon: null,
    class_totals: [
      { slug: "economy", total_rappen: null },
      { slug: "business", total_rappen: null },
      { slug: "van", total_rappen: null },
    ],
    ...overrides,
  };
}

function liveRecompute(
  extra: Partial<IntentRecompute> = {},
): IntentRecompute {
  return {
    pricing_live: true,
    engine_version: "quote-engine@test",
    classes: [
      { slug: "economy", total_rappen: 1, eligible: true },
      { slug: "business", total_rappen: 1, eligible: true },
      { slug: "van", total_rappen: 1, eligible: true },
    ],
    ...extra,
  };
}

function body(
  payload: QuoteLockPayload,
  lock: string,
  extra: Partial<IntentBody> = {},
): IntentBody {
  return {
    quote_id: payload.quote_id,
    lock,
    vehicle_class: "economy",
    idempotency_key: "idem-a",
    ...extra,
  };
}

async function setup(
  payloadOverrides: Partial<QuoteLockPayload> = {},
  recompute: IntentRecompute = liveRecompute(),
  clocks: { workerNowIso?: string; postgresNowIso?: string } = {},
) {
  const payload = fixturePayload(payloadOverrides);
  const token = await mintLock({ current: FAKE_CURRENT }, payload);
  const deps: CheckIntentDeps = {
    secrets: { current: FAKE_CURRENT },
    workerNowIso: clocks.workerNowIso ?? NOW,
    postgresNowIso: clocks.postgresNowIso ?? NOW,
    recompute: () => recompute,
  };
  return { payload, token, deps };
}

const WITHOUT_STEP_2 = INTENT_LADDER.filter((step) => !("decorative" in step && step.decorative));

describe("INTENT_LADDER", () => {
  it("is a frozen array whose five ids match §6", () => {
    expect(Object.isFrozen(INTENT_LADDER)).toBe(true);
    expect(INTENT_LADDER.map((s) => s.id)).toEqual([
      "verify_hmac",
      "worker_expires",
      "postgres_exp",
      "pricing_live",
      "recompute_pin",
    ]);
    expect(INTENT_LADDER[1]).toMatchObject({ decorative: true });
  });
});

describe("checkIntentAgainstLock", () => {
  it("HMAC failure is quote_not_found, byte-identical to an unknown quote_id", async () => {
    const { payload, deps } = await setup();
    const badMac = await checkIntentAgainstLock(
      body(payload, "v1.not-a-token.nope"),
      deps,
    );
    const unknownId = await checkIntentAgainstLock(
      body(payload, "v1.not-a-token.nope", { quote_id: "unknown-id" }),
      deps,
    );
    expect(badMac).toEqual({ ok: false, code: "quote_not_found" });
    expect(unknownId).toEqual(badMac);
    expect(unknownId).toBe(badMac);
  });

  it("mismatched quote_id on a valid lock is the same quote_not_found object", async () => {
    const { payload, token, deps } = await setup();
    const a = await checkIntentAgainstLock(
      body(payload, "v1.not-a-token.nope"),
      deps,
    );
    const b = await checkIntentAgainstLock(
      body(payload, token, { quote_id: "other-id" }),
      deps,
    );
    expect(a).toEqual(b);
    expect(a).toBe(b);
  });

  it("expired lock vs postgres now returns quote_expired even when worker clock is skipped", async () => {
    const { payload, token, deps } = await setup(
      { exp: PAST },
      liveRecompute({
        classes: [
          { slug: "economy", total_rappen: null, eligible: true },
          { slug: "business", total_rappen: null, eligible: true },
          { slug: "van", total_rappen: null, eligible: true },
        ],
      }),
      { workerNowIso: FUTURE, postgresNowIso: NOW },
    );
    const result = await checkIntentAgainstLock(body(payload, token), deps);
    expect(result).toEqual({ ok: false, code: "quote_expired" });
  });

  it("pricing_live false returns pricing_not_live even with a non-null total", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute({ pricing_live: false }),
      },
    );
    expect(result).toEqual({ ok: false, code: "pricing_not_live" });
  });

  it("null chosen-class total returns pricing_not_live even when pricing_live is true", async () => {
    const { payload, token, deps } = await setup(
      {},
      liveRecompute({
        pricing_live: true,
        classes: [
          { slug: "economy", total_rappen: null, eligible: true },
          { slug: "business", total_rappen: null, eligible: true },
          { slug: "van", total_rappen: null, eligible: true },
        ],
      }),
    );
    const result = await checkIntentAgainstLock(body(payload, token), deps);
    expect(result).toEqual({ ok: false, code: "pricing_not_live" });
  });

  it("chosen-class total differing from the pin returns price_changed", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () =>
          liveRecompute({
            classes: [
              { slug: "economy", total_rappen: 2, eligible: true },
              { slug: "business", total_rappen: 1, eligible: true },
              { slug: "van", total_rappen: 1, eligible: true },
            ],
          }),
      },
    );
    expect(result).toEqual({ ok: false, code: "price_changed" });
  });

  it("ENGINE_VERSION differing from the pin returns engine_changed", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute({ engine_version: "quote-engine@other" }),
      },
    );
    expect(result).toEqual({ ok: false, code: "engine_changed" });
  });

  it("when both price and engine differ, returns price_changed (order)", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () =>
          liveRecompute({
            engine_version: "quote-engine@other",
            classes: [
              { slug: "economy", total_rappen: 2, eligible: true },
              { slug: "business", total_rappen: 1, eligible: true },
              { slug: "van", total_rappen: 1, eligible: true },
            ],
          }),
      },
    );
    expect(result).toEqual({ ok: false, code: "price_changed" });
  });

  it("pax: 0 returns a refusal and does not fall back to a floor", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token, { pax: 0 }),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute(),
      },
    );
    expect(result).toEqual({ ok: false, code: "untrusted_input" });
  });

  it("ineligible chosen class returns a refusal", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () =>
          liveRecompute({
            classes: [
              { slug: "economy", total_rappen: 1, eligible: false },
              { slug: "business", total_rappen: 1, eligible: true },
              { slug: "van", total_rappen: 1, eligible: true },
            ],
          }),
      },
    );
    expect(result).toEqual({ ok: false, code: "untrusted_input" });
  });

  it("round(duration_s / minute) of zero returns a refusal, not a floor", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
      legs: [
        {
          leg_seq: 1,
          pickup: { lng: 8.55, lat: 47.45, text: "ZRH" },
          dropoff: { lng: 8.54, lat: 47.37, text: "Zurich" },
          scheduled_local: "2026-09-01T10:00:00",
          distance_m: 1,
          duration_s: 1,
          origin_zone_id: null,
          dest_zone_id: null,
          waypoints: [],
          flight_no: null,
          landing_source: null,
        },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute(),
      },
    );
    expect(result).toEqual({ ok: false, code: "untrusted_input" });
  });

  it("flight_no disagreeing with the lock is untrusted_input (D-20)", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
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
          waypoints: [],
          flight_no: "LX123",
          landing_source: "scheduled",
        },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token, { flight_no: "LX999" }),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute(),
      },
    );
    expect(result).toEqual({ ok: false, code: "untrusted_input" });
  });

  it("landing_source disagreeing with the lock is untrusted_input (D-20)", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
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
          waypoints: [],
          flight_no: "LX123",
          landing_source: "scheduled",
        },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token, { landing_source: "actual" }),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute(),
      },
    );
    expect(result).toEqual({ ok: false, code: "untrusted_input" });
  });

  it("forwards idempotency_key unchanged and does not derive it from quote_id (D-57)", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const deps: CheckIntentDeps = {
      secrets: { current: FAKE_CURRENT },
      workerNowIso: NOW,
      postgresNowIso: NOW,
      recompute: () => liveRecompute(),
    };
    const a = await checkIntentAgainstLock(
      body(priced, token, { idempotency_key: "key-one" }),
      deps,
    );
    const b = await checkIntentAgainstLock(
      body(priced, token, { idempotency_key: "key-two" }),
      deps,
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.idempotency_key).toBe("key-one");
      expect(b.idempotency_key).toBe("key-two");
      expect(a.payload).toEqual(b.payload);
    }
  });

  it("never returns a Response", async () => {
    const priced = fixturePayload({
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute(),
      },
    );
    expect(result).not.toBeInstanceOf(Response);
    expect(result.ok).toBe(true);
  });

  it("refuses Select when quoted rate_version_id is not the current live book (D-21)", async () => {
    const priced = fixturePayload({
      rate_version_id: 1,
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute({ live_rate_version_id: 2 }),
      },
    );
    expect(result).toEqual({ ok: false, code: "quote_expired" });
  });

  it("allows Select when quoted rate_version_id matches live", async () => {
    const priced = fixturePayload({
      rate_version_id: 4,
      class_totals: [
        { slug: "economy", total_rappen: 1 },
        { slug: "business", total_rappen: 1 },
        { slug: "van", total_rappen: 1 },
      ],
    });
    const token = await mintLock({ current: FAKE_CURRENT }, priced);
    const result = await checkIntentAgainstLock(
      body(priced, token),
      {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: NOW,
        postgresNowIso: NOW,
        recompute: () => liveRecompute({ live_rate_version_id: 4 }),
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe("decorative", () => {
  it("running the ladder with step 2 removed produces identical results", async () => {
    const cases: Array<{
      name: string;
      payload: Partial<QuoteLockPayload>;
      recompute: IntentRecompute;
      extra?: Partial<IntentBody>;
      clocks?: { workerNowIso?: string; postgresNowIso?: string };
    }> = [
      {
        name: "happy live pin",
        payload: {
          class_totals: [
            { slug: "economy", total_rappen: 1 },
            { slug: "business", total_rappen: 1 },
            { slug: "van", total_rappen: 1 },
          ],
        },
        recompute: liveRecompute(),
      },
      {
        name: "postgres-expired",
        payload: { exp: PAST },
        recompute: liveRecompute(),
        clocks: { workerNowIso: NOW, postgresNowIso: NOW },
      },
      {
        name: "pricing flag off",
        payload: {
          class_totals: [
            { slug: "economy", total_rappen: 1 },
            { slug: "business", total_rappen: 1 },
            { slug: "van", total_rappen: 1 },
          ],
        },
        recompute: liveRecompute({ pricing_live: false }),
      },
      {
        name: "pax zero",
        payload: {
          class_totals: [
            { slug: "economy", total_rappen: 1 },
            { slug: "business", total_rappen: 1 },
            { slug: "van", total_rappen: 1 },
          ],
        },
        recompute: liveRecompute(),
        extra: { pax: 0 },
      },
    ];

    for (const entry of cases) {
      const payload = fixturePayload(entry.payload);
      const token = await mintLock({ current: FAKE_CURRENT }, payload);
      const deps: CheckIntentDeps = {
        secrets: { current: FAKE_CURRENT },
        workerNowIso: entry.clocks?.workerNowIso ?? NOW,
        postgresNowIso: entry.clocks?.postgresNowIso ?? NOW,
        recompute: () => entry.recompute,
      };
      const withStep = await checkIntentAgainstLock(
        body(payload, token, entry.extra),
        deps,
      );
      const without = await checkIntentAgainstLock(
        body(payload, token, entry.extra),
        deps,
        WITHOUT_STEP_2,
      );
      expect(without, entry.name).toEqual(withStep);
    }
  });
});

describe("D-21 Select posts the lock, no home layout change", () => {
  it("home stores vamosQuoteLock and checkout client posts /api/checkout/intent", () => {
    const home = readFileSync(join(repoRoot, "app/home/home.dc.html"), "utf8");
    const client = readFileSync(
      join(repoRoot, "apps/web/app/[locale]/checkout/CheckoutClient.tsx"),
      "utf8",
    );
    expect(home).toMatch(/vamosQuoteLock/);
    expect(home).toMatch(/\/checkout\/trip/);
    expect(client).toMatch(/\/api\/checkout\/intent/);
  });
});
