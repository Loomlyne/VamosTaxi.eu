// apps/web/lib/ops/class-labels.test.ts
//
// 26.1-19 (26.1-31 leftover): ops labels follow the D-14 line-up through
// class-slug.ts. Live slugs saden / mercedes-benz-v-class / van-luxury read
// Economy / Business / Van luxury; names stay Latin in every language (D-14a).

import { describe, expect, it } from "vitest";
import { mapBoardBooking } from "./bookings-map";
import { vehicleClassLabelKey } from "./vehicle-class-label";

function boardRow(classSlug: string | null) {
  return mapBoardBooking({
    id: "55555555-5555-4555-8555-555555555555",
    reference: "VT-26-0901",
    status: "confirmed",
    contact_name: "Ada",
    contact_email: "ada@example.com",
    contact_phone: null,
    company_name: null,
    note: null,
    pay_link_sent_at: null,
    pickup_text: "ZRH",
    dropoff_text: "Zurich",
    scheduled_local: "2026-10-02T09:00",
    scheduled_at: "2026-10-02T09:00:00+00",
    flight_no: null,
    pax: 1,
    bags: 0,
    class_slug: classSlug,
    chauffeur_name: null,
    payment_status: "succeeded",
    captured_at: "2026-09-28T09:00:00.000Z",
    payment_created_at: "2026-09-28T08:50:00.000Z",
    stripe_checkout_session_id: "cs_test_labels",
    charged_rappen: 8000,
  });
}

describe("ops board class labels (D-14)", () => {
  it("labels the live slugs Economy, Business, Van luxury", () => {
    expect(boardRow("saden").klass).toBe("Economy");
    expect(boardRow("mercedes-benz-v-class").klass).toBe("Business");
    expect(boardRow("van-luxury").klass).toBe("Van luxury");
  });

  it("moves legacy slugs onto the live names", () => {
    expect(boardRow("economy").klass).toBe("Economy");
    expect(boardRow("business").klass).toBe("Business");
    expect(boardRow("van").klass).toBe("Van luxury");
  });

  it("the transfer fare line names the live class", () => {
    const row = mapBoardBooking({
      ...{
        id: "55555555-5555-4555-8555-555555555556",
        reference: "VT-26-0902",
        status: "confirmed",
        contact_name: "Ada",
        contact_email: "ada@example.com",
        contact_phone: null,
        company_name: null,
        note: null,
        pay_link_sent_at: null,
        pickup_text: "ZRH",
        dropoff_text: "Zurich",
        scheduled_local: "2026-10-02T09:00",
        scheduled_at: "2026-10-02T09:00:00+00",
        flight_no: null,
        pax: 1,
        bags: 0,
        chauffeur_name: null,
        payment_status: "succeeded",
        captured_at: "2026-09-28T09:00:00.000Z",
        payment_created_at: "2026-09-28T08:50:00.000Z",
        stripe_checkout_session_id: "cs_test_labels2",
        charged_rappen: 8000,
      },
      class_slug: "mercedes-benz-v-class",
      lines: [{ code: "distance_fare", amount_rappen: 8000 }],
    });
    expect(row.fareLines[0]?.label).toBe("Transfer, Business");
  });
});

describe("vehicleClassLabelKey (D-14, D-14a)", () => {
  it("maps live and legacy slugs to the Latin product-name keys", () => {
    expect(vehicleClassLabelKey("saden")).toBe("checkout.classEconomy");
    expect(vehicleClassLabelKey("economy")).toBe("checkout.classEconomy");
    expect(vehicleClassLabelKey("mercedes-benz-v-class")).toBe("checkout.classBusiness");
    expect(vehicleClassLabelKey("business")).toBe("checkout.classBusiness");
    expect(vehicleClassLabelKey("van-luxury")).toBe("checkout.classVanLuxury");
    expect(vehicleClassLabelKey("van")).toBe("checkout.classVanLuxury");
  });

  it("returns null for a dropped or unknown class", () => {
    expect(vehicleClassLabelKey("first")).toBeNull();
    expect(vehicleClassLabelKey("mahaha")).toBeNull();
  });
});
