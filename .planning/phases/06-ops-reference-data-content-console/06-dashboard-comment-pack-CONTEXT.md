# Dashboard comment pack — Discuss context

**Gathered:** 2026-09-01
**Status:** Discuss complete — awaiting plan approval
**Scope:** Narrow corrective pass for the DC ops mock at `dashboard.vamostaxi.site`, its staff/auth APIs, and the scheduled staff digest. No dispatch board, checkout, or public-site redesign.

## Owner decisions

1. **Sidebar navigation:** Hash-route changes remain within the mounted ops shell. The charcoal/yellow transition cover must not play for Dashboard, Bookings, Calendar, Fleet, Pricing & routes, Customers, Coupons, Staff, or Content. Existing Fleet child tabs keep their visual relationship, but the left rail connector curves into each child tab with a 1–2 px gap before its icon.
2. **Morning digest:** Each staff member who enables the profile toggle receives one email at **06:00 Europe/Zurich** listing that day’s bookings. This is a real scheduled job, not a UI-only toggle. Delivery depends on configured Resend credentials; do not create an account or invent credentials.
3. **Own profile:** Avatar upload, name, and phone number persist through the existing authenticated staff profile API and rehydrate after refresh. Upload uses the private R2 photo route; never a data URI or localStorage.
4. **Currency control:** The CHF selector fills its available header/control-cell width without changing global currency semantics.
5. **Published languages:** Replace the plain language-chip block with a compact, token-only status treatment. It must still truthfully state EN/DE/FR/AR coverage and survive all four console languages / RTL.
6. **Payments:** Replace Cash, Card, TWINT, and Invoice toggles with one non-toggle Stripe card row. Copy states: “Cards, Apple Pay, Google Pay and available Stripe methods.” It does not configure Stripe, create a Payment Link, or enable payments; that remains Phase 7.
7. **Staff admission:** The sole existing admin stays admitted. Every non-admin staff user must both be invited by an admin and accept that invitation before dashboard access; role checks remain server/RLS enforced, never just hidden client UI.
8. **Password field:** Correct the existing DC password eye as an in-field right overlay using the existing design-system field and Lucide eye state. It toggles visibility with accessible labels and has no glow/tinted surface.
9. **Passkeys:** Wire the existing Supabase experimental passkey endpoints into the dashboard login and profile enrollment/removal UI. Passkey authentication is a real WebAuthn flow, not a mock state.
10. **Profile deletion:** Remove the destructive “Delete this profile” section and action from the dashboard UI/API surface.

## Explicitly out of scope

- Live bookings, dispatch assignment, refunds, manual phone bookings, or realtime board work (Phase 8).
- Stripe account/configuration, Payment Links, checkout, payments, or webhooks (Phase 7).
- Pricing data changes and any non-owner-approved CHF values.
- New Resend account, credentials, or email-domain provisioning.
- Redesigning the DC mock beyond the eleven owner comments.

## Verification required in the plan

- Browser test: hash navigation changes visible panels without a yellow transition or document reload; Fleet connector is visually inspected at desktop and RTL.
- Browser/API test: profile name, phone, and an uploaded avatar persist after reload; unauthorized profile/photo writes are rejected.
- Auth tests: unaccepted/non-staff accounts cannot reach the dashboard; accepted invited dispatcher can; sole admin remains admitted.
- WebAuthn browser test (where the test browser supports it): enroll, authenticate with a passkey, and sign in; fallback password continues to work.
- UI/visual tests: payment row, language status, expanded CHF control, password overlay and removed deletion panel at 1440/1024/768/390, plus German and Arabic.
- Scheduled digest test: deterministic job invocation at the Worker boundary, opt-in/out filtering, Europe/Zurich schedule, and no send when Resend is unconfigured. A staging end-to-end send is blocked until owner configures Resend.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, relevant integration tests, and visual gate.

## Likely touched areas (to be confirmed by the plan)

- `app/ops/OpsSidebar.dc.html`, `app/ops/OpsFleet.dc.html`, `app/ops/OpsProfile.dc.html`, `app/ops/OpsSettings.dc.html`, `app/ops/ops.dc.html`, and relevant shared mock runtime styles/scripts.
- `apps/web/app/api/auth/route.ts` and the existing staff profile/invite endpoints.
- Existing staff profile/digest data access under `apps/web/lib/ops/staff.*`.
- Worker scheduled handler/email integration only where the existing Worker entry supports it.

---
*This addendum does not supersede the Phase 6 boundary: it adds dashboard corrective work only.*
