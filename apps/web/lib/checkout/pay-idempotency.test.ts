import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { payIdemAfter, payIdemFor, type PayIdem } from "./pay-idempotency";

const here = dirname(fileURLToPath(import.meta.url));

describe("pay idempotency key (26.2 audit U11-2)", () => {
  let n = 0;
  const newId = () => `id-${++n}`;

  it("keeps one key while the selection is unchanged and mints a new one when it changes", () => {
    const a = payIdemFor(null, "sel-1", newId);
    expect(payIdemFor(a, "sel-1", newId)).toBe(a);
    const b = payIdemFor(a, "sel-2", newId);
    expect(b.id).not.toBe(a.id);
  });

  it("drops the key after a failed answer, so the next press opens a new session", () => {
    const held: PayIdem | null = payIdemFor(null, "sel-1", newId);
    expect(payIdemAfter(held, false)).toBeNull();
    const next = payIdemFor(payIdemAfter(held, false), "sel-1", newId);
    expect(next.id).not.toBe(held.id);
  });

  it("keeps the key after an ok answer", () => {
    const held = payIdemFor(null, "sel-1", newId);
    expect(payIdemAfter(held, true)).toBe(held);
  });

  it("CheckoutForm drops the key on every failed answer after the account step, and on a thrown fetch", () => {
    const src = readFileSync(join(here, "../../app/[locale]/checkout/CheckoutForm.tsx"), "utf8");
    const start = src.indexOf('fetch("/api/checkout/intent"');
    const end = src.indexOf("}, [", start);
    const block = src.slice(start, end);
    // the success branch navigates away before the key is touched; every other path passes the drop
    const drop = block.indexOf("idem.current = payIdemAfter(idem.current, Boolean(effect));");
    expect(drop).toBeGreaterThan(block.indexOf("window.location.assign(json.url)"));
    // decided after the account-step mapping and before any branch returns
    expect(drop).toBeGreaterThan(block.indexOf("const effect = mapAccountCode(code);"));
    expect(drop).toBeLessThan(block.indexOf("if (effect) {"));
    expect(block).toContain("} catch {\n        idem.current = payIdemAfter(idem.current, false);");
  });
});
