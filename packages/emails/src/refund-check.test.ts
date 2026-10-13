import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import {
  renderRefundCheckDidNotRun,
  renderRefundCheckEmail,
  type RefundCheckReport,
} from "./refund-check";
import { sendRefundCheck } from "./lib/send";
import * as pkg from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "refund-check.ts"), "utf8");

// Phase 31 D-09: the owner-approved text (31-CONTEXT.md), used verbatim.
const INTRO_1 = "Tonight's check compared the refunds Stripe made in the last 48 hours with the bookings on vamostaxi.site.";
const INTRO_2 = "Nothing was changed.";
const H_MISSING = "Missing on the booking (Stripe refunded, the booking shows nothing):";
const H_AMOUNTS = "Amounts differ:";
const H_STATUS = "Status differs:";
const H_UNLINKED = "Not linked to any booking:";
const CLOSING =
  "Open the payment in Stripe and the booking on your dashboard to see what happened. A refund missing on a booking usually means a webhook delivery failed: in Stripe, Developers › Webhooks shows failed deliveries and can resend them.";
// Not in D-09: new internal lines awaiting the owner's sign-off at the Phase 31 hand-over.
const TRUNCATED = "Stripe listed more than 500 refunds; the newest 500 were compared.";

const empty: RefundCheckReport = {
  missing: [],
  amountDiffers: [],
  totalDiffers: [],
  statusDiffers: [],
  unlinked: [],
  truncated: false,
};

const full: RefundCheckReport = {
  // 12 Oct 2026 12:05 UTC = 14:05 in Zurich (CEST, +2).
  missing: [{ reference: "VT-26-0001", amountRappen: 4000, refundId: "re_x", createdAt: "2026-10-12T12:05:00.000Z" }],
  amountDiffers: [{ reference: "VT-26-0001", stripeRappen: 4000, siteRappen: 3000, refundId: "re_x" }],
  totalDiffers: [{ reference: "VT-26-0001", bookingRappen: 4000, rowsRappen: 3000 }],
  statusDiffers: [{ reference: "VT-26-0001", stripeStatus: "failed", siteStatus: "refunded", refundId: "re_x" }],
  unlinked: [{ refundId: "re_x", amountRappen: 4000, paymentIntentId: "pi_x" }],
  truncated: false,
};

