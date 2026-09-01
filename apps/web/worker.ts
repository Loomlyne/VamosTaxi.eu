// Custom Worker entry (PLAT-02, D-36) — one Worker, three handlers.
//
// `fetch` re-exports OpenNext's generated handler; `scheduled` and `queue` are proven
// no-ops for Phase 1 (registered in wrangler.jsonc, exercised once in staging per D-36) —
// Phase 4 (quote expiry, no-show sweep) and Phase 5 (Stripe webhook fan-out) attach real
// cases to the same exports, so plumbing already known to fire. Both emit through
// `lib/logger.ts` (D-38) rather than an ad-hoc console.log shape.
//
// Source pattern: https://opennext.js.org/cloudflare/howtos/custom-worker
// @ts-expect-error `.open-next/worker.js` is generated at build time by
// `opennextjs-cloudflare build` and does not exist in source control.
import { default as handler } from "./.open-next/worker.js";
import { withRequestContext } from "./lib/logger";
import { isZurichDigestTime, runStaffDigest } from "./lib/ops/digest";
import { createDigestDependencies } from "./lib/supabase/service";

export default {
  fetch: handler.fetch,

  async scheduled(controller, env, _ctx) {
    // Phase 1: proven no-op — emits one structured line and exercises the trigger once in
    // staging (D-36, PLAT-02). Phase 4 (quote expiry) and Phase 9 (reminders / no-show
    // sweep) attach real cases here. No locale concept applies to a cron trigger, so it is
    // explicitly `null` rather than omitted.
    //
    // `env` (D-06/D-24, Phase 3): Cron takes its Cloudflare bindings from THIS handler
    // argument, never from the fetch/RSC-only context helper — Placement Hints do not pin
    // this handler either, so its latency sits outside DATA-05 by design. A future case
    // that needs identity-scoped data reads it past the response boundary as
    // `ctx.waitUntil(asCustomer(env, claims, fn))` — a fresh client and a fresh transaction
    // every time, never a handle captured from an earlier call.
    const emit = withRequestContext({
      requestId: crypto.randomUUID(),
      route: `scheduled:${controller.cron}`,
      locale: null,
    });
    const scheduledAt = new Date(controller.scheduledTime);
    emit("info", "scheduled", {
      cron: controller.cron,
      scheduledTime: scheduledAt.toISOString(),
    });

    // Cloudflare cron expressions have no IANA timezone. Run hourly and select the exact
    // Europe/Zurich wall-clock instant here, which remains 06:00 through DST changes.
    if (!isZurichDigestTime(scheduledAt)) return;

    try {
      const result = await runStaffDigest(scheduledAt, createDigestDependencies(env));
      emit("info", "staff_digest", result);
    } catch {
      // No recipient address, booking detail, provider response, or secret reaches logs.
      emit("error", "staff_digest", { outcome: "failed" });
    }
  },

  async queue(batch, env, _ctx) {
    // Phase 1: proven no-op. Phase 5 (Stripe webhook fan-out) attaches a real consumer
    // here. Every message is acknowledged so nothing sits unretried against an empty
    // handler; the outcome of that acknowledgement is itself part of the structured line.
    //
    // `env` (D-06/D-24, Phase 3): same handler-argument rule as `scheduled` above — Queue
    // consumers take their bindings here, never from the fetch/RSC-only context helper, and
    // Placement Hints do not pin this handler either. A future consumer opens an identity
    // door the same way: `ctx.waitUntil(asStaff(env, claims, fn))`, never a captured `tx`.
    for (const message of batch.messages) {
      const emit = withRequestContext({
        requestId: message.id,
        route: `queue:${batch.queue}`,
        locale: null,
      });
      let ackOutcome: "acked" | "ack-failed" = "acked";
      try {
        message.ack();
      } catch {
        ackOutcome = "ack-failed";
      }
      emit("info", "queue", {
        messageId: message.id,
        batchSize: batch.messages.length,
        ackOutcome,
      });
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Only required if the app opts into OpenNext's own Durable-Object-backed ISR revalidation
// queue (see 01-RESEARCH.md Common Pitfall 3) — that is a *different* "queue" from the
// Cloudflare Queues `queue()` handler above, and re-exporting it is what keeps DO-backed ISR
// revalidation from silently breaking once a custom worker entry exists. Phase 1 ships no
// ISR content, so this stays commented rather than guessed at:
//
// // @ts-expect-error generated at build time
// export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
