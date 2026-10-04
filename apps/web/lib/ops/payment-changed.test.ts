// apps/web/lib/ops/payment-changed.test.ts
//
// 261004 payment-changed message. Migration 20261007280000 makes nine functions raise `payment-changed`
// (SQLSTATE 40001) when a payment settled for the same booking in the same instant; nothing is written
// and pressing again is safe. This file pins how the Worker names it and how the dashboard says it:
//   1. the three maps (refund, edit-request, booking-change) answer code `payment-changed`;
//   2. the routes answer it as a 409 conflict (statuses come from the map files the routes import);
//   3. each dashboard path that calls the nine functions hands it back: Refund (plan), Accept,
//      class change, trip change (the last two have their own cases in booking-change.test.ts and
//      booking-trip-change.test.ts);
//   4. the dashboard (app/ops/OpsDetail.dc.html) shows the owner's signed sentence in four languages
//      (.planning/decisions/2026-10-04-payment-changed-message.md), in the refund error, the class and
//      trip change error and the Accept notice. No DOM: the DC logic class is run with a stubbed window,
//      the technique of ops-accept-paid-dc.test.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const asSystem = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
  asSystem: (...args: unknown[]) => asSystem(...args),
  asCustomer: vi.fn(),
  asGuest: vi.fn(),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_env: unknown, _claims: unknown, key: string) => (key ? BOOKING : null),
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  mintManageToken: vi.fn(async () => ({ raw: "manage-token-raw", hash: new Uint8Array([1, 2, 3]) })),
}));
vi.mock("../checkout/stripe", () => ({
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  findRefundByIntent: vi.fn(),
  resolvePaymentIntentId: vi.fn(),
  retrieveRefund: vi.fn(),
  stripeFromEnv: vi.fn(),
}));
vi.mock("../lifecycle/paid-cancel", () => ({
  finishPaidCancel: vi.fn(async () => undefined),
  payoutFactsFromRefund: vi.fn(() => ({ payoutCountry: "CH", availableOn: null })),
}));
vi.mock("./must-fix-mail", () => ({ deliverOverlapMustFix: vi.fn(async () => undefined) }));

import { changeFailStatus, mapChangeSqlError } from "./booking-change-map";
import { acceptPaidEdit } from "./edit-request";
import { failStatus, mapEditSqlError } from "./edit-request-map";
import { refundBooking } from "./refund";
import { isPaymentChanged, mapRefundSqlError, refundFailStatus } from "./refund-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const BOOKING = "b0000000-0000-4000-8000-000000000006";
const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "a0000000-0000-4000-8000-000000000005",
  role: "authenticated",
  app_metadata: { vamos_role: "admin" },
};

/** What the database raises: message `payment-changed`, SQLSTATE 40001. */
const raised = () => Object.assign(new Error("payment-changed"), { name: "PostgresError", code: "40001" });
const PAYMENT_CHANGED = { ok: false, code: "payment-changed" };

describe("the three maps name a payment that settled in the same instant", () => {
  it("refund map: by message, by SQLSTATE 40001, and both", () => {
    expect(mapRefundSqlError({ code: "40001", message: "payment-changed" })).toEqual(PAYMENT_CHANGED);
    expect(mapRefundSqlError({ message: "payment-changed\nCONTEXT: PL/pgSQL function ops_refund_plan" })).toEqual(PAYMENT_CHANGED);
    expect(mapRefundSqlError({ code: "40001", message: "" })).toEqual(PAYMENT_CHANGED);
  });

  it("edit-request map (Accept): by message, by SQLSTATE 40001, and both", () => {
    expect(mapEditSqlError({ code: "40001", message: "payment-changed" })).toEqual(PAYMENT_CHANGED);
    expect(mapEditSqlError({ message: "payment-changed " })).toEqual(PAYMENT_CHANGED);
    expect(mapEditSqlError({ code: "40001" })).toEqual(PAYMENT_CHANGED);
  });

  it("booking-change map (class change, trip change): by message, by SQLSTATE 40001, and both", () => {
    expect(mapChangeSqlError({ code: "40001", message: "payment-changed" })).toEqual(PAYMENT_CHANGED);
    expect(mapChangeSqlError({ message: "payment-changed\nCONTEXT: x" })).toEqual(PAYMENT_CHANGED);
    expect(mapChangeSqlError({ code: "40001" })).toEqual(PAYMENT_CHANGED);
  });

  it("a name that only starts like it, and a deadlock (40P01), are not it", () => {
    expect(isPaymentChanged({ message: "payment-changed-x", code: "P0001" })).toBe(false);
    expect(isPaymentChanged({ message: "deadlock detected", code: "40P01" })).toBe(false);
    expect(mapRefundSqlError({ message: "payment-changed-x", code: "P0001" })).toEqual({ ok: false, code: "unknown" });
    expect(mapEditSqlError({ message: "deadlock detected", code: "40P01" })).toEqual({ ok: false, code: "unknown" });
    expect(mapChangeSqlError({ message: "payment-changed-x", code: "P0001" })).toEqual({ ok: false, code: "unknown" });
  });

  it("the neighbours keep their names", () => {
    expect(mapRefundSqlError({ message: "not-paid" })).toEqual({ ok: false, code: "not-paid" });
    expect(mapEditSqlError({ message: "price-changed" })).toEqual({ ok: false, code: "price-changed" });
    expect(mapChangeSqlError({ message: "paid-changed" })).toEqual({ ok: false, code: "paid-changed" });
    expect(mapChangeSqlError({ message: "price-book-changed" })).toEqual({ ok: false, code: "price-book-changed" });
  });
});

