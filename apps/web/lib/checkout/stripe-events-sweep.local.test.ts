// apps/web/lib/checkout/stripe-events-sweep.local.test.ts
//
// J2 (W4-01, W4-09, W5-17) on a real local database, through the REAL asSystem (login `vamos_edge`, then
// the vamos_system role, the client options the Worker uses): the sweep's parameter binding (interval and
// int4 as the Worker sends them, the one-element array literal), the re-enqueue message, the
// abandon-once flow, and the narrow event functions. Skipped unless VAMOS_LOCAL_DB_PORT names a
// DISPOSABLE local stack. Committed rows; ids are unique per run.
// Test-only raw client to seed the disposable local stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { asSystem } from "../db/identity";
import { pgTextArrayLiteral } from "./settle";
import { sweepUnprocessedEvents, SWEEP_MAX_SWEEPS } from "./stripe-events-sweep";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

describe.skipIf(!PORT)("unprocessed-event sweep through the real asSystem (local, committed rows)", () => {
  const env = (send: (m: unknown) => Promise<void>, resendKey = "") =>
    ({
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
      STRIPE_EVENTS: { send },
      RESEND_API_KEY: resendKey,
    }) as unknown as CloudflareEnv;

  it("re-enqueues an idle open event, never a processed one, and reports an event that used every sweep once", async () => {
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    const tag = `swp${Math.random().toString(36).slice(2, 8)}`;
    try {
      // 25 days old: older than any leftover event of another test, inside the 30-day horizon.
      await su`
        insert into public.stripe_events (id, type, stripe_created, object_id, payload, received_at)
        values (${`evt_${tag}_open`}, 'checkout.session.completed', now() - interval '25 days', ${`cs_test_${tag}`}, '{}'::jsonb, now() - interval '25 days'),
               (${`evt_${tag}_done`}, 'checkout.session.completed', now() - interval '25 days', ${`cs_test_${tag}d`}, '{}'::jsonb, now() - interval '25 days')`;
      await su`update public.stripe_events set processed_at = now() where id = ${`evt_${tag}_done`}`;

      const sent: unknown[] = [];
      const first = await sweepUnprocessedEvents(env(async (m) => void sent.push(m)));
      expect(first.requeued).toBeGreaterThanOrEqual(1);
      const mine = sent.filter((m) => (m as { eventId: string }).eventId.startsWith(`evt_${tag}`));
      expect(mine).toEqual([
        { eventId: `evt_${tag}_open`, type: "checkout.session.completed", objectId: `cs_test_${tag}`, stripeCreated: expect.any(Number) },
      ]);
      const [row] = await su<{ sweep_count: number }[]>`select sweep_count from public.stripe_events where id = ${`evt_${tag}_open`}`;
      expect(row?.sweep_count).toBe(1);

      // Idle window: an immediate second run does not claim it again.
      const sent2: unknown[] = [];
      await sweepUnprocessedEvents(env(async (m) => void sent2.push(m)));
      expect(sent2.filter((m) => (m as { eventId: string }).eventId === `evt_${tag}_open`)).toEqual([]);

      // Use every sweep: the event is reported as abandoned. No Resend key: the mail cannot go out, so
      // it is NOT marked reported (it would be reported again next hour).
      await su`update public.stripe_events set sweep_count = ${SWEEP_MAX_SWEEPS}, sweep_last_at = now() - interval '11 minutes' where id = ${`evt_${tag}_open`}`;
      const failed = await sweepUnprocessedEvents(env(async () => undefined, ""));
      expect(failed.alertFailed).toBeGreaterThanOrEqual(1);
      const [open] = await su<{ abandoned_at: string | null }[]>`select abandoned_at from public.stripe_events where id = ${`evt_${tag}_open`}`;
      expect(open?.abandoned_at).toBeNull();

      // The mark itself (what the Worker calls after the mail left) reports it exactly once.
      const marked = await asSystem(env(async () => undefined), async (sql) => sql<{ n: number }[]>`
        select public.stripe_events_sweep_abandoned(${pgTextArrayLiteral([`evt_${tag}_open`])}::text[]) as n`);
      expect(Number(marked[0]?.n)).toBe(1);
      const sentAfter: unknown[] = [];
      const after = await sweepUnprocessedEvents(env(async (m) => void sentAfter.push(m)));
      expect(sentAfter.filter((m) => (m as { eventId: string }).eventId === `evt_${tag}_open`)).toEqual([]);
      expect(after.alertFailed).toBe(0);
    } finally {
      await su.end({ timeout: 5 });
    }
  });

  it("stripe_event_close and stripe_event_settle behave as the Worker needs (W4-09, W5-17)", async () => {
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    const tag = `cls${Math.random().toString(36).slice(2, 8)}`;
    const e = env(async () => undefined);
    try {
      await su`
        insert into public.stripe_events (id, type, stripe_created, object_id, payload)
        values (${`evt_${tag}`}, 'checkout.session.expired', now(), ${`cs_test_${tag}`}, '{}'::jsonb)`;
      await asSystem(e, async (sql) => {
        await sql`select public.stripe_event_close(${`evt_${tag}`}, 'no_payment')`;
      });
      const [row] = await su<{ processed_at: string | null; last_error: string | null }[]>`
        select processed_at, last_error from public.stripe_events where id = ${`evt_${tag}`}`;
      expect(row?.processed_at).not.toBeNull();
      expect(row?.last_error).toBe("no_payment");
      // An unknown id raises P0002 through the real driver (the Worker maps it to a retry).
      const err = await asSystem(e, async (sql) => {
        await sql`select public.stripe_event_settle(${`evt_${tag}_missing`}, null)`;
      }).catch((x: unknown) => x);
      expect((err as { code?: string }).code).toBe("P0002");
    } finally {
      await su.end({ timeout: 5 });
    }
  });
});
