# Decisions

## Confirmed

1. Koussay will build the product himself with AI assistance.
2. Target delivery is no more than one month.
3. Build a pre-booked transfer website plus operations dashboard, not an Uber clone.
4. Transfeero is a product and UX quality reference, not a request to reproduce its global marketplace.
5. Responsive web only for V1 — no native customer or driver apps.
6. Swiss local operator only (Zurich/Switzerland first). Not global multi-country marketplace.
7. No driver app and no driver dashboard. Drivers are admin records only; assignment is manual in ops.
8. Design bar: simpler than Transfeero chrome, mobile-first, excellent on desktop.
9. Customer accounts: Supabase Auth with booking history, profile, and manage-booking from account.
10. Guest checkout still allowed for conversion; email magic link can claim bookings into an account.
11. Maps: Mapbox free tier for map UI, pin-pick destination/pickup, route display. Server geocoding/routing via Mapbox APIs (or hybrid if airport search quality needs Google later).
12. Product model is **scheduled transfer, not on-demand**. Customer books ahead (e.g. now for tomorrow). Driver is assigned and waits at the agreed pickup time/place. No live Uber-style matching, no continuous GPS, no “car arriving in 3 min.”
13. Live location is out of V1. Map is for choosing pickup/dropoff + showing the planned route/distance for pricing and confirmation only. Automation = confirmations, reminders before pickup time, status emails, admin assignment.
14. Stack: Next.js App Router, TypeScript, Tailwind, shadcn/ui, Supabase, Vercel, Resend, Stripe (standard account), Mapbox.
15. Do **not** use Stripe Connect for V1. Connect is for multi-party marketplaces/payouts. Vamos is one merchant; use Stripe Checkout/PaymentIntents + own coupon/voucher system.
16. Coupons/vouchers at checkout: first-class. Codes reduce quote total; rules in Supabase; optional Stripe promotion codes later.
17. Automate as much as possible with this simple stack: paid webhook → confirmed booking → emails → admin notify; pre-trip reminders; cancel policy enforcement; no manual re-entry of paid bookings.
18. Manual dispatcher assignment is sufficient for V1.
19. Begin from a clean MIT-compatible starter, not Medusa.
20. Open-source research must be evaluated by required feature coverage, workflow fit, licence clarity, maintenance, security and build quality.
21. Restaurant menu material is unrelated and must never be included in Vamos Taxi.
22. Live-site audit (2026-07-16): current production is Inware Freshpage (PHP CMS), not a portable codebase. Do not reverse-engineer or host-fork Freshpage; rebuild greenfield per stack decisions above.
23. Do not store production admin credentials, Maps API keys, or payment secrets in this repo. Document exposure findings only (see `docs/CURRENT-SITE-AUDIT.md`).

## Recommended but awaiting confirmation

- Launch languages: English and German first.
- Primary currency: CHF.
- Collect flight numbers; postpone automated flight-status integration.
- Support transfer, return transfer, cash/pay-later and Stripe (TWINT if Stripe account eligible).
- Move Supabase to Pro before accepting production bookings.
- Mapbox free tier caps: monitor; upgrade only if usage exceeds free.
- Item “6.” from latest product notes was empty — clarify if anything else is intended.

## Explicitly out of scope for V1

- Native apps (customer or driver)
- Global multi-country supply marketplace
- Driver dashboard / driver app
- Stripe Connect multi-account payouts
- Continuous automatic driver GPS tracking without a location feed
- Uber street-hail / surge
- Affiliate / hotel partner portals
- Automatic nearest-driver dispatch
