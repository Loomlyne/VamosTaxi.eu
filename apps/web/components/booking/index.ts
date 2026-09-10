// Per-category barrel (booking). Same pattern as components/forms/index.ts — each port
// batch gets its own barrel so they never contend for one shared file.
export { BookingDraftFields } from "./BookingDraftFields";
export { ContactFields, isCheckoutEmail } from "./ContactFields";
export type { ContactFieldsValue, ContactFieldsErrors } from "./ContactFields";
export { FlightField } from "./FlightField";
export { formatFlightInput, normaliseFlightNumber } from "@/lib/flight/format";