describe("the routes answer it as a conflict (409): look again, nothing was written", () => {
  it("Refund (POST ../refund), Accept (../edit-accept, ../edit-request), class and trip change (../change)", () => {
    expect(refundFailStatus("payment-changed")).toBe(409);
    expect(failStatus("payment-changed")).toBe(409);
    expect(changeFailStatus("payment-changed")).toBe(409);
  });

  it("the same status as price-changed / paid-changed, the other 'it moved, look again' refusals", () => {
    expect(failStatus("payment-changed")).toBe(failStatus("price-changed"));
    expect(changeFailStatus("payment-changed")).toBe(changeFailStatus("paid-changed"));
  });

  it("the refund statuses of the neighbours are unchanged", () => {
    expect(refundFailStatus("not-found")).toBe(404);
    expect(refundFailStatus("not-admin")).toBe(403);
    expect(refundFailStatus("already-refunded")).toBe(409);
    expect(refundFailStatus("full-refund-only")).toBe(409);
    expect(refundFailStatus("stripe-failed")).toBe(502);
    expect(refundFailStatus("unknown")).toBe(400);
  });

  it("each route takes its status from these maps and hands the code through jsonErr", () => {
    const refund = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts");
    expect(refund).toMatch(/jsonErr\(result\.code, refundFailStatus\(result\.code\)\)/);
    const accept = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-accept/route.ts");
    expect(accept).toMatch(/import \{ failStatus \} from "@\/lib\/ops\/edit-request-map"/);
    expect(accept).toMatch(/jsonErr\(result\.code, failStatus\(result\.code\)\)/);
    const editRequest = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-request/route.ts");
    expect(editRequest).toMatch(/jsonErr\(result\.code, failStatus\(result\.code\)\)/);
    const change = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/change/route.ts");
    expect(change).toMatch(/jsonErr\(result\.code, changeFailStatus\(result\.code\)/);
    // The public mounts re-export the same handlers.
    for (const name of ["refund", "edit-accept", "change"]) {
      expect(read(`apps/web/app/api/staff/bookings/[id]/${name}/route.ts`)).toMatch(new RegExp(`${name}/route`));
    }
  });
});

describe("a dashboard path whose database call raises it hands the code back", () => {
  beforeEach(() => {
    asStaff.mockReset();
    asSystem.mockReset();
  });

  /** asSystem as postgres.js begin() runs it: a query error the callback caught is rethrown. */
  function systemRaises(err: unknown) {
    asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      let uncaught: unknown;
      const sql = () => {
        const q = Promise.reject(err);
        q.catch((e: unknown) => {
          if (uncaught === undefined) uncaught = e;
        });
        return q;
      };
      const result = await fn(sql);
      if (uncaught !== undefined) throw uncaught;
      return result;
    });
  }

  it("Refund: ops_refund_plan raises it; no Stripe call, the answer is payment-changed", async () => {
    // readRefundState (as staff): one booking row, one captured payment with 250.00 left.
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      let call = 0;
      const sql = async () => {
        call += 1;
        if (call === 1) return [{ status: "confirmed", refund_status: "none", refund_owed_rappen: 0, refunded_rappen: 0, last_change: null }];
        return [{
          id: 1, stripe_payment_intent_id: "pi_1", charged_rappen: 25_000, captured_at: "2026-10-04T10:00:00Z",
          is_extra: false, refunded: 0, open_amount: null, open_state: null,
        }];
      };
      return fn(sql);
    });
    systemRaises(raised());
    const result = await refundBooking(env, claims, "VT-26-0801", { percent: 100 });
    expect(result).toEqual(PAYMENT_CHANGED);
    expect(asSystem).toHaveBeenCalledTimes(1);
    expect(refundFailStatus((result as { code: string }).code)).toBe(409);
  });

  it("Accept: booking_edit_request_accept raises it; nothing else is tried", async () => {
    systemRaises(raised());
    const result = await acceptPaidEdit(env, claims, "VT-26-0801", { requestId: "e0000000-0000-4000-8000-000000000801", payload: {} });
    expect(result).toEqual(PAYMENT_CHANGED);
    expect(asSystem).toHaveBeenCalledTimes(1);
    expect(failStatus((result as { code: string }).code)).toBe(409);
  });

  it("class change and trip change have the same case next to their other refusals", () => {
    expect(read("apps/web/lib/ops/booking-change.test.ts")).toMatch(/261004 lock order: a payment settled in the same instant/);
    expect(read("apps/web/lib/ops/booking-trip-change.test.ts")).toMatch(/261004 lock order: a payment settled in the same instant/);
  });
});

