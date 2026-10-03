// Custom Worker entry (PLAT-02, D-36) — one Worker, three handlers.
//
// `fetch` re-exports OpenNext's generated handler. `scheduled` and `queue`
// are real Phase 7 cases on the same exports Phase 3 proved fire in staging
// (D-36). Both emit through `lib/logger.ts` (D-38) rather than an ad-hoc
// console.log shape.
//
// Source pattern: https://opennext.js.org/cloudflare/howtos/custom-worker
import { WorkerEntrypoint } from "cloudflare:workers";
// @ts-expect-error `.open-next/worker.js` is generated at build time by
// `opennextjs-cloudflare build` and does not exist in source control.
import { default as handler } from "./.open-next/worker.js";
import {
  gatePublicRequest,
  guardOpsAsset,
  isOpsAssetRequest,
  serveOpsAsset,
} from "./lib/dc-mock-urls";
import {
  pinRequestToApexAssets,
  pinRequestToSurface,
  sniFromCf,
  surfaceFromEnv,
  type VamosSurface,
} from "./lib/security/pin-sni";
import { withRequestContext } from "./lib/logger";
import { isZurichDigestTime, runStaffDigest } from "./lib/ops/digest";
import { createDigestDependencies } from "./lib/supabase/service";
import { applyHandleResult, handleStripeMessage } from "./lib/checkout/settle";
import { handleDlqMessage } from "./lib/checkout/dlq";
import { sweepStuckNotifications } from "./lib/checkout/notify";
import { expireUnpaidBookings } from "./lib/checkout/expire-unpaid";
import { purgeExpiredUnpaid } from "./lib/checkout/purge-unpaid";
import { runReminder24h } from "./lib/lifecycle/reminder";
import { probeHealth } from "./lib/health/probe";
import type { StripeQueueMessage } from "./lib/checkout/webhook";

async function handleFetch(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
  surface: VamosSurface,
): Promise<Response> {
  const sni = sniFromCf((request as { cf?: unknown }).cf);
  const surfaced = pinRequestToSurface(request, surface, sni);
  // F16: dashboard screen files exist on the dashboard host only. Decide before the
  // apex asset pin rewrites the host, and before the internal-asset header bypass.
  const hiddenOps = guardOpsAsset(surfaced);
  if (hiddenOps) return hiddenOps;
  // The Dashboard entrypoint skips the asset layer, so the screen file is read from ASSETS here.
  if (isOpsAssetRequest(surfaced)) return serveOpsAsset(surfaced, env.ASSETS);
  const inbound = pinRequestToApexAssets(surfaced);
  const gated = gatePublicRequest(inbound);
  if (gated === "not-found") {
    const gone = new URL(inbound.url);
    gone.pathname = "/__vamos_gone";
    gone.search = "";
    return handler.fetch(new Request(gone, inbound), env, ctx);
  }
  if (gated) return gated;
  return handler.fetch(inbound, env, ctx);
}

/**
 * Named entrypoint for Worker `vamos-dashboard` (service binding).
 * Internet HTTP cannot call this — only the gateway Worker.
 * Always dashboard host, even when env.VAMOS_SURFACE is public on `vamos`.
 */
export class Dashboard extends WorkerEntrypoint<CloudflareEnv> {
  fetch(request: Request): Promise<Response> {
    return handleFetch(request, this.env, this.ctx, "dashboard");
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx, surfaceFromEnv(env));
  },

  async scheduled(controller, env, _ctx) {
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

    if (controller.cron === "0 3 * * *") {
      try {
        await sweepStuckNotifications(env);
        emit("info", "notification_sweep", { outcome: "ok" });
      } catch {
        emit("error", "notification_sweep", { outcome: "failed" });
      }
      return;
    }

    // 26.3-12 (D-25, D-45): delete unpaid web bookings Stripe confirms expired. Counts only, no PII.
    try {
      const purge = await purgeExpiredUnpaid(env);
      emit("info", "purge_unpaid", purge);
    } catch {
      emit("error", "purge_unpaid", { outcome: "failed" });
    }

    try {
      const cancelled = await expireUnpaidBookings(env);
      emit("info", "expire_unpaid", { cancelled });
    } catch {
      emit("error", "expire_unpaid", { outcome: "failed" });
    }

    try {
      const reminder = await runReminder24h(env, scheduledAt);
      emit("info", "reminder_24h", reminder);
    } catch {
      emit("error", "reminder_24h", { outcome: "failed" });
    }

    // 26.3-01 (D-39): a paid booking's confirmation is resent within the hour —
    // stuck or failed claims, and paid bookings that never got a claim.
    try {
      await sweepStuckNotifications(env);
      emit("info", "notification_sweep", { outcome: "ok" });
    } catch {
      emit("error", "notification_sweep", { outcome: "failed" });
    }

    // In-process hourly probe (LAUNCH-03). Do not HTTP-loopback to the route.
    try {
      const health = await probeHealth(env);
      emit("info", "health_probe", {
        ok: health.ok,
        db: health.db,
        payments: health.payments,
        maps: health.maps,
      });
    } catch {
      emit("error", "health_probe", { outcome: "failed" });
    }

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
    // `env` (D-06/D-24, Phase 3): same handler-argument rule as `scheduled` above — Queue
    // consumers take their bindings here, never from the fetch/RSC-only context helper, and
    // Placement Hints do not pin this handler either. A future consumer opens an identity
    // door the same way: `ctx.waitUntil(asStaff(env, claims, fn))`, never a captured `tx`.

    // D-06: the DLQ is an ordinary queue on the Cloudflare side — its consumer is a second
    // `consumers[]` entry in wrangler.jsonc, and this same exported `queue()` receives its
    // batches with `batch.queue` set to the DLQ's own name (Cloudflare Queues JS API:
    // `MessageBatch.queue` is "The name of the Queue that belongs to this batch."). Branch
    // first, before the ordinary Stripe-event loop below, and always ack — never retry a
    // DLQ message into itself (T-26.1-10).
    if (batch.queue.endsWith("-dlq")) {
      for (const message of batch.messages) {
        const emit = withRequestContext({
          requestId: message.id,
          route: `queue:${batch.queue}`,
          locale: null,
        });
        try {
          await handleDlqMessage(env, message.body as StripeQueueMessage);
        } catch {
          emit("error", "dlq_handle_failed", { messageId: message.id });
        }
        message.ack();
        emit("info", "dlq", { messageId: message.id, batchSize: batch.messages.length });
      }
      return;
    }

    for (const message of batch.messages) {
      const emit = withRequestContext({
        requestId: message.id,
        route: `queue:${batch.queue}`,
        locale: null,
      });
      const body = message.body as StripeQueueMessage;
      let ackOutcome: "acked" | "retry" | "ack-failed" = "acked";
      try {
        // Phase 29: only the queue may send the Purchase; the return route never does.
        const result = await handleStripeMessage(env, body, { metaPurchase: true });
        // 26.1-08: a delayed retry (app_refund_pending) passes delaySeconds through.
        ackOutcome = applyHandleResult(message, result);
      } catch {
        try {
          message.retry();
          ackOutcome = "retry";
        } catch {
          ackOutcome = "ack-failed";
        }
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
