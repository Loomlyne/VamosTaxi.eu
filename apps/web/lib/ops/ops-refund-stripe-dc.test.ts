// apps/web/lib/ops/ops-refund-stripe-dc.test.ts
//
// Phase 31 (refunds in Stripe), plan 31-09. The dashboard booking detail (app/ops/OpsDetail.dc.html) no longer
// sends a refund. Its Actions item "Refund in Stripe" opens the booking's payment in the Stripe Dashboard:
//   D-01  the page sends no refund; the refund-decision box and everything that only served it are deleted.
//   D-06  one payment opens in a new tab inside the click; several show "Which payment?"; none says so.
//   D-14  the list hides fully refunded payments; when every payment is fully refunded the newest one opens.
//   S-04  (Q2 = A) "Refund to check" is a neutral info note until Stripe records a refund or pickup has passed.
//   UI-SPEC deviations: 1 disabled until the links arrive, 2 no dead code after the menu return,
//   3 OPEN IN STRIPE in the Refund failed Alert only with exactly one payment, 4 date and CHF isolated per part.
//
// Two kinds of proof, no DOM, no network:
//   1. Source pins on the page (copy in four languages equal to app/vamos-i18n-dict.js, retired keys and handlers gone).
//   2. The page logic loaded from the source and run with a stubbed window (technique of ops-toast-tone-dc.test.ts).
// Amounts in fixtures are neutral rappen (0, 100, 200); none is shown as a price.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const dc = read("app/ops/OpsDetail.dc.html");

type Lang = "en" | "de" | "fr" | "ar";
const LANGS: Lang[] = ["en", "de", "fr", "ar"];
/** A synthetic amount as the page shows it (Law 04: no CHF figure as a literal). */
const chf = (amount: string) => `CHF ${amount}`;

function tBlocks(src: string): Record<Lang, string> {
  const start = src.indexOf("const T = {");
  const end = src.indexOf("class Component extends DCLogic", start);
  const body = src.slice(start, end);
  const at = (lang: string) => body.search(new RegExp(`\\n\\s{2}${lang}: \\{`));
  const [en, de, fr, ar] = LANGS.map(at);
  return { en: body.slice(en, de), de: body.slice(de, fr), fr: body.slice(fr, ar), ar: body.slice(ar) };
}

/** The value of `key:'…'` in one T block (single-quoted, escapes kept as written). */
function tValue(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`\\b${key}:'((?:[^'\\\\]|\\\\.)*)'`));
  return m?.[1]?.replace(/\\'/g, "'");
}

/** The dictionary as the runtime builds it (window.VamosI18n), evaluated with a bare window. */
function loadDict(): { strings: Record<string, Record<string, string>>; patterns: Array<{ re: RegExp } & Record<string, string>> } {
  const win: Record<string, any> = {};
  new Function("window", read("app/vamos-i18n-dict.js"))(win);
  return win.VamosI18n;
}