// ── the dashboard sentence ────────────────────────────────────────────────────────────────────────────

const decision = read(".planning/decisions/2026-10-04-payment-changed-message.md");

/** The owner's English sentence, word for word, from the decisions file (the one "> " line). */
function signedEnglish(): string {
  const m = decision.match(/^> (.+)$/m);
  if (!m?.[1]) throw new Error("signed sentence not found in the decisions file");
  return m[1];
}

const dc = read("app/ops/OpsDetail.dc.html");
const LANGS = ["en", "de", "fr", "ar"] as const;

/** The four `errPaymentChanged:'…',` table lines, as the page's JS reads them. */
function tableLines(): string[] {
  return dc.split("\n").filter((l) => /^\s*errPaymentChanged:'/.test(l));
}

describe("the sentence the owner signed, in the dashboard's four language tables", () => {
  it("one key, once per language, in one place each", () => {
    expect(tableLines()).toHaveLength(4);
  });

  it("English is the signed sentence word for word", () => {
    const line = tableLines()[0]!.trim();
    // The source line escapes the apostrophe of the signed sentence inside its single-quoted string.
    expect(line).toBe(`errPaymentChanged:'${signedEnglish().replace(/'/g, "\\'")}',`);
    expect(signedEnglish()).toBe(
      "This booking's payment was being recorded at the same time, so nothing was changed. Press the button again.",
    );
  });

  it("German (Swiss: ss, never ß), French and Arabic say the same in their own words", () => {
    const [, de, fr, ar] = tableLines();
    expect(de).toContain("Die Zahlung dieser Buchung wurde zur gleichen Zeit verbucht, daher wurde nichts geändert.");
    expect(de).not.toContain("ß");
    expect(fr).toContain("Le paiement de cette réservation était en cours d’enregistrement au même moment, rien n’a donc été modifié.");
    expect(ar).toContain("كانت دفعة هذا الحجز قيد التسجيل في الوقت نفسه، لذلك لم يتغيّر شيء.");
  });

  it("Refund error, class/trip change error and the Accept notice name it before the generic failure", () => {
    expect(dc).toMatch(/'payment-changed': t\.errPaymentChanged,/);
    expect(dc.match(/'payment-changed': t\.errPaymentChanged,/g)).toHaveLength(2);
    const a = dc.indexOf("acceptPending: () => {");
    const b = dc.indexOf("refusePending: () => {", a);
    const handler = dc.slice(a, b);
    expect(handler).toMatch(/code === 'payment-changed'\) \{ if \(ops\) ops\.bookings\.reset\(\); this\.notify\(t\.errPaymentChanged\); \}/);
    expect(handler.indexOf("t.errPaymentChanged")).toBeLessThan(handler.indexOf("t.editFailed"));
  });
});

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

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "VT-26-0801", bookingId: BOOKING_ID, time: "08:00", date: "Thu 8 Oct", dateIso: "2026-10-08",
    pickupAt: new Date(Date.now() + 48 * 3600e3).toISOString(),
    customer: "Anna Example", email: "anna@example.test", phone: "+41 79 000 00 00",
    pickup: "Zurich Airport (ZRH)", dropoff: "Bahnhofstrasse 1, 8001 Zurich", klass: "Economy", vehicle: "",
    pax: 2, bags: 1, status: "confirmed", driver: "", chauffeur: "", paid: true, paidByCard: true, totalRappen: 25_000, events: [],
    ...over,
  };
}

