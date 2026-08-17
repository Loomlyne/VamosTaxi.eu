# Vamos Taxi Product Brief

## Vision

Replace the current Vamos Taxi website with a premium, mobile-first **scheduled** transfer-booking experience and an operations dashboard. Customers book ahead (e.g. today for tomorrow), get a fixed price, pay, and receive confirmation. At the agreed pickup time the assigned driver is waiting. This is not on-demand ride-hailing and not live GPS matching.

Proposed promise:

> Reliable, fixed-price airport and corporate rides booked in under one minute.

## Owner and delivery model

- Koussay will build the product himself with AI assistance.
- Target delivery window: one month.
- Full source-code ownership is required.
- Reference experience: Transfeero, adapted to the smaller Vamos operation rather than cloned.

## Core customer journey

1. Enter pickup and destination (search and/or map pin click).
2. Select one-way or return journey.
3. Select pickup date, time, passengers and luggage.
4. Calculate route and price (server-side); show route on map.
5. Select an eligible vehicle class.
6. Add flight details and extras; apply coupon/voucher if any.
7. Sign in / create account or continue as guest with email.
8. Pay online (Stripe) or select an approved offline method.
9. Receive confirmation and booking voucher (Resend).
10. Manage booking via account history and/or secure email link.
11. Status updates automated where possible (paid → confirmed, reminders, cancel rules).

## V1 public website

- Homepage with prominent booking widget (mobile-first, strong desktop)
- Mapbox map: search + click-to-set pickup/destination
- Quote and vehicle-selection flow
- Passenger, luggage and flight fields
- Extras such as child seats and additional stops
- Coupon / voucher code at checkout
- Auth: sign up / sign in (magic link or email+password via Supabase)
- Account area: profile, booking history, open booking detail
- Guest checkout + claim-into-account via email
- Checkout and payment result pages
- Booking confirmation and voucher
- Secure booking-management page (works logged-in or token link)
- Airport transfers
- City-to-city/private transfers
- Chauffeur by the hour, if approved for launch
- Corporate transportation
- About, contact and FAQ
- Terms, privacy, cookies, imprint and cancellation policy
- Reusable destination and fixed-route SEO pages

## V1 admin dashboard

- Overview metrics
- Booking table and calendar
- Booking detail and status history
- Manual booking creation
- Confirm, modify and cancel bookings
- Refund tracking
- Driver and vehicle assignment
- Driver records
- Vehicle classes and capacities
- Fixed-route prices
- Distance-based pricing rules
- Airport, night, waiting-time and extras fees
- Customer records
- Coupons
- Payment status
- Resend confirmation or voucher
- CSV export
- Admin roles and activity history
- Business and notification settings

## Pricing engine

The system must support both fixed and calculated pricing.

### Fixed routes

A configured pickup/destination pair has a defined price per vehicle class. Fixed-route pricing overrides calculated pricing.

### Calculated routes

```text
base fare
+ route distance × per-kilometre rate
+ duration or waiting charge where applicable
+ airport surcharge
+ time/night surcharge
+ vehicle multiplier
+ extras
- discount
+ tax where applicable
```

Pricing rules must be versioned or snapshotted on each booking so later rule changes do not alter historical bookings.

## Proposed stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL, Auth, Storage and Row Level Security
- Vercel hosting, server functions, webhooks and cron
- Mapbox (free tier first): map UI, pin-pick pickup/destination, directions/route for distance/duration and quote map
- Stripe **standard** merchant account for cards / Apple Pay / TWINT where eligible (not Stripe Connect)
- Own coupons/vouchers table + checkout apply (discounts before payment)
- Resend for transactional email
- Sentry for production error monitoring
- Vercel Analytics or PostHog for booking-funnel analytics

Use a clean Next.js/Supabase starter. Do not add Medusa for V1 because its product/cart/order model introduces unnecessary commerce infrastructure and still requires custom booking, pricing and dispatch modules.

Fallback: if Mapbox geocoding quality for Swiss airports is weak, add Google Places for autocomplete only; keep Mapbox for map/pin UX.

## Initial data model

- `profiles`
- `admin_users`
- `customers`
- `drivers`
- `vehicles`
- `vehicle_categories`
- `service_zones`
- `airports`
- `fixed_routes`
- `pricing_rules`
- `extras`
- `bookings`
- `booking_legs`
- `booking_extras`
- `payments`
- `refunds`
- `coupons`
- `booking_events`
- `notification_deliveries`
- `business_settings`

## Security requirements

- Supabase RLS on every customer or operational table
- Server-side authoritative quote calculation
- Stripe webhook signature verification
- Idempotent payment and booking creation
- No secret keys exposed to the browser or committed to Git
- Admin role checks on every privileged operation
- Audit trail for booking, price, payment and assignment changes
- GDPR-aligned data retention, consent and deletion procedures
- Production backups before accepting live bookings

## Explicitly out of scope for V1

- Uber-style on-demand marketplace
- Global multi-country partner marketplace
- Automatic nearest-driver dispatch
- Continuous driver GPS tracking without a driver location feed
- Driver app or driver dashboard
- Stripe Connect multi-merchant payouts
- Driver wallets and automated payouts
- Surge pricing
- Native customer or driver applications
- Advanced fleet optimization
- Affiliate or hotel partner portals
- Automated flight tracking unless added after the core flow is stable
- Restaurant menu content accidentally supplied in conversation

## Delivery outline

### Week 1

- Freeze business rules
- Establish design system
- Set up repository, Next.js and Supabase
- Design schema and RLS
- Build homepage and booking widget
- Integrate Places and Routes
- Implement pricing engine

### Week 2

- Complete quote and vehicle flow
- Passenger, flight and extras steps
- Stripe checkout and webhooks
- Confirmation, voucher and email
- Return journey support

### Week 3

- Admin dashboard
- Booking calendar and details
- Manual bookings
- Driver and vehicle assignment
- Pricing, routes, extras, coupons and settings

### Week 4

- Marketing, legal and SEO pages
- Responsive and accessibility QA
- Payment and webhook verification
- Security and RLS review
- Analytics and monitoring
- Content migration
- Production deployment and acceptance testing

## Cost assumptions

### Development tools owned or planned

- Codex: USD 100/month
- Claude: USD 20/month
- GLM 5.2: USD 16/month
- Cursor Pro: prepaid for one year
- SuperGrok: prepaid for one year
- Total incremental AI subscriptions: USD 136/month

### Platform operations

- Vercel Pro: approximately USD 20/month for commercial use
- Supabase Free during development; Pro approximately USD 25/month recommended for live bookings
- Resend Free initially within limits
- Mapbox free tier first; paid only after free limits
- Stripe has no normal monthly fee but charges transaction fees (standard account, not Connect)
- Existing domain renewal depends on the current registrar

Expected early production platform baseline: approximately USD 45/month for Vercel Pro plus Supabase Pro, excluding maps overages, email overages, domain renewal and payment fees.
