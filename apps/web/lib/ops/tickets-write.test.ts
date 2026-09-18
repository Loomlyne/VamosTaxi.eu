// apps/web/lib/ops/tickets-write.test.ts
//
// Wave 0 (13-01): patchTicket send-path contract (RPLY-01 RPLY-02 D-05 D-06 D-10 D-11).
// Mock asStaff + sendContactMessage. No Hyperdrive, no live Resend. Stays red until 13-07.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { staffMessageId } from "./ticket-mail";

const asStaff = vi.fn();
const { sendContactMessage } = vi.hoisted(() => ({ sendContactMessage: vi.fn() }));
const { resolveStaffBookingId } = vi.hoisted(() => ({ resolveStaffBookingId: vi.fn() }));

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

vi.mock("@/lib/forms/notify", () => ({
  sendContactMessage: (...args: unknown[]) => sendContactMessage(...args),
}));
vi.mock("@vamos/emails", () => ({
  renderContactCustomerEmail: () => ({ subject: "We received your message", html: "", text: "" }),
  renderStaffReplyEmail: () => ({ subject: "Re:", html: "", text: "" }),
}));

vi.mock("@/lib/contact-channels", async () => import("../contact-channels"));
vi.mock("@/lib/ops/ticket-mail", async () => import("./ticket-mail"));
vi.mock("@/lib/ops/tickets-map", async () => import("./tickets-map"));
vi.mock("@/lib/ops/resolve-booking-id", () => ({
  resolveStaffBookingId: (...args: unknown[]) => resolveStaffBookingId(...args),
}));

import { patchTicket } from "./tickets-write";

const TICKET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPLY_TOKEN = "a".repeat(32);
const PARENT_RFC = "<c.abc@vamostaxi.site>";
const GET_RFC = "<111-222-333@email.example.com>";
const PROVIDER_ID = "37e4414c-5e25-4dbc-a071-43552a4bd53b";
const PROVIDER_SUFFIX = PROVIDER_ID.slice(-12);
const STAFF_FROM = "Vamos Taxi <noreply@vamostaxi.site>";
const PLUS_ADDRESS = `ticket+${REPLY_TOKEN}@replies.vamostaxi.site`;

const claims: VamosClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};

const env = { RESEND_API_KEY: "re_test" } as CloudflareEnv;

type PersistCall = { text: string; values: unknown[] };

const persistCalls: PersistCall[] = [];

const openTicket = {
  ticket_status: "open",
  email: "guest@example.test",
  locale: "en",
  reply_token: REPLY_TOKEN,
  name: "Ada",
  booking_ref: "VT-10001",
};

function persistBlob(): string {
  return persistCalls.map((call) => `${call.text}\n${JSON.stringify(call.values)}`).join("\n");
}

function persistValues(): unknown[] {
  return persistCalls.flatMap((call) => call.values);
}

function lastSendCall(): unknown[] {
  const call = sendContactMessage.mock.calls.at(-1);
  expect(call).toBeTruthy();
  return call ?? [];
}

beforeEach(() => {
  asStaff.mockReset();
  resolveStaffBookingId.mockReset();
  resolveStaffBookingId.mockResolvedValue("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  sendContactMessage.mockReset();
  sendContactMessage.mockResolvedValue({
    accepted: true,
    providerId: PROVIDER_ID,
    providerSuffix: PROVIDER_SUFFIX,
    rfcMessageId: GET_RFC,
  });
  persistCalls.length = 0;
  asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const persist = asStaff.mock.calls.length > 1;
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(" ");
      if (persist) {
        persistCalls.push({ text, values });
        return [];
      }
      if (/contact_submissions/i.test(text) && !/update/i.test(text)) {
        return [openTicket];
      }
      if (/support_messages/i.test(text) && !/insert/i.test(text)) {
        return [{ rfc_message_id: PARENT_RFC }];
      }
      return [];
    };
    return fn(sql);
  });
});

