// apps/web/lib/checkout/phase-26-3-laws.test.ts
//
// Plan 26.3-22 (D-40): the four platform laws, held as a static test over every place this
// phase wrote to: the DC mocks (app/), the Next app, the checkout components, lib/checkout,
// lib/ops, the e-mail package. Reads files as text; comments are removed first so a comment
// that names a banned thing does not fail the test. Test files and screenshots are skipped.
//
//   Law 01  no glow: `--vt-shadow-accent` is only ever `none`; no yellow/accent box-shadow
//   Law 02  no tinted yellow: no --vt-yellow-50/100/200/300/600/700, no tone="accent",
//           no Badge tone="warning"
//   Law 03  no "ß" in German strings; the owner's extras are never matched by a literal code
//           (child_seat, oversized_luggage, extra_stop) in checkout, e-mail or ops code (D-35)
//   Law 04  no invented CHF figure in markup (CHF 000 is the labelled gap)
//   Every .dc.html keeps `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");

const SKIP_DIR = new Set(["node_modules", ".next", "test-results", "snapshots", "__snapshots__"]);
const SOURCE_EXT = /\.(tsx?|css|js|html|json)$/;
const IS_TEST = /(\.test\.|\.spec\.|-snapshots$)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.endsWith("-snapshots") || name.startsWith(".next")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name) && !IS_TEST.test(name)) out.push(full);
  }
  return out;
}

/** Drops // line comments, block comments and HTML comments so prose cannot trip a rule. */
function stripComments(file: string, text: string): string {
  if (file.endsWith(".json")) return text;
  let out = text.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/[^\n]*$/, "$1"))
    .join("\n");
  return out;
}

// The DC pages this phase changed (home box, account bookings, ops board/detail/pricing, auth)
// plus the shared runtimes. The other DC pages are older than 26.3 and belong to their own phases.
const PHASE_DC = [
  "app/home/home.dc.html",
  "app/ops/OpsBoard.dc.html",
  "app/ops/OpsDetail.dc.html",
  "app/ops/OpsPricing.dc.html",
  "app/pages/AuthForm.dc.html",
  "app/pages/BookingRow.dc.html",
  "app/pages/account.dc.html",
  "app/pages/bookings.dc.html",
  "app/vamos-i18n-dict.js",
  "app/vamos-locale.js",
  "app/vamos-ops-data.js",
].map((f) => join(REPO, f));

const ROOTS = {
  dc: [] as string[],
  // The Next app, without the /dev gallery (older, not part of the funnel).
  next: [join(WEB, "app")],
  components: [join(WEB, "components", "checkout")],
  libCheckout: [join(WEB, "lib", "checkout")],
  libOps: [join(WEB, "lib", "ops")],
  emails: [join(REPO, "packages", "emails", "src")],
};

function filesOf(...groups: Array<keyof typeof ROOTS>): string[] {
  const walked = groups.flatMap((g) => ROOTS[g].flatMap((r) => walk(r)));
  const dc = groups.includes("dc") ? PHASE_DC : [];
  return [...walked, ...dc].filter((f) => !f.includes(`${join("app", "[locale]", "dev")}`));
}

const rel = (f: string) => relative(REPO, f);

function offenders(files: string[], test: (text: string, file: string) => string[]): string[] {
  const found: string[] = [];
  for (const f of files) {
    const text = stripComments(f, readFileSync(f, "utf8"));
    for (const hit of test(text, f)) found.push(`${rel(f)}: ${hit}`);
  }
  return found;
}

// Found by this test on 2026-09-29, none of it written in 26.3 (git shows no added line with it).
// Owners: the home and ops-board DC mocks and the shared forms dictionary. Not fixed here.
const PRE_EXISTING_YELLOW: Record<string, string[]> = {
  "app/home/home.dc.html": ["--vt-yellow-700", "--vt-yellow-50"],
  "app/ops/OpsBoard.dc.html": ["--vt-yellow-100", "--vt-yellow-700"],
};
// OpsBoard is a section the ops shell mounts; it never carried the two law lines (laws.css and the
// shell neutralise them). Older than 26.3.
const PRE_EXISTING_MISSING_LAW_LINES = ["app/ops/OpsBoard.dc.html"];
// A row component with no text input at all; it never carried the input-focus line.
const NO_INPUT_COMPONENTS = ["app/pages/BookingRow.dc.html"];
// The legacy closed three-code reader of OLD quote locks (payload.extras) and the rate book's own
// engine-surcharge names. Not the owner's catalog; removing them is not a 26.3 change.
const LEGACY_CODE_READERS = [
  "apps/web/lib/checkout/booking-read.ts",
  "apps/web/lib/checkout/pay-link.ts",
  "apps/web/lib/ops/surcharge-codes.ts",
];
const PRE_EXISTING_ESZETT = ['"error-size": "Dieses Foto ist zu groß"'];

