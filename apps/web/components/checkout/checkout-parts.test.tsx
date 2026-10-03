import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

// 261003: the bar docks the contact button (it needs next-intl, covered in lib/contact-button.test.ts).
vi.mock("@/components/shell/ContactButton", () => ({
  ContactButton: ({ variant }: { variant?: string }) => <span data-contact-mock={variant ?? "float"} />,
}));

import { DisclosureRow } from "./DisclosureRow";
import { ExtraRow } from "./ExtraRow";
import { PayBar } from "./PayBar";

const base = {
  totalLabel: "Total",
  payLabel: "Pay",
  loadingLabel: "Opening payment",
};

describe("PayBar", () => {
  it("default: amount, lock, PAY enabled, polite live region", () => {
    const html = renderToString(<PayBar {...base} variant="bar" total="CHF 000" payAmount="CHF 000" onTotal={() => {}} />);
    expect(html).toContain('data-co-pay-bar="bar"');
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain("CHF 000");
    expect(html).toContain('data-co-total-link');
    expect(html).not.toMatch(/data-co-pay[^-][^>]*disabled/);
    expect(html).not.toContain("Opening payment");
  });

  it("the bar docks the contact button between Total and PAY; the rail does not", () => {
    const bar = renderToString(<PayBar {...base} variant="bar" total="CHF 000" onTotal={() => {}} />);
    const i = bar.indexOf('data-contact-mock="docked"');
    expect(i).toBeGreaterThan(bar.indexOf("data-co-total-link"));
    expect(i).toBeLessThan(bar.indexOf('data-co-pay="'));
    const rail = renderToString(<PayBar {...base} variant="rail" total="CHF 000" />);
    expect(rail).not.toContain("data-contact-mock");
  });

  it("no class: label reads only Pay and the total shows the words", () => {
    const html = renderToString(<PayBar {...base} variant="bar" totalNote="Choose a class" />);
    expect(html).toContain("Choose a class");
    expect(html).toContain("data-co-total-note");
    expect(html).not.toContain("data-co-total>");
  });

  it("updating price placeholder", () => {
    const html = renderToString(<PayBar {...base} variant="rail" totalNote="Updating price" />);
    expect(html).toContain("Updating price");
  });

  it("disabled: the button is disabled", () => {
    const html = renderToString(<PayBar {...base} variant="rail" state="disabled" total="CHF 000" />);
    expect(html).toContain('data-state="disabled"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-co-pay/);
  });

  it("loading: spinner, Opening payment, aria-busy, disabled", () => {
    const html = renderToString(<PayBar {...base} variant="rail" state="loading" total="CHF 000" payAmount="CHF 000" />);
    expect(html).toContain("Opening payment");
    expect(html).toContain("vt-copay__spin");
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("error: danger Alert above PAY", () => {
    const html = renderToString(
      <PayBar {...base} variant="rail" state="error" total="CHF 000" error="Payment did not start. Try Pay again." />,
    );
    expect(html).toContain("vt-alert--danger");
    expect(html).toContain("Payment did not start. Try Pay again.");
    expect(html.indexOf("vt-alert--danger")).toBeLessThan(html.indexOf('data-co-pay="true"'));
  });

  it("rail has the reassurance and a block button; bar has neither", () => {
    const rail = renderToString(<PayBar {...base} variant="rail" total="CHF 000" reassurance="No charge until the Stripe page." />);
    expect(rail).toContain("No charge until the Stripe page.");
    expect(rail).toContain("vt-btn--block");
    const bar = renderToString(<PayBar {...base} variant="bar" total="CHF 000" />);
    expect(bar).not.toContain("vt-btn--block");
  });

  it("challenge slot sits above PAY and the live message renders", () => {
    const html = renderToString(
      <PayBar {...base} variant="rail" total="CHF 000" challenge={<i data-x="w" />} liveMessage="Enter a first name" />,
    );
    expect(html.indexOf('data-x="w"')).toBeLessThan(html.indexOf('data-co-pay="true"'));
    expect(html).toContain("Enter a first name");
  });
});

describe("DisclosureRow", () => {
  const props = { id: "co-company", icon: "briefcase" as const, label: "Need a company receipt?", optionalLabel: "Optional" };

  it("collapsed: button with aria-expanded=false, aria-controls, Optional tag, panel hidden", () => {
    const html = renderToString(
      <DisclosureRow {...props} open={false} onToggle={() => {}}>
        <p>inside</p>
      </DisclosureRow>,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="co-company-panel"');
    expect(html).toContain('id="co-company-panel"');
    expect(html).toContain("Optional");
    expect(html).toMatch(/id="co-company-panel"[^>]*hidden/);
    expect(html).toContain("inside");
  });

  it("open: aria-expanded=true, chevron flag, panel visible", () => {
    const html = renderToString(
      <DisclosureRow {...props} open onToggle={() => {}}>
        <p>inside</p>
      </DisclosureRow>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-open="true"');
    expect(html).not.toMatch(/id="co-company-panel"[^>]*hidden/);
  });
});

describe("ExtraRow", () => {
  const row = { code: "child-seat", name: "Child seat", amount: "CHF 000", onChange: () => {} };

  it("unchecked: name from props, plus amount", () => {
    const html = renderToString(<ExtraRow {...row} checked={false} />);
    expect(html).toContain('data-state="unchecked"');
    expect(html).toContain("Child seat");
    expect(html).toContain("+ <!-- -->CHF 000");
    expect(html).not.toContain(">child-seat<");
  });

  it("checked", () => {
    const html = renderToString(<ExtraRow {...row} checked />);
    expect(html).toContain('data-state="checked"');
    expect(html).toContain("checked");
  });

  it("updating and disabled", () => {
    expect(renderToString(<ExtraRow {...row} checked updating />)).toContain('data-state="updating"');
    const d = renderToString(<ExtraRow {...row} checked={false} disabled />);
    expect(d).toContain('data-state="disabled"');
    expect(d).toContain("disabled");
  });
});
