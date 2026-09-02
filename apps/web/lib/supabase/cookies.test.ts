import { describe, expect, it } from "vitest";
import { authCookiesFrom, cookieListFromHeader } from "./cookies";

describe("cookieListFromHeader", () => {
  it("returns every chunk from a Cookie header, including values that contain '='", () => {
    expect(
      cookieListFromHeader(
        "sb-yaumjzvylngfjhtuffqs-auth-token.0=base64-eyJ; sb-yaumjzvylngfjhtuffqs-auth-token.1=abc==; theme=light",
      ),
    ).toEqual([
      { name: "sb-yaumjzvylngfjhtuffqs-auth-token.0", value: "base64-eyJ" },
      { name: "sb-yaumjzvylngfjhtuffqs-auth-token.1", value: "abc==" },
      { name: "theme", value: "light" },
    ]);
  });

  it("returns an empty list when the header is missing", () => {
    expect(cookieListFromHeader(null)).toEqual([]);
    expect(cookieListFromHeader("")).toEqual([]);
  });
});

describe("authCookiesFrom", () => {
  it("prefers the request Cookie header over next/headers when the header has cookies", () => {
    expect(
      authCookiesFrom([{ name: "theme", value: "dark" }], "sb-auth-token.0=aaa; sb-auth-token.1=bbb"),
    ).toEqual([
      { name: "sb-auth-token.0", value: "aaa" },
      { name: "sb-auth-token.1", value: "bbb" },
    ]);
  });

  it("falls back to the cookie store when the request header is empty", () => {
    expect(authCookiesFrom([{ name: "theme", value: "dark" }], null)).toEqual([
      { name: "theme", value: "dark" },
    ]);
  });
});
