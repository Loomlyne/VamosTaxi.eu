// Custom Worker entry (PLAT-02, D-36) — one Worker, three handlers.
//
// `fetch` re-exports OpenNext's generated handler; `scheduled` and `queue`
// are proven no-ops for Phase 1 (registered in wrangler.jsonc, exercised
// once in staging per D-36) — Phase 4 (quote expiry, no-show sweep) and
// Phase 5 (Stripe webhook fan-out) attach real cases to the same exports,
// so plumbing already known to fire.
//
// Source pattern: https://opennext.js.org/cloudflare/howtos/custom-worker
// @ts-expect-error `.open-next/worker.js` is generated at build time by
// `opennextjs-cloudflare build` and does not exist in source control.
import { default as handler } from "./.open-next/worker.js";

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface QueueMessage {
  id: string;
  body: unknown;
  ack: () => void;
}

interface MessageBatch {
  messages: QueueMessage[];
}

export default {
  fetch: handler.fetch,

  async scheduled(event: ScheduledEvent) {
    // Phase 1: proven no-op — logs and exercises the trigger once in
    // staging (D-36, PLAT-02). Phase 4 (quote expiry) and Phase 9
    // (reminders / no-show sweep) attach real cases here.
    console.log(
      JSON.stringify({
        type: "scheduled",
        cron: event.cron,
        at: new Date().toISOString(),
      }),
    );
  },

  async queue(batch: MessageBatch) {
    // Phase 1: proven no-op. Phase 5 (Stripe webhook fan-out) attaches a
    // real consumer here. Every message is acked so nothing sits unretried
    // against an empty handler.
    for (const message of batch.messages) {
      console.log(
        JSON.stringify({
          type: "queue",
          id: message.id,
          body: message.body,
        }),
      );
      message.ack();
    }
  },
};

// Only required if the app opts into OpenNext's own Durable-Object-backed
// ISR revalidation queue (see 01-RESEARCH.md Common Pitfall 3) — that is a
// *different* "queue" from the Cloudflare Queues `queue()` handler above,
// and re-exporting it is what keeps DO-backed ISR revalidation from
// silently breaking once a custom worker entry exists. Phase 1 ships no
// ISR content, so this stays commented rather than guessed at:
//
// // @ts-expect-error generated at build time
// export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