function setup(b: Record<string, unknown>, answer: (method: string, url: string) => unknown, lang: string) {
  const request = vi.fn(async (method: string, url: string, _body?: unknown) => answer(method, url));
  const on = () => () => undefined;
  const reset = vi.fn();
  const win = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset },
      chauffeurs: { all: () => [], onChange: on },
      vehicles: { all: () => [], onChange: on },
      profile: { get: () => ({ role: "admin" }), onChange: on },
    },
    VamosOpsApi: { request },
    VamosLocale: { money: () => "CHF 000" },
    VamosOpsBar: { set: vi.fn(), clear: vi.fn() },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    open() {},
  };
  const logic = loadDetail(win, lang, { id: String(b.id) });
  return { logic, request, reset };
}

/** The signed sentence in each language, as the page's own table has it (the apostrophe unescaped). */
function sentence(lang: (typeof LANGS)[number]): string {
  const line = tableLines()[LANGS.indexOf(lang)]!.trim();
  const body = line.slice("errPaymentChanged:'".length, -"',".length);
  return body.replace(/\\'/g, "'");
}

describe("the dashboard shows it (vm-run page, four languages)", () => {
  it("English at run time is exactly the signed sentence", () => {
    expect(sentence("en")).toBe(signedEnglish());
  });

  for (const lang of LANGS) {
    it(`${lang}: Accept answered payment-changed shows the sentence, reloads the booking, not the generic failure`, async () => {
      const { logic, request, reset } = setup(
        booking({ pendingEditId: "e0000000-0000-4000-8000-000000000801", pendingEditActor: "customer" }),
        () => ({ ok: false, code: "payment-changed" }),
        lang,
      );
      logic.renderVals().acceptPending();
      await flush();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]![1]).toBe(`/api/staff/bookings/${BOOKING_ID}/edit-accept`);
      expect(logic.state.toastMsg).toBe(sentence(lang));
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it(`${lang}: Refund answered payment-changed shows the sentence in the refund error box`, async () => {
      const { logic, request } = setup(
        booking({ refundStatus: "none" }),
        (method, url) => (method === "POST" && url.endsWith("/refund") ? { ok: false, code: "payment-changed" } : { ok: false, code: "unknown" }),
        lang,
      );
      logic.renderVals().markRefund();
      await flush();
      const posted = request.mock.calls.find((c) => c[0] === "POST" && String(c[1]).endsWith("/refund"));
      expect(posted, "the refund was posted").toBeDefined();
      const vals = logic.renderVals();
      expect(vals.refundErrorShown).toBe(true);
      expect(vals.refundErrorText).toBe(sentence(lang));
    });

    it(`${lang}: a class change answered payment-changed shows the sentence, not the generic failure`, async () => {
      const { logic, request } = setup(
        booking(),
        (method, url) => (method === "POST" && url.endsWith("/change") ? { ok: false, code: "payment-changed" } : { ok: false, code: "unknown" }),
        lang,
      );
      logic.state = {
        ...logic.state,
        editing: true,
        edit: { klass: KEY },
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
      logic.renderVals().confirmClassChange();
      await flush();
      const change = request.mock.calls.find((c) => String(c[1]).endsWith("/change"));
      expect(change, "the change was posted").toBeDefined();
      expect(logic.state.toastMsg).toBe(sentence(lang));
    });
  }

  it("a trip change (passengers) answered payment-changed shows it too", async () => {
    const { logic, request } = setup(
      booking(),
      (method, url) => (method === "POST" && url.endsWith("/change") ? { ok: false, code: "payment-changed" } : { ok: false, code: "unknown" }),
      "en",
    );
    logic.state = {
      ...logic.state,
      editing: true,
      edit: { pax: "3" },
      classPreview: {
        key: BOOKING_ID, sig: "{}", busy: false, code: "", field: "",
        data: {
          currentClass: "saden", paidRappen: 25_000, currentTotalRappen: 25_000, rateVersionId: 18,
          classes: [{ slug: "saden", name: "Economy", current: true, ok: true, newTotalRappen: 25_000, differenceRappen: 0, code: null }],
        },
      },
    };
    logic.renderVals().confirmClassChange();
    await flush();
    expect(request.mock.calls.some((c) => String(c[1]).endsWith("/change"))).toBe(true);
    expect(logic.state.toastMsg).toBe(signedEnglish());
  });

  it("an answer with no line of its own keeps the generic failure (the control)", async () => {
    const { logic } = setup(
      booking({ pendingEditId: "r1", pendingEditActor: "customer" }),
      () => ({ ok: false, code: "some-new-code" }),
      "en",
    );
    logic.renderVals().acceptPending();
    await flush();
    expect(logic.state.toastMsg).toBe("Could not apply edit VT-26-0801");
  });
});
