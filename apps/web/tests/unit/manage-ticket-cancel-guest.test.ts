// Guest cancel names its booking (review of 5dcb9e6c, 2026-10-02): app/vamos-manage-ticket.js runs here as the
// page runs it (a window, fetch) and the request it sends is read. The manage token normally lives in the
// HttpOnly vt_manage cookie, which is one for the whole site, so the reference of the booking on screen goes
// with every guest cancel; the server refuses a cancel for any other booking.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../../../app/vamos-manage-ticket.js"), "utf8");

type Sent = { url: string; method: string; body: unknown };

function load() {
  const sent: Sent[] = [];
  const window: Record<string, unknown> = {};
  const fetch = async (url: string, opt: { method?: string; body?: string }) => {
    sent.push({ url, method: opt.method ?? "GET", body: opt.body ? JSON.parse(opt.body) : null });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  runInNewContext(src, { window, fetch, location: { search: "", pathname: "/manage-booking" }, URLSearchParams });
  const api = window.VamosManageTicket as { cancelGuest: (tok: string, ref: string) => Promise<unknown> };
  return { api, sent };
}

describe("vamos-manage-ticket.js cancelGuest", () => {
  it("with the token in the cookie (none on the page): posts the booking's reference and no token", async () => {
    const { api, sent } = load();
    await api.cancelGuest("", "VT-26-0101");
    expect(sent).toEqual([{ url: "/api/manage/cancel", method: "POST", body: { ref: "VT-26-0101" } }]);
  });

  it("with a token on the page: posts the token and the reference", async () => {
    const { api, sent } = load();
    await api.cancelGuest("raw-token", "VT-26-0101");
    expect(sent).toEqual([{ url: "/api/manage/cancel", method: "POST", body: { token: "raw-token", ref: "VT-26-0101" } }]);
  });
});
