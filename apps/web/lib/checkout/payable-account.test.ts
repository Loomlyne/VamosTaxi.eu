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

  it("keeps reuse behind the prefix guard and does not create first (hosted)", () => {
    expect(intent).toContain("hostedSessionIsPayable");
    expect(intent).toContain("loadOpenPayment");
    expect(stripeSrc).toContain("export function hostedSessionIsPayable");
    expect(stripeSrc).not.toContain("export function sessionIsPayable");
    expect(open).toContain("export async function loadOpenPayment");
    expect(open).toContain("public.checkout_open_payment");

    const prefix = intent.indexOf("deps.legacyUaeAccount === true");
    const load = intent.indexOf("deps.loadOpenPayment(");
    const create = intent.indexOf("openSession(idempotencyKey)");
    expect(prefix).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(prefix);
    expect(create).toBeGreaterThan(load);
    expect(intent.slice(prefix, prefix + 80)).toContain("return legacyUaeAccountStop()");

    const stopStart = intent.indexOf("function legacyUaeAccountStop");
    const stop = intent.slice(stopStart, stopStart + 400);
    expect(stop).toContain("status: 503");
    expect(stop).not.toContain("code");
    expect(stop).not.toContain("pricing_not_live");
    expect(stop).not.toContain("quote_expired");
    expect(stop).not.toContain("invalid_request");
    expect(stop).not.toContain("email_failed");
  });

  it("no client secret anywhere: only Stripe's hosted page (D-48)", () => {
    expect(stripeSrc).toContain('ui_mode: "hosted_page"');
    expect(stripeSrc).not.toContain('ui_mode: "elements"');
    expect(stripeSrc).not.toContain('ui_mode: "hosted"');
    expect(stripeSrc).not.toContain('ui_mode: "custom"');
    expect(stripeSrc).not.toContain('ui_mode: "embedded"');
    expect(intent).not.toContain("ui_mode");
    expect(intent).not.toContain("client_secret");
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
