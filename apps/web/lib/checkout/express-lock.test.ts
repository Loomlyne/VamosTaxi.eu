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

describe("lock-expire stored session", () => {
  const route = read("../../app/api/checkout/lock-expire/route.ts");
  const pay = read("../../app/[locale]/checkout/pay/[token]/PayClient.tsx");
  const open = read("../../app/api/checkout/pay-link/open/route.ts");
  const expire = sliceFunction(pay, "expireStoredCheckoutSession");

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

  it("posts lock-expire from the token timer helper and returns quote_id on open success", () => {
    expect(expire).toContain('fetch("/api/checkout/lock-expire"');
    expect(expire).not.toContain("confirm");
    expect(open).toContain("quote_id: String(row.quote_id)");
  });
});
