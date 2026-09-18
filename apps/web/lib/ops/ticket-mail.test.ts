import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  asRfcMessageId,
  clipInboundBody,
  contactMessageId,
  inboundBody,
  inboundTicketStatus,
  parseTicketPublicPrefix,
  parseTicketReplyToken,
  publicPrefixFromInboundTo,
  readInboundPayload,
  staffMessageId,
  staffSender,
  threadHeaders,
  ticketPublicAddress,
  ticketReplyAddress,
  tokenFromInboundTo,
} from "./ticket-mail";

const TOKEN = "0123456789abcdef0123456789abcdef";
const PLUS = `ticket+${TOKEN}@replies.vamostaxi.site`;
const SUBMISSION = "8ec98a6d-d411-4ecb-b1eb-6e650290fe87";
const PUBLIC = "TKT-8EC98A6D@replies.vamostaxi.site";

type Wave0Mail = typeof import("./ticket-mail") & {
  stripQuotedHistory: (text: string) => string;
  parseInboundHeaders: (headers: unknown) => {
    inReplyTo: string[];
    references: string[];
    messageId: string;
  };
};

async function loadWave0Mail(): Promise<Wave0Mail> {
  return (await import("./ticket-mail")) as Wave0Mail;
}

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
    expect(parseTicketPublicPrefix("TKT-8EC98A6D@vamostaxi.site")).toBeNull();
    expect(parseTicketPublicPrefix("info@replies.vamostaxi.site")).toBeNull();
  });

  it("parses TKT-8hex public mailbox on replies.vamostaxi.site", () => {
    expect(ticketPublicAddress(SUBMISSION)).toBe(PUBLIC);
    expect(parseTicketPublicPrefix(`Vamos Taxi <${PUBLIC}>`)).toBe("8ec98a6d");
    expect(publicPrefixFromInboundTo([PUBLIC])).toBe("8ec98a6d");
    expect(publicPrefixFromInboundTo([{ email: PUBLIC.toLowerCase() }])).toBe("8ec98a6d");
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

  it("reads Resend email.received payloads", () => {
    expect(readInboundPayload({ email_id: "em_1", to: "ticket+a@x" })).toEqual({
      emailId: "em_1",
      to: "ticket+a@x",
      from: undefined,
      text: undefined,
      html: undefined,
      subject: undefined,
    });
    expect(readInboundPayload({ id: "em_2", to: ["x@y"] })?.emailId).toBe("em_2");
    expect(readInboundPayload({})).toBeNull();
  });

  it("prefers text then html then subject", () => {
    expect(inboundBody({ emailId: "1", to: "x", text: " hello " })).toBe("hello");
    expect(inboundBody({ emailId: "1", to: "x", html: "<p>Hi<br/>there</p>" })).toBe("Hi\nthere");
    expect(inboundBody({ emailId: "1", to: "x", subject: "Re: ping" })).toBe("Re: ping");
  });
});

describe("INB-02 D-01 received_for token (Wave 0)", () => {
  it("tokenFromInboundTo on received_for array containing ticket+32hex@replies.vamostaxi.site", () => {
    const received_for = [`Vamos Taxi <${PLUS}>`];
    expect(tokenFromInboundTo(received_for)).toBe(TOKEN);
  });
});

describe("INB-02 D-01 D-06 D-07 Wave 0 strip and RFC parse (RED until 14-02)", () => {
  it("D-01 parseInboundHeaders reads in-reply-to and references case-insensitively", async () => {
    const { parseInboundHeaders } = await loadWave0Mail();
    const parsed = parseInboundHeaders({
      "In-Reply-To": "<c.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@vamostaxi.site>",
      REFERENCES: "<c.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@vamostaxi.site> <s.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb@vamostaxi.site>",
    });
    expect(parseInboundHeaders).toEqual(expect.any(Function));
    expect(parsed.inReplyTo).toContain("<c.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@vamostaxi.site>");
    expect(parsed.references.join(" ")).toContain("<s.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb@vamostaxi.site>");
  });

  it("D-06 stripQuotedHistory keeps the first paragraph and drops an On … wrote: dump", async () => {
    const { stripQuotedHistory } = await loadWave0Mail();
    const out = stripQuotedHistory("Need a later pickup.\n\nOn Alice wrote:\n> Yesterday's thread");
    expect(out).toContain("Need a later pickup.");
    expect(out).not.toMatch(/On Alice wrote:/);
    expect(out).not.toContain("Yesterday's thread");
  });

  it("D-06 stripQuotedHistory drops Gmail On … <addr> wrote: wrap", async () => {
    const { stripQuotedHistory } = await loadWave0Mail();
    const out = stripQuotedHistory(
      "Utxitc8yviyciycy8c\n\nOn Fri, 18 Sep 2026 at 3:12 PM Vamos Taxi\n<TKT-8EC98A6D@replies.vamostaxi.site> wrote:\nokay no",
    );
    expect(out).toBe("Utxitc8yviyciycy8c");
    expect(out).not.toContain("TKT-8EC98A6D");
    expect(out).not.toContain("okay no");
  });

  it("D-07 inboundBody/htmlToText on a p-wrapped script tag does not contain the string script", () => {
    const out = inboundBody({
      emailId: "em_html",
      to: PLUS,
      html: "<p><script>alert(1)</script></p>",
    });
    expect(out.toLowerCase()).not.toContain("script");
    expect(out).not.toMatch(/<\s*script/i);
  });

  it("D-06 clip still 8000 on stripped text", async () => {
    const { stripQuotedHistory } = await loadWave0Mail();
    const dumped = `${"a".repeat(8001)}\n\nOn Bob wrote:\nquoted history`;
    expect(stripQuotedHistory(dumped).length).toBeLessThanOrEqual(8000);
    expect(clipInboundBody("x".repeat(8001)).length).toBe(8000);
  });
});

describe("Phase 16 staffSender public TKT mailbox (D-01 D-04)", () => {
  it("staffSender From and Reply-To are TKT-{id}@replies.vamostaxi.site", () => {
    expect(staffSender(TOKEN, SUBMISSION)).toEqual({
      from: `Vamos Taxi <${PUBLIC}>`,
      replyTo: PUBLIC,
    });
  });

  it("source-read keeps REPLIES_DOMAIN_VERIFIED true and the TKT From template", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ticket-mail.ts"), "utf8");
    expect(src).toMatch(/REPLIES_DOMAIN_VERIFIED\s*=\s*true/);
    expect(src).toContain("`Vamos Taxi <${publicAddr}>`");
    expect(src).not.toContain("`Vamos Taxi <${plus}>`");
  });
});
