// Stubbed /api/** answers for the manage-booking and booking-detail pictures. Nothing reaches a real server.
// No CHF amount is invented: money is null / absent, so the page shows its own placeholder.
export const HIDE = `[data-ck-banner],[data-ck-veil],[data-ck-modal]{display:none!important}
*,*::before,*::after{transition:none!important;animation-duration:0s!important}`;

export const TOKEN = "k3J9xQ2mV7pL4tR8wN5aZ"; // 21 chars: the page needs 8+ to treat the address as a link
export const REF = "VT-26-0807";

/** A pickup five days ahead, as the Zurich wall clock the API sends (YYYY-MM-DDTHH:MM). */
export function pickupLocal(daysAhead = 5, time = "08:15") {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const iso = d.toISOString().slice(0, 10);
  return { iso, time, local: `${iso}T${time}` };
}

export const DRIVER = {
  firstName: "Marco Rossi",
  phone: "+41 79 123 45 67",
  vehicleModel: "Van luxury",
  plate: "ZH 482 913",
};

export function guestBooking(p = pickupLocal()) {
  return {
    id: "6a1f0e0e-0807-4c0d-9a31-0d5b1c4a0807",
    reference: REF,
    status: "confirmed",
    locale: "en",
    contactName: "Amira Keller",
    contactEmail: "amira@example.com",
    pickupText: "Zurich Airport",
    dropoffText: "Zermatt",
    scheduledLocal: p.local,
    originalScheduledAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    flightNo: "",
    pax: 10,
    bags: 6,
    driver: DRIVER,
    money: null,
    priceTotalRappen: 0,
    refundStatus: "none",
    refundOwedRappen: 0,
    refundedRappen: 0,
    payoutCountry: null,
    payoutCountryLabel: null,
    availableOn: null,
    reviewSubmitted: false,
    canCancel: true,
    cancelWindow: "auto_full",
  };
}

export function accountRow(p = pickupLocal()) {
  return {
    ref: REF,
    status: "confirmed",
    pickup: "Zurich Airport",
    dropoff: "Zermatt",
    dateIso: p.iso,
    time: p.time,
    date: "",
    pax: 10,
    flightNo: "",
    contactEmail: "amira@example.com",
    priceRappen: 0,
  };
}

/**
 * Builds the route handler.
 * opts.signedIn      : the session answer (booking-detail shot is signed in)
 * opts.timeChange    : { status, body } the time-change POST answers with
 * opts.onRequest(fn) : optional hook, called with (method, url)
 */
export function apiHandler(opts = {}) {
  const p = pickupLocal();
  return (route) => {
    const req = route.request();
    const url = req.url();
    const path = new URL(url).pathname;
    const method = req.method();
    if (opts.onRequest) opts.onRequest(method, path);
    if (path === "/api/auth/session") {
      return route.fulfill({ json: { signedIn: !!opts.signedIn, finishRequired: false, displayName: "Amira Keller", email: "amira@example.com", emailConfirmed: true } });
    }
    if (path === "/api/manage/booking") {
      if (opts.guest === false) return route.fulfill({ status: 404, json: { ok: false, code: "not-found" } });
      return route.fulfill({ json: { ok: true, booking: guestBooking(p) } });
    }
    if (path === "/api/account/bookings") return route.fulfill({ json: { ok: true, bookings: [accountRow(p)] } });
    if (path === "/api/account/bookings/details") {
      return route.fulfill({ json: { ok: true, money: null, driver: DRIVER, refundStatus: "none", refundOwedRappen: 0, refundedRappen: 0 } });
    }
    if (method === "POST" && (path === "/api/manage/time-change" || path === "/api/account/bookings/time-change")) {
      const tc = opts.timeChange || { status: 200, body: { ok: true } };
      return route.fulfill({ status: tc.status, json: tc.body });
    }
    return route.fulfill({ json: { ok: true } });
  };
}
