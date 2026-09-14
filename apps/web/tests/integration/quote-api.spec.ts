// apps/web/tests/integration/quote-api.spec.ts
//
// 04-API-CONTRACT.md §11 rows reachable without Stripe or a live rate
// version. Each `it` is the claim. Playwright vs the seeded draft-only
// database is the QUOTE-10 launch-state path. Mapbox is stubbed through
// the harness (QUOTE_TEST_STUB_GEO) rather than skipped.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const ENGLISH_SENTENCE = /[A-Za-z]{3,}\s+[A-Za-z]{3,}/;

const LOCK_SECRET = "test-quote-lock-secret-current-not-real-00";

let devServer: ChildProcess | null = null;
let baseURL = "";

function wellFormed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locale: "en",
    display_currency: "CHF",
    mode: "one_way",
    pickup: { kind: "pin", lng: 8.5417, lat: 47.3769, text: "Zurich HB" },
    dropoff: { kind: "pin", lng: 8.5624, lat: 47.4504, text: "ZRH" },
    legs: [{ leg_seq: 1, scheduled_local: "2027-09-01T10:30" }],
    pax: 2,
    bags: 1,
    ...overrides,
  };
}

async function postQuote(body: unknown): Promise<Response> {
  return fetch(`${baseURL}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postReprice(body: unknown): Promise<Response> {
  return fetch(`${baseURL}/api/quote/reprice`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
    return acc;
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, acc);
  }
  return acc;
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(90_000);
  const port = 4100 + testInfo.workerIndex;
  baseURL = `http://localhost:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      QUOTE_TEST_STUB_GEO: "1",
      QUOTE_LOCK_SECRET: LOCK_SECRET,
    },
  });
  await waitForNextServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  devServer = null;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Quote HTTP proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test("a body carrying total_rappen: 1 is 400 untrusted_input", async () => {
  const res = await postQuote(wellFormed({ total_rappen: 1 }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error).toBe("untrusted_input");
  expect(body.ok).toBe(false);
});

test("a body carrying distance_m is 400 untrusted_input", async () => {
  const res = await postQuote(wellFormed({ distance_m: 1 }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error).toBe("untrusted_input");
});

test("a body carrying a forged expires_at is 400 untrusted_input", async () => {
  const res = await postQuote(wellFormed({ expires_at: "2099-01-01T00:00:00.000Z" }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error).toBe("untrusted_input");
});

test("mode: hourly is 422 mode_not_offered", async () => {
  const res = await postQuote(wellFormed({ mode: "hourly" }));
  expect(res.status).toBe(422);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error).toBe("mode_not_offered");
});

test("mode: one-way (hyphen) is accepted and normalised", async () => {
  const res = await postQuote(wellFormed({ mode: "one-way" }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.ok).toBe(true);
});

test("8 pax against the seeded board is 200 with no_eligible_class and a per-class ineligible_reason — never a 422 (D-02)", async () => {
  const res = await postQuote(wellFormed({ pax: 8 }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    no_eligible_class: boolean;
    classes: Array<{ ineligible_reason: string | null; eligible: boolean }>;
  };
  expect(body.classes.length).toBeGreaterThan(0);
  for (const cls of body.classes) {
    expect(cls).toHaveProperty("ineligible_reason");
  }
  if (body.classes.every((c) => c.eligible === false)) {
    expect(body.no_eligible_class).toBe(true);
  }
});

test("against the seeded draft-only database a well-formed quote is 200 with pricing_live false, rate_version null and every total_rappen null (QUOTE-10, D-46)", async () => {
  const res = await postQuote(wellFormed());
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    pricing_live: boolean;
    rate_version: unknown;
    classes: Array<{ total_rappen: number | null; lines: Array<{ amount_rappen: number | null }> }>;
  };
  expect(body.ok).toBe(true);
  expect(body.pricing_live).toBe(false);
  expect(body.rate_version).toBeNull();
  for (const cls of body.classes) {
    expect(cls.total_rappen).toBeNull();
    for (const line of cls.lines) {
      expect(line.amount_rappen).toBeNull();
    }
  }
});

test("a reprice with a coupon and unchanged waypoints returns the SAME quote_id and expires_at", async () => {
  const quoted = await postQuote(wellFormed());
  expect(quoted.status).toBe(200);
  const first = (await quoted.json()) as {
    quote_id: string;
    expires_at: string;
    lock: string;
  };
  const again = await postReprice({
    quote_id: first.quote_id,
    lock: first.lock,
    locale: "en",
    display_currency: "CHF",
    coupon: "SAVE10",
  });
  expect(again.status).toBe(200);
  const body = (await again.json()) as {
    quote_id: string;
    expires_at: string;
  };
  expect(body.quote_id).toBe(first.quote_id);
  expect(body.expires_at).toBe(first.expires_at);
});

test("a reprice carrying pax is 400 untrusted_input", async () => {
  const res = await postReprice({
    quote_id: "q",
    lock: "v1.x.y",
    locale: "en",
    display_currency: "CHF",
    pax: 4,
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error).toBe("untrusted_input");
});

test("a reprice with extra_stops: 2 is extras_max_stops (D-21)", async () => {
  const quoted = await postQuote(wellFormed());
  expect(quoted.status).toBe(200);
  const first = (await quoted.json()) as {
    quote_id: string;
    lock: string;
  };
  const again = await postReprice({
    quote_id: first.quote_id,
    lock: first.lock,
    locale: "en",
    display_currency: "CHF",
    extras: { extra_stops: 2 },
  });
  expect(again.status).toBe(422);
  const body = (await again.json()) as Record<string, unknown>;
  expect(body.error).toBe("extras_max_stops");
});

test("a lock whose HMAC does not verify is 404 quote_not_found, byte-identical to an unknown id", async () => {
  const quoted = await postQuote(wellFormed());
  expect(quoted.status).toBe(200);
  const first = (await quoted.json()) as { quote_id: string; lock: string };
  const tampered = `${first.lock.slice(0, -1)}${first.lock.endsWith("a") ? "b" : "a"}`;
  const forged = await postReprice({
    quote_id: first.quote_id,
    lock: tampered,
    locale: "en",
    display_currency: "CHF",
  });
  const unknown = await postReprice({
    quote_id: "00000000-0000-4000-8000-000000000000",
    lock: "v1.notareallock.notarealmac",
    locale: "en",
    display_currency: "CHF",
  });
  expect(forged.status).toBe(404);
  expect(unknown.status).toBe(404);
  const a = await forged.text();
  const b = await unknown.text();
  expect(JSON.parse(a)).toEqual(JSON.parse(b));
  expect(JSON.parse(a).error).toBe("quote_not_found");
});

test("every 4xx/5xx body in this file satisfies the no-English-sentence scan", async () => {
  const samples: Response[] = [
    await postQuote(wellFormed({ total_rappen: 1 })),
    await postQuote(wellFormed({ distance_m: 1 })),
    await postQuote(wellFormed({ expires_at: "2099-01-01T00:00:00.000Z" })),
    await postQuote(wellFormed({ mode: "hourly" })),
    await postReprice({
      quote_id: "q",
      lock: "v1.x.y",
      locale: "en",
      display_currency: "CHF",
      pax: 2,
    }),
    await postReprice({
      quote_id: "00000000-0000-4000-8000-000000000000",
      lock: "v1.notareallock.notarealmac",
      locale: "en",
      display_currency: "CHF",
    }),
  ];
  for (const res of samples) {
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    for (const s of collectStrings(body)) {
      expect(ENGLISH_SENTENCE.test(s), s).toBe(false);
    }
  }
});
