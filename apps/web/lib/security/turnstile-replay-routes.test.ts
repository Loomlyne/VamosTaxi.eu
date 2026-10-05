// Security S5 review (2026-10-05): the contact form, the cookie banner and the review form took the Turnstile
// idempotency key from the browser. Cloudflare repeats a success for a token re-verified with the same
// idempotency_key for 300 s, so one solved token could be replayed for many submissions. Each route now sends a key
// made on the server, and ignores the browser's, so a second use of the same token is refused.
// The real lib/turnstile helper runs here; only Cloudflare's siteverify answer is faked, with its replay rule.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const limiter = { limit: async () => ({ success: true }) };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      TURNSTILE_SECRET_KEY: "sekret",
      CONTACT_TURNSTILE_ALLOWED_HOSTNAMES: "vamostaxi.site",
      QUOTE_RATE_LIMITER: limiter,
      QUOTE_RATE_LIMITER_BARE: limiter,
    },
  }),
}));
vi.mock("@/lib/db/identity", () => ({
  asSystem: async () => [],
  asCheckout: async () => undefined,
  asGuest: async () => [],
  asCustomer: async () => [],
}));
vi.mock("@/lib/consent/bind", () => ({ recordConsent: async () => undefined }));

const contact = await import("@/app/api/contact/route");
const consent = await import("@/app/api/consent/route");
const reviews = await import("@/app/api/reviews/submit/route");

let siteverify: ReturnType<typeof vi.fn>;
let keysSeen: string[];

/** Cloudflare's rule: same token + same key repeats the success; the same token with another key is a duplicate. */
function cloudflare(action: string) {
  const firstKeyOfToken = new Map<string, string>();
  keysSeen = [];
  siteverify.mockImplementation(async (_url: unknown, init: { body: URLSearchParams }) => {
    const form = new URLSearchParams(String(init.body));
    const token = form.get("response") ?? "";
    const key = form.get("idempotency_key") ?? "";
    keysSeen.push(key);
    const first = firstKeyOfToken.get(token);
    if (first === undefined) firstKeyOfToken.set(token, key);
    return new Response(
      JSON.stringify(
        first === undefined || first === key
          ? { success: true, action, hostname: "vamostaxi.site" }
          : { success: false, "error-codes": ["timeout-or-duplicate"] },
      ),
      { status: 200 },
    );
  });
}

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://vamostaxi.site${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://vamostaxi.site", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  siteverify = vi.fn();
  vi.stubGlobal("fetch", siteverify);
});
afterEach(() => vi.unstubAllGlobals());

// Each body is valid up to the check and then stops at a validation answer (400), so no database is needed:
// 403 means the check refused, anything else means it passed.
const cases = [
  {
    name: "contact form",
    action: "contact",
    run: (browserKey: string) =>
      contact.POST(post("/api/contact", { turnstileToken: "one-solved-token", idempotencyKey: browserKey })),
    refused: async (res: Response) => res.status === 403 && (await res.json()).code === "challenge_failed",
  },
  {
    name: "cookie banner",
    action: "consent",
    run: (browserKey: string) =>
      consent.POST(post("/api/consent", { method: "accept_all", turnstileToken: "one-solved-token", idempotencyKey: browserKey })),
    refused: async (res: Response) => res.status === 403 && (await res.json()).code === "challenge_failed",
  },
  {
    name: "review form",
    action: "contact",
    run: (browserKey: string) =>
      reviews.POST(post("/api/reviews/submit", { turnstileToken: "one-solved-token", idempotencyKey: browserKey })),
    refused: async (res: Response) => res.status === 403 && (await res.json()).code === "challenge_failed",
  },
] as const;

describe("S5 review: the Turnstile idempotency key is made on the server", () => {
  for (const c of cases) {
    it(`${c.name}: the key sent to Cloudflare is a fresh UUID, never the browser's`, async () => {
      cloudflare(c.action);
      const res = await c.run("browser-key-1");
      expect(await c.refused(res)).toBe(false);
      expect(keysSeen).toHaveLength(1);
      expect(keysSeen[0]).toMatch(UUID);
      expect(keysSeen[0]).not.toBe("browser-key-1");
    });

    it(`${c.name}: the same token posted again with the same browser key is refused (replay)`, async () => {
      cloudflare(c.action);
      const first = await c.run("same-browser-key");
      const second = await c.run("same-browser-key");
      expect(await c.refused(first)).toBe(false);
      expect(await c.refused(second)).toBe(true);
      expect(keysSeen).toHaveLength(2);
      expect(keysSeen[0]).not.toBe(keysSeen[1]);
      expect(keysSeen).not.toContain("same-browser-key");
    });
  }
});
