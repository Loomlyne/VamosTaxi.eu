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

describe("OpsFleet chauffeur languages", () => {
  const src = readDc("OpsFleet.dc.html");
  // Everything between the script tag and the component class: constants and the copy table.
  const head = grab(src, /<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\nclass Component extends DCLogic/, "OpsFleet head");
  const optionsExpr = grab(src, /key:'languages',[^\n]*options:([^,\n]+(?:\([^\n]*?\)\))?), icon:'globe'/, "languages options");
  const build = new Function(
    "lang",
    `${head}\nconst t = T[lang] || T.en;\nreturn ${optionsExpr};`,
  ) as (lang: string) => { value: string; label: string }[];

  it("the select offers the codes the database stores, so a saved chauffeur's languages show as picked", () => {
    const stored = "de, fr".split(",").map((s) => s.trim()); // chauffeurs.languages is text[] of ISO codes
    const values = build("en").map((o) => o.value);
    for (const code of stored) expect(values).toContain(code);
    expect(values.sort()).toEqual(["ar", "de", "en", "fr", "it"]);
  });

  it("labels the languages in en, de, fr and ar", () => {
    const en = build("en").map((o) => o.label);
    expect(en).toEqual(["German", "French", "Italian", "English", "Arabic"]);
    for (const lang of ["de", "fr", "ar"]) {
      const labels = build(lang).map((o) => o.label);
      expect(labels.every((l) => typeof l === "string" && l.length > 0), lang).toBe(true);
      expect(labels, lang).not.toEqual(en);
    }
  });
});

describe("OpsDetail history time", () => {
  const src = readDc("OpsDetail.dc.html");
  const eventWhen = new Function(
    "at",
    grab(src, /\nfunction eventWhen\(at\) \{\n([\s\S]*?)\n\}\n/, "OpsDetail eventWhen"),
  ) as (at: unknown) => string;

  it("shows a booking event at Zurich time, as the rest of the dashboard does", () => {
    // booking_events.at is timestamptz; Postgres hands it to JSON in the session zone (UTC).
    expect(eventWhen("2026-09-30T06:15:00.123456+00:00")).toBe("2026-09-30 08:15");
    expect(eventWhen("2026-01-15T23:30:00Z")).toBe("2026-01-16 00:30");
    expect(eventWhen("2026-09-30T08:15:00+02:00")).toBe("2026-09-30 08:15");
  });

  it("the Arrived tag is the Zurich clock time of the arrival", () => {
    // bookings-map iso() hands arrivedAt over as a UTC ISO string.
    const expr = grab(src, /k: t\.arrived, v: ([^\n]*?) \}\);\n/, "OpsDetail arrived tag");
    const shown = new Function("booking", "eventWhen", `return ${expr};`) as (
      b: { arrivedAt: string },
      f: typeof eventWhen,
    ) => string;
    expect(shown({ arrivedAt: "2026-09-30T06:15:00.000Z" }, eventWhen)).toBe("08:15");
  });

  it("keeps a value without a zone, or one it cannot read, as written", () => {
    expect(eventWhen("2026-09-30T08:15")).toBe("2026-09-30 08:15");
    expect(eventWhen("2026-09-30")).toBe("2026-09-30");
    expect(eventWhen("")).toBe("");
    expect(eventWhen(null)).toBe("");
  });
});

// ── OpsSupportTicket (released to this unit 2026-09-30, after Phase 20 made it read-only) ──
// The whole script block runs here against a stub DCLogic, so the tests drive the real methods.
type Ticket = {
  id: string; ticketId: string; status: string; name: string; email: string; phone: string;
  bookingRef: string; locale: string; when: string; last: string; note: string; messages: unknown[];
};
type SupportComp = {
  state: { tickets: Ticket[]; openId: string | null; overlayError: boolean; loadError: boolean };
  hydrate(): void;
  componentDidMount(): void;
  openTicket(id: string): void;
  closeOverlay(): void;
  closeTicket(): void;
  setNote(e: { target: { value: string } }): void;
  saveNote(): void;
  setState(patch: Record<string, unknown>): void;
  renderVals(): { thread: { from: string; who: string }[] };
};
type ApiAnswer = { ok: boolean; data?: unknown };

function supportHarness(api: (method: string, path: string, body?: unknown) => ApiAnswer) {
  const src = readDc("OpsSupportTicket.dc.html");
  const script = grab(src, /<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/, "support script");
  class DCLogic {
    props: Record<string, unknown> = {};
    state: Record<string, unknown> = {};
    setState(patch: Record<string, unknown>, done?: () => void) {
      this.state = { ...this.state, ...patch };
      if (done) done();
    }
    forceUpdate() {}
  }
  const badges: number[] = [];
  const win: Record<string, unknown> = {
    VamosOpsApi: { request: (m: string, p: string, b?: unknown) => Promise.resolve(api(m, p, b)) },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: (e: { detail: { newCount: number } }) => badges.push(e.detail.newCount),
    matchMedia: () => ({ matches: false }),
  };
  const doc = { addEventListener: () => undefined, removeEventListener: () => undefined, visibilityState: "visible", querySelector: () => null };
  class FakeEvent {
    detail: unknown;
    constructor(_name: string, init: { detail: unknown }) {
      this.detail = init.detail;
    }
  }
  const Component = new Function(
    "DCLogic", "window", "document", "requestAnimationFrame", "CustomEvent",
    `${script}\nreturn Component;`,
  )(DCLogic, win, doc, (fn: () => void) => fn(), FakeEvent) as new () => SupportComp;
  const settle = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  return { comp: new Component(), win, badges, settle };
}