describe("patchTicket staff reply (RPLY-01 RPLY-02 D-05 D-06 D-10 D-11)", () => {
  it("does not bind EMAIL on the staff env", () => {
    expect("EMAIL" in env).toBe(false);
  });

  describe("D-10 empty and closed refuse (RPLY-01)", () => {
    it("returns empty-reply for a trimmed-empty body and never calls sendContactMessage", async () => {
      await expect(patchTicket(env, claims, TICKET_ID, { reply: "   " })).resolves.toEqual({
        ok: false,
        reason: "empty-reply",
      });
      expect(sendContactMessage).not.toHaveBeenCalled();
      expect(asStaff).not.toHaveBeenCalled();
    });

    it("returns invalid-status for a closed ticket and never calls sendContactMessage", async () => {
      asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
          const text = strings.join(" ");
          if (/contact_submissions/i.test(text) && !/update/i.test(text)) {
            return [{ ...openTicket, ticket_status: "closed" }];
          }
          if (/support_messages/i.test(text) && !/insert/i.test(text)) {
            return [{ rfc_message_id: PARENT_RFC }];
          }
          return [];
        };
        return fn(sql);
      });
      await expect(patchTicket(env, claims, TICKET_ID, { reply: "Thanks." })).resolves.toEqual({
        ok: false,
        reason: "invalid-status",
      });
      expect(sendContactMessage).not.toHaveBeenCalled();
      expect(persistCalls).toHaveLength(0);
    });

    it("returns invalid-reply when reply.length is greater than 8000 and never sends", async () => {
      await expect(
        patchTicket(env, claims, TICKET_ID, { reply: "x".repeat(8001) }),
      ).resolves.toEqual({ ok: false, reason: "invalid-reply" });
      expect(sendContactMessage).not.toHaveBeenCalled();
    });
  });

  describe("D-06 fail-closed — no INSERT, status not replied (RPLY-01)", () => {
    it("returns send-failed when Resend accepted is false and does not persist", async () => {
      sendContactMessage.mockResolvedValue({
        accepted: false,
        providerId: null,
        providerSuffix: null,
        rfcMessageId: null,
      });
      await expect(patchTicket(env, claims, TICKET_ID, { reply: "Thanks, Ada." })).resolves.toEqual({
        ok: false,
        reason: "send-failed",
      });
      expect(persistBlob()).not.toMatch(/insert into public\.support_messages/i);
      expect(persistBlob()).not.toMatch(/ticket_status = 'replied'/);
    });

    it("returns send-failed when rfcMessageId is missing and does not persist", async () => {
      sendContactMessage.mockResolvedValue({
        accepted: true,
        providerId: PROVIDER_ID,
        providerSuffix: PROVIDER_SUFFIX,
      });
      await expect(patchTicket(env, claims, TICKET_ID, { reply: "Thanks, Ada." })).resolves.toEqual({
        ok: false,
        reason: "send-failed",
      });
      expect(persistBlob()).not.toMatch(/insert into public\.support_messages/i);
      expect(persistBlob()).not.toMatch(/ticket_status = 'replied'/);
    });
  });

  describe("RPLY-02 D-05 payload — From noreply, Reply-To plus-address, BCC info@", () => {
    it("sends From noreply, Reply-To plus-address, bcc info@, allowEmailFallback false, no EMAIL, no Message-ID", async () => {
      sendContactMessage.mockResolvedValue({
        accepted: true,
        providerId: PROVIDER_ID,
        providerSuffix: PROVIDER_SUFFIX,
        rfcMessageId: GET_RFC,
      });
      await patchTicket(env, claims, TICKET_ID, { reply: "Thanks, Ada." });
      const [apiKey, _from, to, idempotencyKey, _rendered, email, options] = lastSendCall();
      expect(apiKey).toBe("re_test");
      expect(to).toBe("guest@example.test");
      expect(email).toBeUndefined();
      expect(idempotencyKey).toMatch(new RegExp(`^staff-reply/${TICKET_ID}/[0-9a-f-]{36}$`));
      const headers = (options as { headers?: Record<string, string> }).headers ?? {};
      expect(headers["In-Reply-To"]).toBe(PARENT_RFC);
      expect(headers).not.toHaveProperty("Message-ID");
      expect(Object.keys(headers)).not.toContain("Message-ID");
      expect(options).toMatchObject({
        from: STAFF_FROM,
        replyTo: PLUS_ADDRESS,
        bcc: "info@vamostaxi.site",
        allowEmailFallback: false,
      });
    });
  });

  describe("RPLY-01 GET rfc persist and D-11 replied", () => {
    it("persists angle-bracketed rfcMessageId from GET and resend_email_id from providerId", async () => {
      sendContactMessage.mockResolvedValue({
        accepted: true,
        providerId: PROVIDER_ID,
        providerSuffix: PROVIDER_SUFFIX,
        rfcMessageId: GET_RFC,
      });
      await expect(patchTicket(env, claims, TICKET_ID, { reply: "Thanks, Ada." })).resolves.toMatchObject({
        ok: true,
        status: "replied",
      });
      const [, , , idempotencyKey] = lastSendCall();
      const outboundId = String(idempotencyKey).split("/")[2] ?? "";
      const values = persistValues();
      expect(GET_RFC).toMatch(/^<.+@.+>$/);
      expect(values).toContain(GET_RFC);
      expect(values).toContain(PROVIDER_ID);
      expect(GET_RFC).not.toBe(PROVIDER_ID);
      expect(GET_RFC).not.toBe(PROVIDER_SUFFIX);
      expect(GET_RFC).not.toBe(staffMessageId(outboundId));
      expect(values).not.toContain(PROVIDER_SUFFIX);
      expect(values).not.toContain(staffMessageId(outboundId));
      expect(persistBlob()).toMatch(/insert into public\.support_messages/i);
      expect(persistBlob()).toMatch(/ticket_status = 'replied'/);
    });
  });
});

