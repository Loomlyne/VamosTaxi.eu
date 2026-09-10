import { describe, expect, it } from "vitest";
import { inboundBody, readInboundPayload } from "./ticket-mail";

describe("ticket-inbound parse", () => {
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
