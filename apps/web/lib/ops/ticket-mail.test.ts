import { describe, expect, it } from "vitest";
import {
  asRfcMessageId,
  clipInboundBody,
  contactMessageId,
  inboundTicketStatus,
  parseTicketReplyToken,
  staffMessageId,
  threadHeaders,
  ticketReplyAddress,
  tokenFromInboundTo,
} from "./ticket-mail";

describe("ticket-mail", () => {
  it("builds a plus-address on replies.vamostaxi.site", () => {
    expect(ticketReplyAddress("a".repeat(32))).toBe(`ticket+${"a".repeat(32)}@replies.vamostaxi.site`);
  });

  it("parses ticket+token from To including display names", () => {
    const token = "0123456789abcdef0123456789abcdef";
    expect(parseTicketReplyToken(`Vamos Taxi <ticket+${token}@replies.vamostaxi.site>`)).toBe(token);
    expect(tokenFromInboundTo([`ticket+${token}@replies.vamostaxi.site`])).toBe(token);
    expect(tokenFromInboundTo([{ email: `ticket+${token}@replies.vamostaxi.site` }])).toBe(token);
  });

  it("drops unmatched inboxes and non-hex tokens", () => {
    expect(parseTicketReplyToken("info@vamostaxi.site")).toBeNull();
    expect(parseTicketReplyToken("ticket+not-a-token@replies.vamostaxi.site")).toBeNull();
    expect(parseTicketReplyToken("ticket+0123456789abcdef0123456789abcdef@vamostaxi.site")).toBeNull();
  });

  it("threads staff mail off the contact Message-ID without minting Message-ID", () => {
    const outboundId = "22222222-2222-2222-2222-222222222222";
    const parent = contactMessageId("11111111-1111-1111-1111-111111111111");
    const headers = threadHeaders(parent, outboundId);
    expect(parent).toBe("<c.11111111111111111111111111111111@vamostaxi.site>");
    expect(headers["In-Reply-To"]).toBe(asRfcMessageId(parent));
    expect(headers).not.toHaveProperty("Message-ID");
    expect(Object.keys(headers)).not.toContain("Message-ID");
    expect(headers.References).toContain(parent);
    expect(headers.References).not.toContain(staffMessageId(outboundId));
    expect(asRfcMessageId("id@host")).toBe("<id@host>");
  });

  it("maps every inbound customer mail to responded", () => {
    expect(inboundTicketStatus("new")).toBe("responded");
    expect(inboundTicketStatus("open")).toBe("responded");
    expect(inboundTicketStatus("replied")).toBe("responded");
    expect(inboundTicketStatus("closed")).toBe("responded");
    expect(clipInboundBody("x".repeat(8001)).length).toBe(8000);
  });
});
