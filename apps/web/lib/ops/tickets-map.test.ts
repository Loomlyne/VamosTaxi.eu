import { describe, expect, it } from "vitest";
import { nextTicketStatus } from "./tickets-map";

describe("nextTicketStatus", () => {
  it("keeps an explicit open after new", () => {
    expect(nextTicketStatus("new", "open")).toBe("open");
  });

  it("moves to replied and closed", () => {
    expect(nextTicketStatus("open", "replied")).toBe("replied");
    expect(nextTicketStatus("replied", "closed")).toBe("closed");
  });

  it("never returns to new and never leaves closed", () => {
    expect(nextTicketStatus("open", "new")).toBeNull();
    expect(nextTicketStatus("replied", "new")).toBeNull();
    expect(nextTicketStatus("closed", "open")).toBeNull();
    expect(nextTicketStatus("closed", "closed")).toBe("closed");
  });
});