// The signed copy (31-UI-SPEC.md, Copywriting Contract, dashboard table).
const SIGNED: Record<string, Record<Lang, string>> = {
  refundInStripe: { en: "Refund in Stripe", de: "In Stripe rückerstatten", fr: "Rembourser dans Stripe", ar: "الاسترداد في Stripe" },
  openInStripe: { en: "Open in Stripe", de: "In Stripe öffnen", fr: "Ouvrir dans Stripe", ar: "فتح في Stripe" },
  stripeNewTab: {
    en: "Stripe opens in a new tab. This page shows the refund once Stripe records it.",
    de: "Stripe öffnet sich in einem neuen Tab. Diese Seite zeigt die Rückerstattung, sobald Stripe sie erfasst hat.",
    fr: "Stripe s’ouvre dans un nouvel onglet. Cette page affiche le remboursement dès que Stripe l’enregistre.",
    ar: "يُفتح Stripe في علامة تبويب جديدة. تعرض هذه الصفحة الاسترداد بمجرد أن يسجّله Stripe.",
  },
  checkTitle: { en: "Refund to check", de: "Rückerstattung prüfen", fr: "Remboursement à vérifier", ar: "استرداد للمراجعة" },
  checkBody: {
    en: "Cancelled with a payment on file. If the cancellation policy gives money back, refund it in Stripe. This page shows it once Stripe records it.",
    de: "Storniert, die Zahlung ist erfasst. Sehen die Stornierungsbedingungen eine Rückerstattung vor, erstatten Sie sie in Stripe. Diese Seite zeigt sie, sobald Stripe sie erfasst hat.",
    fr: "Annulée avec un paiement enregistré. Si la politique d’annulation prévoit un remboursement, faites-le dans Stripe. Cette page l’affiche dès que Stripe l’enregistre.",
    ar: "أُلغي الحجز وعليه دفعة مسجّلة. إذا كانت سياسة الإلغاء تتيح استردادًا، فنفّذه في Stripe. تعرضه هذه الصفحة بمجرد أن يسجّله Stripe.",
  },
  failedStripeBody: {
    en: "Stripe could not send the refund. Open the payment in Stripe to try again.",
    de: "Stripe konnte die Rückerstattung nicht senden. Öffnen Sie die Zahlung in Stripe, um es erneut zu versuchen.",
    fr: "Stripe n’a pas pu envoyer le remboursement. Ouvrez le paiement dans Stripe pour réessayer.",
    ar: "تعذّر على Stripe إرسال الاسترداد. افتح الدفعة في Stripe لإعادة المحاولة.",
  },
  noStripePayment: {
    en: "This booking has no Stripe payment to open.",
    de: "Diese Buchung hat keine Stripe-Zahlung zum Öffnen.",
    fr: "Cette réservation n’a aucun paiement Stripe à ouvrir.",
    ar: "لا توجد لهذا الحجز دفعة في Stripe لفتحها.",
  },
  classNoteCheaper: {
    en: "The class changes when you confirm. Refund the difference in Stripe afterwards.",
    de: "Die Klasse ändert sich, wenn Sie bestätigen. Erstatten Sie die Differenz danach in Stripe.",
    fr: "La classe change dès votre confirmation. Remboursez ensuite la différence dans Stripe.",
    ar: "تتغيّر الفئة عند تأكيدك. استرد الفرق بعد ذلك في Stripe.",
  },
  tripNoteCheaper: {
    en: "The trip changes when you confirm. Refund the difference in Stripe afterwards.",
    de: "Die Fahrt ändert sich, wenn Sie bestätigen. Erstatten Sie die Differenz danach in Stripe.",
    fr: "Le trajet change dès votre confirmation. Remboursez ensuite la différence dans Stripe.",
    ar: "تتغيّر الرحلة عند تأكيدك. استرد الفرق بعد ذلك في Stripe.",
  },
  classDoneRefund: {
    en: "Class changed. Difference to refund: {a}. Refund it in Stripe.",
    de: "Klasse geändert. Zu erstattende Differenz: {a}. Erstatten Sie sie in Stripe.",
    fr: "Classe modifiée. Différence à rembourser : {a}. Remboursez-la dans Stripe.",
    ar: "تم تغيير الفئة. الفرق المطلوب استرداده: {a}. نفّذ الاسترداد في Stripe.",
  },
  tripDoneRefund: {
    en: "Trip changed. Difference to refund: {a}. Refund it in Stripe.",
    de: "Fahrt geändert. Zu erstattende Differenz: {a}. Erstatten Sie sie in Stripe.",
    fr: "Trajet modifié. Différence à rembourser : {a}. Remboursez-la dans Stripe.",
    ar: "تم تغيير الرحلة. الفرق المطلوب استرداده: {a}. نفّذ الاسترداد في Stripe.",
  },
};
const PATTERN_KEYS = new Set(["classDoneRefund", "tripDoneRefund"]);

// Keys that lost their last use with the decision box (UI-SPEC line 254 plus the picker/percent/unit strings).
const RETIRED = [
  "confirmRefund", "declineRefund", "declineConfirmTitle", "declineConfirmBody", "keepReviewing",
  "requestedTitle", "requestedBody", "acceptRefund", "rejectRefund", "rejectConfirmTitle", "rejectConfirmBody",
  "refundFailedBody", "tryAgain", "refundTitle", "refundBody", "dueLegacyBody",
  "classCreditBody", "tripCreditBody", "classCreditLine", "refundFullLine", "refundClick", "markRefund",
  "reviewTitle", "reviewBody", "percentPlaceholder", "payLine", "partialTitle", "partialBody", "processingBody",
  "refundAmountLabel", "unitAria", "exactNeedsPayment", "errFullOnly", "errExceeds", "errAlready", "errDecided",
  "errNotPostTrip", "allPayments", "errInvalid", "errNotPaid", "errNothing",
];

