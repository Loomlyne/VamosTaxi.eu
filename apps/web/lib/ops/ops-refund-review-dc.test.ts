// apps/web/lib/ops/ops-refund-review-dc.test.ts
//
// 26.1-18 source pins for the ops refund review panel (UI-SPEC §4, D-07, D-16b,
// D-24, D-25, D-25a). No Hyperdrive, no DOM — reads the DC source.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const dc = read("app/ops/OpsDetail.dc.html");

function tBlocks(src: string): Record<"en" | "de" | "fr" | "ar", string> {
  const start = src.indexOf("const T = {");
  const end = src.indexOf("class Component extends DCLogic", start);
  const body = src.slice(start, end);
  const at = (lang: string) => body.search(new RegExp(`\\n\\s{2}${lang}: \\{`));
  const en = at("en");
  const de = at("de");
  const fr = at("fr");
  const ar = at("ar");
  return {
    en: body.slice(en, de),
    de: body.slice(de, fr),
    fr: body.slice(fr, ar),
    ar: body.slice(ar),
  };
}

const KEYS = [
  "reviewTitle",
  "reviewBody",
  "percentPlaceholder",
  "confirmRefund",
  "declineRefund",
  "declineConfirmTitle",
  "declineConfirmBody",
  "keepReviewing",
  "requestedTitle",
  "requestedBody",
  "acceptRefund",
  "rejectRefund",
  "rejectConfirmTitle",
  "rejectConfirmBody",
  "disputeTitle",
  "disputeManage",
  "disputeNeedsResponse",
  "disputeUnderReview",
  "disputeWon",
  "disputeLost",
  "refundFailedTitle",
  "refundFailedBody",
  "tryAgain",
] as const;

