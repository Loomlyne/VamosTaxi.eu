// Stub answers for the dashboard shell pictures of quick 261004-payment-changed-message.
// Nothing here reaches a server: shoot.mjs answers every /api/** request from these rows.
// Amounts are small round fixtures (CHF 1.00 / 2.00): never a real price (project law 04).
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function base(ref, uuid, over = {}) {
  return {
    id: ref, bookingId: uuid, time: "08:15", date: day(5), dateIso: day(5), pickupAt: `${day(5)}T06:15:00.000Z`,
    customer: "Amira Keller", email: "amira@example.com", phone: "+41 79 000 00 00",
    pickup: "Zurich Airport", dropoff: "Zermatt", klass: "Economy", className: "Economy", pax: 3, bags: 2,
    status: "confirmed", paid: true, paidByCard: true, totalRappen: 100, capturedRappen: 100,
    flight: "", note: "", extras: [], fareLines: [], events: [], refundStatus: "none",
    durationMin: 190, distanceKm: 240,
    ...over,
  };
}

export const CHANGE_REF = "VT-26-0821";
export const CHANGE_ID = "6a1f0e0e-0821-4c0d-9a31-0d5b1c4a0821";
export const REFUND_REF = "VT-26-0822";
export const REFUND_ID = "6a1f0e0e-0822-4c0d-9a31-0d5b1c4a0822";

export const ROWS = [
  base(CHANGE_REF, CHANGE_ID),
  // Cancelled more than 24 hours ahead: the full refund is due, one press sends it.
  base(REFUND_REF, REFUND_ID, { status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 100, refundRappen: 0 }),
];

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

/** GET ../refund: what the picker and a reloaded page need. */
export const REFUND_PICKER = {
  id: REFUND_ID,
  payments: [{ id: 1, kind: "trip", capturedAt: `${day(-1)}T10:00:00.000Z`, chargedRappen: 100, refundedRappen: 0, leftRappen: 100, open: null }],
  owedRappen: 100, refundedRappen: 0, dueRappen: 100, refundStatus: "pending_ops", fullTier: true, creditTier: false, lastChange: null,
};

/** POST ../change/preview: the three classes against what was paid. */
export const CHANGE_PREVIEW = {
  currentClass: "economy", paidRappen: 100, currentTotalRappen: 100, rateVersionId: 18,
  classes: [
    { slug: "economy", name: "Economy", current: true, ok: true, newTotalRappen: 100, differenceRappen: 0, code: null, lines: [] },
    { slug: "business", name: "Business", current: false, ok: true, newTotalRappen: 200, differenceRappen: 100, code: null, lines: [] },
    { slug: "van-luxury", name: "Van luxury", current: false, ok: true, newTotalRappen: 300, differenceRappen: 200, code: null, lines: [] },
  ],
};

/** The conflict the database raises when a payment settles in the same instant. */
export const PAYMENT_CHANGED = { ok: false, code: "payment-changed" };

export function answer(method, path) {
  if (method === "POST" && path === "/api/auth") return { status: 200, json: null };
  if (path === "/api/staff/me") return { status: 200, json: { ok: true, data: ME } };
  if (path === "/api/staff/bookings") return { status: 200, json: { ok: true, data: ROWS } };
  if (path === `/api/staff/bookings/${REFUND_ID}/refund`) {
    return method === "GET" ? { status: 200, json: { ok: true, data: REFUND_PICKER } } : { status: 409, json: PAYMENT_CHANGED };
  }
  if (path === `/api/staff/bookings/${CHANGE_ID}/change/preview`) return { status: 200, json: { ok: true, data: CHANGE_PREVIEW } };
  if (path === `/api/staff/bookings/${CHANGE_ID}/change`) return { status: 409, json: PAYMENT_CHANGED };
  return { status: 200, json: { ok: true, data: [] } };
}
