// apps/web/lib/ops/trip-change-browser.local-seed.test.ts
//
// 26.2 P6: the seed of the browser run (tests/e2e-worker/p6-run.sh -> p6-browser.e2e.mjs). Not a test of
// behaviour: it writes the paid bookings the browser run opens, the way checkout writes them (lines from
// checkoutCharge on a LIVE price book, shown class totals, distance, coordinates and Mapbox ids; see
// trip-change.local-fixture.ts), and leaves them, the live book, the admin and the three drivers in the
// database. Every manage token it mints (base64url of 32 random bytes; the table keeps the SHA-256) and the
// ids the browser script needs go into the JSON file named by P6_BROWSER_SEED_OUT.
// Skipped unless BOTH VAMOS_LOCAL_DB_PORT (a DISPOSABLE local stack) and P6_BROWSER_SEED_OUT are set.
// Rows are committed; synthetic rappen only; host fixed to 127.0.0.1. No password is written here: the
// browser script sets the admin's and the customer's through the local stack's admin API.
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { base64urlEncode } from "../crypto/hmac";
import { openWorld } from "./trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const OUT = process.env["P6_BROWSER_SEED_OUT"];

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: null }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000006`;
const CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

/** Europe/Zurich wall clock as the booking stores it ("YYYY-MM-DDTHH:mm"), `minutes` from now. */
function zurichLocal(minutes: number): string {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + minutes * 60_000)).forEach((x) => { p[x.type] = x.value; });
  return `${p["year"]}-${p["month"]}-${p["day"]}T${p["hour"]}:${p["minute"]}`;
}

describe.skipIf(!PORT || !OUT)("seed for the browser run (local, committed rows)", () => {
  it("seeds the paid bookings, the admin, three drivers and the manage tokens", { timeout: 120_000 }, async () => {
    const w = await openWorld(PORT!, tag, adminId, CLAIMS);
    const { su, ECO, BIZ, drivers, seedBooking } = w;
    try {
      // The fixture wrote the admin straight into auth.users (no instance, NULL token columns): make the row one the local
      // GoTrue can read, so the browser script can set a password through the admin API and sign in at the dashboard.
      await su`
        update auth.users set instance_id = '00000000-0000-0000-0000-000000000000', confirmation_token = '', recovery_token = '',
          email_change_token_new = '', email_change = '', email_change_token_current = '', phone_change = '', phone_change_token = '',
          reauthentication_token = '', raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb
        where id = ${adminId}`;
      // The O4 pair (a clash on driver a) is built around "now": X's pickup has just passed (so Complete is offered
      // on it, as in the real day), Y moves to a time inside X's window, Z is a third trip overlapping Y's new time.
      const o4 = { x: zurichLocal(-10), yTarget: zurichLocal(12), z: zurichLocal(17) };
      const rows = {
        dear: await seedBooking("dear", ECO, { local: "2030-01-01T10:00" }),
        cheap: await seedBooking("cheap", ECO, { local: "2030-01-03T10:00" }),
        time: await seedBooking("time", ECO, { local: "2030-01-05T10:00", driver: drivers.b }),
        x: await seedBooking("x", ECO, { local: o4.x, driver: drivers.a }),
        y: await seedBooking("y", ECO, { local: "2030-01-06T12:00", driver: drivers.a }),
        z: await seedBooking("z", ECO, { local: o4.z }),
        contact: await seedBooking("contact", ECO, { local: "2030-01-07T10:00" }),
        air: await seedBooking("air", ECO, { local: "2030-01-08T10:00", driver: drivers.c }),
        edit8: await seedBooking("edit8", ECO, { local: "2030-01-09T10:00" }),
        acct: await seedBooking("acct", ECO, { local: "2030-01-10T10:00" }),
        canc: await seedBooking("canc", ECO, { local: "2030-01-11T10:00" }),
        // C8: two bookings opened from their two e-mailed links in one browser (the vt_manage cookie is one per site).
        pairA: await seedBooking("pairA", ECO, { local: "2030-01-12T10:00" }),
        pairB: await seedBooking("pairB", ECO, { local: "2030-01-13T10:00" }),
      };
      // An airport PICKUP with a flight number: swap pickup and destination (the seed writes Oerlikon -> airport).
      for (const key of ["air", "acct"] as const) {
        await su`
          update public.booking_legs set
            pickup_text = dropoff_text, pickup_place_id = dropoff_place_id, pickup_lat = dropoff_lat, pickup_lng = dropoff_lng,
            dropoff_text = pickup_text, dropoff_place_id = pickup_place_id, dropoff_lat = pickup_lat, dropoff_lng = pickup_lng,
            flight_no = 'LX 318'
          where booking_id = ${rows[key].id}`;
      }
      // Manage-link tokens: the raw value goes to the browser script, the table keeps the hash (hashManageToken).
      const tokens: Record<string, string> = {};
      for (const key of ["cheap", "air", "dear", "canc", "pairA", "pairB"] as const) {
        const bytes = randomBytes(32);
        tokens[key] = base64urlEncode(bytes);
        await su`
          insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
          values (${rows[key].id}, ${createHash("sha256").update(bytes).digest()}, now() + interval '7 days', 'manage')`;
      }
      // Checks that keep the run honest: the price book is live and every seeded booking is paid.
      const live = await su<{ n: number }[]>`select count(*)::int as n from public.rate_versions where status = 'live'`;
      expect(live[0]!.n).toBe(1);
      const out = {
        tag, adminId, adminEmail: `p6e-admin-${tag}@example.test`, ECO, BIZ, drivers, o4,
        customerEmail: `p6e-${tag}-acct@example.test`,
        bookings: Object.fromEntries(
          Object.entries(rows).map(([k, r]) => [k, { id: r.id, reference: r.reference, paid: r.paid, email: `p6e-${tag}-${k}@example.test` }]),
        ),
        tokens,
      };
      writeFileSync(OUT!, JSON.stringify(out, null, 1), { mode: 0o600 });
    } finally {
      // Not world.close(): that retires the live price book, and the browser run needs it live.
      await su.end({ timeout: 5 });
    }
  });
});
