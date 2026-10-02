// apps/web/lib/checkout/phase-26-4-laws.test.ts
//
// Plan 26.4-10: the four platform laws, held as a static test over the files phase 26.4 added
// or changed. Files are read as text; comments are removed first so prose that names a banned
// thing does not fail the test. Test files and screenshots are never scanned.
//
//   Law 01  no glow: `--vt-shadow-accent` is only ever `none`; no yellow/accent box-shadow
//   Law 02  no tinted yellow: no --vt-yellow-50/100/200/300/600/700, no tone="accent",
//           no Badge tone="warning", no --vt-warning in the booking bar or sheet
//   Law 03  no "ß" in German strings; BookingBar/BookingSheet carry no string table of their own
//           (strings live in app/vamos-i18n-dict.js) and mark place names and captions with
//           data-vt-no-i18n, the attribute app/vamos-locale.js honours (never data-i18n-skip)
//   Law 04  no invented CHF figure in markup (CHF 000 is the labelled gap)

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const rel = (f: string) => relative(REPO, f);

/** Drops block, HTML and // line comments so prose cannot trip a rule. */
function stripComments(file: string, text: string): string {
  if (file.endsWith(".json")) return text;
  let out = text.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  return out
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/[^\n]*$/, "$1"))
    .join("\n");
}

const DC_26_4 = [
  "app/home/BookingBar.dc.html",
  "app/home/BookingBarStates.dc.html",
  "app/home/BookingSheet.dc.html",
  "app/home/BookingSheetStates.dc.html",
  "app/home/home.dc.html",
  "app/home/Services.dc.html",
  "app/home/HowItWorks.dc.html",
  "app/home/SiteHeader.dc.html",
  "app/home/SiteFooter.dc.html",
  "app/pages/SiteHeader.dc.html",
  "app/pages/SiteFooter.dc.html",
  "app/ops/OpsNewTrip.dc.html",
  "app/ops/OpsPricing.dc.html",
].map((f) => join(REPO, f));

const NEXT_26_4 = [
  "apps/web/app/[locale]/checkout/sections/TripEditor.tsx",
  "apps/web/app/[locale]/checkout/sections/ContactSection.tsx",
  "apps/web/app/[locale]/checkout/CheckoutForm.tsx",
  "apps/web/app/[locale]/checkout/checkout.css",
  "apps/web/components/shell/SiteHeader.tsx",
  "apps/web/components/shell/SiteFooter.tsx",
  "apps/web/components/home/Services.tsx",
].map((f) => join(REPO, f));

const DICT = join(REPO, "app", "vamos-i18n-dict.js");
const STYLE_FILES = [...DC_26_4, ...NEXT_26_4, DICT];

// Written before 26.4 (26.3-HANDOVER item 10); 26.4 did not add them.
const PRE_EXISTING_YELLOW: Record<string, string[]> = {
  "app/home/home.dc.html": ["--vt-yellow-700", "--vt-yellow-50"],
};
// Sections the shell mounts (ops) or with no text input: never carried the input-focus line.
const NO_FOCUS_LINE = ["app/ops/OpsNewTrip.dc.html", "app/home/HowItWorks.dc.html"];
const NO_LAW_LINES = ["app/ops/OpsNewTrip.dc.html"];

function offenders(files: string[], test: (text: string, file: string) => string[]): string[] {
  const found: string[] = [];
  for (const f of files) {
    const text = stripComments(f, readFileSync(f, "utf8"));
    for (const hit of test(text, f)) found.push(`${rel(f)}: ${hit}`);
  }
  return found;
}

describe("26.4 file list", () => {
  it("every listed file exists and is read", () => {
    for (const f of STYLE_FILES) expect(readFileSync(f, "utf8").length, rel(f)).toBeGreaterThan(0);
  });
});

