// apps/web/lib/checkout/resume.ts
//
// GET /api/checkout/resume?quote=<uuid> — pure logic. D-24 / D-25: Back from Stripe
// refills the one-page checkout. Everything is gated on the vt_manage cookie whose
// hash matches an active manage token of that quote's booking; with no match the
// answer is "none" (no cookie) or "purged" (cookie but no booking) and carries no data.

import type Stripe from "stripe";
import { hostedSessionIsPayable } from "./stripe";

export type ResumeRow = {
  booking_id: string;
  quote_id: string;
  reference: string;
  status: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  company_name: string;
  company_address: string;
  company_vat: string;
  note: string;
  class_slug: string | null;
  extra_codes: string[] | null;
  coupon_code: string | null;
  charged_rappen: number;
  pay_link_sent: boolean;
  latest_session_id: string | null;
  checkout_trip_query: string;
};

export type ResumeDeps = {
  /** SHA-256 hex of the raw cookie; "" when empty or undecodable. */
  hashCookie: (raw: string) => Promise<string>;
  readRow: (quoteId: string, hashHex: string) => Promise<ResumeRow | null>;
  retrieveSession: (id: string) => Promise<Stripe.Checkout.Session | null>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAID: readonly string[] = [
  "paid",
  "confirmed",
  "assigned",
  "completed",
  "partially_cancelled",
  "partially_completed",
];

export type ResumeAnswer =
  | { state: "none" }
  | { state: "purged" }
  | { state: "paid"; reference: string }
  | ({ state: "open"; url: string } & ResumeFields)
  | ({ state: "expired" } & ResumeFields);

type ResumeFields = {
  booking_id: string;
  quote_id: string;
  trip_query: string;
  contact: { name: string; email: string; phone: string };
  company: { name: string; address: string; vat: string };
  note: string;
  class: string | null;
  extra_codes: string[];
  coupon: string | null;
  charged_rappen: number;
};

function fields(row: ResumeRow): ResumeFields {
  return {
    booking_id: row.booking_id,
    quote_id: row.quote_id,
    trip_query: row.checkout_trip_query,
    contact: { name: row.contact_name, email: row.contact_email, phone: row.contact_phone },
    company: { name: row.company_name, address: row.company_address, vat: row.company_vat },
    note: row.note,
    class: row.class_slug,
    extra_codes: row.extra_codes ?? [],
    coupon: row.coupon_code,
    charged_rappen: row.charged_rappen,
  };
}

export async function resumeCheckoutWithDeps(
  quoteId: string | null,
  rawCookie: string,
  deps: ResumeDeps,
): Promise<ResumeAnswer> {
  if (!rawCookie || !quoteId || !UUID.test(quoteId)) return { state: "none" };
  const hashHex = await deps.hashCookie(rawCookie);
  if (!hashHex) return { state: "none" };

  const row = await deps.readRow(quoteId.toLowerCase(), hashHex);
  if (!row) return { state: "purged" };
  if (PAID.includes(row.status)) return { state: "paid", reference: row.reference };
  if (row.status !== "pending") return { state: "purged" };

  let session: Stripe.Checkout.Session | null = null;
  if (row.latest_session_id) {
    try {
      session = await deps.retrieveSession(row.latest_session_id);
    } catch {
      session = null;
    }
  }
  if (hostedSessionIsPayable(session, row.charged_rappen)) {
    return { state: "open", url: session.url as string, ...fields(row) };
  }
  return { state: "expired", ...fields(row) };
}
