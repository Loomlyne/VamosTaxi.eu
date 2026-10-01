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
  "refundBody",
  "dueLegacyBody",
  "whichPayment",
  "allPayments",
  "payTrip",
  "payExtra",
  "payLine",
  "partialTitle",
  "partialBody",
  "processingBody",
  "refundFullLine",
  "refundAmountLabel",
  "unitAria",
  "exactNeedsPayment",
  "errFullOnly",
  "errExceeds",
  "errInvalid",
  "errAlready",
  "errNotPaid",
  "errNothing",
  "errTestOnly",
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
    expect(dc).toMatch(/Input" type="number" min="0" max="\{\{ inputMax \}\}" size="md"/);
    expect(dc).toMatch(/inputMax: unit === 'pct' \? '100' : ''/);
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
    expect(dc).toMatch(/const paidAdmin = isAdmin && !!booking\.paid;/);
    expect(dc).toMatch(/const reviewNeeded = paidAdmin && /);
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

describe("20-10 dashboard refund screen", () => {
  it("full tier: fixed 100 %, no Decline, no editable field", () => {
    // The form block shows the Decline button and the amount Input only for the decided tier.
    expect(dc).toMatch(/sc-if value="\{\{ declineShown \}\}"[^>]*>\s*<x-import[^>]*onClick="\{\{ openDecline \}\}"/);
    expect(dc).toMatch(/sc-if value="\{\{ decidedShown \}\}"[^>]*>\s*<div data-ops-refund-pct>/);
    expect(dc).toMatch(/declineShown: reviewNeeded/);
    expect(dc).toMatch(/decidedShown: reviewNeeded/);
    expect(dc).toMatch(/const fullShown = paidAdmin && refundStatus === 'pending_ops' && fullTier;/);
    // 26.2 P1: the review tier excludes the credit tier (a cheaper class on a live trip).
    expect(dc).toMatch(/const reviewNeeded = paidAdmin && refundStatus === 'pending_ops' && !fullTier && !creditTier;/);
    expect(dc).toMatch(/if \(fullShown\) return chosen \? \{ paymentId: chosen\.id, percent: 100 \} : \{ percent: 100 \};/);
    expect(dc).toMatch(/data-ops-refund-full/);
  });

  it("the payment list is built only with two or more captured payments", () => {
    expect(dc).toMatch(/const multi = payments\.length >= 2;/);
    expect(dc).toMatch(/const payRows = multi \? \[/);
    expect(dc).toMatch(/pickerShown: multi/);
    expect(dc).toMatch(/sc-if value="\{\{ pickerShown \}\}"/);
    expect(dc).toMatch(/VamosTaxiDesignSystem_245af1\.Radio" name="refund-pay"/);
    // a payment with nothing left cannot be picked
    expect(dc).toMatch(/!\(Number\(p\.leftRappen\) > 0\)/);
  });

  it("%/CHF: one body only, an exact amount needs a payment when there are two", () => {
    expect(dc).toMatch(/VamosTaxiDesignSystem_245af1\.Tabs" items="\{\{ unitItems \}\}"/);
    expect(dc).toMatch(/if \(unit === 'chf'\) return chosen \? \{ paymentId: chosen\.id, amountRappen \} : \{ amountRappen \};/);
    expect(dc).toMatch(/return chosen \? \{ paymentId: chosen\.id, percent: Number\(percentText\) \} : \{ percent: Number\(percentText\) \};/);
    expect(dc).not.toMatch(/percent:[^}]*amountRappen:|amountRappen:[^}]*percent:/);
    expect(dc).toMatch(/const exactAllowed = !multi \|\| !!chosen;/);
    expect(dc).toMatch(/const unit = !fullShown && exactAllowed && this\.state\.refundUnit === 'chf' \? 'chf' : 'pct';/);
    expect(dc).toMatch(/unitSwitchShown: reviewNeeded && exactAllowed, exactHintShown: reviewNeeded && !exactAllowed/);
  });

  it("loads GET …/refund and reloads it after every answer", () => {
    expect(dc).toMatch(/client\.request\('GET', '\/api\/staff\/bookings\/' \+ encodeURIComponent\(key\) \+ '\/refund'\)/);
    expect(dc).toMatch(/\['pending_ops', 'processing', 'failed'\]/);
    expect(dc).toMatch(/refreshRefund\(\);/);
  });

  it("Try again posts { retry: true }; partial and stripe-failed show what is still due", () => {
    expect(dc).toMatch(/postRefund\('retry', \{ retry: true \}\)/);
    expect(dc).not.toMatch(/rappen: owed|\{ rappen:/);
    expect(dc).toMatch(/code === 'refund-partial' \|\| code === 'stripe-failed'/);
    expect(dc).toMatch(/t\.partialTitle/);
    expect(dc).toMatch(/figures\.unrecorded \? t\.processingBody/);
  });

  it("named refusals read as an inline message, amounts come from VamosLocale.money", () => {
    for (const code of ["full-refund-only", "refund-exceeds-remaining", "invalid-amount", "already-refunded", "nothing-to-retry"]) {
      expect(dc).toContain(`'${code}'`);
    }
    expect(dc).toMatch(/sc-if value="\{\{ refundErrorShown \}\}"/);
    expect(dc).toMatch(/window\.VamosLocale\.money\(\(n \/ 100\)\.toFixed\(2\), 'CHF'\)/);
  });

  it("Refund due for the full tier, old rows and (26.2 P1) a cheaper class; success alert on refunded", () => {
    expect(dc).toMatch(/\(booking\.status === 'cancelled' && \(\(refundStatus === 'pending_ops' && fullTier\) \|\| legacyDue\)\)/);
    expect(dc).toMatch(/\(refundStatus === 'pending_ops' && creditTier && !creditShown\)/);
    expect(dc).toMatch(/isRefunded: booking\.status === 'refunded' \|\| refundStatus === 'refunded'/);
    // 26.2 P6 D21: a cheaper trip change names the trip; a class change keeps the class line.
    expect(dc).toMatch(/tRefundBody: creditTier \? \(tripCredit \? t\.tripCreditBody : t\.classCreditBody\) : \(fullTier \? t\.refundBody : t\.dueLegacyBody\)/);
  });

  it("26.2 P1 credit tier: exactly what is due, one press, no percentage field, no Decline", () => {
    expect(dc).toMatch(/const creditTier = rd \? rd\.creditTier === true :/);
    expect(dc).toMatch(/const creditShown = paidAdmin && refundStatus === 'pending_ops' && creditTier;/);
    expect(dc).toMatch(/if \(creditShown\) return chosen \? \{ paymentId: chosen\.id, amountRappen: Math\.min\(creditDue, Number\(chosen\.leftRappen\) \|\| 0\) \} : \{\};/);
    expect(dc).toMatch(/const refundFormShown = \(fullShown \|\| reviewNeeded \|\| creditShown\) && !refundFailedShown;/);
    expect(dc).toMatch(/sc-if value="\{\{ creditShown \}\}"/);
    expect(dc).not.toMatch(/declineShown: reviewNeeded \|\| creditShown/);
  });

  it("the new English copy is the approved wording; German has no ß", () => {
    const { en, de } = tBlocks(dc);
    expect(en).toContain("Cancelled more than 24 hours before pickup. The customer was told they get a full refund. Nothing is sent until you confirm.");
    expect(en).toContain("{a} refunded. {b} still due.");
    expect(en).toContain("Which payment?");
    expect(de).not.toMatch(/ß/);
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
