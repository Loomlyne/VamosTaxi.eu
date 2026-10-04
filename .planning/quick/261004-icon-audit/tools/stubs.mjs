// Stub answers for the dashboard shell pictures of quick 261004-icon-audit.
// Nothing here reaches a server: shoot.mjs answers every /api/** request from these rows.
// Small fixtures only, no price (project law 04): the extras list is empty.
const NOW = Date.now();
const ago = (h) => new Date(NOW - h * 3_600_000).toISOString();

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

const ticket = (n, status, name, hoursAgo) => ({
  id: `t-${n}`, ticketId: `TK-000${n}`, status, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "",
  bookingRef: "", locale: "en", when: "04 Oct 2026 · 10:0" + n, last: "04 Oct 2026 · 11:0" + n, note: "",
  reply: null,
  messages: [{ whoKey: "customer", when: ago(hoursAgo), body: "Hello, a question about my transfer.", files: [] }],
});

/** GET /api/staff/tickets: two in New, one each in Open and Closed, so the board has cards and an order to flip. */
export const TICKETS = [
  ticket(1, "new", "Amira Keller", 5),
  ticket(2, "new", "Jonas Meier", 4),
  ticket(3, "open", "Lea Baumann", 3),
  ticket(4, "closed", "Marc Frei", 2),
];

export function answer(method, path) {
  if (method === "POST" && path === "/api/auth") return { status: 200, json: null };
  if (path === "/api/staff/me") return { status: 200, json: { ok: true, data: ME } };
  if (path === "/api/staff/tickets") return { status: 200, json: { ok: true, data: TICKETS } };
  if (path === "/api/staff/rate-versions") {
    return { status: 200, json: { ok: true, data: { versions: [{ id: 18, status: "live" }, { id: 19, status: "draft" }] } } };
  }
  if (path === "/api/staff/rate-versions/19") return { status: 200, json: { ok: true, data: { gaps: [] } } };
  if (path === "/api/staff/rate-book") {
    return { status: 200, json: { ok: true, data: { versionId: 19, vatRateBps: 81, classes: [], zones: [], routes: [], rates: [], bands: [], surcharges: [], rules: [], coupons: [] } } };
  }
  return { status: 200, json: { ok: true, data: [] } };
}
