# Scope of Work

**Project:** Vamos Taxi — Scheduled Transfer Booking Platform (V1)  
**Client:** Vamos Taxi GmbH  
**Provider:** Koussay Zayani  
**Document type:** Statement of Work / Delivery Contract Annex  
**Version:** 1.0  
**Date:** 18 July 2026  
**Delivery window:** 3–4 weeks from project kickoff (target: within one calendar month)

---

## 1. Purpose

This document defines everything included in the V1 rebuild of the Vamos Taxi digital platform: public website, design system, customer booking system, pricing calculations, payments, automated emails, customer accounts, and the internal operations dashboard.

It is intended to be signed or accepted by the Client so both parties share one clear list of deliverables, timeline, responsibilities, and exclusions.

---

## 2. Project summary

| Item | Detail |
|------|--------|
| Product | Premium **scheduled** airport and private transfer booking platform for Switzerland (Zurich-first) |
| Model | Customer books in advance (e.g. today for tomorrow). Fixed price. Driver waits at the agreed place and time. |
| Not building | Uber-style on-demand rides, live driver GPS tracking, native apps, global marketplace |
| Reference UX | Transfeero-level booking quality adapted to a local Swiss operator |
| Ownership | Full source code and production credentials handed to the Client at acceptance |

**Customer promise (product):**  
Reliable, fixed-price airport and corporate rides booked in under one minute.

---

## 3. Parties and roles

| Role | Responsibility |
|------|----------------|
| **Provider** | Design, development, integrations, deployment setup, training handoff for V1 scope below |
| **Client** | Business rules, brand assets, legal copy, Stripe/business accounts, content approval, acceptance testing within agreed windows |

---

## 4. What will be delivered

### 4.1 Brand and interface design

- Mobile-first, desktop-excellent UI based on Vamos Taxi brand direction (yellow / charcoal premium transfer identity)
- Design system in code: colours, typography, buttons, forms, cards, spacing
- Homepage and booking flow layouts
- Account pages and confirmation / voucher screens
- Operations dashboard UI (clean, functional, professional)
- Responsive behaviour for phone, tablet, and desktop
- Simpler, calmer visual system than generic template sites; conversion-focused booking first

**Client provides:** final logo files (SVG preferred), brand fonts/licences if mandatory, vehicle photos, and any mandatory brand rules. Placeholders may be used until assets arrive; final swap is included when assets are supplied during the delivery window.

---

### 4.2 Public website (customer-facing)

| Module | Deliverable |
|--------|-------------|
| Homepage | Booking widget above the fold + marketing sections |
| Booking flow | Pickup / destination, date & time, passengers, luggage, one-way or return |
| Map experience | Mapbox map: address search + click-to-set pin for pickup and destination; planned route display for quote |
| Quote | Server-calculated distance, duration, and fixed price by vehicle class |
| Vehicles | Eligible vehicle classes only (capacity / luggage rules) |
| Details | Passenger info, flight number field, extras (e.g. child seats, extra stops if configured) |
| Coupons | Promo / voucher codes at checkout with discount applied to total |
| Checkout | Online payment via Stripe (standard merchant account) and optional offline / pay-later if Client enables |
| Confirmation | Success page + booking voucher content |
| Accounts | Sign up / sign in (Supabase Auth), profile, **booking history**, open booking detail |
| Guest path | Guest can book with email; can later attach bookings to an account |
| Manage booking | View booking; cancel / modify within Client policy rules (as configured) |
| Content pages | About, Contact, FAQ |
| Legal pages | Terms, Privacy, Imprint, Cancellation policy structure (Client supplies final legal text) |
| SEO pages | Structure for airport / fixed-route pages (initial set for key Swiss routes once Client lists them) |
| Languages | English + German UI strings for V1 (content Client-approved) |
| Currency | CHF primary (unless Client confirms otherwise in kickoff) |

---

### 4.3 Pricing and calculation engine

Server-side only (customer browser cannot invent prices).

| Capability | Description |
|------------|-------------|
| Fixed routes | Configured A→B prices per vehicle class (override calculated price) |
| Calculated routes | Base fare + distance rate + applicable surcharges + vehicle multiplier + extras − discount |
| Surcharges | Airport, night/time window, waiting rules — as supplied by Client |
| Extras | Priced add-ons (child seats, extra stops, etc.) |
| Coupons | Percentage or fixed amount; min booking value; expiry; usage limits |
| Snapshot | Price breakdown stored on each booking so later rule changes do not rewrite history |
| Validation | Minimum advance booking time, passenger/luggage vs vehicle capacity |

---

### 4.4 System integrations

| System | Use in V1 |
|--------|-----------|
| **Vercel** | Hosting, production deploy, serverless/API routes |
| **Supabase** | Database, Auth, storage, Row Level Security |
| **Mapbox** | Map UI, geocoding, directions for distance/duration (free tier first) |
| **Stripe** | Card / wallet payments as available on Client’s Stripe account; webhooks for paid/failed |
| **Resend** | Transactional email: confirmation, voucher, status updates, pre-trip reminders |

