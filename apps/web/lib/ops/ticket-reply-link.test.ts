// apps/web/lib/ops/ticket-reply-link.test.ts
//
// Owner rule (2026-09-30): "Answer by e-mail" always leads to the customer of THAT ticket —
// its own address, subject and message identity, never another ticket's. A ticket with
// several messages uses the latest customer message.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapTicket, ticketReply, type SqlMessage, type SqlSubmission } from "./tickets-map";

const MIA = "11111111-1111-4111-8111-111111111111";
const LEO = "22222222-2222-4222-8222-222222222222";

function submission(id: string, email: string, locale: string): SqlSubmission {
  return {
    id,
    name: id === MIA ? "Mia Keller" : "Leo Rossi",
    email,
    phone: null,
    booking_ref: null,
    message: "hello",
    locale,
    ticket_status: "open",
    created_at: "2026-09-30T10:00:00Z",
    last_activity_at: null,
  } as SqlSubmission;
}

function message(submissionId: string, direction: string, at: string, rfc: string | null): SqlMessage {
  return { id: `${submissionId}-${at}`, submission_id: submissionId, direction, body_text: "x", created_at: at, rfc_message_id: rfc };
}

const miaMessages = [
  message(MIA, "inbound_form", "2026-09-30T10:00:00Z", "<ack-mia@vamostaxi.site>"),
  message(MIA, "outbound_staff", "2026-09-30T10:05:00Z", "<staff-mia@vamostaxi.site>"),
  message(MIA, "inbound_email", "2026-09-30T10:10:00Z", "<mia-first@mail.example>"),
  message(MIA, "inbound_email", "2026-09-30T10:20:00Z", "<mia-latest@mail.example>"),
  message(MIA, "outbound_staff", "2026-09-30T10:30:00Z", "<staff-mia-2@vamostaxi.site>"),
];
const leoMessages = [message(LEO, "inbound_form", "2026-09-30T11:00:00Z", "<ack-leo@vamostaxi.site>")];

describe("ticket reply link @support", () => {
  const mia = mapTicket(submission(MIA, "mia@example.com", "de"), miaMessages);
  const leo = mapTicket(submission(LEO, "leo@example.org", "en"), leoMessages);

  it("each ticket carries its own address, subject and message identity", () => {
    expect(mia.reply.to).toBe("mia@example.com");
    expect(leo.reply.to).toBe("leo@example.org");
    expect(mia.reply.subject).toBe("Re: Wir haben Ihre Nachricht erhalten — Vamos Taxi");
    expect(leo.reply.subject).toBe("Re: We received your message — Vamos Taxi");
    expect(mia.reply.messageId).toBe("<mia-latest@mail.example>");
    expect(leo.reply.messageId).toBe("<ack-leo@vamostaxi.site>");
    for (const link of [mia.reply.mailto, mia.reply.gmail]) {
      expect(link).toContain("mia");
      expect(link).not.toMatch(/leo/i);
    }
    for (const link of [leo.reply.mailto, leo.reply.gmail]) {
      expect(link).toContain("leo");
      expect(link).not.toMatch(/mia/i);
    }
  });

  it("several messages: the latest customer message wins, never a staff message", () => {
    expect(mia.reply.messageId).toBe("<mia-latest@mail.example>");
    expect(mia.reply.mailto).not.toContain("staff-mia");
    expect(mia.reply.mailto).not.toContain("mia-first");
  });

  it("a message of another ticket passed by mistake is never used", () => {
    const mixed = ticketReply(submission(LEO, "leo@example.org", "en"), [...leoMessages, ...miaMessages]);
    expect(mixed.messageId).toBe("<ack-leo@vamostaxi.site>");
    expect(mixed.mailto).not.toMatch(/mia/i);
  });

  it("the mail-app link carries In-Reply-To and References; the Gmail link carries the subject only", () => {
    const id = encodeURIComponent("<mia-latest@mail.example>");
    expect(mia.reply.mailto).toBe(
      `mailto:mia@example.com?subject=${encodeURIComponent(mia.reply.subject)}&In-Reply-To=${id}&References=${id}`,
    );
    expect(mia.reply.gmail).toBe(
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent("mia@example.com")}&su=${encodeURIComponent(mia.reply.subject)}`,
    );
  });

  it("no stored identity: subject-only link; no or bad address: no link at all", () => {
    const plain = ticketReply(submission(LEO, "leo@example.org", "fr"), [message(LEO, "inbound_form", "2026-09-30T11:00:00Z", null)]);
    expect(plain.messageId).toBe("");
    expect(plain.mailto).toBe(`mailto:leo@example.org?subject=${encodeURIComponent(plain.subject)}`);
    for (const bad of ["", "not-an-address", "a@b.c?bcc=evil@x.y", "a@b.c\r\nBcc: e@x.y"]) {
      const none = ticketReply(submission(LEO, bad, "en"), []);
      expect(none.mailto).toBe("");
      expect(none.gmail).toBe("");
    }
  });
});

describe("support copy in the admin's inbox @support", () => {
  it("answers to the customer of that submission, never to noreply", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const route = readFileSync(join(here, "../../app/api/contact/route.ts"), "utf8");
    expect(route).toContain('message === "customer" ? { replyTo } : { replyTo: input.email },');
  });
});