// ── 1. source pins ─────────────────────────────────────────────────────────────────────────────────────

describe("copy: the signed dashboard strings in en, de, fr and ar (S-01)", () => {
  const blocks = tBlocks(dc);

  for (const [key, byLang] of Object.entries(SIGNED)) {
    it(`${key} reads as signed in all four tables`, () => {
      for (const lang of LANGS) expect(tValue(blocks[lang], key), `${lang}.${key}`).toBe(byLang[lang]);
    });
  }

  it("every strings entry equals its app/vamos-i18n-dict.js entry, character for character", () => {
    const dict = loadDict();
    for (const [key, byLang] of Object.entries(SIGNED)) {
      if (PATTERN_KEYS.has(key)) continue;
      const entry = dict.strings[byLang.en];
      expect(entry, `dict.strings["${byLang.en}"]`).toBeDefined();
      for (const lang of ["de", "fr", "ar"] as const) expect(entry![lang], `${lang}.${key}`).toBe(tValue(blocks[lang], key));
    }
  });

  // D12: VamosLocale.coverage(<open Actions menu>) only clears when the dictionary knows the
  // translated label, so its entry must equal the T table word for word.
  it("the Actions menu labels Assign driver and Mark arrival equal their dictionary entries", () => {
    const dict = loadDict();
    for (const key of ["assign", "markArrival"]) {
      const entry = dict.strings[tValue(blocks.en, key)!];
      expect(entry, `dict.strings["${tValue(blocks.en, key)}"]`).toBeDefined();
      for (const lang of ["de", "fr", "ar"] as const) expect(entry![lang], `${lang}.${key}`).toBe(tValue(blocks[lang], key));
    }
  });

  it("the class/trip done toasts equal the dictionary patterns ({a} is $1)", () => {
    const dict = loadDict();
    for (const key of PATTERN_KEYS) {
      const en = tValue(blocks.en, key)!;
      const sample = en.replace("{a}", chf("0.00"));
      const pattern = dict.patterns.find((p) => p.re.test(sample));
      expect(pattern, key).toBeDefined();
      for (const lang of ["de", "fr", "ar"] as const) expect(pattern![lang], `${lang}.${key}`).toBe(tValue(blocks[lang], key)!.replace("{a}", "$1"));
    }
  });

  it("German uses ss, never ß, anywhere on the page", () => {
    expect(dc).not.toContain("ß");
  });

  it("the retired keys are gone from all four tables", () => {
    for (const lang of LANGS) {
      for (const key of RETIRED) expect(blocks[lang], `${lang}.${key}`).not.toMatch(new RegExp(`\\b${key}:'`));
    }
    for (const key of RETIRED) expect(dc, `t.${key}`).not.toMatch(new RegExp(`\\bt\\.${key}\\b`));
  });
});