**Not included as primary architecture:** Stripe Connect (marketplace multi-account payouts), driver apps, Google Maps as primary (Mapbox first; Google Places only if airport search quality requires a fallback during build).

**Accounts and API keys:** Client owns business accounts. Provider configures integration during build. Ongoing usage fees (Stripe fees, Mapbox, email, hosting) are Client operating costs.

---

### 4.5 Automation (scheduled-transfer model)

Because this is **pre-booked for a future time**, not live Uber matching:

| Automation | Behaviour |
|------------|-----------|
| Payment success | Booking marked paid/confirmed; voucher email sent |
| Ops notify | New booking appears in admin; optional notify email |
| Pre-trip reminder | Email before pickup time (configurable window) |
| Status emails | Customer notified on key status changes (e.g. confirmed, cancelled) |
| Cancel rules | Free cancel window enforced per Client policy |
| No live GPS | Map shows planned route only; driver is expected at the booked time |

---

### 4.6 Operations dashboard (admin / dispatch)

Web dashboard for Vamos staff (not for drivers).

| Feature | Deliverable |
|---------|-------------|
| Secure admin login | Role-based access |
| Bookings list | Filter/search; sort by pickup date/time |
| Calendar / day view | See day’s transfers |
| Booking detail | Passenger, route, price breakdown, payment status, notes |
| Manual booking | Create booking for phone customers |
| Status workflow | e.g. new → confirmed → assigned → completed / cancelled |
| Assignment | Manually assign driver and vehicle (records only) |
| Drivers & vehicles | Simple directory (name, contact, vehicle class) — **no driver app login** |
| Pricing admin | Fixed routes, calculated rules, extras, coupons |
| Customers | Customer records linked to bookings |
| Export | CSV export of bookings |
| Audit | History of important booking / payment / assignment changes |

---

### 4.7 Security and quality baseline

- Row Level Security on operational data  
- Server-authoritative quotes and payments  
- Stripe webhook signature verification  
- Secrets not stored in public code  
- HTTPS production deploy  
- Basic monitoring setup path (error tracking recommended at launch)  
- Mobile + desktop smoke QA of main booking path  

---

### 4.8 Handover

- Production deployment on Client domain (or agreed subdomain)  
- Source code repository access for Client  
- Environment variable checklist  
- Short admin walkthrough (written or live session)  
- Acceptance checklist sign-off  

---

## 5. Explicitly out of scope (V1)

The following are **not** included unless added by written change order:

1. Native iOS / Android apps (customer or driver)  
2. Driver mobile app or driver self-service dashboard  
3. Live continuous GPS tracking of vehicles / Uber-style ETA  
4. On-demand “ride now” matching  
5. Global multi-country marketplace or multi-fleet platform  
6. Automatic nearest-driver assignment algorithms  
7. Stripe Connect multi-party payouts to freelancers  
8. Driver wallets, tips engine, or automated payroll  
9. Hotel / affiliate partner portals  
10. Full migration of historical Freshpage bookings (export assistance only if Client can export data)  
11. Legal advice or writing of binding Swiss legal text (Client or Client’s lawyer supplies final T&Cs / privacy)  
12. Professional photography production  
13. Paid ads, SEO content writing at scale, or social media management  
14. 24/7 support retainer after acceptance (support terms can be agreed separately)  
15. Features beyond this document discovered mid-project without change order  

---

## 6. Timeline (3–4 weeks)

Kickoff = day Client accepts this Scope **and** provides the Blocking Inputs in Section 7.

| Week | Focus | Outcome |
|------|--------|---------|
| **Week 1** | Foundation + design system + quote | App live in staging; homepage booking widget; Mapbox pin/search; route + price calculation; vehicle classes display |
| **Week 2** | Checkout + accounts + emails | Full book → pay → voucher path; coupons; customer auth + booking history; Resend emails |
| **Week 3** | Operations dashboard | Admin can run day-to-day: bookings, assign driver/vehicle, statuses, pricing & coupon admin, manual bookings |
| **Week 4** (buffer / polish) | Launch hardening | Legal/content pages, DE+EN polish, QA, security pass, production domain, Client acceptance |

**Hard target:** complete V1 within **one calendar month** from kickoff.  
**Fast path:** core public booking + payments may be demoable by end of Week 2 if Client inputs arrive on time.

Delays in Client inputs, Stripe account readiness, domain DNS access, or legal copy shift the calendar day-for-day.

---

## 7. Client responsibilities (required)

### 7.1 Blocking inputs (needed to start Week 1 pricing)

- Legal company details for imprint  
- Service area (cities / airports)  
- Vehicle classes: name, max passengers, max luggage, example vehicles  
- Pricing: base fare, per-km (or per class), minimum fare, fixed routes list, airport/night/extras fees  
- Booking policy: min advance time, free cancel window, refund rules, waiting rules  
- Currency confirmation (CHF recommended)  
- Languages confirmation (EN + DE recommended)  

