// apps/web/lib/ops/ops-toast-tone-dc.test.ts
//
// 261004 toast tone. The dashboard booking page (app/ops/OpsDetail.dc.html) shows every notice in one toast.
// It used to be hard-coded `tone="success"`: a green check next to "Could not apply edit" and every other
// refusal. Now the toast has two tones: success (green check, announced as a status) and danger (red warning
// sign, announced as an alert). `notify(msg)` is success; `notifyError(msg)` is danger.
//
// Two kinds of proof, no DOM:
//   1. Source pins: the toast element takes its tone and role from the page, the call-site rule holds
//      (a failure key never goes through plain notify, a success key never through notifyError).
//   2. The page logic is loaded from the source and run with a stubbed window (the technique of
//      ops-accept-paid-dc.test.ts): the class change, Accept, refund and the one-press actions answer
//      success or failure, and the toast state carries the tone.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const dc = readFileSync(join(repoRoot, "app/ops/OpsDetail.dc.html"), "utf8");

// ── 1. source pins ─────────────────────────────────────────────────────────────────────────────────────

/** The first argument of every `this.<fn>(` call in the page script, up to the matching close paren. */
function calls(fn: "notify" | "notifyError"): string[] {
  const out: string[] = [];
  const re = new RegExp(`this\\.${fn}\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(dc))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < dc.length && depth > 0) {
      if (dc[i] === "(") depth++;
      else if (dc[i] === ")") depth--;
      i++;
    }
    out.push(dc.slice(start, i - 1));
  }
  return out;
}

// T keys that say something failed or was refused. A plain notify with one of these would show a green check.
const FAILURE_KEY = /\bt\.(?:err[A-Z]\w*|\w*Failed|frozen|mustFix|unpaidNoEditBody|acceptPaid|acceptPriceChanged|withdrawPaid|withdrawNothing|withdrawStripe)\b/;
// T keys that say something was done.
const SUCCESS_KEY = /\bt\.(?:unassignedOk|withdrawDone|extraWaiting|refundClick|savedFlight|savedInstant|voucherResent|bookingRemoved|bookingCancelled|payLinkSent|payLinkCopied|driverAssigned)\b/;

describe("the toast takes its tone and role from the page", () => {
  it("the Toast element is not hard-coded: tone and role are bindings", () => {
    const toast = dc.match(/<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1\.Toast"[^>]*>/);
    expect(toast?.[0]).toBeDefined();
    expect(toast![0]).toContain('tone="{{ toastTone }}"');
    expect(toast![0]).toContain('role="{{ toastRole }}"');
    expect(toast![0]).not.toContain('tone="success"');
  });

  it("the design system's Toast has the danger tone (red triangle-alert on the charcoal toast) and lets role through", () => {
    const bundle = readFileSync(join(repoRoot, "design-system/_ds_bundle.js"), "utf8");
    const a = bundle.indexOf("// components/feedback/Toast.jsx");
    const b = bundle.indexOf("// components/feedback/Tooltip.jsx", a);
    const toast = bundle.slice(a, b);
    expect(toast).toContain("danger: 'triangle-alert'");
    expect(toast).toContain("danger: 'var(--vt-danger)'");
    expect(toast).toContain("background:var(--vt-charcoal-900)");
    // role is set before the spread, so a role passed by the page replaces the default "status".
    expect(toast.indexOf('role: "status"')).toBeLessThan(toast.indexOf("}, rest)"));
  });
});

describe("call sites: failures use notifyError, successes use notify", () => {
  it("no failure or refusal text goes through plain notify", () => {
    const wrong = calls("notify").filter((a) => FAILURE_KEY.test(a));
    expect(wrong).toEqual([]);
  });

  it("no success text goes through notifyError", () => {
    const wrong = calls("notifyError").filter((a) => SUCCESS_KEY.test(a));
    expect(wrong).toEqual([]);
  });

  it("every plain notify is a known success text (besides notifyError itself and the class/trip change result, which carries its own tone)", () => {
    const unknown = calls("notify").filter((a) => !SUCCESS_KEY.test(a));
    // The only plain notify with other text: notifyError's own body, and the class/trip change result notify(msg, tone).
    expect(unknown.map((a) => a.replace(/\s+/g, " "))).toEqual(["msg, 'danger'", "msg, tone"]);
  });

  it("the Stripe tab helper reports its failures as errors", () => {
    const a = dc.indexOf("openStripePage = (route, booking, failText) => {");
    const b = dc.indexOf("loadClassPreview = (booking) => {", a);
    const helper = dc.slice(a, b);
    expect(helper).not.toMatch(/this\.notify\(/);
    expect(helper.match(/this\.notifyError\(failText/g)).toHaveLength(3);
  });

  it("the class and trip change result sets the tone: a mail that did not go out is a failed step", () => {
    const a = dc.indexOf("const postClassChange = () => {");
    const b = dc.indexOf("const vals = {", a);
    const fn = dc.slice(a, b);
    expect(fn).toMatch(/this\.notify\(msg, tone\);/);
    expect(fn).toMatch(/if \(!d\.mailed\) tone = 'danger';/);
    expect(fn).toMatch(/if \(!d\.confirmationSent\) tone = 'danger';/);
  });

  it("notify takes the tone, anything but 'danger' is success", () => {
    expect(dc).toMatch(/notify = \(msg, tone\) => \{ this\.setState\(\{ toastMsg: msg, toastTone: tone === 'danger' \? 'danger' : 'success', showToast: true \}\);/);
    expect(dc).toMatch(/notifyError = \(msg\) => this\.notify\(msg, 'danger'\);/);
  });
});

// ── 2. the page logic, run ─────────────────────────────────────────────────────────────────────────────

type DetailLogic = {
  state: Record<string, any>;
  renderVals(): Record<string, any>;
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
    { pathname: "/bookings/VT-26-0801", href: "https://dashboard.vamostaxi.site/bookings/VT-26-0801" },
    class {},
  ) as new (p: Record<string, unknown>) => DetailLogic;
  const logic = new Component(props);
  logic.state = { ...logic.state, lang };
  return logic;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const BOOKING_ID = "b0000000-0000-4000-8000-000000000801";
const KEY = "mercedes-benz-v-class";
const LANGS = ["en", "de", "fr", "ar"] as const;

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "VT-26-0801", bookingId: BOOKING_ID, time: "08:00", date: "Thu 8 Oct", dateIso: "2026-10-08",
    pickupAt: new Date(Date.now() + 48 * 3600e3).toISOString(),
    customer: "Anna Example", email: "anna@example.test", phone: "+41 79 000 00 00",
    pickup: "Zurich Airport (ZRH)", dropoff: "Bahnhofstrasse 1, 8001 Zurich", klass: "Economy", vehicle: "",
    pax: 2, bags: 1, status: "confirmed", driver: "", chauffeur: "", paid: true, paidByCard: true, totalRappen: 0, events: [],
    ...over,
  };
}

function setup(b: Record<string, unknown>, answer: ((method: string, url: string) => unknown) | null, lang = "en") {
  const request = vi.fn(async (method: string, url: string, _body?: unknown) => (answer ? answer(method, url) : undefined));
  const on = () => () => undefined;
  const reset = vi.fn();
  const win: Record<string, unknown> = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset },
      chauffeurs: { all: () => [], onChange: on },
      vehicles: { all: () => [], onChange: on },
      profile: { get: () => ({ role: "admin" }), onChange: on },
    },
    VamosLocale: { money: () => "CHF 000" },
    VamosOpsBar: { set: vi.fn(), clear: vi.fn() },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    open() {},
  };
  // No API client at all is itself a path: the page says the action could not be sent.
  if (answer) win.VamosOpsApi = { request };
  const logic = loadDetail(win, lang, { id: String(b.id) });
  return { logic, request, reset };
}

/** What the toast is showing: the state the page hands to the Toast element. */
function toastOf(logic: DetailLogic) {
  const v = logic.renderVals();
  return { shown: v.showToast, msg: String(v.toastMsg), tone: v.toastTone as string, role: v.toastRole as string };
}

/** The page as the owner has it open: Edit mode, the class list from the preview, one field edited. */
function editing(lang: string, edit: Record<string, unknown>, answer: (method: string, url: string) => unknown) {
  const out = setup(booking(), answer, lang);
  out.logic.state = {
    ...out.logic.state,
    editing: true,
    edit,
    classPreview: {
      key: BOOKING_ID, sig: "{}", busy: false, code: "", field: "",
      data: {
        currentClass: "saden", paidRappen: 25_000, currentTotalRappen: 25_000, rateVersionId: 18,
        classes: [
          { slug: "saden", name: "Economy", current: true, ok: true, newTotalRappen: 25_000, differenceRappen: 0, code: null },
          { slug: KEY, name: "Business", current: false, ok: true, newTotalRappen: 31_000, differenceRappen: 6_000, code: null },
        ],
      },
    },
  };
  return out;
}
const changeAnswers = (json: unknown) => (method: string, url: string) =>
  method === "POST" && url.endsWith("/change") ? json : { ok: false, code: "unknown" };

describe("the toast starts as a success status", () => {
  it("before anything is shown: success tone, status role", () => {
    const { logic } = setup(booking(), null);
    expect(toastOf(logic)).toMatchObject({ shown: false, tone: "success", role: "status" });
  });
});

describe("class change", () => {
  for (const lang of LANGS) {
    it(`${lang}: price-changed (409) shows the error tone, announced as an alert`, async () => {
      const { logic } = editing(lang, { klass: KEY }, changeAnswers({ ok: false, code: "price-changed" }));
      logic.renderVals().confirmClassChange();
      await flush();
      expect(toastOf(logic)).toMatchObject({ shown: true, tone: "danger", role: "alert" });
    });

    it(`${lang}: payment-changed shows the error tone`, async () => {
      const { logic } = editing(lang, { klass: KEY }, changeAnswers({ ok: false, code: "payment-changed" }));
      logic.renderVals().confirmClassChange();
      await flush();
      expect(toastOf(logic)).toMatchObject({ shown: true, tone: "danger", role: "alert" });
    });
  }

  it("a code with no line of its own (the generic 'Could not change') is an error", async () => {
    const { logic } = editing("en", { klass: KEY }, changeAnswers({ ok: false, code: "some-new-code" }));
    logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(logic)).toMatchObject({ tone: "danger", role: "alert", msg: expect.stringMatching(/^Could not change the class of /) });
  });

  it("a network failure is an error", async () => {
    const { logic } = editing("en", { klass: KEY }, (method, url) => {
      if (method === "POST" && url.endsWith("/change")) throw new Error("network");
      return { ok: false };
    });
    logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(logic)).toMatchObject({ tone: "danger", role: "alert" });
  });

  it("applied with the confirmation sent is a success, announced as a status", async () => {
    const { logic } = editing("en", { klass: KEY }, changeAnswers({ ok: true, data: { outcome: "applied", confirmationSent: true } }));
    logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(logic)).toMatchObject({ shown: true, tone: "success", role: "status", msg: "Class changed. The customer got the confirmation again." });
  });

  it("refund due is a success (the owner presses Confirm refund next)", async () => {
    const { logic } = editing("en", { klass: KEY }, changeAnswers({ ok: true, data: { outcome: "refund_due", differenceRappen: -6_000 } }));
    logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(logic)).toMatchObject({ tone: "success", role: "status", msg: expect.stringMatching(/^Class changed\. Refund due: /) });
  });

  it("extra payment with the link e-mailed is a success; with the e-mail not sent it is an error", async () => {
    const sent = editing("en", { klass: KEY }, changeAnswers({ ok: true, data: { outcome: "extra_required", mailed: true, differenceRappen: 6_000 } }));
    sent.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(sent.logic)).toMatchObject({ tone: "success", msg: expect.stringMatching(/^The customer was e-mailed the link to pay /) });
    const notSent = editing("en", { klass: KEY }, changeAnswers({ ok: true, data: { outcome: "extra_required", mailed: false, differenceRappen: 6_000 } }));
    notSent.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(notSent.logic)).toMatchObject({ tone: "danger", role: "alert", msg: "The e-mail did not go out. Copy the payment link and send it to the customer." });
  });

  it("applied but the confirmation e-mail did not go out is an error (a step failed); a driver note does not change the tone", async () => {
    const { logic } = editing("en", { klass: KEY }, changeAnswers({ ok: true, data: { outcome: "applied", confirmationSent: false, driverTakenOff: true } }));
    logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(logic)).toMatchObject({ tone: "danger", role: "alert", msg: expect.stringMatching(/^Class changed\. The confirmation e-mail did not go out/) });
    const ok = editing("en", { klass: KEY }, changeAnswers({ ok: true, data: { outcome: "applied", confirmationSent: true, driverTakenOff: true } }));
    ok.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(ok.logic)).toMatchObject({ tone: "success", msg: expect.stringMatching(/The driver was taken off the trip and told\.$/) });
  });

  it("a trip change (passengers) answers with the same tones", async () => {
    const refused = editing("en", { pax: "3" }, changeAnswers({ ok: false, code: "price-changed" }));
    refused.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(refused.logic)).toMatchObject({ tone: "danger", role: "alert" });
    const done = editing("en", { pax: "3" }, changeAnswers({ ok: true, data: { outcome: "applied", confirmationSent: true } }));
    done.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(done.logic)).toMatchObject({ tone: "success", role: "status", msg: "Trip changed. The customer got the confirmation again." });
  });

  it("a later success replaces an earlier error: the tone follows the latest notice", async () => {
    const first = editing("en", { klass: KEY }, changeAnswers({ ok: false, code: "price-changed" }));
    first.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(first.logic).tone).toBe("danger");
    // The same page, next press: the answer is now a success.
    (first.request as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ ok: true, data: { outcome: "applied", confirmationSent: true } }));
    first.logic.state = { ...first.logic.state, editing: true, edit: { klass: KEY } };
    first.logic.renderVals().confirmClassChange();
    await flush();
    expect(toastOf(first.logic)).toMatchObject({ tone: "success", role: "status" });
  });
});

describe("Accept on a customer's change request", () => {
  const pending = () => booking({ pendingEditId: "e0000000-0000-4000-8000-000000000801", pendingEditActor: "customer" });
  const accept = async (json: unknown, lang = "en") => {
    const { logic } = setup(pending(), () => json, lang);
    logic.renderVals().acceptPending();
    await flush();
    return toastOf(logic);
  };

  for (const code of ["price-changed", "payment-changed", "already-paid", "must-fix", "capacity", "unpaid", "unknown"]) {
    it(`code ${code} is an error`, async () => {
      expect(await accept({ ok: false, code })).toMatchObject({ shown: true, tone: "danger", role: "alert" });
    });
  }

  for (const lang of LANGS) {
    it(`${lang}: payment-changed shows the error tone`, async () => {
      expect(await accept({ ok: false, code: "payment-changed" }, lang)).toMatchObject({ tone: "danger", role: "alert" });
    });
  }

  it("accepted with an extra payment open is a success", async () => {
    expect(await accept({ ok: true, data: { outcome: "extra_required" } })).toMatchObject({
      shown: true, tone: "success", role: "status", msg: "Extra payment is open for the difference.",
    });
  });

  it("accepted with a refund due is a success", async () => {
    expect(await accept({ ok: true, data: { outcome: "refund_due" } })).toMatchObject({
      shown: true, tone: "success", role: "status", msg: "Use Refund for the difference.",
    });
  });
});

describe("refund", () => {
  it("a refund that cannot be sent (no connection to the server) is an error", () => {
    const { logic } = setup(booking({ status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 100, refundRappen: 0 }), null);
    logic.renderVals().markRefund();
    expect(toastOf(logic)).toMatchObject({ shown: true, tone: "danger", role: "alert", msg: "Could not refund VT-26-0801" });
  });
});

describe("the one-press actions", () => {
  type Case = { name: string; run: (v: Record<string, any>) => void; answer: unknown; tone: "success" | "danger"; msg?: RegExp; booking?: Record<string, unknown> };
  const cases: Case[] = [
    { name: "resend voucher, sent", run: (v) => v.resendVoucher(), answer: { ok: true, data: { email: "anna@example.test" } }, tone: "success", msg: /^Voucher re-sent to / },
    { name: "resend voucher, refused", run: (v) => v.resendVoucher(), answer: { ok: false }, tone: "danger", msg: /^Could not resend voucher / },
    { name: "send pay link, sent", run: (v) => v.sendPayLink(), answer: { ok: true }, tone: "success", msg: /^Pay-link sent to /, booking: { paid: false } },
    { name: "send pay link, refused", run: (v) => v.sendPayLink(), answer: { ok: false }, tone: "danger", msg: /^Could not send pay-link /, booking: { paid: false } },
    { name: "cancel, done", run: (v) => v.confirmCancel(), answer: { ok: true }, tone: "success", msg: /^Cancelled / },
    { name: "cancel, frozen", run: (v) => v.confirmCancel(), answer: { ok: false, code: "frozen" }, tone: "danger", msg: /^This trip is frozen\.$/ },
    { name: "cancel, refused", run: (v) => v.confirmCancel(), answer: { ok: false }, tone: "danger", msg: /^Could not cancel / },
    { name: "complete, frozen", run: (v) => v.markComplete(), answer: { ok: false, code: "frozen" }, tone: "danger", msg: /^This trip is frozen\.$/ },
    { name: "complete, refused", run: (v) => v.markComplete(), answer: { ok: false }, tone: "danger", msg: /^Could not apply edit / },
    { name: "mark arrival, refused", run: (v) => v.markArrival(), answer: { ok: false }, tone: "danger", msg: /^Could not mark arrival / },
  ];
  for (const c of cases) {
    it(`${c.name}: ${c.tone}`, async () => {
      const { logic } = setup(booking(c.booking), () => c.answer);
      c.run(logic.renderVals());
      await flush();
      const toast = toastOf(logic);
      expect(toast).toMatchObject({ shown: true, tone: c.tone, role: c.tone === "danger" ? "alert" : "status" });
      if (c.msg) expect(toast.msg).toMatch(c.msg);
    });
  }
});
