// apps/web/lib/ops/ops-class-change-dc.test.ts
//
// 26.2 P1 source pins for the dashboard booking page (app/ops/OpsDetail.dc.html): the class list,
// the price box, the confirm step, the waiting state. No DOM — reads the DC source, like the other
// OpsDetail pins. The pictures for the owner are in .planning/quick/260930-p1-class-change-reprice/screens/.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const dc = readFileSync(join(repoRoot, "app/ops/OpsDetail.dc.html"), "utf8");

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(-1);
  return src.slice(a, b);
}

describe("Edit: the class is a list of today's classes, not a free text or the car", () => {
  it("the field is the design-system Select bound to the preview's classes", () => {
    expect(dc).toMatch(/VamosTaxiDesignSystem_245af1\.Select" size="md" label="\{\{ tVehicleClass \}\}" options="\{\{ classOptions \}\}" value="\{\{ classValue \}\}"/);
    expect(dc).not.toMatch(/Input" size="md" label="\{\{ tVehicleClass \}\}"/);
  });

  it("is pre-filled by the preview with the booking's class, never the assigned car", () => {
    const snap = between(dc, "snapshotEdit = (booking) => ({", "});");
    expect(snap).toMatch(/klass: '',/);
    expect(snap).not.toMatch(/booking\.vehicle/);
    expect(dc).toMatch(/'\/change\/preview', \{\}\)/);
    expect(dc).toMatch(/klass: \(s\.edit && s\.edit\.klass\) \|\| data\.currentClass \|\| ''/);
  });

  it("the price box shows class now, new class, paid so far, new total and the difference", () => {
    expect(dc).toMatch(/sc-if value="\{\{ classBoxShown \}\}"/);
    expect(dc).toMatch(/PriceSummary" lines="\{\{ classBoxLines \}\}" total="\{\{ classBoxTotal \}\}"/);
    for (const key of ["classRowNow", "classRowNew", "classPaidSoFar", "classNewTotal"]) {
      expect(dc).toMatch(new RegExp(`label: t\\.${key}`));
    }
    expect(dc).toMatch(/classDiff > 0 \? t\.classDiffToPay : \(classDiff < 0 \? t\.classDiffRefund : t\.classDiffNone\)/);
  });
});

describe("Saving: nothing is written before the confirm step; the class never rides on the PATCH", () => {
  const save = between(dc, "      saveEdit: () => {", "      markRefund:");

  it("a changed class opens the confirm step first", () => {
    expect(save).toMatch(/if \(classChanged && !this\._classConfirmed\)/);
    expect(save).toMatch(/this\.setState\(\{ classConfirmOpen: true \}\)/);
    const patch = between(save, "client.request('PATCH'", "}).then");
    expect(patch).not.toMatch(/klass/);
  });

  it("the class goes to …/change with the slug and the two figures shown, nothing else", () => {
    const post = between(dc, "const postClassChange = () => {", "    const vals = {");
    expect(post).toMatch(/'\/change', \{\n\s+klass: pickedClass\.slug, expectTotalRappen: pickedClass\.newTotalRappen, expectPaidRappen: cpData\.paidRappen,\n\s+\}\)/);
    expect(post).not.toMatch(/edit-accept/);
  });

  it("the confirm step is a design-system Dialog with Keep / Change and the driver line when one is assigned", () => {
    const dialog = between(dc, '<sc-if value="{{ classConfirmOpen }}"', "</sc-if>\n\n<sc-if value=\"{{ cancelOpen }}\"");
    expect(dialog).toMatch(/Dialog" open="\{\{ yes \}\}" title="\{\{ tClassConfirmTitle \}\}"/);
    expect(dialog).toMatch(/onClick="\{\{ closeClassConfirm \}\}"/);
    expect(dialog).toMatch(/onClick="\{\{ confirmClassChange \}\}"/);
    expect(dialog).toMatch(/sc-if value="\{\{ classDriverOff \}\}"/);
  });
});

describe("Waiting for the difference (D1, D4) and the customer's own requests", () => {
  it("your class change waiting for the payment shows its own line, without Accept / Refuse", () => {
    expect(dc).toMatch(/const pendingClassWait = !!booking\.pendingEditId && booking\.pendingEditActor === 'staff' && !!booking\.pendingEditClass;/);
    const block = between(dc, '<sc-if value="{{ hasPendingEdit }}"', "<sc-if value=\"{{ hasFlightBanner }}\"");
    const answer = between(block, '<sc-if value="{{ pendingNeedsAnswer }}"', "</sc-if>");
    expect(answer).toMatch(/acceptPending/);
    expect(answer).toMatch(/refusePending/);
    const wait = between(block, '<sc-if value="{{ pendingClassWait }}"', "</sc-if>");
    expect(wait).not.toMatch(/acceptPending|refusePending/);
    expect(wait).toMatch(/classWaitingLine/);
    expect(block).toMatch(/hasExtraPay/);
  });

  it("the ops data store keeps the waiting class, the difference and until when", () => {
    const data = readFileSync(join(repoRoot, "app/vamos-ops-data.js"), "utf8");
    expect(data).toMatch(/pendingEditClass: str\(b\.pendingEditClass\)/);
    expect(data).toMatch(/pendingEditDifferenceRappen: num\(b\.pendingEditDifferenceRappen, 0\)/);
    expect(data).toMatch(/pendingEditPayUntil: str\(b\.pendingEditPayUntil\)/);
  });
});

describe("design laws on the new parts", () => {
  it("the class box is a hairline card from tokens: no glow, no tinted yellow", () => {
    const rule = dc.match(/\[data-ops-class-box\]\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/border:1px solid var\(--vt-border-subtle\)/);
    expect(rule).not.toMatch(/shadow|yellow|glow/);
  });
});

describe("Withdraw change (owner sign-off 2026-10-01)", () => {
  it("is in the Actions menu only while your dearer change waits for the payment", () => {
    expect(dc).toMatch(/pendingClassWait \? \{ value: 'withdraw', label: t\.withdrawChange, icon: 'x' \} : null,/);
    const decl = dc.indexOf("const pendingClassWait =");
    expect(decl).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(dc.indexOf("const actionItems = ["));
  });

  it("asks first, then POSTs …/change/withdraw with an empty body", () => {
    expect(dc).toMatch(/if \(v === 'withdraw'\) \{ if \(pendingClassWait\) this\.setState\(\{ withdrawOpen: true \}\); return; \}/);
    const dialog = between(dc, '<sc-if value="{{ withdrawOpen }}"', "</sc-if>");
    expect(dialog).toMatch(/Dialog" open="\{\{ yes \}\}" title="\{\{ tWithdrawTitle \}\}"/);
    expect(dialog).toMatch(/onClick="\{\{ confirmWithdraw \}\}"/);
    expect(dc).toMatch(/'\/change\/withdraw', \{\}\)/);
  });

  it("each answer has its notice: withdrawn, she has just paid, Stripe did not answer, nothing waits", () => {
    const post = between(dc, "confirmWithdraw: () => {", "      },\n");
    for (const key of ["withdrawDone", "withdrawPaid", "withdrawStripe", "withdrawNothing"]) {
      expect(post).toMatch(new RegExp(`t\\.${key}`));
    }
  });
});
