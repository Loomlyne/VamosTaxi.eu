import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("home Select off", () => {
  const board = source("components/home/BookingBoard.tsx");

  it("imports classIsSelectable from the charge gate", () => {
    expect(board).toMatch(
      /import\s*\{[^}]*\bclassIsSelectable\b[^}]*\}\s*from\s*["']@\/lib\/checkout\/charge-gate["']/,
    );
    expect(board).toMatch(/classIsSelectable\(/);
  });

  it("does not label the card or price stack with pricing_not_live", () => {
    expect(board).not.toContain("REFUSAL_BINDINGS.pricing_not_live");
    expect(board).not.toContain("pricingNotLive");
  });

  it("publicFleet still only drops no_rate", () => {
    const start = board.indexOf("function publicFleet");
    const end = board.indexOf("function ineligiblePrice");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fleet = board.slice(start, end);
    expect(fleet).toContain('entry.ineligible_reason !== "no_rate"');
    expect(fleet).not.toContain("total_rappen");
    expect(fleet).not.toContain("classIsSelectable");
  });
});

describe("checkout trip Select off", () => {
  const cards = source("app/[locale]/checkout/CheckoutClassCards.tsx");
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const css = source("app/[locale]/checkout/checkout.css");

  it("gates the chip on classIsSelectable and peekLockClassRappen", () => {
    expect(cards).toContain("classIsSelectable");
    expect(cards).toContain("peekLockClassRappen");
    expect(cards).toContain('data-priced={priced ? "true" : "false"}');
    expect(cards).toContain("disabled={!activatable}");
    expect(cards).toContain("aria-disabled={!activatable}");
    expect(cards).not.toContain("pricingNotLive");
    expect(cards).not.toContain("na_pax");
    expect(cards).not.toContain("formatChfRappen");
    expect(cards).not.toContain("formatAmount");
  });

  it("passes lock from CheckoutClient and does not invent chip copy", () => {
    const start = client.indexOf("<CheckoutClassCards");
    const end = client.indexOf("/>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(client.slice(start, end)).toContain("lock=");
  });

  it("continueDetails consults the gate before entering Pay", () => {
    const start = client.indexOf("async function continueDetails");
    const end = client.indexOf("async function startPayment", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = client.slice(start, end);
    const gate = body.indexOf("classIsSelectable");
    const peek = body.indexOf("peekLockClassRappen");
    const push = body.indexOf('checkoutStepPath("payment")');
    const pay = body.indexOf("startPayment(");
    expect(gate).toBeGreaterThan(-1);
    expect(peek).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(Math.min(gate, peek));
    expect(pay).toBeGreaterThan(gate);
    expect(body).not.toContain('setRefusal("pricingNotLive")');
  });

  it("shares the unfit opacity and hover rule for an unpriced chip", () => {
    expect(css).toContain('.vt-checkout__class[data-priced="false"]');
    expect(css).toContain('.vt-checkout__class[data-priced="false"]:hover');
    const rule = css.slice(
      css.indexOf('.vt-checkout__class[data-fit="false"],'),
      css.indexOf('.vt-checkout__class[data-fit="false"]:hover'),
    );
    expect(rule).toContain("opacity: 0.42");
    expect(rule).toContain('[data-priced="false"]');
  });
});
