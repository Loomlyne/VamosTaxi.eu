// apps/web/lib/checkout/customer-cancel-cookie.test.ts
//
// "Confirm cancellation" on the two booking pages, run as the page runs it: the page's own logic class
// (its <script data-dc-script> block, plain JavaScript) with the real app/vamos-manage-ticket.js helper,
// a fake fetch, and a stand-in for the design-component base class. The request the page sends and the
// message it shows are what is checked.
//
// The e-mailed manage link opens /manage-booking?token=..., the middleware moves the token into the
// HttpOnly vt_manage cookie and strips it from the address (K100), so the page holds no token: the guest
// request must still be sent (the server reads the cookie). That cookie is one for the whole site (a
// second link or a second booking replaces it), so the request names the booking on screen and the
// server's refusal for another booking (409 wrong-booking) is shown in plain words.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const HELPER = read("app/vamos-manage-ticket.js");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];
const WRONG = "This page is for another booking. Open the link from its e-mail again.";

type Sent = { url: string; method: string; body: unknown };
type Page = {
  state: Record<string, unknown>;
  setState: (patch: Record<string, unknown>) => void;
  confirmCancel: () => void;
};

/** The page's logic class with the real helper; `answer` is what the server says to the cancel. */
function openPage(rel: string, answer: { status: number; body: Record<string, unknown> }) {
  const html = read(rel);
  const tag = html.indexOf("<script type=\"text/x-dc\" data-dc-script");
  const start = html.indexOf(">", tag) + 1;
  const logic = html.slice(start, html.indexOf("</script>", start));
  const sent: Sent[] = [];
  const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const ctx = createContext({
    window: {} as Record<string, unknown>,
    location: { search: "", pathname: rel.includes("detail") ? "/booking-detail" : "/manage-booking", href: "" },
    URLSearchParams,
    localStorage: store,
    sessionStorage: store,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    console,
    // The logic class keeps one ref (React.createRef); nothing here renders.
    React: { createRef: () => ({ current: null }) },
    fetch: async (url: string, opt: { method?: string; body?: string } = {}) => {
      sent.push({ url, method: opt.method ?? "GET", body: opt.body ? JSON.parse(opt.body) : null });
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
    },
    DCLogic: class {
      props: Record<string, unknown>;
      state: Record<string, unknown> = {};
      constructor(props?: Record<string, unknown>) {
        this.props = props ?? {};
      }
      setState(patch: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>), cb?: () => void) {
        const next = typeof patch === "function" ? patch(this.state) : patch;
        this.state = { ...this.state, ...next };
        cb?.();
      }
      forceUpdate() {}
    },
  });
  runInContext(HELPER, ctx);
  runInContext(`${logic}\n;globalThis.__Page = Component;`, ctx);
  const Page = (ctx as unknown as { __Page: new (p: Record<string, unknown>) => Page }).__Page;
  const page = new Page({});
  return { page, sent };
}

const flush = () => new Promise((r) => setImmediate(r));

async function pressConfirm(rel: string, authVia: string, answer: { status: number; body: Record<string, unknown> }) {
  const { page, sent } = openPage(rel, answer);
  page.setState({ authVia, signedIn: authVia === "account", ticket: { ...(page.state.ticket as object), reference: "VT-26-0101", status: "confirmed" } });
  page.confirmCancel();
  for (let i = 0; i < 5; i++) await flush();
  return { page, sent };
}

describe.each(PAGES)("%s: Confirm cancellation", (rel) => {
  it("opened from the e-mailed link (the token is in the cookie, not the address): the guest request goes, naming the booking", async () => {
    const { page, sent } = await pressConfirm(rel, "token", { status: 200, body: { ok: true, bookingId: "b1", refundStatus: "pending_ops" } });
    expect(sent).toEqual([{ url: "/api/manage/cancel", method: "POST", body: { ref: "VT-26-0101" } }]);
    expect(page.state.status).toBe("cancelled");
  });

  it("the server says the cookie is for another booking: nothing on screen changes and the page says so", async () => {
    const { page, sent } = await pressConfirm(rel, "token", { status: 409, body: { ok: false, code: "wrong-booking" } });
    expect(sent).toHaveLength(1);
    expect(page.state.status).not.toBe("cancelled");
    expect(page.state.toast).toBe(WRONG);
    expect(page.state.cancelling).toBe(false);
  });

  it("any other refusal keeps the existing message", async () => {
    const { page } = await pressConfirm(rel, "token", { status: 409, body: { ok: false, code: "not-cancellable" } });
    expect(page.state.toast).toBe("Could not cancel this booking.");
    expect(page.state.status).not.toBe("cancelled");
  });

  it("opened through the account: the account route, by reference, as before", async () => {
    const { sent } = await pressConfirm(rel, "account", { status: 200, body: { ok: true, bookingId: "b1" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "/api/account/bookings/paid-cancel", method: "POST" });
    expect(JSON.stringify(sent[0]!.body)).toContain("VT-26-0101");
  });
});

describe("the refusal message exists in four languages", () => {
  it("German, French and Arabic in the dictionary", () => {
    const dict = read("app/vamos-i18n-dict.js");
    const line = dict.split("\n").find((l) => l.includes(`'${WRONG}':`));
    expect(line).toBeDefined();
    expect(line).toMatch(/de: 'Diese Seite gehört zu einer anderen Buchung\./);
    expect(line).toMatch(/fr: 'Cette page concerne une autre réservation\./);
    expect(line).toMatch(/ar: '[^']+'/);
  });
});
