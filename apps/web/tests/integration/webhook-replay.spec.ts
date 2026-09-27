// apps/web/tests/integration/webhook-replay.spec.ts
//
// Plan 07-10 Task 1. The only place the signature verifier, the dedupe
// insert, the queue message shape, the consumer's admission check and the
// settlement RPC-shaped deps run together. Every other Phase 7 test stubs
// at least one of them. The real verifyStripeEvent runs — never mocked.

import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { handleStripeWebhook } from "../../lib/checkout/webhook";
import { handleStripeMessageWithDeps, type SettleDeps } from "../../lib/checkout/settle";
import { verifyStripeEvent } from "../../lib/checkout/webhook-verify";
import type { StripeQueueMessage } from "../../lib/checkout/webhook";

const RUN_PROJECT = "component-1440";
const SECRET = "whsec_test_fixture_sign_only";
const SK = "sk_test_placeholder";

function sign(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
}

function env(): CloudflareEnv {
  return {
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_SECRET_KEY: SK,
  } as CloudflareEnv;
}

function completedBody(id: string, created: number, sessionId: string): string {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-08-26.dahlia",
    created,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_intent: "pi_wh_replay",
        payment_status: "paid",
      },
    },
  });
}

function canceledBody(id: string, created: number, pi: string): string {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-08-26.dahlia",
    created,
    type: "payment_intent.canceled",
    data: {
      object: {
        id: pi,
        object: "payment_intent",
      },
    },
  });
}

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "once");
});

test("signed fixture is 200; replay is 200 and the ledger does not grow @checkout", async () => {
  const ledger = new Map<string, true>();
  const queue: StripeQueueMessage[] = [];
  const raw = completedBody("evt_replay_1", 1_700_000_000, "cs_replay_1");
  const header = sign(raw);

  const post = () =>
    handleStripeWebhook(raw, header, {
      verify: (body, signature) => verifyStripeEvent(env(), body, signature),
      record: async (event) => {
        if (ledger.has(event.id)) return false;
        ledger.set(event.id, true);
        return true;
      },
      enqueue: async (message) => {
        queue.push(message);
      },
      emit: () => undefined,
    });

  const first = await post();
  const second = await post();
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(ledger.size).toBe(1);
  expect(queue).toHaveLength(2);
  expect(queue[0]?.eventId).toBe("evt_replay_1");
});

test("one altered character is 400 and writes no ledger row @checkout", async () => {
  const ledger = new Map<string, true>();
  const raw = completedBody("evt_replay_bad", 1_700_000_000, "cs_replay_bad");
  const header = sign(raw);
  const tampered = raw.replace("evt_replay_bad", "evt_replay_bae");
  const res = await handleStripeWebhook(tampered, header, {
    verify: (body, signature) => verifyStripeEvent(env(), body, signature),
    record: async (event) => {
      ledger.set(event.id, true);
      return true;
    },
    enqueue: async () => undefined,
    emit: () => undefined,
  });
  expect(res.status).toBe(400);
  expect(ledger.size).toBe(0);
});

test("out-of-order canceled is superseded; booking stays confirmed @checkout", async () => {
  const processed: { objectId: string; created: number }[] = [];
  let status = "pending";
  let emails = 0;

  const deps: SettleDeps = {
    begin: async (_eventId, objectIds, stripeCreated) => {
      const newer = processed.some(
        (row) => objectIds.includes(row.objectId) && row.created > stripeCreated.getTime() / 1000,
      );
      if (newer) return { should_process: false, reason: "superseded" };
      return { should_process: true, reason: "ok" };
    },
    retrieveSession: async () =>
      ({
        id: "cs_replay_1",
        payment_intent: "pi_wh_replay",
        payment_status: "paid",
      }) as Stripe.Checkout.Session,
    settlePayment: async (input) => {
      if (input.outcome === "succeeded") status = "confirmed";
      processed.push({
        objectId: input.sessionId ?? input.paymentIntentId ?? "",
        created: 1_700_000_100,
      });
      return {
        booking_id: "00000000-0000-4000-8000-000000000501",
        reference: "VT-26-0001",
        locale: "en",
        contact_email: "wh-ord@example.test",
        already_settled: false,
        revived: false,
        duplicate: false,
        refund_required: false,
        refund_reason: null,
        payment_id: 1,
        charged_rappen: 8000,
        other_open_session_ids: [],
      };
    },
    eventSettle: async () => undefined,
    deliverConfirmation: async () => {
      emails += 1;
    },
    refund: async () => ({ id: "re_never" }),
    recordDuplicateRefund: async () => undefined,
    alertPaidAfterCancel: async () => undefined,
    alertStuckPayment: async () => undefined,
    expireSession: async () => undefined,
    emit: () => undefined,
  };

  const done = await handleStripeMessageWithDeps(
    {
      eventId: "evt_replay_done",
      type: "checkout.session.completed",
      objectId: "cs_replay_1",
      stripeCreated: 1_700_000_100,
    },
    deps,
  );
  const cancel = await handleStripeMessageWithDeps(
    {
      eventId: "evt_replay_old",
      type: "payment_intent.canceled",
      objectId: "pi_wh_replay",
      stripeCreated: 1_700_000_000,
    },
    deps,
  );
  expect(done).toEqual({ ack: true });
  expect(cancel).toEqual({ ack: true });
  expect(status).toBe("confirmed");
  expect(emails).toBe(1);
});

test("a second confirmation deliver is not issued when already_settled @checkout", async () => {
  let emails = 0;
  const deps: SettleDeps = {
    begin: async () => ({ should_process: true, reason: "ok" }),
    retrieveSession: async () =>
      ({
        id: "cs_replay_2",
        payment_intent: "pi_wh_replay_2",
        payment_status: "paid",
      }) as Stripe.Checkout.Session,
    settlePayment: async () => ({
      booking_id: "00000000-0000-4000-8000-000000000502",
      reference: "VT-26-0002",
      locale: "en",
      contact_email: "wh-ord@example.test",
      already_settled: true,
      revived: false,
      duplicate: false,
      refund_required: false,
      refund_reason: null,
      payment_id: 1,
      charged_rappen: 8000,
      other_open_session_ids: [],
    }),
    eventSettle: async () => undefined,
    deliverConfirmation: async () => {
      emails += 1;
    },
    refund: async () => ({ id: "re_never" }),
    recordDuplicateRefund: async () => undefined,
    alertPaidAfterCancel: async () => undefined,
    alertStuckPayment: async () => undefined,
    expireSession: async () => undefined,
    emit: () => undefined,
  };
  await handleStripeMessageWithDeps(
    {
      eventId: "evt_replay_again",
      type: "checkout.session.completed",
      objectId: "cs_replay_2",
      stripeCreated: 1_700_000_200,
    },
    deps,
  );
  expect(emails).toBe(0);
});
