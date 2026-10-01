// apps/web/lib/checkout/stripe-event-record.local.test.ts
//
// 26.2 finding "JSON double encoding in stripe_events.payload", on a real local database through
// the REAL Worker client (asSystem: login `vamos_edge`, role vamos_system, `fetch_types: false`,
// prepared statements). Read back as the owner with the Worker's client options (D-07 helper).
//
//  - the fixed writer (recordStripeEvent) stores an object;
//  - the old writer form (`${JSON.stringify(x)}::jsonb`) stores a JSON string, which is what every
//    live row written before the fix holds, and the ledger (begin, settle, dedupe) still runs on
//    such a row; the unwrap expression gives back the same object.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack. Rows are committed and stay
// (stripe_events has no DELETE); every id carries a random tag. Host is fixed to 127.0.0.1.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import { asSystem } from "../db/identity";
import { pgTextArrayLiteral } from "./settle";
import { recordStripeEvent } from "./stripe-event-record";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const env = {
  HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
} as unknown as CloudflareEnv;

const object = (id: string) => ({
  id,
  object: "checkout.session",
  payment_status: "paid",
  metadata: { booking_reference: "VT-26-0001" },
});

describe.skipIf(!PORT)("stripe_events.payload through the real Worker client (local, committed rows)", () => {
  // Opened in beforeAll: the describe body also runs when the suite is skipped.
  let owner!: ReturnType<typeof workerSql>;
  beforeAll(() => {
    owner = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
  });
  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });

  type Shape = { shape: string; unwrapped: Record<string, unknown>; processed: boolean };
  const shapeOf = async (id: string): Promise<Shape> => {
    const rows = await owner<Shape[]>`
      select jsonb_typeof(payload) as shape,
             (case jsonb_typeof(payload) when 'string' then (payload #>> '{}')::jsonb else payload end)::text as unwrapped,
             processed_at is not null as processed
        from public.stripe_events where id = ${id}`;
    const row = rows[0]!;
    return { ...row, unwrapped: JSON.parse(row.unwrapped as unknown as string) as Record<string, unknown> };
  };

  it("the webhook and return writers store an object, and a replay is a duplicate", async () => {
    const created = Math.floor(Date.now() / 1000);
    const webhookId = `evt_sej_${tag}_new`;
    const csId = `cs_test_sej_${tag}`;
    expect(await recordStripeEvent(env, { id: webhookId, type: "checkout.session.completed", created, objectId: csId, payload: object(csId) })).toBe(true);
    expect(await recordStripeEvent(env, { id: webhookId, type: "checkout.session.completed", created, objectId: csId, payload: object(csId) })).toBe(false);
    const returnId = `return_${csId}`;
    expect(await recordStripeEvent(env, { id: returnId, type: "checkout.session.completed", created, objectId: csId, payload: { id: csId, payment_status: "paid" } })).toBe(true);

    const webhook = await shapeOf(webhookId);
    expect(webhook.shape).toBe("object");
    expect(webhook.unwrapped).toEqual(object(csId));
    const ret = await shapeOf(returnId);
    expect(ret.shape).toBe("object");
    expect(ret.unwrapped).toEqual({ id: csId, payment_status: "paid" });

    const reads = await owner<{ ref: string | null; kind: string | null }[]>`
      select payload #>> '{metadata,booking_reference}' as ref, payload ->> 'object' as kind
        from public.stripe_events where id = ${webhookId}`;
    expect(reads[0]).toEqual({ ref: "VT-26-0001", kind: "checkout.session" });
  });

  it("an old string row (the pre-fix writer) still runs through begin, settle and dedupe", async () => {
    const created = Math.floor(Date.now() / 1000);
    const legacyId = `evt_sej_${tag}_old`;
    const csId = `cs_test_sej_old_${tag}`;
    // The exact pre-fix writer, through the same client: this is what the live rows hold.
    await asSystem(env, (sql) => sql`
      select public.stripe_event_record(
        ${legacyId}, ${"checkout.session.completed"}, ${new Date(created * 1000).toISOString()}::timestamptz,
        ${csId}, ${JSON.stringify(object(csId))}::jsonb
      ) as inserted`);
    const before = await shapeOf(legacyId);
    expect(before.shape).toBe("string");
    expect(before.unwrapped).toEqual(object(csId));
    expect(before.processed).toBe(false);

    // A Stripe retry of the same event goes through the fixed writer: still a duplicate, row unchanged.
    expect(await recordStripeEvent(env, { id: legacyId, type: "checkout.session.completed", created, objectId: csId, payload: object(csId) })).toBe(false);
    expect((await shapeOf(legacyId)).shape).toBe("string");

    const begin = () =>
      asSystem(env, (sql) => sql<{ should_process: boolean; reason: string }[]>`
        select * from public.stripe_event_begin(
          ${legacyId}, ${pgTextArrayLiteral([csId])}::text[], ${new Date(created * 1000).toISOString()}::timestamptz)`);
    expect((await begin())[0]).toEqual({ should_process: true, reason: "ok" });
    await asSystem(env, (sql) => sql`select public.stripe_event_settle(${legacyId}, ${null})`);
    expect((await shapeOf(legacyId)).processed).toBe(true);
    expect((await begin())[0]).toEqual({ should_process: false, reason: "already_processed" });
  });
});