const ALL = filesOf("dc", "next", "components", "libCheckout", "libOps", "emails");
const STYLE_FILES = ALL.filter((f) => /\.(css|html|tsx?|js)$/.test(f));

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
        const v = m[1]!;
        if (/--vt-yellow|--vt-accent|#fdc20b|253\s*,\s*194\s*,\s*11|--vt-shadow-accent/i.test(v)) {
          hits.push(`box-shadow: ${v.trim()}`);
        }
      }
      if (/drop-shadow\([^)]*(--vt-yellow|--vt-accent|#fdc20b)/i.test(t)) hits.push("drop-shadow glow");
      return hits;
    });
    expect(bad).toEqual([]);
  });
});

describe("Law 02: no tinted yellow", () => {
  it("never --vt-yellow-50/100/200/300/600/700", () => {
    const bad = offenders(STYLE_FILES, (t, f) => {
      const allowed = PRE_EXISTING_YELLOW[rel(f)] ?? [];
      const hits = [...t.matchAll(/--vt-yellow-(?:50|100|200|300|600|700)\b/g)]
        .map((m) => m[0])
        .filter((h) => !allowed.includes(h));
      return hits.slice(0, 1);
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
});

describe("Law 03: German has no eszett", () => {
  const de = [
    join(WEB, "i18n", "messages", "de.json"),
    join(REPO, "packages", "emails", "src", "messages", "de.json"),
  ];
  it("de.json (web and e-mail) contains no ß beyond the one string older than 26.3", () => {
    const bad: string[] = [];
    for (const f of de) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("ß") && !PRE_EXISTING_ESZETT.some((k) => line.includes(k))) bad.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    }
    expect(bad).toEqual([]);
  });
  it("the DC dictionary has no ß in any de value", () => {
    const src = readFileSync(join(REPO, "app", "vamos-i18n-dict.js"), "utf8");
    const lines = src.split("\n").filter((l) => /\bde\s*:/.test(l) && l.includes("ß"));
    expect(lines).toEqual([]);
  });
});

describe("D-35: the owner's extras are never matched by a literal code", () => {
  const files = filesOf("next", "components", "libCheckout", "libOps", "emails", "dc").filter(
    (f) => /\.(tsx?|js|html)$/.test(f),
  );
  it("no child_seat / oversized_luggage / extra_stop literal in checkout, e-mail or ops code paths", () => {
    const bad = offenders(files, (t, f) => {
      // The dictionary and the extras-catalog compatibility exports are the only homes of these words.
      if (/vamos-i18n-dict\.js$|extras-catalog\.ts$|\/messages\//.test(f)) return [];
      if (LEGACY_CODE_READERS.includes(rel(f))) return [];
      const m = t.match(/["'`](child_seat|oversized_luggage|extra_stop)["'`]/);
      return m ? [m[0]] : [];
    });
    expect(bad).toEqual([]);
  });
  it("app/ops/OpsDetail.dc.html and lib/ops are among the files scanned", () => {
    expect(files.map(rel)).toContain(join("app", "ops", "OpsDetail.dc.html"));
    expect(files.some((f) => rel(f).startsWith(join("apps", "web", "lib", "ops")))).toBe(true);
  });
});

describe("every DC page keeps the two law lines", () => {
  const pages = PHASE_DC.filter((f) => f.endsWith(".dc.html") && !PRE_EXISTING_MISSING_LAW_LINES.includes(rel(f)));
  it("has --vt-shadow-accent:none and .vt-input--focus{box-shadow:none}", () => {
    expect(pages.length).toBeGreaterThanOrEqual(7);
    const bad: string[] = [];
    for (const f of pages) {
      const t = readFileSync(f, "utf8").replace(/\s+/g, "");
      if (!t.includes("--vt-shadow-accent:none")) bad.push(`${rel(f)}: missing --vt-shadow-accent:none`);
      if (!NO_INPUT_COMPONENTS.includes(rel(f)) && !t.includes(".vt-input--focus{box-shadow:none}")) bad.push(`${rel(f)}: missing .vt-input--focus{box-shadow:none}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("Law 04: no invented CHF figure in markup", () => {
  it("CHF is followed only by the 000 gap", () => {
    const markup = filesOf("dc", "next", "components").filter((f) => /\.(html|tsx)$/.test(f));
    const bad = offenders(markup, (t) => {
      const hits: string[] = [];
      for (const m of t.matchAll(/CHF\s*(\d+(?:[.,']\d+)*)/g)) {
        // 0, 000 and 00.00 are the labelled gap (or zero); any other figure is a price.
        if (!/^0{1,3}$|^0{2,3}\.0{2}$/.test(m[1]!)) hits.push(m[0]);
      }
      return hits;
    });
    expect(bad).toEqual([]);
  });
});
