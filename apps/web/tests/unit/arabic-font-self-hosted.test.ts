// Phase 20 F17: Arabic type is served from our own host, never from Google.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../..");
const FONT_DIR = path.join(ROOT, "assets/fonts/noto-sans-arabic");
const SKIP = new Set(["node_modules", ".next", ".open-next", "public", "tests", ".git", "dist"]);

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|tsx|css|html|json)$/.test(name)) out.push(p);
  }
  return out;
}

describe("F17 Arabic font self-hosted", () => {
  it("no source file under app/ or apps/web names a Google font host", () => {
    const files = [...walk(path.join(ROOT, "app"), []), ...walk(path.join(ROOT, "apps/web"), [])];
    const hits = files.filter((f) => /fonts\.googleapis|fonts\.gstatic/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("ships four woff2 weights and the OFL licence", () => {
    for (const w of [400, 500, 600, 700]) {
      expect(existsSync(path.join(FONT_DIR, `noto-sans-arabic-arabic-${w}-normal.woff2`))).toBe(true);
    }
    expect(readFileSync(path.join(FONT_DIR, "OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE");
  });

  it("the stylesheet declares the four weights with swap", () => {
    const css = readFileSync(path.join(FONT_DIR, "noto-sans-arabic.css"), "utf8");
    for (const w of [400, 500, 600, 700]) {
      expect(css).toContain(`font-weight: ${w};`);
      expect(css).toContain(`url(./noto-sans-arabic-arabic-${w}-normal.woff2)`);
    }
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).toContain("font-display: swap");
    expect(css).toContain("unicode-range: U+0600-06FF");
  });

  it("vamos-locale.js loads the same-origin stylesheet", () => {
    const js = readFileSync(path.join(ROOT, "app/vamos-locale.js"), "utf8");
    expect(js).toContain("'/assets/fonts/noto-sans-arabic/noto-sans-arabic.css'");
  });

  it("the CSP names no Google font host", () => {
    const h = readFileSync(path.join(ROOT, "apps/web/lib/security/headers.ts"), "utf8");
    expect(h).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(h).not.toMatch(/font-src[^;]*google/);
  });
});
