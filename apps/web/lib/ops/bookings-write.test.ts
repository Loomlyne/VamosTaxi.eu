import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extraWaitFromArrival } from "./bookings-map";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("bookings-write arrival clock (D-38)", () => {
  it("persists booking_legs.arrived_at on markArrival and does not charge Stripe", () => {
    const src = read("bookings-write.ts");
    expect(src).toMatch(/export async function markArrival/);
    expect(src).toMatch(/arrived_at = coalesce\(arrived_at, now\(\)\)/);
    expect(src).not.toMatch(/off_session/);
    expect(src).not.toMatch(/PaymentIntent/);
    const route = readFileSync(
      join(here, "../../app/[locale]/(ops)/api/staff/bookings/[id]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/markArrival/);
    expect(route).toMatch(/arrived === true/);
  });

  it("computes extra wait from published free_wait_minutes, not 60", () => {
    const wait = extraWaitFromArrival({
      arrivedAt: "2026-09-14T11:20:00.000Z",
      scheduledAt: "2026-09-14T10:00:00.000Z",
      freeWaitMinutes: 45,
      unitMinutes: 15,
      amountRappen: 1500,
    });
    expect(wait.extraMinutes).toBe(35);
    expect(wait.extraRappen).toBe(3 * 1500);
    const noFree = extraWaitFromArrival({
      arrivedAt: "2026-09-14T10:10:00.000Z",
      scheduledAt: "2026-09-14T10:00:00.000Z",
      freeWaitMinutes: null,
      amountRappen: 2000,
    });
    expect(noFree.extraMinutes).toBe(10);
    expect(noFree.extraRappen).toBe(2000);
    expect(wait.extraMinutes).not.toBe(60);
  });
});
