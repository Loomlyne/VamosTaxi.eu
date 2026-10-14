// apps/web/tests/unit/contact-route-translate.test.ts
//
// Phase 32 plan 07 (T-32-26, T-32-27): POST /api/contact queues the new form message for translation
// by submission id only, once the submission exists and before the e-mail work, and a queue fault never
// changes the form's answer. Every dependency is a stand-in: no database, no mail, no network.

import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const asSystem = vi.fn();
const deliverContactMessages = vi.fn();
const sendTranslateJob = vi.fn();
const env = { QUOTE_RATE_LIMITER: {}, TURNSTILE_SECRET_KEY: "s" };

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/rate-limit", () => ({ checkWriteRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => ({ ok: true }) }));
vi.mock("@vamos/emails", () => ({
  renderContactCustomerEmail: () => ({ subject: "s", html: "h", text: "t" }),
  renderContactSupportEmail: () => ({ subject: "s", html: "h", text: "t" }),
}));
vi.mock("@/lib/db/identity", () => ({ asSystem: (...args: unknown[]) => asSystem(...args) }));
vi.mock("@/lib/forms/contact-delivery", () => ({
  deliverContactMessages: (...args: unknown[]) => {
    order.push("deliver");
    return deliverContactMessages(...args);
  },
}));
vi.mock("@/lib/forms/notify", async () => {
  const actual = await vi.importActual<typeof import("../../lib/forms/notify")>("../../lib/forms/notify");
  return { ...actual, sendContactMessage: vi.fn() };
});
vi.mock("@/lib/translate/jobs-contract", () => ({
  sendTranslateJob: (...args: unknown[]) => {
    order.push("enqueue");
    return sendTranslateJob(...args);
  },
}));

const { POST } = await import("../../app/api/contact/route");

const SUBMISSION = "44444444-4444-4444-8444-444444444444";
const MESSAGE = "Bonjour, mon vol arrive à 7 h.";

function request(): Request {
  return new Request("https://vamostaxi.site/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://vamostaxi.site" },
    body: JSON.stringify({
      name: "Ada",
      email: "ada@example.test",
      phone: "",
      bookingRef: "",
      message: MESSAGE,
      locale: "fr",
      turnstileToken: "tok",
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    }),
  });
}

beforeEach(() => {
  order.length = 0;
  asSystem.mockReset();
  deliverContactMessages.mockReset();
  sendTranslateJob.mockReset();
  sendTranslateJob.mockResolvedValue(true);
  asSystem.mockImplementation(async (_env: unknown, fn: (tx: unknown) => unknown) => {
    const tx = async (strings: TemplateStringsArray) => {
      const text = strings.join(" ");
      if (text.includes("submit_contact_message")) {
        order.push("submit");
        return [{ id: SUBMISSION }];
      }
      if (text.includes("reply_token")) return [{ reply_token: null }];
      return [];
    };
    return fn(tx);
  });
  deliverContactMessages.mockResolvedValue({ accepted: true });
});

describe("POST /api/contact queues the form message for translation (Phase 32)", () => {
  it("enqueues { v:1, kind:'support-form', submissionId } once, after the submission and before delivery", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendTranslateJob).toHaveBeenCalledTimes(1);
    const job = sendTranslateJob.mock.calls[0]?.[1];
    expect(job).toEqual({ v: 1, kind: "support-form", submissionId: SUBMISSION });
    expect(Object.keys(job as object).sort()).toEqual(["kind", "submissionId", "v"]);
    expect(JSON.stringify(job)).not.toContain("vol");
    expect(sendTranslateJob.mock.calls[0]?.[0]).toBe(env);
    expect(order).toEqual(["submit", "enqueue", "deliver"]);
  });

  it("a queue that answers false leaves the form answer unchanged", async () => {
    sendTranslateJob.mockResolvedValue(false);
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deliverContactMessages).toHaveBeenCalledTimes(1);
  });

  it("a queue that throws leaves the form answer unchanged", async () => {
    sendTranslateJob.mockRejectedValue(new Error("queue down"));
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deliverContactMessages).toHaveBeenCalledTimes(1);
  });

  it("a failed delivery still answers 503 as before, with the job already queued", async () => {
    deliverContactMessages.mockResolvedValue({ accepted: false });
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(sendTranslateJob).toHaveBeenCalledTimes(1);
  });

  it("no submission id: nothing is queued", async () => {
    asSystem.mockImplementation(async (_env: unknown, fn: (tx: unknown) => unknown) => fn(async () => [{}]));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });

  it("a store fault: nothing is queued", async () => {
    asSystem.mockRejectedValue(new Error("db down"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });
});
