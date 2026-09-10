import { describe, expect, it } from "vitest";
import { asRfcMessageId, contactMessageId, staffMessageId, threadHeaders } from "./ticket-mail";

describe("ticket-mail", () => {
  it("threads staff mail off the contact Message-ID", () => {
    const parent = contactMessageId("11111111-1111-1111-1111-111111111111");
    const headers = threadHeaders(parent, "22222222-2222-2222-2222-222222222222");
    expect(parent).toBe("<c.11111111111111111111111111111111@vamostaxi.site>");
    expect(headers["In-Reply-To"]).toBe(parent);
    expect(headers["Message-ID"]).toBe(staffMessageId("22222222-2222-2222-2222-222222222222"));
    expect(headers.References).toContain(parent);
    expect(asRfcMessageId("id@host")).toBe("<id@host>");
  });
});
