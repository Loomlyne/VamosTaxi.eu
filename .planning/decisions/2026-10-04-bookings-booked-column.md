# Decision: creation date on the dashboard bookings table

Owner, 2026-10-04 20:09 +0400. Chat: "on bookings table i wanna see the date of creation directly there". Question form:

- Format: "Date and time (Recommended)": Zurich time, e.g. "4 Oct · 14:32"; the year is added only when it is not
  the current year ("4 Oct 2025 · 14:32").
- Position: "Next to the reference (Recommended)": Ref · Booked · Pickup · Customer · Route · Vehicle · Driver · Total.

Options he was shown: date and time / date only / how long ago; next to the reference / after the pickup time / last.
Job: `fix/ops-booked-column` (quick 261004-ops-booked-column).
