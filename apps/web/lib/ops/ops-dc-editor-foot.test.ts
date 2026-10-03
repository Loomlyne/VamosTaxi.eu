// apps/web/lib/ops/ops-dc-editor-foot.test.ts
//
// Quick 260930-dash-design, owner decision 2026-10-01 (question form): "fix the buttons on the
// overlay" = the editor dialog of the shared table editor (app/ops/OpsTable.dc.html), first seen
// on Edit chauffeur. He chose "One row at the bottom":
//   - wider than 680 px: Delete as a small red text button at the start; Cancel and Save at the
//     end, same height, Save primary;
//   - 680 px and narrower: Save full width on top, Cancel full width under it, Delete as a red
//     text button at the very bottom, centred;
//   - RTL mirrors through logical properties; touch targets 44 px; kit Button variants only; the
//     danger colour token for Delete, no glow, no tinted fill.
// Every editor dialog built on OpsTable gets the same footer.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const table = readFileSync(join(repoRoot, "app/ops/OpsTable.dc.html"), "utf8");

/** The editor footer's markup: from `<div data-vt-editor-foot>` to its closing `</div>`. */
function footMarkup(): string {
  const start = table.indexOf("<div data-vt-editor-foot");
  if (start < 0) throw new Error("no editor footer");
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (let m = re.exec(table); m; m = re.exec(table)) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return table.slice(start, m.index + m[0].length);
  }
  throw new Error("editor footer not closed");
}
/** The page's own <style> block (the first one, before the markup). */
function styleBlock(): string {
  const m = table.match(/<style>([\s\S]*?)<\/style>/);
  if (!m?.[1]) throw new Error("no style");
  return m[1];
}
/** Every @media block for this query, braces matched, joined. */
function mediaBlocks(src: string, query: string): string {
  const out: string[] = [];
  const head = `@media ${query}{`;
  let at = src.indexOf(head);
  while (at >= 0) {
    let depth = 1;
    let i = at + head.length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    out.push(src.slice(at + head.length, i - 1));
    at = src.indexOf(head, i);
  }
  return out.join("\n");
}
/** Rules outside any @media block. */
function baseRules(src: string): string {
  return src.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
}
function rule(src: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = src.match(new RegExp(`(?:^|\\})\\s*${esc}\\{([^}]*)\\}`, "m"));
  return m?.[1] ?? "";
}
const buttons = (html: string) => html.match(/<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1\.Button"[^>]*>[^<]*<\/x-import>/g) ?? [];

describe("editor dialog footer (OpsTable): one row at the bottom", () => {
  it("renders Delete, then Cancel and Save, in two groups — kit Buttons, 44 px", () => {
    const foot = footMarkup();
    const del = foot.indexOf("<span data-vt-foot-del");
    const main = foot.indexOf("<span data-vt-foot-main");
    expect(del, "delete group").toBeGreaterThan(0);
    expect(main, "cancel + save group").toBeGreaterThan(del);
    const all = buttons(foot);
    expect(all).toHaveLength(3);
    const [d, c, s] = all as [string, string, string];
    expect(d).toContain('onClick="{{ askDeleteCurrent }}"');
    expect(d).toContain(">Delete<");
    // A text button: no icon (it also keeps the French row on one line in the 512 px footer).
    expect(d).not.toContain("icon=");
    expect(c).toContain('onClick="{{ requestClose }}"');
    expect(c).toContain(">Cancel<");
    expect(s).toContain('onClick="{{ save }}"');
    expect(s).toContain(">{{ saveLabel }}<");
    // Kit variants only (the kit has primary, secondary, ghost, light, danger — no "outline").
    expect(d).toContain('variant="ghost"');
    expect(c).toContain('variant="ghost"');
    expect(s).toContain('variant="primary"');
    for (const b of all) expect(b, "44 px touch target").toContain('size="md"');
    // Delete still hides for a new row; Save still follows saveOff.
    expect(foot).toMatch(/<span data-vt-foot-del="1" style="display:\{\{ deleteShow \}\}">/);
    expect(s).toContain('disabled="{{ saveOff }}"');
  });

  it("desktop and tablet: Delete at the start, Cancel and Save together at the end, same height", () => {
    const base = baseRules(styleBlock());
    const foot = rule(base, "[data-vt-editor-foot]");
    expect(foot).toMatch(/display:flex/);
    expect(foot).toMatch(/align-items:center/);
    expect(foot).toMatch(/padding:18px 24px var\(--vt-space-6\)/);
    expect(rule(base, "[data-vt-foot-main]")).toMatch(/margin-inline-start:auto/);
    expect(rule(base, "[data-vt-foot-main]")).toMatch(/display:flex/);
    expect(rule(base, "[data-vt-foot-main]")).toMatch(/align-items:center/);
  });

  it("Delete is a red text button: danger token, no fill, no border, no glow", () => {
    const base = baseRules(styleBlock());
    const del = rule(base, "[data-vt-foot-del] .vt-btn");
    expect(del).toMatch(/color:var\(--vt-danger\)/);
    expect(del).toMatch(/background:transparent/);
    expect(del).toMatch(/border-color:transparent/);
    const hover = rule(base, "[data-vt-foot-del] .vt-btn.vt-btn--ghost:hover:not([disabled])");
    expect(hover).toMatch(/color:var\(--vt-danger\)/);
    expect(hover).toMatch(/border-color:transparent/);
    const css = styleBlock();
    const mine = css.split("\n").filter((l) => l.includes("data-vt-foot-")).join("\n");
    expect(mine).not.toMatch(/--vt-danger-tint|--vt-shadow-accent|box-shadow|--vt-yellow-/);
    // RTL mirrors: logical properties only.
    expect(mine).not.toMatch(/(^|[;{])\s*(margin|padding)-(left|right)\s*:|(^|[;{])\s*(left|right)\s*:|text-align:(left|right)/);
  });

  it("680 px and narrower: Save full width on top, Cancel under it, Delete centred at the very bottom", () => {
    const phone = mediaBlocks(styleBlock(), "(max-width:680px)");
    expect(rule(phone, "[data-vt-editor-foot]")).toMatch(/flex-direction:column/);
    expect(rule(phone, "[data-vt-editor-foot]")).toMatch(/align-items:stretch/);
    const main = rule(phone, "[data-vt-foot-main]");
    expect(main).toMatch(/flex-direction:column-reverse/);
    expect(main).toMatch(/margin-inline-start:0/);
    expect(rule(phone, "[data-vt-foot-main] .vt-btn")).toMatch(/width:100%/);
    const del = rule(phone, "[data-vt-foot-del]");
    expect(del).toMatch(/order:2/);
    expect(del).toMatch(/align-self:center/);
  });

  it("the old footer is gone: no unstyled 'outline' Cancel, no inline wrap span", () => {
    const foot = footMarkup();
    expect(foot).not.toContain('variant="outline"');
    expect(foot).not.toContain('style="margin-inline-start:auto;display:flex;flex-wrap:wrap;gap:10px"');
  });
});
