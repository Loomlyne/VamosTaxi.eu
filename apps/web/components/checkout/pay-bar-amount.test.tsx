import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/components/shell/ContactButton", () => ({
  ContactButton: () => <span data-contact-mock="docked" />,
}));

import { PayBar } from "./PayBar";

/**
 * 261003: the phone PAY bar must never break a figure across two lines ("CHF" over "000").
 * Measured in Chromium at 390 px: PAY carried the figure a second time (up to 235 px) and left the
 * Total 37 px, so the figure wrapped. The fix is pinned here; the browser run proves the geometry
 * (apps/web/tests/e2e-worker/contact-button-browser.e2e.mjs, section 6).
 */
const css = readFileSync(join(__dirname, "checkout-parts.css"), "utf8");

/** Body of the first rule whose selector is exactly `selector`, searched from `from`. */
function rule(selector: string, from = 0): string {
  const at = css.indexOf(`${selector} {`, from);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
}

describe("PayBar amount stays on one line", () => {
  it("the Total figure never wraps", () => {
    expect(rule(".vt-copay__amount")).toMatch(/white-space:\s*nowrap/);
  });

  const phone = css.indexOf("@media (max-width: 520px)");

  it("phone bar: the Total container sizes the figure, 16px floor and 20px cap", () => {
    expect(phone).toBeGreaterThan(-1);
    expect(rule(".vt-copay--bar .vt-copay__total", phone)).toMatch(/container-type:\s*inline-size/);
    const size = rule(".vt-copay--bar .vt-copay__amount", phone).match(/font-size:\s*clamp\(([^)]*)\)/);
    expect(size).not.toBeNull();
    const parts = (size![1] ?? "").split(",").map((s) => s.trim());
    expect(parts[0]).toBe("16px");
    expect(parts[2]).toBe("20px");
    expect(rule(".vt-copay--bar .vt-copay__row", phone)).toMatch(/gap:\s*8px/);
  });

  it("phone bar: PAY keeps its figure for screen readers only, so the Total gets the room", () => {
    const hidden = rule(".vt-copay--bar .vt-copay__pay-amount", phone);
    expect(hidden).toMatch(/position:\s*absolute/);
    expect(hidden).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(hidden).not.toMatch(/display:\s*none/); // display:none would drop it from the accessible name
  });

  it("no figure rule goes under 16px, no glow, no tinted yellow", () => {
    const amountRules = css.slice(css.indexOf(".vt-copay__amount {"), css.indexOf(".vt-copay__reassure {"));
    for (const m of amountRules.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(16);
    expect(css).not.toMatch(/--vt-shadow-accent|--vt-yellow-(50|100|200|300|600|700)\b/);
  });

  it("PayBar marks the figure inside PAY so the rule can reach it; PAY keeps the label and the figure in its markup", () => {
    const html = renderToString(
      <PayBar variant="bar" totalLabel="Total" total="CHF 9'999.00" payLabel="Pay" payAmount="CHF 9'999.00" loadingLabel="Opening payment" onTotal={() => {}} />,
    );
    expect(html).toContain('class="vt-dir-keep vt-copay__pay-amount"');
    expect(html).toMatch(/data-co-pay[^>]*>.*Pay.*CHF 9&#x27;999\.00/s);
  });
});
