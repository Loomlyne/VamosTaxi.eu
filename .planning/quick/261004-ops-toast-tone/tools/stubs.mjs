// Stub answers for the dashboard shell pictures of quick 261004-ops-toast-tone.
// Nothing here reaches a server: shoot.mjs answers every /api/** request from these rows.
// Amounts are small round fixtures (CHF 1.00 / 2.00): never a real price (project law 04).
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const CHANGE_REF = "VT-26-0821";
export const CHANGE_ID = "6a1f0e0e-0821-4c0d-9a31-0d5b1c4a0821";

export const ROW = {
  id: CHANGE_REF, bookingId: CHANGE_ID, time: "08:15", date: day(5), dateIso: day(5), pickupAt: `${day(5)}T06:15:00.000Z`,
  customer: "Amira Keller", email: "amira@example.com", phone: "+41 79 000 00 00",
  pickup: "Zurich Airport", dropoff: "Zermatt", klass: "Economy", className: "Economy", pax: 3, bags: 2,
  status: "confirmed", paid: true, paidByCard: true, totalRappen: 100, capturedRappen: 100,
  flight: "", note: "", extras: [], fareLines: [], events: [], refundStatus: "none",
  durationMin: 190, distanceKm: 240,
};

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

/** POST ../change/preview: the three classes against what was paid. */
export const CHANGE_PREVIEW = {
  currentClass: "economy", paidRappen: 100, currentTotalRappen: 100, rateVersionId: 18,
  classes: [
    { slug: "economy", name: "Economy", current: true, ok: true, newTotalRappen: 100, differenceRappen: 0, code: null, lines: [] },
    { slug: "business", name: "Business", current: false, ok: true, newTotalRappen: 200, differenceRappen: 100, code: null, lines: [] },
    { slug: "van-luxury", name: "Van luxury", current: false, ok: true, newTotalRappen: 300, differenceRappen: 200, code: null, lines: [] },
  ],
};

/**
 * What the class change answers.
 *   error:   the price moved since the owner looked (409 price-changed), a refusal
 *   success: applied, the customer got the confirmation again
 */
export const CHANGE_ANSWER = {
  error: { status: 409, json: { ok: false, code: "price-changed" } },
  success: { status: 200, json: { ok: true, data: { outcome: "applied", confirmationSent: true } } },
};

export function answer(method, path, mode) {
  if (method === "POST" && path === "/api/auth") return { status: 200, json: null };
  if (path === "/api/staff/me") return { status: 200, json: { ok: true, data: ME } };
  if (path === "/api/staff/bookings") return { status: 200, json: { ok: true, data: [ROW] } };
  if (path === `/api/staff/bookings/${CHANGE_ID}/change/preview`) return { status: 200, json: { ok: true, data: CHANGE_PREVIEW } };
  if (path === `/api/staff/bookings/${CHANGE_ID}/change`) return CHANGE_ANSWER[mode];
  return { status: 200, json: { ok: true, data: [] } };
}
