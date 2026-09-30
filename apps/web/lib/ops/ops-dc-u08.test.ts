// apps/web/lib/ops/ops-dc-u08.test.ts
//
// 26.2-u08 regression tests for the live dashboard DC surfaces (app/ops/*.dc.html).
// Each test pulls one expression out of the DC source and runs it, so the test fails
// on the pre-fix source and passes on the fixed one. No DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readDc(name: string): string {
  return readFileSync(join(repoRoot, "app/ops", name), "utf8");
}

function grab(src: string, re: RegExp, label: string): string {
  const m = src.match(re);
  if (!m?.[1]) throw new Error(`missing ${label}`);
  return m[1];
}

describe("OpsFleet chauffeur delete", () => {
  it("onDelete hands the store promise back to OpsTable (else the dialog reports a failure)", () => {
    const src = readDc("OpsFleet.dc.html");
    const body = grab(src, /\n\s*onDelete: (\(id\) => [^\n]*),\n/, "OpsFleet onDelete");
    const answer = Promise.resolve({ ok: true });
    const onDelete = new Function("store", `return ${body};`)({ remove: () => answer }) as (
      id: string,
    ) => unknown;
    expect(onDelete("c1")).toBe(answer);
  });
});

// VamosLocale.lang is a function (app/vamos-locale.js); reading it as a value stores the
// function itself, which no copy table has a key for, so the surface stays English.
const fakeLocale = { lang: () => "de" };

describe("ops shell language on mount", () => {
  it("ops.dc.html starts in the stored language, not the function object", () => {
    const src = readDc("ops.dc.html");
    const expr = grab(
      src,
      /if \(window\.VamosLocale\) this\.setState\(\{ lang: ([^}]*) \}\);/,
      "ops.dc.html mount lang",
    );
    const lang = new Function("window", `return ${expr};`)({ VamosLocale: fakeLocale });
    expect(lang).toBe("de");
  });
});

describe("AuthForm locale sent to /api/auth", () => {
  it("locale() answers the language code, so JSON.stringify keeps the key", () => {
    const src = readDc("AuthForm.dc.html");
    const body = grab(src, /\n  locale\(\) \{\n([\s\S]*?)\n  \}\n/, "AuthForm locale()");
    const locale = new Function("window", "localStorage", body) as (
      w: unknown,
      ls: unknown,
    ) => unknown;
    const got = locale({ VamosLocale: fakeLocale }, { getItem: () => null });
    expect(got).toBe("de");
    expect(JSON.parse(JSON.stringify({ locale: got }))).toEqual({ locale: "de" });
  });
});

