// apps/web/lib/checkout/customer-cancel-cookie.test.ts
//
// Found by the P6 browser run (tests/e2e-worker/p6-browser.e2e.mjs, step C7): the e-mailed manage link
// opens /manage-booking?token=..., the middleware moves the token into the HttpOnly vt_manage cookie
// and redirects to the address without it (K100). The page then has no token to read, and "Confirm
// cancellation" did nothing: confirmCancel only sent the guest request when it held a token, and fell
// through to "Could not cancel this booking." without any request otherwise. The other handlers (time
// change, flight, resend) already follow how the booking was opened (authVia) and send the guest
// request with whatever token the address has (empty: the server reads the cookie first).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];

/** The confirmCancel handler of a page, as text. */
function confirmCancel(html: string): string {
  const a = html.indexOf("confirmCancel = () => {");
  expect(a).toBeGreaterThan(-1);
  const b = html.indexOf("\n  };", a);
  return html.slice(a, b);
}

describe("confirmCancel sends the request however the booking was opened", () => {
  it.each(PAGES)("%s: the account route when opened through the account, otherwise the guest route (the cookie carries the token)", (rel) => {
    const body = confirmCancel(read(rel));
    expect(body).toMatch(/this\.state\.authVia === 'account'/);
    expect(body).toMatch(/helper\.cancelAccount\(ticket\.reference\)/);
    expect(body).toMatch(/helper\.cancelGuest\(tok\)/);
    // The guest request is not gated on a token in the address (there is none once the cookie is set).
    expect(body).not.toMatch(/tok && helper\.cancelGuest/);
    expect(body).not.toMatch(/this\.state\.signedIn/);
  });

  it.each(PAGES)("%s: the same failure and success states as before", (rel) => {
    const body = confirmCancel(read(rel));
    expect(body).toMatch(/t\('Could not cancel this booking\.'\)/);
    expect(body).toMatch(/status: 'cancelled'/);
  });
});
