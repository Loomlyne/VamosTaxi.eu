import { describe, expect, it } from "vitest";
import { nextTicketStatus, rejectStaffReply, staffPatchStatus } from "./tickets-map";

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
