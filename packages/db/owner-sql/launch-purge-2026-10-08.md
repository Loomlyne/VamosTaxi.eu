# Launch purge, 2026-10-08 (already executed, do not rerun)

Run against the VamosTaxi Supabase project (eu-central-2) before go-live.

Removed: all bookings, payments, refunds, price snapshots, Stripe events, consent rows,
support tickets and files, chauffeurs and leave, daily digests, pay presses, and the
sign-in accounts of the deleted customers.

Kept: pricing, routes, zones, surcharges, coupons, rate versions, settings, content strings,
vehicle classes, staff, audit log, booking reference counter, booking VT-26-0754, and the
customers mariamahdouni@gmail.com and wasis8173@gmail.com.

Append-only guards (booking_events, price_snapshots, price_snapshot_legs, booking_refunds,
booking_notifications, consent_log, account_agreement_records, stripe_events) were switched
off inside one transaction and switched back on before commit. The circular foreign keys on
price_snapshots were dropped and re-added in the same transaction.

Staff: vamostaxich@gmail.com added as admin with sign_in_method magic_link. The digest email
for koussayzayeni@gmail.com is off; that account keeps admin sign-in.
