import { beforeEach, describe, expect, it, vi } from "vitest";

const asAnon = vi.fn();
const readConsentChoice = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/db/identity", () => ({
  asAnon: (env: unknown, fn: (tx: unknown) => unknown) => {
    asAnon(env);
    return fn({});
  },
}));
vi.mock("@/lib/consent/read", () => ({
  readConsentChoice: (...args: unknown[]) => readConsentChoice(...args),
}));

import { GET } from "@/app/api/consent/state/route";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/policy";

const SUBJECT = "22222222-2222-4222-8222-222222222222";

function req(cookie?: string): Request {
  return new Request("https://vamostaxi.site/api/consent/state", {
    headers: cookie ? { cookie } : {},
  });
}

function expectHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("vary")).toContain("Cookie");
  expect(res.headers.get("set-cookie")).toBeNull();
}

beforeEach(() => {
  asAnon.mockReset();
  readConsentChoice.mockReset();
});

describe("GET /api/consent/state", () => {
  it("no cookie: chosen false, no DB", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, chosen: false, policyVersion: CONSENT_POLICY_VERSION });
    expect(asAnon).not.toHaveBeenCalled();
    expectHeaders(res);
  });

  it("non-UUID cookie: chosen false, no DB", async () => {
    const res = await GET(req("consent_subject=not-a-uuid"));
    expect(((await res.json()) as { chosen: boolean }).chosen).toBe(false);
    expect(asAnon).not.toHaveBeenCalled();
    expectHeaders(res);
  });

  it("valid cookie, no row: chosen false", async () => {
    readConsentChoice.mockResolvedValue(null);
    const res = await GET(req(`consent_subject=${SUBJECT}`));
    expect(((await res.json()) as { chosen: boolean }).chosen).toBe(false);
    expect(readConsentChoice.mock.calls[0]![1]).toBe(SUBJECT);
    expectHeaders(res);
  });

  it("valid cookie, row: chosen true, choice fields, no UUID in body", async () => {
    const choice = {
      method: "accept_all",
      functional: true,
      analytics: false,
      marketing: true,
      recordedAt: "2026-09-30T08:15:00.000Z",
    };
    readConsentChoice.mockResolvedValue(choice);
    const res = await GET(req(`consent_subject=${SUBJECT}`));
    const text = await res.text();
    expect(text).not.toContain(SUBJECT);
    expect(JSON.parse(text)).toEqual({
      ok: true,
      chosen: true,
      policyVersion: CONSENT_POLICY_VERSION,
      choice,
    });
    expectHeaders(res);
  });

  it("reader throws: 503 unavailable", async () => {
    readConsentChoice.mockRejectedValue(new Error("db down"));
    const res = await GET(req(`consent_subject=${SUBJECT}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "unavailable" });
    expectHeaders(res);
  });

  it("every response carries no-store, Vary Cookie and no Set-Cookie", async () => {
    readConsentChoice.mockResolvedValue(null);
    for (const c of [undefined, `consent_subject=${SUBJECT}`]) expectHeaders(await GET(req(c)));
  });
});
