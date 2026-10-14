import { describe, expect, it } from "vitest";
import { mapTicket, rejectStaffReply, staffPatchStatus, type SqlMessage, type SqlSubmission } from "./tickets-map";

describe("staffPatchStatus", () => {
  it("opens only from new or closed", () => {
    expect(staffPatchStatus("new", "open")).toBe("open");
    expect(staffPatchStatus("closed", "open")).toBe("open");
    expect(staffPatchStatus("open", "open")).toBeNull();
    expect(staffPatchStatus("replied", "open")).toBeNull();
    expect(staffPatchStatus("responded", "open")).toBeNull();
  });

  it("closes from any live status and rejects replied/responded/new writes", () => {
    expect(staffPatchStatus("new", "closed")).toBe("closed");
    expect(staffPatchStatus("open", "closed")).toBe("closed");
    expect(staffPatchStatus("replied", "closed")).toBe("closed");
    expect(staffPatchStatus("responded", "closed")).toBe("closed");
    expect(staffPatchStatus("closed", "closed")).toBe("closed");
    expect(staffPatchStatus("open", "replied")).toBeNull();
    expect(staffPatchStatus("open", "responded")).toBeNull();
    expect(staffPatchStatus("open", "new")).toBeNull();
  });
});

describe("rejectStaffReply (D-12)", () => {
  it("blocks a reply key: the dashboard Support page is read-only (G27)", () => {
    expect(rejectStaffReply({ reply: "hi" })).toBe(true);
    expect(rejectStaffReply({ reply: "" })).toBe(true);
    expect(rejectStaffReply(null)).toBe(false);
    expect(rejectStaffReply({ status: "open" })).toBe(false);
    expect(rejectStaffReply({})).toBe(false);
  });
});

describe("mapTicket files + text body (D-08 D-09 D-10)", () => {
  const row = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Ada",
    email: "ada@example.test",
    phone: "+41",
    booking_ref: "VT-10001",
    message: "hello <script>alert(1)</script>",
    locale: "de",
    ticket_status: "open",
    created_at: "2026-01-01T12:00:00.000Z",
    last_activity_at: null,
  };

  it("keeps angle-bracket body as the source string (not HTML)", () => {
    const ticket = mapTicket(row, []);
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]?.body).toBe("hello <script>alert(1)</script>");
    expect(ticket.messages[0]?.whoKey).toBe("customer");
    expect(ticket.messages[0]?.files).toEqual([]);
    expect(ticket.bookingRef).toBe("VT-10001");
    expect(ticket.locale).toBe("de");
  });

  it("attaches files by message id and ignores unknown ids", () => {
    const messages = [
      {
        id: "msg-1",
        submission_id: row.id,
        direction: "inbound",
        body_text: "photo",
        created_at: "2026-01-01T12:01:00.000Z",
      },
    ];
    const ticket = mapTicket(row, messages, {
      "msg-1": [{ id: "f1", filename: "a.png", contentType: "image/png", kept: true }],
      "nope": [{ id: "f2", filename: "b.png", contentType: "image/png", kept: true }],
    });
    expect(ticket.messages[0]?.files).toEqual([
      { id: "f1", filename: "a.png", contentType: "image/png", kept: true },
    ]);
    expect(ticket.messages[0]?.whoKey).toBe("customer");
  });

  it("maps staff_note to note and missing files arg to empty", () => {
    const ticket = mapTicket(row, [
      {
        id: "msg-2",
        submission_id: row.id,
        direction: "staff_note",
        body_text: "internal",
        created_at: "2026-01-01T12:02:00.000Z",
      },
    ]);
    expect(ticket.messages[0]?.whoKey).toBe("note");
    expect(ticket.messages[0]?.files).toEqual([]);
    expect(ticket.note).toBe("");
  });
});

