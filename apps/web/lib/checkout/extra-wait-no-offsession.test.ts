import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("D-38 grep gate — no off-session extra-wait debit", () => {
  it("checkout charge path has no off_session or waiting PaymentIntent capture", () => {
    for (const name of ["intent.ts", "settle.ts", "stripe.ts", "webhook.ts"] as const) {
      const src = read(name);
      expect(src, name).not.toMatch(/off_session/);
      expect(src, name).not.toMatch(/setup_future_usage/);
      expect(src, name).not.toMatch(/paymentIntents\.create/);
      expect(src, name).not.toMatch(/PaymentIntent\.create/);
      expect(src, name).not.toMatch(/waiting[\s\S]{0,80}paymentIntents/i);
      expect(src, name).not.toMatch(/paymentIntents[\s\S]{0,80}waiting/i);
    }
    const intent = read("intent.ts");
    expect(intent).toMatch(/waiting extra is 0 at pay/);
  });
});