### 7.2 Accounts Client must open or provide access to

- Domain DNS (vamostaxi.eu or agreed domain)  
- Stripe account (Switzerland / eligible methods; TWINT only if Stripe supports on that account)  
- Email sending domain for Resend (DNS records)  
- Mapbox account (or Provider creates under Client ownership)  
- Supabase + Vercel projects under Client ownership at handover  

### 7.3 Content and approval

- Final legal texts (Terms, Privacy, Cancellation)  
- Brand assets (logo, photos)  
- Feedback within **48 hours** on staging demos so the schedule holds  

---

## 8. Assumptions

1. Product is **scheduled transfer**, not street-hail.  
2. One operating company (Vamos Taxi); one Stripe merchant account.  
3. Dispatch assigns drivers manually inside the admin dashboard.  
4. Drivers are coordinated outside the software (phone / WhatsApp / radio) for V1.  
5. Mapbox free tier is sufficient for early traffic; Client upgrades if usage exceeds free limits.  
6. Transfeero is a quality reference only — not a feature-for-feature clone.  
7. Existing Freshpage site remains live until cutover; cutover plan agreed in Week 4.  

---

## 9. Acceptance criteria

V1 is accepted when all of the following work on staging or production:

1. Customer can complete a scheduled booking on mobile and desktop (quote → vehicle → details → pay or approved offline method → confirmation).  
2. Price shown matches configured rules for a test fixed route and a calculated route.  
3. Coupon code reduces total correctly when valid.  
4. Stripe test (or live) payment marks booking paid via webhook.  
5. Customer receives confirmation/voucher email.  
6. Customer account shows booking history.  
7. Admin can view booking, assign driver/vehicle, change status, create manual booking.  
8. Admin can edit core pricing rules and coupons.  
9. Public legal/about/contact pages are published with Client-approved content.  
10. Production deploy is reachable on the agreed domain; access handed over.  

Minor visual polish items listed jointly as “post-acceptance backlog” do not block acceptance if core flows above pass.

---

## 10. Change requests

Work outside this Scope requires written agreement (email is enough) covering:

- Description of change  
- Impact on timeline  
- Impact on fee (if any)  

Examples of change orders: driver app, live tracking, multi-language beyond EN/DE, multi-currency marketplace, deep historical data migration, hourly chauffeur module if not confirmed at kickoff.

---

## 11. Intellectual property and access

- Upon full payment of agreed fees for this engagement, Client owns the custom project source code delivered for Vamos Taxi V1.  
- Third-party services (Stripe, Mapbox, Supabase, Vercel, Resend, fonts, stock assets) remain under their own licences and Client accounts.  
- Provider may reuse generic non-client-specific techniques and components in other work; Client branding, content, and business data remain exclusive to Client.  

---

## 12. Commercial terms

| Item | Detail |
|------|--------|
| **Delivery fee** | As agreed separately in quotation / invoice (this Scope defines *work*, not payment schedule unless attached) |
| **Third-party costs** | Paid by Client (hosting, database, email, maps usage, Stripe transaction fees, domain) |
| **Payment schedule** | To be stated on the commercial invoice / order form attached to this Scope |
| **Validity** | This Scope is valid for 30 days from the document date unless signed earlier |

*(If this document is attached to a paid invoice or proposal, that commercial paper controls price and payment dates.)*

---

## 13. Warranty and support after launch

- Provider will fix defects that break the accepted V1 flows for **14 days** after acceptance (bugfix), provided the issue is reproducible and not caused by Client content changes, third-party outages, or new feature requests.  
- Ongoing maintenance, new features, and content updates can be contracted monthly or per task after V1.  

---

## 14. Summary checklist for the Client

**You receive in 3–4 weeks:**

- [ ] New premium booking website (mobile + desktop)  
- [ ] Map-based pickup/destination + route-based pricing  
- [ ] Fixed and calculated price engine  
- [ ] Coupons / vouchers at checkout  
- [ ] Stripe payments + automated confirmation emails  
- [ ] Customer accounts + booking history  
- [ ] Admin / dispatch dashboard (assign drivers, manage bookings, pricing)  
- [ ] Production deploy + code ownership handover  

**You do not receive in V1:**

- [ ] Mobile apps  
- [ ] Driver app  
- [ ] Live GPS tracking  
- [ ] Uber on-demand product  

---

## 15. Acceptance

By signing below, Client confirms that this Scope of Work describes the V1 project to be delivered within the stated window, subject to timely Client inputs and the exclusions above.

| | Client | Provider |
|--|--------|----------|
| **Name** | Ben Othman Houssein / authorised signatory | Koussay Zayani |
| **Company** | Vamos Taxi GmbH | — |
| **Signature** | | |
| **Date** | | |

---

## 16. Contact

**Provider:** Koussay Zayani  
**Client primary contact:** as designated by Vamos Taxi GmbH (info@vamostaxi.eu / project channel)

---

*End of Scope of Work — Vamos Taxi Platform V1*
