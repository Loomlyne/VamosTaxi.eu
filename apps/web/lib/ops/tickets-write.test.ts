// apps/web/lib/ops/tickets-write.test.ts
//
// patchTicket: status changes and overlay Save. The reply send path is gone (G27).
// Mock asStaff + sendContactMessage. No Hyperdrive, no live Resend.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

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
const PUBLIC_ADDRESS = "TKT-AAAAAAAA@replies.vamostaxi.site";
const STAFF_FROM = `Vamos Taxi <${PUBLIC_ADDRESS}>`;

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

describe("patchTicket sends no mail (G27, read-only Support)", () => {
  it("does not bind EMAIL on the staff env", () => {
    expect("EMAIL" in env).toBe(false);
  });

  it("a status change never sends", async () => {
    await patchTicket(env, claims, TICKET_ID, { status: "closed" });
    expect(sendContactMessage).not.toHaveBeenCalled();
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

  it("refuses Save mixed with status", async () => {
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