describe("OpsDetail refund review panel (UI-SPEC §4)", () => {
  it("carries every new key in en, de, fr and ar", () => {
    const blocks = tBlocks(dc);
    for (const lang of ["en", "de", "fr", "ar"] as const) {
      for (const key of KEYS) {
        expect(blocks[lang], `${lang}.${key}`).toMatch(new RegExp(`\\b${key}:'`));
      }
    }
  });

  it("uses the approved English copy once", () => {
    expect(dc.split("Refund review needed").length - 1).toBe(1);
    expect(dc).toContain("Cancelled inside 24 hours of pickup. Set the percentage to refund.");
    expect(dc).toContain("Decline this refund?");
    expect(dc).toContain("stays charged in full — the customer gets nothing back.");
    expect(dc).toContain("Asked after the trip. Accept or reject the refund.");
    expect(dc).toContain("Reject this refund?");
    expect(dc).toContain("The customer is told no money will be returned for {ref}.");
    expect(dc).toContain("Manage in the Stripe dashboard.");
    expect(dc).toContain("Stripe did not accept the refund. You can try again.");
    expect(dc).toContain("keepReviewing:'Keep reviewing'");
  });

  it("German uses ss, never ß, in the new keys", () => {
    const de = tBlocks(dc).de;
    for (const key of KEYS) {
      const m = de.match(new RegExp(`\\b${key}:'([^']*)'`));
      expect(m?.[1] ?? "", key).not.toContain("ß");
    }
  });

  it("review states are info tone; dispute and failure are danger tone", () => {
    expect(dc).toMatch(/Alert" tone="info" title="\{\{ tReviewTitle \}\}"/);
    expect(dc).toMatch(/Alert" tone="info" title="\{\{ tRequestedTitle \}\}"/);
    expect(dc).toMatch(/Alert" tone="danger" title="\{\{ tDisputeTitle \}\}"/);
    expect(dc).toMatch(/Alert" tone="danger" title="\{\{ tRefundFailedTitle \}\}"/);
    expect(dc).not.toMatch(/tone="accent"/);
    expect(dc).not.toMatch(/tone="warning"/);
  });

  it("keeps the no-glow and input-focus laws", () => {
    expect(dc).toMatch(/--vt-shadow-accent:none/);
    expect(dc).toMatch(/\.vt-input--focus\{box-shadow:none\}/);
  });

  it("percentage field starts empty with 0–100 bounds and gates Confirm refund", () => {
    expect(dc).toMatch(/Input" type="number" min="0" max="100" size="md"/);
    expect(dc).toMatch(/percentText: ''/);
    expect(dc).toMatch(/percentValid = \/\^\\d\{1,3\}\$\/\.test\(percentText\)/);
    expect(dc).toMatch(/disabled="\{\{ confirmDisabled \}\}"/);
  });

  it("decline and reject sit behind sm confirm dialogs with Keep reviewing focused", () => {
    expect(dc).toMatch(/Dialog" open="\{\{ yes \}\}" title="\{\{ tDeclineConfirmTitle \}\}" size="sm"/);
    expect(dc).toMatch(/Dialog" open="\{\{ yes \}\}" title="\{\{ tRejectConfirmTitle \}\}" size="sm"/);
    const keep = dc.match(/variant="secondary" autoFocus="\{\{ yes \}\}" onClick="\{\{ closeDecide \}\}"/g) ?? [];
    expect(keep.length).toBe(2);
    expect(dc).not.toMatch(/closeDecide \}\}"[^>]*>\{\{ tCancel \}\}/);
  });

  it("calls the admin refund routes with percent, postTrip and decision bodies", () => {
    expect(dc).toMatch(/'\/refund-decision'/);
    expect(dc).toMatch(/\{ decision: kind \}/);
    expect(dc).toMatch(/\{ percent: Number\(percentText\) \}/);
    expect(dc).toMatch(/\{ postTrip: true \}/);
  });

  it("shows refund controls to the admin only (D-16b)", () => {
    expect(dc).toMatch(/const isAdmin = role === 'admin';/);
    expect(dc).toMatch(/const canFullRefund = isAdmin && /);
    expect(dc).toMatch(/const reviewNeeded = isAdmin && /);
    expect(dc).toMatch(/const postTripEligible = isAdmin && /);
    // 260930-dash-design: Refund is an item of the Actions menu, still admin-only through canFullRefund.
    expect(dc).toMatch(/canFullRefund \|\| postTripEligible \? \{ value: 'refund'/);
    expect(dc).not.toMatch(/sc-if value="\{\{ isCancelled \}\}"[^>]*>\s*<x-import[^>]*onClick="\{\{ markRefund \}\}"/);
  });

  it("maps Stripe dispute statuses to four status words, status only", () => {
    expect(dc).toMatch(/needs_response/);
    expect(dc).toMatch(/under_review/);
    expect(dc).toMatch(/'won'/);
    expect(dc).toMatch(/'lost'/);
    expect(dc).not.toMatch(/dispute\.evidence/);
  });

  it("puts the reference in vt-dir-keep inside confirm bodies", () => {
    const keeps = dc.match(/<span class="vt-dir-keep" data-vt-no-i18n="1">\{\{ decideRef \}\}<\/span>/g) ?? [];
    expect(keeps.length).toBe(2);
  });
});

describe("ops data passes refund facts through to the DC", () => {
  it("cleanBooking keeps refundStatus, refundOwedRappen, capturedRappen, tripPassed, dispute", () => {
    const data = read("app/vamos-ops-data.js");
    expect(data).toMatch(/refundStatus: str\(b\.refundStatus\) \|\| "none"/);
    expect(data).toMatch(/refundOwedRappen: b\.refundOwedRappen == null/);
    expect(data).toMatch(/capturedRappen: num\(b\.capturedRappen, 0\)/);
    expect(data).toMatch(/tripPassed: b\.tripPassed === true/);
    expect(data).toMatch(/dispute: b\.dispute && typeof b\.dispute === "object"/);
  });
});
