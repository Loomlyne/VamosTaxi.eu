// apps/web/lib/checkout/stripe-event-record.ts
//
// The one writer of public.stripe_events (D-13 insert-first dedupe). The webhook route and the
// return-route settle both record through here.
//
// 26.2 finding (2026-10-02): the payload went as `${JSON.stringify(x)}::jsonb`. Through the
// Worker's client (`fetch_types: false`, prepared statements) the parameter is described as
// jsonb and the text is serialised a second time, so Postgres stored a JSON STRING, not an
// object. Every live row written before this fix is a string. The payload now goes as a JSON
// parameter (`sql.json`), which stores the object.
//
// Nothing reads `payload` today: the queue consumer re-reads Stripe by object id, and no SQL
// function selects the column. A future reader must accept both shapes:
//   case jsonb_typeof(payload) when 'string' then (payload #>> '{}')::jsonb else payload end

import { asSystem } from "../db/identity";

export type StripeEventRecord = {
  /** Stripe's event id, or `return_<cs_id>` for the return-route settle. */
  id: string;
  type: string;
  /** Stripe's `created`, in seconds. The ordering key, never received_at. */
  created: number;
  /** The object the event is about (cs_ / pi_ / ch_ / dp_ ...), "" when it has none. */
  objectId: string;
  /** Stored as a JSON object. */
  payload: object;
};

/** Records the event once. True when this call inserted it, false when the id was already there. */
export async function recordStripeEvent(env: CloudflareEnv, event: StripeEventRecord): Promise<boolean> {
  const rows = await asSystem(env, (sql) =>
    sql<{ inserted: boolean | null }[]>`
      select public.stripe_event_record(
        ${event.id},
        ${event.type},
        ${new Date(event.created * 1000).toISOString()}::timestamptz,
        ${event.objectId},
        ${sql.json(event.payload as Parameters<typeof sql.json>[0])}
      ) as inserted
    `,
  );
  return Boolean(rows[0]?.inserted);
}