describe("the page sends no refund (D-01)", () => {
  it("no refund or refund-decision request and no handler that sent one", () => {
    expect(dc).not.toContain("/refund'");
    expect(dc).not.toContain("refund-decision");
    for (const name of ["markRefund", "postRefund", "postDecision", "retryRefund", "refundBusy", "syncRefund", "loadRefund", "refundBody", "refundFormShown"]) {
      expect(dc, name).not.toContain(name);
    }
  });

  it("the decision box markup and its retired layout rules are deleted, not hidden", () => {
    for (const attr of ["data-ops-refund-pick", "data-ops-refund-pct", "data-ops-refund-payrow", "data-ops-refund-full", "data-ops-refund-unit"]) {
      expect(dc, attr).not.toContain(attr);
    }
    for (const gone of ["declineOpen", "rejectOpen", "refundData", "refundAnswer", "refundUnit", "refundPick", "acceptPostTrip", "openRequested"]) {
      expect(dc, gone).not.toContain(gone);
    }
  });

  it("the Stripe links come from the staff route, once, on mount and on update", () => {
    expect(dc.match(/\/stripe-payments'/g)).toHaveLength(1);
    expect(dc).toMatch(/client\.request\('GET', '\/api\/staff\/bookings\/' \+ encodeURIComponent\(key\) \+ '\/stripe-payments'\)/);
    const mount = dc.slice(dc.indexOf("  componentDidMount() {"), dc.indexOf("  bind = () => {"));
    expect(mount).toContain("this.syncStripe();");
    const update = dc.slice(dc.indexOf("  componentDidUpdate() {"), dc.indexOf("  publishBar = () => {"));
    expect(update).toContain("this.syncStripe();");
  });

  it("the menu opens the tab synchronously inside the click; nothing follows the return", () => {
    expect(dc).toContain("window.open(targets[0].url, '_blank', 'noopener')");
    const a = dc.indexOf("if (v === 'refund') {");
    const b = dc.indexOf("if (v === 'cancel')", a);
    const branch = dc.slice(a, b);
    expect(branch).not.toMatch(/await|\.then\(/);
    expect(branch).not.toContain("goRefund(); return; }\n          if");
  });
});

describe("markup and laws", () => {
  it("Refund to check is a neutral info Alert; Refund failed is danger with the Stripe body", () => {
    expect(dc).toMatch(/Alert" tone="info" title="\{\{ tCheckTitle \}\}"[^>]*>\{\{ tCheckBody \}\}/);
    expect(dc).toMatch(/Alert" tone="danger" title="\{\{ tRefundFailedTitle \}\}"[^>]*>\{\{ tFailedStripeBody \}\}/);
    expect(dc).not.toMatch(/tone="accent"/);
  });

  it("OPEN IN STRIPE buttons are real links to a new tab without opener or referrer", () => {
    const buttons = dc.match(/<x-import[^>]*>\{\{ tOpenInStripe \}\}<\/x-import>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const btn of buttons) {
      expect(btn).toContain('target="_blank"');
      expect(btn).toContain('rel="noopener noreferrer"');
      expect(btn).toContain('iconEnd="external-link"');
      expect(btn).toContain('variant="secondary"');
      expect(btn).toContain('size="md"');
    }
    expect(dc).toMatch(/<sc-if value="\{\{ stripeOneUrl \}\}"/);
  });

  it("the row detail keeps the runtime out and isolates itself (deviation 4)", () => {
    expect(dc).toMatch(/<span data-ops-stripe-v data-vt-no-i18n="1">\{\{ p\.detail \}\}<\/span>/);
    expect(dc).toMatch(/\[data-ops-stripe-v\]\{[^}]*unicode-bidi:isolate/);
    expect(dc).toMatch(/\[data-ops-stripe-row\]\+\[data-ops-stripe-row\]\{border-block-start:1px solid var\(--vt-border-subtle\)\}/);
  });

  it("keeps the no-glow and input-focus laws", () => {
    expect(dc).toMatch(/--vt-shadow-accent:none/);
    expect(dc).toMatch(/\.vt-input--focus\{box-shadow:none\}/);
  });

  it("the synced public copy carries the same refund area", () => {
    expect(read("apps/web/public/app/ops/OpsDetail.dc.html")).toContain("/stripe-payments'");
  });
});

// ── 2. the page logic, run ─────────────────────────────────────────────────────────────────────────────

type DetailLogic = {
  state: Record<string, any>;
  renderVals(): Record<string, any>;
  componentDidMount(): void;
};

class Base {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  constructor(props?: Record<string, unknown>) {
    this.props = props || {};
  }
  setState(update: unknown, cb?: () => void) {
    const patch = typeof update === "function" ? (update as (s: unknown) => object)(this.state) : update;
    this.state = { ...this.state, ...(patch as object) };
    if (typeof cb === "function") cb();
  }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() {
    return {};
  }
}

function scriptOf(src: string): string {
  const m = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no data-dc-script");
  return m[1];
}

function loadDetail(win: Record<string, unknown>, lang: string, props: Record<string, unknown>): DetailLogic {
  const React = { createElement: (...args: unknown[]) => ({ args }) };
  const doc = {
    body: { style: {} as Record<string, string> },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { getAttribute: () => "ltr" },
  };
  const fn = new Function(
    "DCLogic", "StreamableLogic", "React", "window", "document", "history", "localStorage", "location", "PopStateEvent",
    `${scriptOf(dc)}\n;return Component;`,
  );
  const Component = fn(
    Base, Base, React, win, doc, { pushState() {} },
    { getItem: (k: string) => (k === "vamosLang" ? lang : null), setItem() {} },
    { pathname: "/bookings/VT-26-0001", href: "https://dashboard.vamostaxi.site/bookings/VT-26-0001" },
    class {},
  ) as new (p: Record<string, unknown>) => DetailLogic;
  const logic = new Component(props);
  logic.state = { ...logic.state, lang };
  return logic;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const KEY = "b1";
const ROUTE = "/api/staff/bookings/b1/stripe-payments";
const URL_NEW = "https://dashboard.stripe.com/test/payments/pi_new";
const URL_OLD = "https://dashboard.stripe.com/test/payments/pi_old";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "VT-26-0001", bookingId: KEY, time: "08:00", date: "Thu 8 Oct", dateIso: "2026-10-08",
    pickupAt: new Date(Date.now() + 48 * 3600e3).toISOString(),
    customer: "Anna Example", email: "anna@example.test", phone: "+41 79 000 00 00",
    pickup: "Zurich Airport (ZRH)", dropoff: "Bahnhofstrasse 1, 8001 Zurich", klass: "Economy", vehicle: "",
    pax: 2, bags: 1, status: "cancelled", driver: "", chauffeur: "", paid: true, paidByCard: true, totalRappen: 0,
    refundStatus: "pending_ops", refundRappen: 0, tripPassed: false, events: [],
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return { kind: "trip", chargedRappen: 200, leftRappen: 200, capturedAt: "2026-10-08T08:00:00Z", url: URL_NEW, ...over };
}

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

function setup(b: Record<string, unknown>, opts: { role?: string; lang?: string } = {}) {
  const pending: Deferred[] = [];
  const request = vi.fn((_method: string, _url: string) => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const open = vi.fn();
  const on = () => () => undefined;
  const win: Record<string, unknown> = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset: vi.fn() },
      chauffeurs: { all: () => [], onChange: on },
      vehicles: { all: () => [], onChange: on },
      profile: { get: () => ({ role: opts.role ?? "admin" }), onChange: on },
    },
    VamosOpsApi: { request },
    VamosLocale: { money: () => "CHF 000" },
    VamosOpsBar: { set: vi.fn(), clear: vi.fn() },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    open,
  };
  const logic = loadDetail(win, opts.lang ?? "en", { id: String(b.id) });
  logic.componentDidMount();
  const stripeCalls = () => request.mock.calls.filter((c) => String(c[1]).endsWith("/stripe-payments"));
  /** Answer the Stripe-links request, then let the promise chain run. */
  const answer = async (json: unknown) => {
    const i = request.mock.calls.findIndex((c) => String(c[1]).endsWith("/stripe-payments"));
    pending[i]!.resolve(json);
    await flush();
  };
  const fail = async () => {
    const i = request.mock.calls.findIndex((c) => String(c[1]).endsWith("/stripe-payments"));
    pending[i]!.reject(new Error("network"));
    await flush();
  };
  return { logic, request, open, stripeCalls, answer, fail };
}

const refundItem = (logic: DetailLogic) => (logic.renderVals().actionItems as Array<Record<string, unknown>>).find((i) => i.value === "refund");

describe("the menu item: who sees it and when it is live (UI-SPEC deviation 1)", () => {
  it("admin, paid: present with the Stripe label and icon, disabled while the links load; one GET to the route", () => {
    const { logic, request, stripeCalls } = setup(booking());
    const item = refundItem(logic);
    expect(item).toMatchObject({ value: "refund", label: "Refund in Stripe", icon: "external-link", disabled: true });
    expect(stripeCalls()).toHaveLength(1);
    expect(request).toHaveBeenCalledWith("GET", ROUTE);
    const items = logic.renderVals().actionItems as Array<Record<string, unknown>>;
    const at = items.findIndex((i) => i.value === "refund");
    const cancel = items.findIndex((i) => i.value === "cancel");
    if (cancel !== -1) expect(at).toBeLessThan(cancel);
  });

  it("a dispatcher sees no item and the page asks for no links", () => {
    const { logic, stripeCalls } = setup(booking(), { role: "dispatcher" });
    expect(refundItem(logic)).toBeUndefined();
    expect(stripeCalls()).toHaveLength(0);
  });

  it("an unpaid booking has no item and no request", () => {
    const { logic, stripeCalls } = setup(booking({ paid: false, status: "confirmed" }));
    expect(refundItem(logic)).toBeUndefined();
    expect(stripeCalls()).toHaveLength(0);
  });

  it("a rejected request leaves the item disabled with no message", async () => {
    const { logic, fail } = setup(booking());
    await fail();
    expect(refundItem(logic)?.disabled).toBe(true);
    expect(logic.renderVals().refundErrorText).toBe("");
    expect(logic.state.stripePays ?? null).toBeNull();
  });

  it("an ok:false answer leaves the item disabled with no message", async () => {
    const { logic, answer } = setup(booking());
    await answer({ ok: false, code: "forbidden" });
    expect(refundItem(logic)?.disabled).toBe(true);
    expect(logic.renderVals().refundErrorText).toBe("");
  });

  it("rows stored under another booking key are ignored", () => {
    const { logic } = setup(booking());
    logic.state = { ...logic.state, stripePays: { key: "other", rows: [row()] } };
    const v = logic.renderVals();
    expect(refundItem(logic)?.disabled).toBe(true);
    expect(v.stripeRows).toEqual([]);
    expect(v.stripeOneUrl).toBe("");
  });
});

describe("one, several or no payments (D-06, D-14)", () => {
  it("one payment: the item is live and the click opens it in a new tab synchronously", async () => {
    const { logic, answer, open } = setup(booking());
    await answer({ ok: true, data: [row()] });
    expect(refundItem(logic)?.disabled).toBe(false);
    logic.renderVals().pickAction("refund");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(URL_NEW, "_blank", "noopener");
    expect(logic.state.stripeListFor || "").toBe("");
    expect(logic.renderVals().stripeListShown).toBe(false);
  });

  it("two open payments: the click shows the list, newest first, each detail isolated per part", async () => {
    const { logic, answer, open } = setup(booking());
    await answer({ ok: true, data: [row({ kind: "extra", leftRappen: 100, chargedRappen: 100 }), row({ url: URL_OLD, capturedAt: "2026-10-01T08:00:00Z" })] });
    logic.renderVals().pickAction("refund");
    expect(open).not.toHaveBeenCalled();
    expect(logic.state.stripeListFor).toBe(KEY);
    const v = logic.renderVals();
    expect(v.stripeListShown).toBe(true);
    expect(v.stripeRows).toHaveLength(2);
    expect(v.stripeRows.map((r: { url: string }) => r.url)).toEqual([URL_NEW, URL_OLD]);
    expect(v.stripeRows.map((r: { label: string }) => r.label)).toEqual(["Extra fare", "Trip"]);
    for (const r of v.stripeRows as Array<{ detail: string }>) {
      expect(r.detail.split("⁦").length - 1).toBe(2);
      expect(r.detail.split("⁩").length - 1).toBe(2);
      expect(r.detail).toContain(" · ");
    }
    expect(v.stripeOneUrl).toBe("");
  });

  it("the list hides a fully refunded payment; the click opens the one left", async () => {
    const { logic, answer, open } = setup(booking());
    await answer({ ok: true, data: [row(), row({ url: URL_OLD, leftRappen: 0 })] });
    const v = logic.renderVals();
    expect(v.stripeRows).toHaveLength(1);
    v.pickAction("refund");
    expect(open).toHaveBeenCalledWith(URL_NEW, "_blank", "noopener");
  });

  it("every payment fully refunded: the click opens the newest", async () => {
    const { logic, answer, open } = setup(booking());
    await answer({ ok: true, data: [row({ leftRappen: 0 }), row({ url: URL_OLD, leftRappen: 0 })] });
    logic.renderVals().pickAction("refund");
    expect(open).toHaveBeenCalledWith(URL_NEW, "_blank", "noopener");
    expect(logic.renderVals().stripeListShown).toBe(false);
  });

  it("zero payments: the click says the booking has no Stripe payment to open", async () => {
    const { logic, answer, open } = setup(booking());
    await answer({ ok: true, data: [] });
    expect(refundItem(logic)?.disabled).toBe(false);
    logic.renderVals().pickAction("refund");
    expect(open).not.toHaveBeenCalled();
    expect(logic.state.refundError).toEqual({ key: KEY, code: "no-stripe-payment" });
    const v = logic.renderVals();
    expect(v.refundErrorShown).toBe(true);
    expect(v.refundErrorText).toBe("This booking has no Stripe payment to open.");
  });

  for (const lang of ["de", "fr", "ar"] as const) {
    it(`${lang}: the no-payment error is the signed text`, async () => {
      const { logic, answer } = setup(booking(), { lang });
      await answer({ ok: true, data: [] });
      logic.renderVals().pickAction("refund");
      expect(logic.renderVals().refundErrorText).toBe(SIGNED.noStripePayment![lang]);
    });
  }

  it("a row whose url is not on dashboard.stripe.com is dropped", async () => {
    const { logic, answer, open } = setup(booking());
    await answer({ ok: true, data: [row({ url: "https://evil.example/payments/pi_x" }), row({ url: "javascript:alert(1)" }), row({ url: URL_OLD })] });
    const v = logic.renderVals();
    expect(v.stripeRows.map((r: { url: string }) => r.url)).toEqual([URL_OLD]);
    v.pickAction("refund");
    expect(open).toHaveBeenCalledWith(URL_OLD, "_blank", "noopener");
  });
});

describe("Refund to check (S-04, Q2 = A)", () => {
  const due = (over: Record<string, unknown>) => setup(booking(over)).logic.renderVals().showRefundDue;

  it("cancelled, paid, refund pending, nothing recorded, pickup ahead: shown", () => {
    expect(due({})).toBe(true);
  });
  it("refunded in Stripe: hidden", () => {
    expect(due({ refundStatus: "refunded" })).toBe(false);
  });
  it("a refund recorded above 0: hidden", () => {
    expect(due({ refundRappen: 100 })).toBe(false);
  });
  it("pickup time passed: hidden", () => {
    expect(due({ tripPassed: true })).toBe(false);
  });
  it("refund failed: hidden (the failed Alert shows instead)", () => {
    expect(due({ refundStatus: "failed" })).toBe(false);
  });
  it("a booking that is not cancelled: hidden", () => {
    expect(due({ status: "confirmed" })).toBe(false);
  });
  it("the note's title and body are the signed text", () => {
    const v = setup(booking()).logic.renderVals();
    expect(v.tCheckTitle).toBe("Refund to check");
    expect(v.tCheckBody).toBe(SIGNED.checkBody!.en);
  });
});

describe("Refund failed links to Stripe (UI-SPEC deviation 3)", () => {
  it("shown for refund_status failed with the Stripe body; one payment gives one link", async () => {
    const { logic, answer } = setup(booking({ refundStatus: "failed" }));
    await answer({ ok: true, data: [row()] });
    const v = logic.renderVals();
    expect(v.refundFailedShown).toBe(true);
    expect(v.tFailedStripeBody).toBe(SIGNED.failedStripeBody!.en);
    expect(v.stripeOneUrl).toBe(URL_NEW);
  });

  it("two payments: no link in the Alert (the menu opens the list)", async () => {
    const { logic, answer } = setup(booking({ refundStatus: "failed" }));
    await answer({ ok: true, data: [row(), row({ url: URL_OLD })] });
    const v = logic.renderVals();
    expect(v.refundFailedShown).toBe(true);
    expect(v.stripeOneUrl).toBe("");
  });

  it("not shown while the refund is only pending", () => {
    expect(setup(booking()).logic.renderVals().refundFailedShown).toBe(false);
  });
});