describe("Phase 32 plan 07: language, translation status and reply target", () => {
  const NOW = new Date("2026-10-14T10:00:00.000Z");
  const ticket: SqlSubmission = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Lena",
    email: "lena@example.test",
    phone: null,
    booking_ref: null,
    message: "Hallo",
    locale: "en",
    ticket_status: "open",
    created_at: "2026-10-14T08:00:00.000Z",
    last_activity_at: null,
  };
  function msg(over: Partial<SqlMessage>): SqlMessage {
    return {
      id: "m-1",
      submission_id: ticket.id,
      direction: "inbound_email",
      body_text: "Wo wartet der Fahrer?",
      created_at: "2026-10-14T09:00:00.000Z",
      rfc_message_id: null,
      detected_lang: null,
      tr_body: null,
      tr_status: null,
      ...over,
    };
  }

  it("German message with a done en row, dashboard en: lang de, ready with the text; the body stays the original", () => {
    const t = mapTicket(ticket, [msg({ detected_lang: "de", tr_body: "Where does the driver wait?", tr_status: "done" })], {}, { lang: "en", now: NOW });
    expect(t.messages[0]?.lang).toBe("de");
    expect(t.messages[0]?.translation).toEqual({ status: "ready", text: "Where does the driver wait?" });
    expect(t.messages[0]?.body).toBe("Wo wartet der Fahrer?");
  });

  it("dashboard de for the same German message: same, no text", () => {
    const t = mapTicket(ticket, [msg({ detected_lang: "de" })], {}, { lang: "de", now: NOW });
    expect(t.messages[0]?.translation).toEqual({ status: "same", text: "" });
  });

  it("und (no detectable language): same, lang ''", () => {
    const t = mapTicket(ticket, [msg({ detected_lang: "und" })], {}, { lang: "en", now: NOW });
    expect(t.messages[0]?.translation?.status).toBe("same");
    expect(t.messages[0]?.lang).toBe("");
  });

  it("just arrived (no rows, not detected, 2 minutes old): pending", () => {
    const t = mapTicket(ticket, [msg({ created_at: "2026-10-14T09:58:00.000Z" })], {}, { lang: "en", now: NOW });
    expect(t.messages[0]?.translation).toEqual({ status: "pending", text: "" });
    expect(t.messages[0]?.lang).toBe("");
  });

  it("the same but 2 hours old: failed", () => {
    const t = mapTicket(ticket, [msg({ created_at: "2026-10-14T08:00:00.000Z" })], {}, { lang: "en", now: NOW });
    expect(t.messages[0]?.translation).toEqual({ status: "failed", text: "" });
  });

  it("a rejected row or a failed row: failed, never an empty ready", () => {
    for (const tr_status of ["rejected", "failed"]) {
      const t = mapTicket(ticket, [msg({ detected_lang: "de", tr_status, created_at: "2026-10-14T09:59:00.000Z" })], {}, { lang: "en", now: NOW });
      expect(t.messages[0]?.translation).toEqual({ status: "failed", text: "" });
    }
    const blank = mapTicket(ticket, [msg({ detected_lang: "de", tr_status: "done", tr_body: "" })], {}, { lang: "en", now: NOW });
    expect(blank.messages[0]?.translation?.status).toBe("failed");
  });

  it("detected but no row for the requested language: failed", () => {
    const t = mapTicket(ticket, [msg({ detected_lang: "it", created_at: "2026-10-14T09:59:00.000Z" })], {}, { lang: "fr", now: NOW });
    expect(t.messages[0]?.lang).toBe("it");
    expect(t.messages[0]?.translation?.status).toBe("failed");
  });

  it("staff and note messages: lang '' and translation null, even with a stray row", () => {
    const t = mapTicket(
      ticket,
      [
        msg({ id: "s", direction: "outbound_staff", detected_lang: "de", tr_status: "done", tr_body: "x" }),
        msg({ id: "n", direction: "staff_note" }),
      ],
      {},
      { lang: "en", now: NOW },
    );
    for (const m of t.messages) {
      expect(m.lang).toBe("");
      expect(m.translation).toBeNull();
    }
  });

  it("the no-message fallback: lang '' and translation null", () => {
    const t = mapTicket(ticket, [], {}, { lang: "en", now: NOW });
    expect(t.messages[0]?.lang).toBe("");
    expect(t.messages[0]?.translation).toBeNull();
  });

  it("reply target: the latest customer detected language; German customer gets the German subject", () => {
    const t = mapTicket(
      ticket,
      [
        msg({ id: "a", detected_lang: "fr", created_at: "2026-10-14T08:30:00.000Z" }),
        msg({ id: "b", detected_lang: "de", created_at: "2026-10-14T09:00:00.000Z" }),
        msg({ id: "c", direction: "outbound_staff", detected_lang: null, created_at: "2026-10-14T09:10:00.000Z" }),
      ],
      {},
      { lang: "en", now: NOW },
    );
    expect(t.reply.lang).toBe("de");
    expect(t.reply.subject).toBe("Re: Wir haben Ihre Nachricht erhalten — Vamos Taxi");
  });

  it("an Italian customer: reply.lang 'it' and the subject falls back to the ticket locale", () => {
    const t = mapTicket({ ...ticket, locale: "fr" }, [msg({ detected_lang: "it" })], {}, { lang: "en", now: NOW });
    expect(t.reply.lang).toBe("it");
    expect(t.reply.subject).toBe(mapTicket({ ...ticket, locale: "fr" }, []).reply.subject);
    expect(t.reply.subject).not.toBe(mapTicket({ ...ticket, locale: "en" }, []).reply.subject);
  });

  it("nothing detected yet: reply.lang is the ticket locale; no locale: ''", () => {
    expect(mapTicket({ ...ticket, locale: "ar" }, [msg({})], {}, { lang: "en", now: NOW }).reply.lang).toBe("ar");
    expect(mapTicket({ ...ticket, locale: null }, [msg({ detected_lang: "und" })], {}, { lang: "en", now: NOW }).reply.lang).toBe("");
  });

  it("an unknown dashboard language is treated as en", () => {
    const t = mapTicket(ticket, [msg({ detected_lang: "en" })], {}, { lang: "xx", now: NOW });
    expect(t.messages[0]?.translation?.status).toBe("same");
  });
});