describe("overlay Save (D-04 D-05 D-06 SUP-04)", () => {
  it("writes phone + empty booking_ref, skips staff_note, never sends", async () => {
    await expect(
      patchTicket(env, claims, TICKET_ID, { phone: "+41 79 000 00 00", booking_ref: "", note: "   " }),
    ).resolves.toEqual({ ok: true, status: "open" });
    expect(sendContactMessage).not.toHaveBeenCalled();
    expect(resolveStaffBookingId).not.toHaveBeenCalled();
    expect(persistBlob()).toMatch(/update public\.contact_submissions/i);
    expect(persistBlob()).not.toMatch(/insert into public\.support_messages/i);
    expect(persistValues()).toContain("+41 79 000 00 00");
    expect(persistValues()).toContain("");
  });

  it("inserts staff_note for a trimmed note and does not call sendContactMessage", async () => {
    await expect(
      patchTicket(env, claims, TICKET_ID, {
        phone: "+41 79 000 00 00",
        booking_ref: "VT-10001",
        note: "  internal  ",
      }),
    ).resolves.toEqual({ ok: true, status: "open" });
    expect(sendContactMessage).not.toHaveBeenCalled();
    expect(resolveStaffBookingId).toHaveBeenCalled();
    expect(persistBlob()).toMatch(/insert into public\.support_messages/i);
    expect(persistBlob()).toMatch(/staff_note/);
    expect(persistValues()).toContain("internal");
    expect(persistBlob()).not.toMatch(/ticket_status = 'replied'/);
  });

  it("refuses unknown booking_ref with invalid-booking-ref and writes nothing", async () => {
    resolveStaffBookingId.mockResolvedValue(null);
    await expect(
      patchTicket(env, claims, TICKET_ID, { phone: "+41", booking_ref: "NOPE", note: "secret" }),
    ).resolves.toEqual({ ok: false, reason: "invalid-booking-ref" });
    expect(sendContactMessage).not.toHaveBeenCalled();
    expect(persistCalls).toHaveLength(0);
  });

  it("stores the submitted booking_ref string when resolveStaffBookingId returns a uuid", async () => {
    await expect(
      patchTicket(env, claims, TICKET_ID, { booking_ref: "VT-10001" }),
    ).resolves.toEqual({ ok: true, status: "open" });
    expect(resolveStaffBookingId).toHaveBeenCalled();
    expect(persistValues()).toContain("VT-10001");
    expect(persistValues()).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });

  it("refuses Save mixed with reply or status", async () => {
    await expect(
      patchTicket(env, claims, TICKET_ID, { note: "x", reply: "Thanks." }),
    ).resolves.toEqual({ ok: false, reason: "invalid-status" });
    await expect(
      patchTicket(env, claims, TICKET_ID, { phone: "+41", status: "open" }),
    ).resolves.toEqual({ ok: false, reason: "invalid-status" });
    expect(sendContactMessage).not.toHaveBeenCalled();
    expect(persistCalls).toHaveLength(0);
  });

  it("PATCH route source parses phone, booking_ref, note and names invalid-booking-ref", () => {
    const routePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/[locale]/(ops)/api/staff/tickets/[id]/route.ts",
    );
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("phone");
    expect(src).toContain("booking_ref");
    expect(src).toContain("note");
    expect(src).toContain("invalid-booking-ref");
  });
});
