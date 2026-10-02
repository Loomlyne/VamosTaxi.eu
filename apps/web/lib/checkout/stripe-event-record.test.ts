// apps/web/lib/checkout/stripe-event-record.test.ts
//
// 26.2 finding: stripe_events.payload was stored as a JSON string. The writer must hand the
// payload to the driver as a JSON parameter (`sql.json`), never as JSON.stringify text cast to
// jsonb. The end-to-end proof through the Worker's client is stripe-event-record.local.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as { text: string; values: unknown[] }[],
  inserted: true as boolean | null,
}));

vi.mock("../db/identity", () => ({
  asSystem: async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        state.calls.push({ text: strings.join("$"), values });
        return Promise.resolve([{ inserted: state.inserted }]);
      },
      { json: (value: unknown) => ({ jsonParameter: value }) },
    );
    return fn(sql);
  },
}));

import { recordStripeEvent } from "./stripe-event-record";

const env = {} as CloudflareEnv;
const event = {
  id: "evt_unit_1",
  type: "checkout.session.completed",
  created: 1_790_000_000,
  objectId: "cs_test_unit",
  payload: { id: "cs_test_unit", object: "checkout.session", metadata: { booking_reference: "VT-26-0001" } },
};

describe("recordStripeEvent", () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.inserted = true;
  });

  it("sends the payload as a JSON parameter, not as text", async () => {
    await recordStripeEvent(env, event);
    const call = state.calls[0]!;
    expect(call.text).toContain("public.stripe_event_record(");
    expect(call.text).not.toContain("::jsonb");
    expect(call.values).toEqual([
      "evt_unit_1",
      "checkout.session.completed",
      new Date(1_790_000_000 * 1000).toISOString(),
      "cs_test_unit",
      { jsonParameter: event.payload },
    ]);
    expect(call.values.some((v) => typeof v === "string" && v.startsWith("{"))).toBe(false);
  });

  it("answers inserted (true) and duplicate (false)", async () => {
    await expect(recordStripeEvent(env, event)).resolves.toBe(true);
    state.inserted = false;
    await expect(recordStripeEvent(env, event)).resolves.toBe(false);
    state.inserted = null;
    await expect(recordStripeEvent(env, event)).resolves.toBe(false);
  });
});

describe("both stripe_events writers go through recordStripeEvent", () => {
  const web = join(__dirname, "..", "..");
  const files = ["app/api/stripe/webhook/route.ts", "lib/checkout/return-settle.ts"];

  it.each(files)("%s records through the shared writer and never stringifies into jsonb", (file) => {
    const text = readFileSync(join(web, file), "utf8");
    expect(text).toContain("recordStripeEvent(env, {");
    expect(text).not.toContain("stripe_event_record(");
    expect(text).not.toContain("::jsonb");
  });
});
