// apps/web/lib/ops/ops-pricing-tabs.test.ts
//
// Wave 0 (18-01): OpsPricing four tabs, no History, no Preview, no region
// table (D-11 D-12 D-17 D-25). Dual-DC byte-equal. May stay red until 18-03.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");

function paneKeys(html: string): string[] {
  const start = html.indexOf("const PANES = [");
  expect(start).toBeGreaterThanOrEqual(0);
  const open = html.indexOf("[", start);
  const close = html.indexOf("];", open);
  const body = html.slice(open, close);
  return [...body.matchAll(/key:'(\w+)'/g)].map((m) => m[1]!);
}

describe("OpsPricing tabs (D-11 D-12 D-17 D-25)", () => {
  it("both OpsPricing.dc.html copies exist and are byte-equal", () => {
    expect(existsSync(CANONICAL)).toBe(true);
    expect(existsSync(PUBLIC_COPY)).toBe(true);
    expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(
      readFileSync(CANONICAL, "utf8"),
    );
  });

  it("PANES has exactly four keys: routes, distance, surcharges, coupons", () => {
    const keys = paneKeys(readFileSync(CANONICAL, "utf8"));
    expect(keys).toEqual(["routes", "distance", "surcharges", "coupons"]);
  });

  it("does not contain History / Preview / region / night-weekend-holiday kinds", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).not.toContain("tabHistory");
    expect(html).not.toContain("runPreview");
    expect(html).not.toContain("testUnpaid");
    expect(html).not.toContain("regionRows");
    expect(html).not.toContain("saveRegion");
    expect(html).not.toMatch(/kind:\s*['"]night['"]/);
    expect(html).not.toMatch(/kind:\s*['"]weekend['"]/);
    expect(html).not.toMatch(/kind:\s*['"]holiday['"]/);
    expect(html).toContain("Save VAT");
    expect(html).toContain("Draft — not public until Publish");
    expect(html).toContain("Live book");
    expect(html).toContain("Fix this");
    expect(html).toContain("city to city");
    expect(html).toContain("canton to canton");
    expect(html).toContain("photoKind:'class'");
    expect(html).toContain("SURCHARGE_TYPES");
    expect(html).not.toContain("ruleRows");
  });

  it("refetches completeness before opening Publish so a filled start fare is not a stale gap", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).toMatch(/openPublish = \(\) => \{[\s\S]*loadDraft\(\)/);
    expect(html).toContain("moneyOrDash");
    expect(html).toContain("chfOf");
  });

  it("Fixed routes columns and fields follow rated classes, not a four-class ladder (D-29)", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).not.toContain("CLASS_KEYS");
    expect(html).toContain("uniqueByClass");
    expect(html).toContain("byClassOrder");
    expect(html).toMatch(/kind:'photo'/);
    expect(html).toMatch(/kind:'order'/);
    expect(html).not.toMatch(/kind:'grip'/);
    expect(html).not.toMatch(/arrangeClass/);
    expect(html).toMatch(/onReorder="\{\{ reorderDistance \}\}"/);
    expect(html).toMatch(/key:'hideFromPublic', header: t.hidePublic, kind:'bool', toggle:true/);
    expect(html).toContain("ratedClasses");
    expect(html).not.toMatch(/key:'economy', header: t.colEconomy/);
    expect(html).not.toMatch(/key:'van', header: t.colVan/);
  });

  it("D-08/D-09/D-13: Distance rules labels the fee for what it does and drops the dead city-price input", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).not.toMatch(/key:'cityPrice'/);
    expect(html).toContain("Airport pickup fee (added to start)");
    expect(html).toContain("Flughafen-Abholgebühr (zum Start addiert)");
    expect(html).toContain("Frais aéroport (ajoutés au départ)");
    expect(html).toContain("رسوم الاستقبال من المطار (تُضاف إلى البداية)");
    expect(html).toContain(
      "One pair covers both directions. Click a row and it goes live.",
    );
    expect(html).toContain("Start, per kilometre, airport pickup fee");
  });

  it("class order is up and down arrows that save the same sort_order the grip was supposed to", () => {
    const html = readFileSync(CANONICAL, "utf8");
    const table = readFileSync(join(repoRoot, "app/ops/OpsTable.dc.html"), "utf8");
    const orderAt = html.indexOf("kind:'order'");
    const photoAt = html.indexOf("{ key:'photo', header: t.colPhoto");
    const classAt = html.indexOf("{ key:'klass', header: t.colClass");
    expect(orderAt).toBeGreaterThan(-1);
    expect(photoAt).toBeGreaterThan(orderAt);
    expect(classAt).toBeGreaterThan(photoAt);
    expect(html).toMatch(/moveClassUp:'Move class up', moveClassDown:'Move class down'/);
    expect(html).toMatch(/moveClassUp:'Klasse nach oben', moveClassDown:'Klasse nach unten'/);
    expect(html).toMatch(/moveClassUp:'Monter la classe', moveClassDown:'Descendre la classe'/);
    expect(html).toMatch(/moveClassUp:'تحريك الفئة لأعلى', moveClassDown:'تحريك الفئة لأسفل'/);
    expect(html).not.toMatch(/Drag to arrange|Ziehen, um Klassen|Glisser pour ordonner|اسحب لترتيب/);
    expect(html).toMatch(/upLabel: t.moveClassUp, downLabel: t.moveClassDown/);
    expect(table).toMatch(/data-vt-order-pair/);
    expect(table).toMatch(/chevron-up/);
    expect(table).toMatch(/chevron-down/);
    expect(table).toMatch(/upOff = index <= 0/);
    expect(table).toMatch(/downOff = index < 0 \|\| index >= last/);
    expect(table).toMatch(/next\[from\] = next\[to\]/);
    expect(table).not.toMatch(/data-vt-grip|grip-vertical|dragstart/);
    const orderCss = (table.match(/\[data-vt-order[^\]]*\]\{[^}]+\}/g) || []).join("");
    expect(orderCss).not.toMatch(/box-shadow|glow|#[0-9a-fA-F]{3,8}/);
    expect(orderCss).toMatch(/var\(--vt-/);
  });

  it("surcharge overlay is name and price only, always checkout extra, and merges coupon value with % / CHF", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).not.toMatch(/key:'type', label:t.surchargeType, editor:'select'/);
    expect(html).not.toMatch(/editor:'iconGrid'/);
    expect(html).not.toMatch(/key:'icon'/);
    expect(html).not.toMatch(/EXTRA_ICONS/);
    expect(html).not.toMatch(/does not stay as CHF 0/);
    expect(html).not.toMatch(/Delete and Publish removes/);
    expect(html).toMatch(/type: 'checkout_extra'/);
    expect(html).toMatch(/editor:'amountKind'/);
    expect(html).not.toMatch(/key:'kind', label:t.fKind, editor:'select'/);
    expect(html).toMatch(/vatSavedBps/);
    expect(html).toMatch(/vatSaveOff/);
    expect(html).toMatch(/minDate:'today'/);
    expect(html).toMatch(/key:'hideFromPublic', header: t.hidePublic, kind:'bool', toggle:true/);
    expect(html).toMatch(/key:'to', label:t.colTo, required:true, icon:'map-pin', half:true/);
    expect(html).toMatch(/fill="1"/);
    expect(html).toMatch(/\/api\/staff\/coupons\/redemptions/);
    expect(html).not.toMatch(/hNote:/);
    expect(html).not.toMatch(/key:'note', label:t\.fNote/);
    expect(html).toMatch(/history-kind="uses"/);
    expect(html).toMatch(/useBefore:'Before coupon'/);
    expect(html).toMatch(/useBefore:'Vor dem Gutschein'/);
    expect(html).toMatch(/useBefore:'Avant le code'/);
    expect(html).toMatch(/useBefore:'قبل القسيمة'/);
    expect(html).not.toMatch(/key:'active', label:t.fActive, editor:'switch'/);
    expect(html).not.toMatch(/key:'validFrom'/);
    expect(html).toMatch(/key:'expires', label:t.fExpires, editor:'date'/);
    expect(html).toMatch(/couponBlank: \(\) => Object.assign\(\{[^}]*active:true/);
    expect(html).toMatch(/key:'capStatus', header:t.fActive, kind:'mark'/);
    expect(html).toMatch(/usedUp:'Used up'/);
    expect(html).toMatch(/usedUp:'Aufgebraucht'/);
    expect(html).toMatch(/usedUp:'Épuisé'/);
    expect(html).toMatch(/usedUp:'مستنفد'/);
    expect(html).toMatch(/cap != null && cap >= 1 && Number.isFinite\(used\) && used >= cap/);
    expect(html).not.toMatch(/used === 10|limit === 10|uses === 10/);
    expect(html).not.toMatch(/key:'live', header: t.colLive, width:'92px'/);
    expect(html).toContain("live: { label:t.live, bg:'var(--vt-charcoal-900)', fg:'var(--vt-accent)' }");
    const statusFn = html.match(/couponCapStatus\(row\) \{([\s\S]*?)\n  \}/);
    expect(statusFn).not.toBeNull();
    const couponCapStatus = new Function("row", statusFn?.[1] ?? "") as (row: {
      active?: boolean;
      uses?: number;
      cap?: number | null;
    }) => string;
    expect(couponCapStatus({ active: true, uses: 10, cap: 10 })).toBe("used");
    expect(couponCapStatus({ active: true, uses: 10, cap: 10 })).not.toBe("live");
    expect(couponCapStatus({ active: true, uses: 9, cap: 10 })).toBe("live");
    expect(couponCapStatus({ active: true, uses: 3, cap: 3 })).toBe("used");
    expect(couponCapStatus({ active: true, uses: 5, cap: null })).toBe("live");
    expect(couponCapStatus({ active: false, uses: 0, cap: 10 })).toBe("paused");
    expect(html).toMatch(/couponUsesTitle/);
    expect(html).toMatch(/couponFields: \[[\s\S]*?key:'code'[\s\S]*?key:'value'[\s\S]*?key:'limit'[\s\S]*?half:true[\s\S]*?key:'expires'[\s\S]*?half:true/);
    expect(html).not.toMatch(/key:'value'[\s\S]*?half:true[\s\S]*?key:'limit'/);
    expect(html).toMatch(/key:'limit', label:t.fLimit, editor:'number', min:1/);
  });
});
