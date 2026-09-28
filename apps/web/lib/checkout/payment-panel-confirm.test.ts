import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const panel = readFileSync(join(WEB, "app", "[locale]", "checkout", "PaymentPanel.tsx"), "utf8");
const stripeServer = readFileSync(join(WEB, "lib", "checkout", "stripe.ts"), "utf8");
const footer = readFileSync(join(WEB, "components", "shell", "SiteFooter.tsx"), "utf8");

/** Every `confirm({ … })` argument object in the payment panel, as source text. */
function confirmCalls(source: string): string[] {
  const calls: string[] = [];
  const re = /\.confirm\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") depth -= 1;
      i += 1;
    }
    calls.push(source.slice(m.index, i));
  }
  return calls;
}

describe("PaymentPanel confirm (card payment blocked on live, 2026-09-24 to 2026-09-28)", () => {
  it("the server sets customer_email on the Checkout Session", () => {
    expect(stripeServer).toContain("customer_email: input.customerEmail");
  });

  it("finds both confirm calls: card and express", () => {
    expect(confirmCalls(panel)).toHaveLength(2);
  });

  it("no confirm call passes email, because the session already carries customer_email", () => {
    for (const call of confirmCalls(panel)) {
      expect(call).not.toMatch(/\bemail\b/);
    }
  });

  it("the card confirm passes no returnUrl and redirects only if required", () => {
    const card = confirmCalls(panel).find((c) => !c.includes("expressCheckoutConfirmEvent"));
    expect(card).toBeDefined();
    expect(card).toContain('redirect: "if_required"');
    expect(card).not.toContain("returnUrl");
  });
});

describe("SiteFooter payment row", () => {
  it("shows no internal note to customers", () => {
    expect(footer).not.toContain("marks-awaiting-confirmed-stripe-provider-config");
    expect(footer).not.toContain("data-ft-paynote");
  });
});
