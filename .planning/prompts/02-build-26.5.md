You build Phase 26.5, the account choice before payment, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Take over branch `gsd/phase-26.5-checkout-account` in `/Users/koss/Developer/vamos-wt/phase-26.5`.
Everything is planned: `26.5-CONTEXT.md` (D-01 to D-19), `26.5-UI-SPEC.md`, `26.5-RESEARCH.md`,
11 plans. Read `SESSION-HANDOFF.md` in the phase folder first. If it is missing, tell the control
session and wait. If the revised plan 01 (D-19) is not signed by the owner yet, get that
signature before you build.

START NOW, WITHOUT WAITING, with what does not touch the checkout page:
- Migrations in the reserved block `20261001100000` to `20261001190000`: the shared account
  agreement record (`account_agreement_records`, `record_account_agreement`, D-19), unpaid
  bookings hidden from customer reads and from the claim function (D-16), the 24-hour reminder
  for paid bookings only (D-18). pgTAP for each.
- The one server-only module for `SUPABASE_SERVICE_ROLE_KEY` (D-14) and the two older callers
  moved onto it with unchanged behaviour (D-15: staff digest, staff invite).
- The privacy paragraph "Your account" (D-17), verbatim from
  `.planning/decisions/2026-09-30-legal-pages.md`, mock and Next.js page, four languages.

WAIT FOR 26.4.2 TO SHIP before you touch `/checkout` files (`CheckoutForm.tsx`, `CheckoutPage.tsx`,
`sections/*`, `checkout.css`). Another session is changing them. The control session tells you
when. Then merge origin/main and build the choice panel.

RULES THE CONTROL SESSION CHECKS AT HAND-OVER
- The key is read in exactly one server-only module; never in a client component, a
  NEXT_PUBLIC name, a response, a log line or an error. Used only to create or look up the auth
  user. A test proves the client bundle holds neither the key name nor a value.
- Notice texts and the tick box: `.planning/decisions/2026-09-29-checkout-account-notice.md`,
  verbatim. The button is never disabled; pressing it unticked names what is missing.
- The tick and the guest "informed" record go into the agreement record, never into `consent_log`.
  Phase 27 will call the same function from `/sign-up`: no column only a booking can fill.
- Owner rule `.planning/decisions/2026-09-30-unpaid-booking-other-device.md`, proven through
  the real routes: a second browser with a pasted link gets trip, class and extras and an empty
  form; a second browser signed in as the same customer does not get the unpaid booking; a paid
  booking opens from its manage link anywhere; a staff pay link works on any device.
- "This e-mail already has an account": neutral wording and a limit, so it does not reveal who
  is a customer.

OWNER UAT in the hand-over: one 4242 payment as a guest, one with "Create an account", sign-in
by e-mail link on a second device.
