// Stubbed /api/** answers for tools/mirror-check.mjs when it runs against a static tree.
// Nothing reaches a real server. No CHF amount is invented: money is null, so the pages show their own placeholder.
// (Shapes follow tools/stubs.mjs of this job and 261001-arabic-design-g23/tools/shoot.mjs.)

/** Switches off transitions and animations so a computed transform is the resting value, and hides the cookie banner. */
export const HIDE = `[data-ck-banner],[data-ck-veil],[data-ck-modal]{display:none!important}
*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}`;

export const TOKEN = "k3J9xQ2mV7pL4tR8wN5aZ"; // 21 chars: the page needs 8+ to treat the address as a link
export const REF = "VT-26-0807";

/** A pickup `daysAhead` days ahead, as the Zurich wall clock the API sends (YYYY-MM-DDTHH:MM). */
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
    pax: 4,
    bags: 2,
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

/** One row of GET /api/account/bookings, in the shape account.dc.html and bookings.dc.html read. */
export function accountRow(ref, daysAhead, status = "confirmed", when = "upcoming") {
  const p = pickupLocal(daysAhead);
  const d = new Date(`${p.iso}T12:00:00Z`);
  return {
    ref,
    when,
    group: when === "upcoming" ? "Coming up" : "Earlier",
    status,
    pickup: "Zurich Airport",
    dropoff: "Zermatt",
    route: "Zurich Airport to Zermatt",
    vehicle: "Van luxury",
    chauffeur: "",
    date: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    time: p.time,
    dateIso: p.iso,
    pax: 4,
    flightNo: "",
    href: `/confirmation/${ref}`,
    reviewState: "none",
    reviewHref: "",
    contactEmail: "amira@example.com",
    priceRappen: 0,
  };
}

/**
 * Builds the Playwright route handler for `**\/api/**`.
 * opts.signedIn : the session answer
 * opts.guest    : false = the manage-booking token finds nothing
 */
export function apiHandler(opts = {}) {
  const p = pickupLocal();
  return (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (method === "POST" && path === "/api/auth") return route.fulfill({ contentType: "application/json", body: "null" });
    if (path === "/api/auth/session") {
      return route.fulfill({
        json: { signedIn: !!opts.signedIn, finishRequired: false, displayName: "Amira Keller", email: "amira@example.com", emailConfirmed: true },
      });
    }
    if (path === "/api/manage/booking") {
      if (opts.guest === false) return route.fulfill({ status: 404, json: { ok: false, code: "not-found" } });
      return route.fulfill({ json: { ok: true, booking: guestBooking(p) } });
    }
    if (path === "/api/reviews") {
      // Fixture rows so the home trust row (shown only when published reviews exist) renders. Not customer-visible.
      const row = (id, rating) => ({ id, source: "trustpilot", authorName: "Test", body: "Test", rating, published: true, verified: true });
      return route.fulfill({ json: { ok: true, data: [row("r1", 5), row("r2", 4)] } });
    }
    if (path === "/api/account/bookings") {
      return route.fulfill({
        json: {
          ok: true,
          bookings: [
            accountRow(REF, 5),
            accountRow("VT-26-0808", 9),
            accountRow("VT-26-0809", 14, "awaiting_payment"),
            accountRow("VT-26-0701", -20, "completed", "past"),
          ],
        },
      });
    }
    if (path === "/api/account/bookings/details") {
      return route.fulfill({ json: { ok: true, money: null, driver: DRIVER, refundStatus: "none", refundOwedRappen: 0, refundedRappen: 0 } });
    }
    return route.fulfill({ json: { ok: true } });
  };
}
