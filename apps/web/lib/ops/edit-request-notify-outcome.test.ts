import { beforeEach, describe, expect, it, vi } from "vitest";

// fix/notification-kinds (20261012230000): the edit-request and edit-accept routes save the decision,
// then call notifyTimeChangeOutcome. Until the ledger allowed 'time_change' the claim raised 23514 and
// the throw turned a saved decision into a 500. The mail is best effort: a failure is logged, never thrown.

const loadTripForMail = vi.fn();
const notifyTimeChange = vi.fn();

vi.mock("@/lib/db/identity", () => ({ asCustomer: vi.fn(), asGuest: vi.fn(), asSystem: vi.fn() }));
vi.mock("@/lib/db/system-reads", () => ({
  loadEditBookingContact: vi.fn(),
  loadEditExtraSession: vi.fn(),
  loadEditPendingPayload: vi.fn(),
  loadTripForMail: (...a: unknown[]) => loadTripForMail(...a),
  supersedePendingEditRequest: vi.fn(),
  writeFlightNumber: vi.fn(),
}));
vi.mock("@/lib/lifecycle/notify-lifecycle", () => ({
  notifyFlightNumber: vi.fn(),
  notifyTimeChange: (...a: unknown[]) => notifyTimeChange(...a),
}));
vi.mock("@/lib/checkout/stripe", () => ({
  createCheckoutSession: vi.fn(),
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
  hostedSessionIsPayable: vi.fn(),
  stripeFromEnv: vi.fn(),
}));
vi.mock("@/lib/quote/lock", () => ({ verifyLock: vi.fn() }));

import { notifyTimeChangeOutcome } from "./edit-request";

const env = {} as CloudflareEnv;
const ROW = {
  contact_email: "traveller@example.test",
  locale: "de",
  reference: "VT-00001",
  pickup_text: "ZRH",
  dropoff_text: "Zurich HB",
  scheduled_local: "2026-11-01T08:00",
  chauffeur_email: "chauffeur@example.test",
  booking_leg_id: "leg-1",
};

describe("notifyTimeChangeOutcome is best effort", () => {
  beforeEach(() => {
    loadTripForMail.mockReset();
    notifyTimeChange.mockReset();
  });

  it("resolves and logs when the claim refuses the kind (23514)", async () => {
    loadTripForMail.mockResolvedValue(ROW);
    notifyTimeChange.mockRejectedValue(
      Object.assign(new Error('new row violates check constraint "booking_notifications_kind_check"'), {
        code: "23514",
      }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyTimeChangeOutcome(env, "b-1", "confirmed")).resolves.toBeUndefined();
    expect(notifyTimeChange).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "notifyTimeChangeOutcome",
      "b-1",
      "confirmed",
      expect.stringContaining("booking_notifications_kind_check"),
    );
    log.mockRestore();
  });

  it("resolves when the trip read fails", async () => {
    loadTripForMail.mockRejectedValue(new Error("connection reset"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyTimeChangeOutcome(env, "b-1", "refused")).resolves.toBeUndefined();
    expect(notifyTimeChange).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("still sends: confirmed copies the chauffeur, refused does not", async () => {
    loadTripForMail.mockResolvedValue(ROW);
    notifyTimeChange.mockResolvedValue(undefined);
    await notifyTimeChangeOutcome(env, "b-1", "confirmed");
    await notifyTimeChangeOutcome(env, "b-1", "refused");
    expect(notifyTimeChange.mock.calls[0]![1]).toMatchObject({
      bookingId: "b-1",
      outcome: "confirmed",
      chauffeurEmail: "chauffeur@example.test",
      bookingLegId: "leg-1",
    });
    expect(notifyTimeChange.mock.calls[1]![1]).toMatchObject({ outcome: "refused", chauffeurEmail: undefined });
  });
});
