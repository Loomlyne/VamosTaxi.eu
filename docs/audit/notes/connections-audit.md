# Vamos Taxi connections audit (read-only, 2026-09-27, HEAD f0238bd)

Paths relative to /home/user/VamosTaxi.eu. AW = apps/web. MIG = packages/db/supabase/migrations.

## 1. Surface map
- Public marketing, sign-in, account, bookings, booking-detail, manage-booking: .dc.html mocks served by middleware rewrite (AW/middleware.ts:30-49 DC_PAGES; AW/lib/dc-mock-urls.ts:27). Data via /api/account/*, /api/manage/* (manage token hash -> manage_booking_* RPCs), /api/contact, /api/reviews, /api/consent.
- Booking funnel: React (AW/app/[locale]/checkout/{trip,details,payment,pay/[token]}, confirmation/[ref], review). APIs: /api/quote (+reprice), /api/checkout/{intent,extras,requote,abandon,lock-expire,pay-link,pay-link/open,return,status/[ref],invite/[ref]}.
  - DB RPCs: quote_rate_book, quote_settings_version, quote_lock_deadline, evaluate_coupon (AW/lib/db/quote.ts:70-157); checkout_create_booking / checkout_issue_manage_token (AW/lib/checkout/create-booking.ts:55,92); checkout_open_payment, checkout_abandon_gate/unpaid, checkout_requote_cancel, checkout_booking_is_test, checkout_pay_link_by_hash, checkout_expire_unpaid.
  - Bindings: HYPERDRIVE / HYPERDRIVE_NOCACHE, GEO_CACHE KV, QUOTE_ABUSE KV, QUOTE_RATE_LIMITER(_BARE), STRIPE_EVENTS queue, EMAIL send_email, PHOTOS/SUPPORT_FILES R2.
  - Stripe objects: Checkout Session (ui_mode elements, CHF price_data, adaptive_pricing) (AW/lib/checkout/stripe.ts:79-125), Refunds (stripe.ts:143-160). No direct PaymentIntent create.
- Ops console: dashboard.vamostaxi.site -> gateway Worker vamos-dashboard (AW/wrangler.dashboard.jsonc, AW/dashboard-gateway.ts:46-60) -> service binding to Worker vamos entrypoint Dashboard (AW/worker.ts:57-61) -> middleware serves app/ops/ops.dc.html (AW/middleware.ts:277-332). Data via /api/staff/* (dual-mounted: AW/app/api/staff/** re-export AW/app/[locale]/(ops)/api/staff/**), client data layer app/vamos-ops-data.js.
- Driver side: none (no driver app/routes). Chauffeurs only receive ChauffeurAssign/Unassign emails (AW/lib/ops/assign.ts:219-225).
- Emails: packages/emails (Resend SDK), plus Cloudflare send_email binding for contact (AW/app/api/contact/route.ts:117-125).
- Support tickets: contact_submissions + support_messages + support_message_files; inbound via Resend webhook email.received (AW/app/api/webhooks/resend/route.ts:94-120 -> AW/lib/ops/ticket-inbound.ts). Staff replies AW/lib/ops/tickets-write.ts:227-236 (bcc info@). No Slack/#support channel in code.
- Cron: hourly expire_unpaid + reminder_24h + health + 06:00 Zurich digest; 03:00 notification sweep (AW/worker.ts:86-133).

## 2. Pricing (server)
- Engine: AW/lib/pricing/priceQuote.ts:176-278. Per leg: fare = start (base_fare_rappen, or airport_start_rappen for airport_pickup) + perKm(per_km_rappen, metres) + class distance-band extras (AW/lib/pricing/lines.ts:454-471, bands.ts:13-53); + one fixed_route pair extra, canton wins over city (lines.ts:371-431); + leg surcharges incl. percent-of-fare (lines.ts:606+); + extras (buildExtraLines); + return_trip line; - coupon (priceQuote.ts:264-269). Total = signed sum (priceQuote.ts:71-146).
- Checkout adds catalog extras not in lock (AW/lib/checkout/intent.ts:253-257) and VAT 8.1% on top (intent.ts:259-260; AW/lib/checkout/vat.ts:20-27; "bps" is really per-mille: 81 = 8.1%).
- Differences vs business formula: distance bands, percent surcharges (region/night etc.), return_trip line, VAT on top. min_fare not a floor. No SQL pricing function; SQL only serves the book (quote_rate_book).
- Rounding: integer rappen, half-up per line (AW/lib/pricing/round.ts:28-102); VAT uses Math.round.
- Rate version: MIG/20260914190000_quote_rate_book_live_classes.sql: `where status='live' order by id desc limit 1`; draft only when p_prefer_draft (dashboard host + PRICING_PREVIEW=true, AW/lib/quote/engine.ts:186-187). Pinned into lock as rate_version_id; checkout refuses if lock rate_version_id != live id (AW/lib/quote/intent.ts:200-207), but liveRateVersionId=null on loadRateBook failure skips that check (AW/app/api/checkout/intent/route.ts:112-120) [fail-open].
- Checkout "reprice" is NOT a recompute: it echoes the lock's own class_totals (AW/app/api/checkout/intent/route.ts:126-135; same in pay-link/route.ts:133-142). Price integrity = HMAC lock (AW/lib/quote/lock.ts:161-230) + Stripe amount set server-side.
- public_chf launch flag not enforced at checkout: pricing_live hardcoded true (intent/route.ts:127, pay-link/route.ts:136); lock carries real totals regardless (AW/lib/quote/pipeline.ts:460-467). Only DB gate is rate_version_is_live trigger.

## 3. Stripe
- Session create: amount server-derived, currency hard CHF (stripe.ts:113-121, currency.ts:9). Idempotency key = client-supplied body.idempotency_key (intent.ts:297-307; schema intent-schema.ts:77 has no max length). sessionIsPayable double-checks amount/currency (stripe.ts:176-187).
- metadata.booking_id is actually quote_id, booking_reference is the idempotency key (intent.ts:301-305).
- Webhook: raw body text + constructEventAsync (AW/app/api/stripe/webhook/route.ts:26-29; AW/lib/checkout/webhook-verify.ts:19-43). stripe_event_record -> stripe_events table; enqueue to STRIPE_EVENTS even on duplicate; consumer dedups via stripe_event_begin (AW/lib/checkout/settle.ts:215-238). max_retries 8, DLQ vamos-stripe-events-*-dlq (AW/wrangler.jsonc:55-63,127-135); no DLQ consumer or alert.
- Settle: checkout.session.completed w/ payment_status=paid -> succeeded; completed-but-unpaid -> failed; async_payment_succeeded ignored (settle.ts:99-115). checkout_payment_settle: pending->paid->confirmed (MIG/20260827000004_settlement_rpcs.sql:62-148). No amount check vs charged_rappen in SQL.
- Capture gate: if booking cancelled/expired, event acked and nothing refunded (settle.ts:46-53,160-179). Sessions are automatic capture, so money is kept.
- Refunds: staff route AW/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts -> AW/lib/ops/refund.ts:74-200 (Stripe first, then ops_refund_record). Refuses sk_live_ (refund.ts:84; paid-cancel.ts:113). Sums all captured payments but refunds against first PI only (refund.ts:93-117).
- Cancel paths: account unpaid cancel (checkout_cancel_unpaid; does not expire Stripe session; regex VT-\d{2}-\d{4} vs 4-5 digits) AW/app/api/account/bookings/cancel/route.ts:32-43; paid cancel (customer_paid_cancel / manage_booking_cancel -> finishPaidCancel) AW/lib/lifecycle/paid-cancel.ts:314-440; abandon/requote/lock-expire expire session first (AW/app/api/checkout/abandon/route.ts:76-99), unauthenticated by quote_id only; cron expire-unpaid does not expire Stripe session (AW/lib/checkout/expire-unpaid.ts:10-21).
- No handling of charge.refunded / charge.dispute.* (dashboard refunds/disputes invisible to DB).

## 4. Coupons
- Checkout always passes couponId null (intent.ts:352) so checkout_create_booking never inserts coupon_redemptions (MIG/20260827000003_checkout_rpc.sql:258). evaluate_coupon caps read coupon_redemptions (MIG/20260920000003_coupons_per_rate_version.sql:114-140) and is called with customerId/contactEmail null (AW/lib/quote/engine.ts:208). => max-uses / per-customer caps unenforced for web bookings; ops redemption counts miss web usage (AW/lib/ops/coupons.ts:381,640).
- body.coupon recorded as coupon_code even if it differs from the lock's coupon (intent.ts:353).

## 5. Realtime
- No Supabase Realtime (explicitly excluded, MIG/20260823000023_rls_staff.sql:205; test AW/lib/ops/fleet-persist.test.ts:23). Ops bookings: 3 s polling of GET /api/staff/bookings while tab visible + refetch on focus/visibility (app/vamos-ops-data.js:108-133). Tickets: refetch on focus/visibility only (app/ops/OpsSupportTicket.dc.html:531-541).

## 6. Emails
- Confirmation: queue consumer -> deliverConfirmation (AW/lib/checkout/notify.ts:42-155). notification_claim/settle log in booking_notifications. Sends separate copies to payer and info@vamostaxi.site (notify.ts:128-135), each containing the live manage link token; copy outcomes not logged. Missing RESEND_API_KEY -> silent return with no row (notify.ts:46-47). Daily 03:00 sweep retries only 'confirmation' (worker.ts:88; notify.ts:157-177).
- Lifecycle (cancel, refund_failed, reminder_24h, assignment_customer, time_change, flight_no, review_request): AW/lib/lifecycle/notify-lifecycle.ts:137-290, ops copies to bookings@vamostaxi.site (not info@).
- Pay-link: AW/app/api/checkout/pay-link/route.ts:189-214 to contact + payer_email (attacker-choosable) with attacker text company_name/address.
- Refund issued: staff refund route :61-73 (outcome ignored). Price-changed/expired: AW/lib/checkout/lock-mail.ts:29-44. Ops must-fix to SUPPORT_EMAIL: AW/lib/ops/must-fix-mail.ts:48-51. Digest: AW/lib/supabase/service.ts:63-64. Auth email hook: AW/app/api/auth/email-hook/route.ts:81. Contact: claim/finalize outbox (contact_delivery_outbox) AW/app/api/contact/route.ts:94-139. Staff ticket reply bcc info@ (tickets-write.ts:236).
- No Gmail copy anywhere. Resend webhook handles only email.received; bounces/complaints/delivered ignored (resend/route.ts:107). Svix verification via standardwebhooks (route.ts:18-29).
- Inconsistency: packages/emails/src/lib/send.ts:112-116 says "Never info@" for lifecycle while confirmation deliberately copies info@.

## 7. Env drift
- Referenced but not in env.d.ts: CONTACT_EMAIL_FROM, CONTACT_SUPPORT_RECIPIENT, CONTACT_TURNSTILE_ALLOWED_HOSTNAMES (contact/route.ts:43-74, with process.env fallback), QUOTE_ENGINE_VERSION (build-time, lib/version.ts:54-61).
- Not in GSD-LAUNCH secrets matrix/runbooks: SEND_EMAIL_HOOK_SECRET, VAMOS_QS_SECRET, RESEND_WEBHOOK_SECRET, HEALTH_PROBE_SECRET, TURNSTILE_SECRET_KEY (contact) vs TURNSTILE_SECRET (quote), CONTACT_*. QUOTE_LOCK_SECRET(_PREVIOUS) only in docs/runbooks/quote-lock-rotation.md. SENTRY_DSN documented but no code.
- production env (AW/wrangler.jsonc:109-171): STRIPE_PUBLISHABLE_KEY "pk_test_placeholder", QUOTE_ABUSE id placeholder, both HYPERDRIVE ids placeholders; no SUPPORT_FILES bucket; no send_email EMAIL binding. Documented as not deployed; deploy-production.yml runs on v* tags.
- staging env = Worker "vamos" serving vamostaxi.site; committed pk_test publishable key (public by design), PRICING_PREVIEW=true.
- Fail-open: rate limiter missing binding -> passLimiter (AW/lib/abuse/guards.ts:125-127,166-167) and limiter throw -> ok (rate-limit.ts:108-121). QUOTE_LOCK_SECRET missing -> "" key (intent/route.ts:97); WebCrypto rejects zero-length HMAC key so verify fails closed [Unverified on workerd]. VAMOS_QS_SECRET -> "" (guards.ts:129-136) [Unverified effect].
- database.types.ts generated + CI check (.github/workflows/pr.yml:169) but imported by nothing in apps/web.

## 8. Duplicate enums
- Ticket status list x4: AW/lib/ops/ticket-inbound.ts:22, tickets-write.ts:14, tickets-map.ts:5-7, ticket-mail.ts:7.
- VehicleStatus/ChauffeurStatus/RateVersionStatus hand-typed: AW/lib/ops/fleet.ts:16, chauffeurs-model.ts:4, pricing.ts:9 (DB enums in packages/db/database.types.ts:3023-3045).
- Booking status groupings: AW/lib/checkout/booking-status.ts:3-27, AW/lib/account/bookings.ts:41, confirmation/[ref]/ConfirmationClient.tsx:258, AW/lib/ops/bookings-map.ts:280, app/ops/OpsDetail.dc.html. Booking ref regex: booking-status.ts:1 (4-5 digits) vs account cancel route (4 digits).
- VehicleClassSlug = string in two places (pricing/types.ts:21, ops/fleet.ts:17); class slugs hardcoded in client-fixtures, CheckoutClient.tsx, notify.ts:118 default "business".

## 9. Tamper test plan (not executed) -- see final report.
