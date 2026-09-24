import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function sliceFunction(src: string, name: string): string {
  const marker = name.startsWith("async ") ? name : `function ${name}`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

describe("onExpress lock gate", () => {
  const panel = read("../../app/[locale]/checkout/PaymentPanel.tsx");
  const onExpress = sliceFunction(panel, "async function onExpress");

  it("fails the wallet event before confirm when the render ref is locked", () => {
    const lockedAt = onExpress.indexOf("lockedRef");
    const failedAt = onExpress.indexOf("paymentFailed");
    const notSuccessAt = onExpress.indexOf('type !== "success"');
    const confirmAt = onExpress.indexOf(".confirm(");
    expect(lockedAt).toBeGreaterThan(-1);
    expect(failedAt).toBeGreaterThan(lockedAt);
    expect(notSuccessAt).toBeGreaterThan(failedAt);
    expect(confirmAt).toBeGreaterThan(notSuccessAt);

    const gate = onExpress.slice(0, notSuccessAt);
    expect(gate).toMatch(/if\s*\(\s*lockedRef\.current\s*\)/);
    expect(gate).toContain('reason: "fail"');
    expect(onExpress).not.toContain("if (locked) return");
    expect(onExpress).not.toContain("pointerEvents");
    expect(onExpress).not.toContain("createCheckoutSession");
    expect(onExpress).not.toContain("sessions.create");
    expect(onExpress).not.toContain("loadStripe");
  });

  it("writes lockedRef during render, outside onExpress", () => {
    expect(onExpress).not.toContain("lockedRef.current = locked");
    expect(panel).toContain("const lockedRef = useRef(locked);\n  lockedRef.current = locked;");
    expect(panel).toContain("if (locked) return;");
    expect(panel).toContain('pointerEvents: "none"');
    expect(panel).toContain('data-pay-locked={locked ? "true" : undefined}');
    expect(panel).toContain("aria-disabled={locked || undefined}");
  });
});

describe("lock-expire stored session", () => {
  const route = read("../../app/api/checkout/lock-expire/route.ts");
  const client = read("../../app/[locale]/checkout/CheckoutClient.tsx");
  const pay = read("../../app/[locale]/checkout/pay/[token]/PayClient.tsx");
  const open = read("../../app/api/checkout/pay-link/open/route.ts");
  const zero = sliceFunction(client, "onQuoteLockZero");
  const expire = sliceFunction(pay, "expireStoredCheckoutSession");
  const paid = sliceFunction(open, "openPaidJson");

  it("expires only a stored session id and does not mint, cancel, or refund", () => {
    expect(route).toContain("csrfForbidden");
    expect(route).toContain("expireCheckoutSession");
    expect(route).toContain("session_lookup_failed");
    expect(route).toContain("session_not_expired");
    expect(route).toContain("loadOpenPayment");
    for (const banned of [
      "createCheckoutSession",
      "sessions.create",
      "createRefund",
      "checkout_requote_cancel",
      "sk_live_",
      "ui_mode",
    ]) {
      expect(route).not.toContain(banned);
    }
  });

  it("posts lock-expire from checkout lock zero and not intent", () => {
    expect(zero).toContain("/api/checkout/lock-expire");
    expect(zero).not.toContain("/api/checkout/intent");
    expect(zero.indexOf('setRefusal("quoteExpired")')).toBeLessThan(zero.indexOf("/api/checkout/lock-expire"));
  });

  it("posts lock-expire from the token timer helper and returns quote_id on open success", () => {
    expect(expire).toContain('fetch("/api/checkout/lock-expire"');
    expect(expire).not.toContain("confirm");
    expect(paid).toContain("quote_id");
  });
});
