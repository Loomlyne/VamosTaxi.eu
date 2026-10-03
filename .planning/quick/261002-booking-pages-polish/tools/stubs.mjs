// Stubbed /api/** answers for the booking-pages-polish pictures and the click-through. Nothing reaches a real server.
// No CHF amount is invented: money is null and the fare is 0, so the pages show their own placeholder.
// "before" answers are the shapes the live routes send today (origin/main); "after" adds what this job adds
// (details: status, canCancel, cancelWindow, reviewSubmitted).
export const HIDE = `[data-ck-banner],[data-ck-veil],[data-ck-modal]{display:none!important}
*,*::before,*::after{transition:none!important;animation-duration:0s!important}`;

export const TOKEN = "k3J9xQ2mV7pL4tR8wN5aZ"; // 21 chars: the page needs 8+ to treat the address as a link
export const REF = "VT-26-0807";
export const DAY = "2026-10-06"; // a Tuesday, four days after the job date: more than 24 h ahead
export const TIME = "08:15";

export function guestBooking(o = {}) {
  const refunded = o.refunded === true;
  return {
    id: "6a1f0e0e-0807-4c0d-9a31-0d5b1c4a0807",
    reference: REF,
    status: refunded ? "cancelled" : "confirmed",
    locale: "en",
    contactName: "Amira Keller",
    contactEmail: "amira@example.com",
    pickupText: "Zurich Airport",
    dropoffText: "Zermatt",
    scheduledLocal: `${DAY}T${TIME}`,
    originalScheduledAt: `${DAY}T06:15:00.000Z`,
    flightNo: "",
    pax: o.pax ?? 3,
    bags: o.bags ?? 2,
    driver: null,
    money: null,
    priceTotalRappen: 0,
    refundStatus: refunded ? "refunded" : "none",
    refundOwedRappen: 0,
    refundedRappen: 0,
    payoutCountry: refunded ? "CH" : null,
    // What the live route sends today for a refunded booking: an English label.
    payoutCountryLabel: refunded ? "Switzerland" : null,
    availableOn: refunded ? "2026-10-09T00:00:00.000Z" : null,
    reviewSubmitted: false,
    canCancel: !refunded,
    cancelWindow: "auto_full",
  };
}

/** One row of GET /api/account/bookings exactly as apps/web/lib/account/bookings.ts maps a paid booking today. */
export function accountRow(o = {}) {
  return {
    ref: REF,
    href: `/confirmation/${REF}`,
    date: "Tue 6 Oct",
    time: TIME,
    dateIso: DAY,
    flightNo: "",
    contactEmail: "amira@example.com",
    route: "Zurich Airport → Zermatt",
    pickup: "Zurich Airport",
    dropoff: "Zermatt",
    vehicle: "",
    chauffeur: "",
    pax: o.pax ?? 3,
    priceRappen: 0,
    status: "booked",
    when: "upcoming",
    group: "October 2026",
    reviewState: "none",
    reviewHref: "",
    pay_url: null,
    payable: false,
  };
}

/**
 * Builds the route handler.
 * o.side       : "before" | "after" (the details answer)
 * o.signedIn   : the session answer
 * o.refunded   : the guest booking is cancelled and refunded
 * o.bags, o.pax: counts on the guest booking
 * o.log        : optional array; every /api call is pushed as "METHOD path status"
 */
export function apiHandler(o = {}) {
  return (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const answer = (status, json) => {
      if (o.log) o.log.push(`${method} ${path} ${status}`);
      return route.fulfill({ status, json });
    };
    if (path === "/api/auth/session") {
      return answer(200, { signedIn: !!o.signedIn, finishRequired: false, displayName: "Amira Keller", email: "amira@example.com", emailConfirmed: true });
    }
    if (path === "/api/manage/booking") return answer(200, { ok: true, booking: guestBooking(o) });
    if (path === "/api/account/bookings") return answer(200, { bookings: [accountRow(o)] });
    if (path === "/api/account/bookings/details") {
      const base = { ok: true, money: null, driver: null, refundStatus: "none", refundOwedRappen: 0, refundedRappen: 0 };
      if (o.side === "after") Object.assign(base, { status: "confirmed", canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false });
      return answer(200, base);
    }
    if (method === "POST" && (path === "/api/manage/cancel" || path === "/api/account/bookings/paid-cancel")) {
      return answer(200, { ok: true, bookingId: "6a1f0e0e-0807-4c0d-9a31-0d5b1c4a0807", refundMode: "auto_full", refundStatus: "refunded", refundRappen: 0, payoutCountry: "CH", availableOn: "2026-10-09T00:00:00.000Z" });
    }
    if (method === "POST" && (path === "/api/manage/time-change" || path === "/api/account/bookings/time-change")) {
      return answer(200, { ok: true });
    }
    if (path === "/api/fx") return answer(200, { ok: true, rates: {} });
    return answer(200, { ok: true });
  };
}
