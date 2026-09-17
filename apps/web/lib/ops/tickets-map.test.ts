import { describe, expect, it } from "vitest";
import { mapTicket, nextTicketStatus, rejectStaffReply, staffPatchStatus } from "./tickets-map";

describe("nextTicketStatus", () => {
  it("keeps an explicit open after new", () => {
    expect(nextTicketStatus("new", "open")).toBe("open");
  });

  it("moves to replied, responded, and closed", () => {
    expect(nextTicketStatus("open", "replied")).toBe("replied");
    expect(nextTicketStatus("replied", "responded")).toBe("responded");
    expect(nextTicketStatus("replied", "closed")).toBe("closed");
  });

  it("reopens closed to open and never returns to new", () => {
    expect(nextTicketStatus("open", "new")).toBeNull();
    expect(nextTicketStatus("replied", "new")).toBeNull();
    expect(nextTicketStatus("closed", "open")).toBe("open");
    expect(nextTicketStatus("closed", "replied")).toBeNull();
    expect(nextTicketStatus("closed", "closed")).toBe("closed");
  });
});

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
  it("does not block a reply key so overlay PATCH { reply } can send", () => {
    expect(rejectStaffReply({ reply: "hi" })).toBe(false);
    expect(rejectStaffReply({ reply: "" })).toBe(false);
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
