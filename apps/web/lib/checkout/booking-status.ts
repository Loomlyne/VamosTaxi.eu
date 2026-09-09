export const BOOKING_REFERENCE_RE = /^VT-[0-9]{2}-[0-9]{4,5}$/;

export function isProcessingStatus(status: string): boolean {
  return status === "pending" || status === "paid" || status === "quote";
}

export function isVoucherStatus(status: string): boolean {
  return (
    status === "confirmed" ||
    status === "assigned" ||
    status === "completed" ||
    status === "partially_completed" ||
    status === "partially_cancelled"
  );
}