describe("Law 01: no glow", () => {
  it("--vt-shadow-accent is only ever none, and never read with var()", () => {
    const bad = offenders(STYLE_FILES, (t) => {
      const hits: string[] = [];
      for (const m of t.matchAll(/--vt-shadow-accent\s*:\s*([^;}\n]+)/g)) {
        if (!/^none\b/.test(m[1]!.trim())) hits.push(`sets it to ${m[1]!.trim()}`);
      }
      if (/var\(\s*--vt-shadow-accent/.test(t)) hits.push("reads var(--vt-shadow-accent)");
      return hits;
    });
    expect(bad).toEqual([]);
  });

  it("no yellow or accent-tinted box-shadow, no filter glow", () => {
    const bad = offenders(STYLE_FILES, (t) => {
      const hits: string[] = [];
      for (const m of t.matchAll(/box-shadow\s*:\s*([^;}\n]+)/gi)) {
        if (/--vt-yellow|--vt-accent|#fdc20b|253\s*,\s*194\s*,\s*11|--vt-shadow-accent/i.test(m[1]!)) {
          hits.push(`box-shadow: ${m[1]!.trim()}`);
        }
      }
      if (/drop-shadow\([^)]*(--vt-yellow|--vt-accent|#fdc20b)/i.test(t)) hits.push("drop-shadow glow");
      return hits;
    });
    expect(bad).toEqual([]);
  });

  it("every DC file keeps --vt-shadow-accent:none and the input-focus line", () => {
    const bad: string[] = [];
    for (const f of DC_26_4) {
      const t = readFileSync(f, "utf8").replace(/\s+/g, "");
      if (!NO_LAW_LINES.includes(rel(f)) && !t.includes("--vt-shadow-accent:none")) bad.push(`${rel(f)}: missing --vt-shadow-accent:none`);
      if (!NO_FOCUS_LINE.includes(rel(f)) && !t.includes(".vt-input--focus{box-shadow:none}")) bad.push(`${rel(f)}: missing .vt-input--focus{box-shadow:none}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("Law 02: no tinted yellow", () => {
  it("never --vt-yellow-50/100/200/300/600/700", () => {
    const bad = offenders(STYLE_FILES, (t, f) => {
      const allowed = PRE_EXISTING_YELLOW[rel(f)] ?? [];
      return [...t.matchAll(/--vt-yellow-(?:50|100|200|300|600|700)\b/g)]
        .map((m) => m[0])
        .filter((h) => !allowed.includes(h))
        .slice(0, 1);
    });
    expect(bad).toEqual([]);
  });

  it('never tone="accent" or Badge tone="warning"', () => {
    const bad = offenders(STYLE_FILES, (t) => {
      const hits: string[] = [];
      if (/tone\s*=\s*["'{]\s*["']?accent/.test(t)) hits.push('tone="accent"');
      if (/Badge[^>]*tone\s*=\s*["'{]\s*["']?warning/.test(t)) hits.push('Badge tone="warning"');
      return hits;
    });
    expect(bad).toEqual([]);
  });

  it("no --vt-warning in the booking bar or sheet", () => {
    const files = ["BookingBar", "BookingSheet"].map((n) => join(REPO, "app", "home", `${n}.dc.html`));
    expect(offenders(files, (t) => (/--vt-warning/.test(t) ? ["--vt-warning"] : []))).toEqual([]);
  });
});

describe("Law 03: four languages", () => {
  it("no ß in de.json or in any de value of the DC dictionary", () => {
    const bad: string[] = [];
    readFileSync(join(WEB, "i18n", "messages", "de.json"), "utf8")
      .split("\n")
      .forEach((line, i) => {
        // One string older than 26.3 (owner: not fixed here).
        if (line.includes("ß") && !line.includes('"error-size": "Dieses Foto ist zu groß"')) bad.push(`de.json:${i + 1}`);
      });
    const dict = readFileSync(DICT, "utf8");
    for (const line of dict.split("\n")) if (/\bde\s*:/.test(line) && line.includes("ß")) bad.push(line.trim().slice(0, 80));
    expect(bad).toEqual([]);
  });

  const BAR_SHEET = ["BookingBar", "BookingSheet"].map((n) => join(REPO, "app", "home", `${n}.dc.html`));

  it("BookingBar and BookingSheet keep no string table and no browser storage", () => {
    const bad = offenders(BAR_SHEET, (t) => {
      const hits: string[] = [];
      if (/\b(?:const|let|var)\s+T\s*=\s*[{[]/.test(t)) hits.push("const T = string table");
      if (/\blocalStorage\b|\bsessionStorage\b/.test(t)) hits.push("browser storage");
      if (/\bde\s*:\s*["'{]/.test(t) && /\bfr\s*:\s*["'{]/.test(t)) hits.push("per-language table");
      return hits;
    });
    expect(bad).toEqual([]);
  });

  it("BookingBar and BookingSheet mark place names and captions with data-vt-no-i18n, never data-i18n-skip", () => {
    for (const f of BAR_SHEET) {
      const t = readFileSync(f, "utf8");
      expect(t, rel(f)).toContain("data-vt-no-i18n");
      expect(t, rel(f)).not.toContain("data-i18n-skip");
    }
  });

  it("no data-i18n-skip in the 26.4 DC files", () => {
    expect(offenders(DC_26_4, (t) => (t.includes("data-i18n-skip") ? ["data-i18n-skip"] : []))).toEqual([]);
  });

  it("no Lenis, no scroll-behavior:smooth in the 26.4 DC files", () => {
    const bad = offenders(DC_26_4, (t) => {
      const hits: string[] = [];
      if (/new\s+Lenis\b/.test(t)) hits.push("new Lenis");
      if (/scroll-behavior\s*:\s*smooth/.test(t)) hits.push("scroll-behavior:smooth");
      return hits;
    });
    expect(bad).toEqual([]);
  });

  it("OpsNewTrip never matches an extra by a literal code (D-35)", () => {
    const f = join(REPO, "app", "ops", "OpsNewTrip.dc.html");
    expect(offenders([f], (t) => (/["'`](child_seat|oversized_luggage|extra_stop)["'`]/.test(t) ? ["literal extra code"] : []))).toEqual([]);
  });
});

describe("Law 04: no invented CHF figure in markup", () => {
  it("CHF is followed only by the 000 gap", () => {
    const markup = [...DC_26_4, ...NEXT_26_4].filter((f) => /\.(html|tsx)$/.test(f));
    const bad = offenders(markup, (t) => {
      const hits: string[] = [];
      for (const m of t.matchAll(/CHF\s*(\d+(?:[.,']\d+)*)/g)) {
        if (!/^0{1,3}$|^0{2,3}\.0{2}$/.test(m[1]!)) hits.push(m[0]);
      }
      return hits;
    });
    expect(bad).toEqual([]);
  });
});
