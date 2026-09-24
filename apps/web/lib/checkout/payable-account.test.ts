import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const selfPath = fileURLToPath(import.meta.url);

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

/** Build a forbidden mark without writing it into this file. */
function chars(...codes: number[]): string {
  return String.fromCharCode(...codes);
}

describe("payable account reuse pin", () => {
  const intent = read("intent.ts");
  const stripeSrc = read("stripe.ts");
  const open = read("load-open-payment.ts");

  it("keeps reuse behind the prefix guard and does not create first", () => {
    expect(intent).toContain("async function payableFromOpen");
    expect(intent).toContain("sessionIsPayable");
    expect(intent).toContain("loadOpenPayment");
    expect(stripeSrc).toContain("export function sessionIsPayable");
    expect(open).toContain("export async function loadOpenPayment");
    expect(open).toContain("public.checkout_open_payment");

    const prefix = intent.indexOf("stripeAccountIsLegacyUaeTest(");
    const load = intent.indexOf("loadOpenPayment(");
    const reuse = intent.indexOf("await payableFromOpen(");
    const create = intent.indexOf("createCheckoutSession(");
    expect(prefix).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(prefix);
    expect(reuse).toBeGreaterThan(prefix);
    expect(create).toBeGreaterThan(reuse);
    expect(intent.slice(prefix, create)).toContain("return legacyUaeAccountStop()");

    const stopStart = intent.indexOf("function legacyUaeAccountStop");
    const stopEnd = intent.indexOf("function okIntentResponse", stopStart);
    const stop = intent.slice(stopStart, stopEnd);
    expect(stop).toContain("status: 503");
    expect(stop).not.toContain("code");
    expect(stop).not.toContain("pricing_not_live");
    expect(stop).not.toContain("quote_expired");
    expect(stop).not.toContain("invalid_request");
    expect(stop).not.toContain("email_failed");
  });

  it("does not return the stored session when retrieve misses", () => {
    const start = intent.indexOf("async function payableFromOpen");
    const end = intent.indexOf("function utf8Hex", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = intent.slice(start, end);
    const retrieve = body.indexOf("retrieveCheckoutSession");
    const miss = body.indexOf(".catch(");
    expect(retrieve).toBeGreaterThan(-1);
    expect(miss).toBeGreaterThan(retrieve);
    expect(body.slice(miss, miss + 40)).toContain("() => null");
    expect(body).toContain(
      "const payable = stored ? await sessionWithSecret(stored, deps.retrieveCheckoutSession) : null;",
    );
    expect(body).toContain("if (!sessionIsPayable(payable, chargedRappen)) return null;");
    expect(body).not.toMatch(/return\s+existing\b/);
    expect(body).not.toMatch(/return\s+stored\b/);
    const check = body.indexOf("if (!sessionIsPayable(payable, chargedRappen)) return null;");
    const success = body.indexOf("return { row: existing, payable }");
    expect(check).toBeGreaterThan(miss);
    expect(success).toBeGreaterThan(check);
  });

  it("keeps Checkout ui_mode on elements through CHECKOUT_UI_MODE", () => {
    expect(stripeSrc).toContain('export const CHECKOUT_UI_MODE = "elements" as const;');
    expect(stripeSrc).toContain("ui_mode: CHECKOUT_UI_MODE");
    expect(stripeSrc).not.toContain('ui_mode: "hosted"');
    expect(stripeSrc).not.toContain('ui_mode: "custom"');
    expect(stripeSrc).not.toContain('ui_mode: "embedded"');
    expect(intent).not.toContain("ui_mode");
    expect(intent).toContain("createCheckoutSession");
    expect(intent).not.toContain("paymentIntents.create");
  });

  it("contains no secret, account id, or key material and does not create a session", () => {
    const self = readFileSync(selfPath, "utf8");
    const marks = [
      chars(115, 107, 95),
      chars(112, 107, 95),
      chars(119, 104, 115, 101, 99, 95),
      chars(114, 107, 95),
      chars(97, 99, 99, 116, 95),
      chars(53, 49, 85, 54, 53, 112, 87),
    ];
    for (const mark of marks) {
      expect(self).not.toContain(mark);
    }
    expect(self).not.toContain(["sessions", "create"].join("."));
    expect(self).not.toMatch(/\bimport\s+Stripe\b/);
  });
});