function serverTicket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1", ticketId: "T-1", status: "open", name: "Ada Example", email: "ada@example.com", phone: "",
    bookingRef: "", locale: "en", when: "", last: "", note: "", messages: [], ...over,
  };
}

describe("OpsSupportTicket unsaved fields", () => {
  it("a refresh (window focus, tab back in view) keeps what was typed and not saved yet", async () => {
    const { comp, settle } = supportHarness((m) => (m === "GET" ? { ok: true, data: [serverTicket()] } : { ok: true }));
    comp.hydrate();
    await settle();
    comp.openTicket("t1");
    comp.setNote({ target: { value: "call back at five" } });
    comp.hydrate(); // what the focus and visibilitychange handlers do
    await settle();
    expect(comp.state.tickets[0]?.note).toBe("call back at five");
  });

  it("after Save the server copy is the truth again, and closing the ticket drops an unsaved edit", async () => {
    let stored = "";
    const { comp, settle } = supportHarness((m, _p, body) => {
      if (m === "PATCH") stored = String((body as { note?: string }).note ?? stored);
      return m === "GET" ? { ok: true, data: [serverTicket({ note: stored })] } : { ok: true };
    });
    comp.hydrate();
    await settle();
    comp.openTicket("t1");
    comp.setNote({ target: { value: "first note" } });
    comp.saveNote();
    await settle();
    stored = "edited elsewhere";
    comp.hydrate();
    await settle();
    expect(comp.state.tickets[0]?.note).toBe("edited elsewhere");

    comp.setNote({ target: { value: "never saved" } });
    comp.closeOverlay();
    comp.hydrate();
    await settle();
    expect(comp.state.tickets[0]?.note).toBe("edited elsewhere");
  });
});

describe("OpsSupportTicket close that the server refuses", () => {
  it("puts the ticket back to its status and the badge back to its count", async () => {
    const { comp, badges, settle } = supportHarness((m) =>
      m === "GET" ? { ok: true, data: [serverTicket({ status: "open" })] } : { ok: false },
    );
    comp.hydrate();
    await settle();
    comp.openTicket("t1");
    comp.closeTicket();
    await settle();
    expect(comp.state.overlayError).toBe(true);
    expect(comp.state.tickets[0]?.status).toBe("open");
    expect(badges[badges.length - 1]).toBe(1);
  });
});

describe("OpsSupportTicket sidebar badge", () => {
  it("opening Support does not wipe the count before the tickets have loaded", async () => {
    const { comp, win, badges, settle } = supportHarness(() => ({ ok: false }));
    win.__vamosSupportNew = 3;
    comp.componentDidMount();
    await settle();
    expect(comp.state.loadError).toBe(true);
    expect(win.__vamosSupportNew).toBe(3);
    expect(badges).toEqual([]);
  });

  it("a loaded list still sets it: new and open tickets only", async () => {
    const { comp, win, settle } = supportHarness(() => ({
      ok: true,
      data: [serverTicket({ id: "a", status: "new" }), serverTicket({ id: "b", status: "open" }), serverTicket({ id: "c", status: "closed" })],
    }));
    comp.componentDidMount();
    await settle();
    expect(win.__vamosSupportNew).toBe(2);
  });
});

describe("OpsSupportTicket staff message label", () => {
  it("without a profile name it is the copy-table word for the language, not a fixed person's name", async () => {
    const staffMsg = { whoKey: "staff", when: "", body: "We will call you.", files: [] };
    const { comp, settle } = supportHarness(() => ({ ok: true, data: [serverTicket({ messages: [staffMsg] })] }));
    comp.hydrate();
    await settle();
    comp.openTicket("t1");
    expect(comp.renderVals().thread[0]?.who).toBe("Dispatcher");
    comp.setState({ lang: "de" });
    expect(comp.renderVals().thread[0]?.who).toBe("Disponent");
  });

  it("with a profile name it is that name", async () => {
    const staffMsg = { whoKey: "staff", when: "", body: "We will call you.", files: [] };
    const { comp, win, settle } = supportHarness(() => ({ ok: true, data: [serverTicket({ messages: [staffMsg] })] }));
    win.VamosOps = { profile: { get: () => ({ name: "Ada Admin" }) } };
    comp.hydrate();
    await settle();
    comp.openTicket("t1");
    expect(comp.renderVals().thread[0]?.who).toBe("Ada Admin");
  });
});
