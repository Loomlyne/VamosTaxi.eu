import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("ops booking id lookup", () => {
  it("looks up as staff, never as system", () => {
    const src = read("resolve-booking-id.ts");
    expect(src).toMatch(/asStaff/);
    expect(src).not.toMatch(/asSystem/);
  });

  it("cancelBooking resolves as staff then RPCs as system", () => {
    const src = read("bookings-write.ts");
    const start = src.indexOf("export async function cancelBooking");
    const end = src.indexOf("export async function updateBooking");
    const cancel = src.slice(start, end);
    expect(cancel).toMatch(/BOOKING_UUID/);
    expect(cancel).toMatch(/resolveStaffBookingId/);
    expect(cancel).toMatch(/ops_cancel_booking/);
    expect(cancel).toMatch(/asSystem/);
    expect(cancel).not.toMatch(/from public\.bookings/);
  });
});