describe("OpsSettings save", () => {
  it("a saved answer lands in the settings store, so the screen stops reading as unsaved", async () => {
    const src = readDc("OpsSettings.dc.html");
    const body = grab(src, /\n  save = \(\) => \{\n([\s\S]*?)\n  \};\n/, "OpsSettings save");
    const stored: Record<string, unknown> = { company: "Old AG" };
    const answer = { ok: true, data: { company: "New AG" } };
    const win = {
      VamosOps: {
        settings: {
          get: () => ({ ...stored }),
          apply: (patch: Record<string, unknown>) => Object.assign(stored, patch),
        },
      },
    };
    const self = {
      state: { draft: { company: "New AG" } },
      setState: () => undefined,
    };
    const run = new Function("api", "window", "setTimeout", "clearTimeout", body);
    run.call(self, () => Promise.resolve(answer), win, () => 0, () => undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(win.VamosOps.settings.get().company).toBe("New AG");
  });
});

describe("OpsDash 'Unassigned bookings' count", () => {
  it("counts what the board's Unassigned filter lists: a refunded or no-show trip is not waiting for a chauffeur", () => {
    const src = readDc("OpsDash.dc.html");
    const arrow = grab(
      src,
      /const unassignedPaid = periodBookings\.filter\((\(b\) => [^\n]*)\)\.length;/,
      "OpsDash unassignedPaid",
    );
    const counted = new Function(`return ${arrow};`)() as (b: Record<string, unknown>) => boolean;
    const row = (status: string) => ({ paid: true, driver: "", status });
    expect(Boolean(counted(row("confirmed")))).toBe(true);
    for (const closed of ["cancelled", "completed", "refunded", "no-show", "no_show"]) {
      expect(Boolean(counted(row(closed))), closed).toBe(false);
    }
  });
});

describe("BrandSelect open list", () => {
  it("scrolling inside the list keeps it open; scrolling the page still closes it", () => {
    const src = readDc("BrandSelect.dc.html");
    const arrow = grab(src, /\n\s*this\._bail = ([^\n]*);\n/, "BrandSelect _bail");
    const inner = { nodeType: 1 };
    let closed = 0;
    const self = {
      state: { open: true },
      _pop: { contains: (n: unknown) => n === inner },
      close: () => {
        closed += 1;
      },
    };
    const bail = new Function(`return ${arrow};`).call(self) as (e?: unknown) => void;
    bail({ target: inner });
    expect(closed).toBe(0);
    bail({ target: { nodeType: 9 } });
    expect(closed).toBe(1);
    bail({ target: {} });
    expect(closed).toBe(2);
  });
});

// Four languages (platform law): English that a dashboard screen writes straight into the
// page, without a copy table of its own, has to resolve in app/vamos-i18n-dict.js.
type DictEntry = { de?: string; fr?: string; ar?: string };
type Dict = {
  strings: Record<string, DictEntry>;
  patterns: { re: RegExp; de?: string; fr?: string; ar?: string }[];
};

function loadDict(): Dict {
  const code = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
  const win: { VamosI18n?: Dict } = {};
  new Function("window", code)(win);
  if (!win.VamosI18n) throw new Error("dictionary did not load");
  return win.VamosI18n;
}

const LITERALS: Record<string, string[]> = {
  "OpsDash.dc.html": [
    "None recorded",
    "Income minus fees and refunds",
    "Per captured fare",
    "Last seven days",
    "Last thirty days",
    "All captured fares",
    "Stripe fee",
    "Paid, no chauffeur yet",
    "Pay link sent, not paid",
    "Pending edits",
    "Paid trips waiting for accept",
  ],
  "OpsTable.dc.html": [
    "Unsaved changes",
    "Keep editing",
    "Discard",
    "Decrease",
    "Increase",
    "Move up",
    "Move down",
    "Nothing yet",
  ],
  "OpsCalendarBoard.dc.html": ["Pending"],
};

describe("dashboard literals resolve in the platform dictionary", () => {
  const dict = loadDict();

  for (const [file, strings] of Object.entries(LITERALS)) {
    it(`${file}: every literal has de, fr and ar`, () => {
      const src = readDc(file);
      const missing: string[] = [];
      for (const s of strings) {
        expect(src, `${s} is still in ${file}`).toContain(s);
        const e = dict.strings[s];
        if (!e?.de || !e.fr || !e.ar) missing.push(s);
        else expect(e.de, s).not.toContain("ß");
      }
      expect(missing).toEqual([]);
    });
  }

  it("OpsTable write errors: every fixed sentence and the coded fallback resolve", () => {
    const src = readDc("OpsTable.dc.html");
    const body = grab(src, /\n  writeError\(json\) \{\n([\s\S]*?)\n  \}\n/, "OpsTable writeError");
    const sentences = [...body.matchAll(/return '([^']+)';/g)].map((m) => m[1] as string);
    expect(sentences.length).toBeGreaterThan(20);
    const missing = sentences.filter((s) => {
      const e = dict.strings[s];
      return !e?.de || !e.fr || !e.ar;
    });
    expect(missing).toEqual([]);
    const coded = "Could not save (chauffeurs-failure-x).";
    const hit = dict.patterns.find((p) => p.re.test(coded));
    expect(hit?.de && hit.fr && hit.ar).toBeTruthy();
  });

  it("no new entry reuses a translation another English key already owns (language switch maps back by first owner)", () => {
    const mine = new Set<string>(Object.values(LITERALS).flat());
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [key, e] of Object.entries(dict.strings)) {
      for (const v of [e.de, e.fr, e.ar]) {
        if (!v) continue;
        const first = owner.get(v);
        if (first === undefined) owner.set(v, key);
        else if (first !== key && mine.has(key) && v !== key) clashes.push(`${key} -> ${v} (owned by ${first})`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe("OpsDetail edit form save", () => {
  const src = readDc("OpsDetail.dc.html");
  const saveEdit = grab(src, /\n      saveEdit: \(\) => \{\n([\s\S]*?)\n      \},\n      markRefund:/, "OpsDetail saveEdit");
  const literal = grab(
    saveEdit,
    /client\.request\('PATCH', '\/api\/staff\/bookings\/' \+ encodeURIComponent\(id\), \{\n([\s\S]*?)\n        \}\)\.then/,
    "OpsDetail saveEdit body",
  );
  // `scheduled` is a local the pre-fix body used; harmless to supply.
  const bodyOf = new Function("draft", "keep", "scheduled", `return {${literal}};`) as (
    draft: Record<string, unknown>,
    keep: (v: unknown) => string | undefined,
  ) => Record<string, unknown>;
  const keepSrc = saveEdit.match(/const keep = ([^\n]*);\n/)?.[1];
  const keep = (keepSrc ? new Function(`return ${keepSrc};`)() : (v: unknown) => v) as (
    v: unknown,
  ) => string | undefined;
  const route = readFileSync(
    join(repoRoot, "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts"),
    "utf8",
  );
  const read = new Set([...route.matchAll(/record\.(\w+)/g)].map((m) => m[1]));
  const draft = {
    customer: "Ada Example", email: "ada@example.com", phone: "+41 00 000 00 00",
    pickup: "A", dropoff: "B", dateIso: "2026-10-01", time: "08:15", pax: "2", bags: "1", flight: "",
  };

  it("sends the contact under the names PATCH /api/staff/bookings/:id reads", () => {
    const body = JSON.parse(JSON.stringify(bodyOf(draft, keep))) as Record<string, unknown>;
    expect(body.customer).toBe("Ada Example");
    expect(body.email).toBe("ada@example.com");
    expect(body.phone).toBe("+41 00 000 00 00");
    expect(Object.keys(body).filter((k) => !read.has(k))).toEqual([]);
  });

  it("an emptied contact field is left out, so the stored value stays", () => {
    const body = JSON.parse(JSON.stringify(bodyOf({ ...draft, email: "  ", phone: "" }, keep))) as Record<string, unknown>;
    expect("email" in body).toBe(false);
    expect("phone" in body).toBe(false);
    expect(body.customer).toBe("Ada Example");
  });
});
