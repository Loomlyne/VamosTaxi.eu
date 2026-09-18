// apps/web/lib/ops/phase-15-dc.test.ts
//
// Source-read gates for #support Save / badge / hydrate / files. No Hyperdrive.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const webRoot = join(here, "../..");
const SUPPORT_WRITER = join(repoRoot, "app/ops/OpsSupportTicket.dc.html");
const SUPPORT_PUBLIC = join(webRoot, "public/app/ops/OpsSupportTicket.dc.html");
const SIDEBAR = join(repoRoot, "app/ops/OpsSidebar.dc.html");
const LANGS = ["en", "de", "fr", "ar"] as const;
const SAVE = { en: "Save", de: "Speichern", fr: "Enregistrer", ar: "حفظ" } as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function langBlock(src: string, lang: string): string {
  const start = src.indexOf(`\n  ${lang}: {`);
  if (start < 0) throw new Error(`T.${lang} not found`);
  const open = src.indexOf("{", start);
  let end = src.length;
  for (const other of LANGS) {
    if (other === lang) continue;
    const idx = src.indexOf(`\n  ${other}: {`, open);
    if (idx > open && idx < end) end = idx;
  }
  const closeT = src.indexOf("\n};", open);
  if (closeT > open && closeT < end) end = closeT;
  return src.slice(open, end);
}

function quotedKey(block: string, key: string): string | null {
  const match = block.match(new RegExp(`${key}\\s*:\\s*(['"])([\\s\\S]*?)\\1`));
  return match?.[2] ?? null;
}

describe("phase 15 DC #support", () => {
  it("Save labels are Save / Speichern / Enregistrer / حفظ", () => {
    const html = read(SUPPORT_WRITER);
    for (const lang of LANGS) {
      expect(quotedKey(langBlock(html, lang), "saveNote")).toBe(SAVE[lang]);
    }
  });

  it("saveNote PATCHes phone + booking_ref + note; mailto/tel/wa.me stay", () => {
    const html = read(SUPPORT_WRITER);
    expect(html).toMatch(/booking_ref/);
    expect(html).toMatch(/persistTicket/);
    expect(html).toMatch(/mailto:/);
    expect(html).toMatch(/tel:/);
    expect(html).toMatch(/wa\.me/);
    expect(html).not.toMatch(/innerHTML\s*=/);
  });

  it("badge counts new + responded; hydrate on focus/visibility; no setInterval", () => {
    const html = read(SUPPORT_WRITER);
    expect(html).toMatch(/publishBadge/);
    expect(html).toMatch(/responded/);
    expect(html).toMatch(/visibilitychange/);
    expect(html).toMatch(/addEventListener\('focus'/);
    expect(html).not.toMatch(/setInterval/);
    expect(html).toMatch(/m\.files/);
    expect(html).toMatch(/STATUSES = \['new', 'open', 'replied', 'responded', 'closed'\]/);
  });

  it("public copy matches Save labels after dual-DC", () => {
    expect(existsSync(SUPPORT_PUBLIC)).toBe(true);
    const pub = read(SUPPORT_PUBLIC);
    for (const lang of LANGS) {
      expect(quotedKey(langBlock(pub, lang), "saveNote")).toBe(SAVE[lang]);
    }
  });

  it("D-12 must-nots", () => {
    const html = read(SUPPORT_WRITER);
    const sidebar = read(SIDEBAR);
    expect(html).not.toMatch(/POST \/api\/quote/);
    expect(html).not.toMatch(/vamostaxi\.eu/);
    expect(html).not.toMatch(/env\.production/);
    expect(sidebar).not.toMatch(/key:'staff'/);
  });
});