describe("renderRefundCheckEmail (Phase 31 D-09)", () => {
  it("subject counts every finding line across all sections", () => {
    expect(renderRefundCheckEmail(full).subject).toBe("Refund check: 5 Stripe refund(s) do not match a booking");
    expect(renderRefundCheckEmail({ ...empty, unlinked: full.unlinked }).subject).toBe(
      "Refund check: 1 Stripe refund(s) do not match a booking",
    );
  });

  it("text: intro, sections in D-09 order with verbatim headings and line formats, closing paragraph", () => {
    const { text } = renderRefundCheckEmail(full);
    const expected = [
      `${INTRO_1}\n${INTRO_2}`,
      `${H_MISSING}\n- VT-26-0001 · CHF 40.00 · refund re_x · 12 Oct 2026 14:05`,
      `${H_AMOUNTS}\n- VT-26-0001 · Stripe CHF 40.00 · booking CHF 30.00 · refund re_x\n- VT-26-0001 · booking refunded CHF 40.00 · refund records CHF 30.00`,
      `${H_STATUS}\n- VT-26-0001 · Stripe failed · booking refunded · refund re_x`,
      `${H_UNLINKED}\n- refund re_x · CHF 40.00 · payment pi_x`,
      CLOSING,
    ].join("\n\n");
    expect(text).toContain(expected);
    expect(text.startsWith("Vamos Taxi\n\n")).toBe(true);
    expect(text).not.toContain(TRUNCATED);
  });

  it("only non-empty sections appear", () => {
    const { text, html } = renderRefundCheckEmail({ ...empty, unlinked: full.unlinked });
    expect(text).toContain(H_UNLINKED);
    for (const h of [H_MISSING, H_AMOUNTS, H_STATUS]) {
      expect(text).not.toContain(h);
      expect(html).not.toContain(h);
    }
  });

  it("a totalDiffers line alone opens the Amounts differ section", () => {
    const { text } = renderRefundCheckEmail({ ...empty, totalDiffers: full.totalDiffers });
    expect(text).toContain(`${H_AMOUNTS}\n- VT-26-0001 · booking refunded CHF 40.00 · refund records CHF 30.00\n\n${CLOSING}`);
  });

  it("payment reads 'none' when the refund has no payment intent", () => {
    const { text } = renderRefundCheckEmail({
      ...empty,
      unlinked: [{ refundId: "re_y", amountRappen: 1250, paymentIntentId: null }],
    });
    expect(text).toContain("- refund re_y · CHF 12.50 · payment none");
  });

  it("time is Europe/Zurich, 24 h, no comma, three-letter month in winter and in September", () => {
    const winter = renderRefundCheckEmail({
      ...empty,
      missing: [{ reference: "VT-26-0002", amountRappen: 100, refundId: "re_w", createdAt: "2026-12-01T23:30:00.000Z" }],
    }).text;
    expect(winter).toContain("- VT-26-0002 · CHF 1.00 · refund re_w · 2 Dec 2026 00:30");
    const sept = renderRefundCheckEmail({
      ...empty,
      missing: [{ reference: "VT-26-0003", amountRappen: 100, refundId: "re_s", createdAt: "2026-09-12T07:05:00.000Z" }],
    }).text;
    expect(sept).toContain("- VT-26-0003 · CHF 1.00 · refund re_s · 12 Sep 2026 09:05");
  });

  it("truncated adds the 500-cap line right after the intro", () => {
    const { text, html } = renderRefundCheckEmail({ ...full, truncated: true });
    expect(text).toContain(`${INTRO_1}\n${INTRO_2}\n\n${TRUNCATED}\n\n${H_MISSING}`);
    expect(html).toContain(TRUNCATED);
  });

  it("html: English layout, every value escaped, headings and closing present", () => {
    const hostile: RefundCheckReport = {
      ...empty,
      missing: [{ reference: "VT-<26>&1", amountRappen: 4000, refundId: "re_<b>", createdAt: "2026-10-12T12:05:00.000Z" }],
      statusDiffers: [{ reference: "VT-\"2\"", stripeStatus: "<i>failed</i>", siteStatus: "refunded", refundId: "re_'q'" }],
      unlinked: [{ refundId: "re_x", amountRappen: 4000, paymentIntentId: "pi_<z>" }],
    };
    const { html } = renderRefundCheckEmail(hostile);
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain("VT-&lt;26&gt;&amp;1");
    expect(html).toContain("re_&lt;b&gt;");
    expect(html).toContain("&lt;i&gt;failed&lt;/i&gt;");
    expect(html).toContain("VT-&quot;2&quot;");
    expect(html).toContain("re_&#39;q&#39;");
    expect(html).toContain("pi_&lt;z&gt;");
    expect(html).not.toMatch(/<b>|<i>|<z>/);
    expect(html).toContain(INTRO_1.replace("'", "&#39;"));
    expect(html).toContain(H_MISSING);
    expect(html).toContain(CLOSING);
  });

  it("the report type carries no name or e-mail field", () => {
    expect(source.match(/contact_name|contactEmail|name:/g)).toBeNull();
    for (const section of Object.values(full)) {
      if (!Array.isArray(section)) continue;
      for (const row of section) {
        expect(Object.keys(row).some((k) => /name|email|mail/i.test(k))).toBe(false);
      }
    }
  });

  it("the two lines not in D-09 are marked in code", () => {
    expect(source.match(/Not in D-09: new internal line, awaiting the owner's sign-off \(Phase 31 hand-over\)/g)).toHaveLength(2);
    expect(source).toContain(INTRO_1);
  });
});

describe("renderRefundCheckDidNotRun (Phase 31 D-09)", () => {
  it("renders the approved subject and body", () => {
    const mail = renderRefundCheckDidNotRun();
    expect(mail.subject).toBe("Refund check did not run");
    const body =
      "Stripe did not answer tonight's refund check, so nothing was compared. It runs again tomorrow at the same time.";
    expect(mail.text).toContain(body);
    expect(mail.html).toContain(body.replace("'", "&#39;"));
    expect(mail.html).toContain('<html lang="en" dir="ltr">');
  });
});

describe("sendRefundCheck (Phase 31 D-09)", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "msg_check" }, error: null });
  });

  it("without a key answers ok:false and never calls Resend", async () => {
    const outcome = await sendRefundCheck({ RESEND_API_KEY: "" }, renderRefundCheckDidNotRun(), "ops@example.test");
    expect(outcome).toEqual({ ok: false, error: "RESEND_API_KEY is not bound" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the rendered mail once from noreply to the trimmed recipient", async () => {
    const mail = renderRefundCheckEmail(full);
    const outcome = await sendRefundCheck({ RESEND_API_KEY: "re_test" }, mail, " Info@Example.test ");
    expect(outcome).toEqual({ ok: true, providerMessageId: "msg_check" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload] = sendMock.mock.calls[0] as [{ from: string; to: string; subject: string; html: string; text: string }];
    expect(payload).toEqual({
      from: "Vamos Taxi <noreply@vamostaxi.site>",
      to: "info@example.test",
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  });

  it("an empty recipient answers ok:false", async () => {
    expect(await sendRefundCheck({ RESEND_API_KEY: "re_test" }, renderRefundCheckDidNotRun(), "  ")).toEqual({
      ok: false,
      error: "no ops recipient",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("maps a Resend error, a missing id or a throw to ok:false and never throws", async () => {
    const mail = renderRefundCheckDidNotRun();
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "rate limited" } });
    expect(await sendRefundCheck({ RESEND_API_KEY: "re_test" }, mail, "o@x.test")).toEqual({ ok: false, error: "rate limited" });
    sendMock.mockResolvedValueOnce({ data: {}, error: null });
    expect(await sendRefundCheck({ RESEND_API_KEY: "re_test" }, mail, "o@x.test")).toEqual({
      ok: false,
      error: "Resend returned no id",
    });
    sendMock.mockRejectedValueOnce(new Error("network"));
    expect(await sendRefundCheck({ RESEND_API_KEY: "re_test" }, mail, "o@x.test")).toEqual({ ok: false, error: "network" });
  });

  it("is exported from the package index with both renderers", () => {
    expect(typeof pkg.sendRefundCheck).toBe("function");
    expect(typeof pkg.renderRefundCheckEmail).toBe("function");
    expect(typeof pkg.renderRefundCheckDidNotRun).toBe("function");
  });
});
