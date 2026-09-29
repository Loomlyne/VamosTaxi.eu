# Session hand-off — Phase 26.5 (checkout: guest, sign in, create account)

Written 2026-09-30 ~03:00 by the orchestrating session. The owner moved this work to a new session. These are plain facts; anything marked "not verified" was not checked.

## Branch
- Folder: `/Users/koss/Developer/vamos-wt/phase-26.5`
- Branch: `gsd/phase-26.5-checkout-account`. The last planning commit before this hand-off is `c2613ebd`.
- Merge base with main: `624c0c44`. **origin/main 76b53ca8 is NOT merged.** Each plan's task 1 does the mechanical merge guard, then `git merge origin/main`. Main wins a conflict.
- Not pushed, no PR, nothing built.

## Built and proven
- Nothing. No code exists. The phase is planning only.
- Planning files: CONTEXT, UI-SPEC, RESEARCH, VALIDATION, and 11 plans (01–11).

## Half-built
- None.

## Not started
- The build, all 11 plans. Ship order: 26.4.2 first, then 26.5, then Meta 27–29, then 26.0, 26.2, 20, 19 (owner, 2026-09-30).
- The build guard in every plan: origin/main contains 26.4 + 26.4.1 (file checks plus `merge-base --is-ancestor`). This is now true on main: not re-verified.
- Waves:
  - Wave 1: 01, 02, 03, 08, 11
  - Wave 2: 04, 05, 09 (09 after 02)
  - Wave 3: 06
  - Wave 4: 10
  - Wave 5: 07 (e2e + HANDOVER, depends on all)

## Owner decisions (full text in 26.5-CONTEXT.md)
- **D-01:** the choice (guest / sign in / create account) sits at the top of section 2 "Who is travelling". A signed-in customer skips it and gets the form prefilled.
- **D-02:** a guest gets an automatic account from their e-mail, with no password. They sign in later by magic link.
- **D-03:** passwords stay for now and go later in a separate job. 26.5 adds nothing that depends on passwords.
- **D-04:** if the e-mail already has an account, checkout sends a sign-in link first. The wording stays neutral, with a rate limit and Turnstile.
- **D-05:** an unconfirmed e-mail sees nothing new. Bookings appear only after one magic-link sign-in.
- **D-06:** consent wording is legal copy, and consent is logged server-side. D-11 settled this.
- **D-07:** signing in from checkout returns to the same checkout, with trip, class and extras kept.
- **D-08:** four languages, RTL, design system only, 1440/1024/768/390, 44/54 px targets.
- **D-09:** while the guest-account switch is off, guest checkout works exactly as today.
- **D-10:** withdrawn and replaced by D-11.
- **D-11:** notice Text 1 (tick box) and Text 2 (guest) are used VERBATIM, en/de/fr/ar, from `.planning/decisions/2026-09-29-checkout-account-notice.md`.
- **D-12:** "Create an account" has a tick box, and the button is never disabled. An unticked press warns. The tick is recorded with text version, locale and time.
- **D-13:** the guest path records "informed", not consent. The switch may ship ON; the control session sets it.
- **D-14 (key rules):** `SUPABASE_SERVICE_ROLE_KEY` is read in ONE server-only module.
  - Never used on the client, never NEXT_PUBLIC, never logged.
  - Used only to create or look up the checkout auth user, with no table access.
  - If the key is missing, the feature hides.
  - A bundle test proves the key is absent from client code.
  - The key has been on Worker `vamos` since 2026-09-29 23:56.
- **D-15:** written exception to D-14. The staff digest and staff invite keep using the key and move onto the single module (plan 08).
- **D-16:** a paid trip opens from its manage link on any device. An unpaid booking never continues on another device: not by a pasted link, not after sign-in. A staff pay link works anywhere.
- **D-16a:** a pasted link may keep class and extras. Contact data, company, note, voucher and reference never carry over.
- **D-17:** the approved "Your account" paragraph replaces the /privacy gap VERBATIM, in the mock and in Next.js, in 4 languages. The seed is regenerated (plan 09).
- **D-18:** the 24-hour reminder goes to paid bookings only. `reminder_24h_candidates` keeps only status confirmed/assigned (plan 11).
- **D-19:** there is one shared `account_agreement_records` table for checkout and /sign-up.
  - It has a `surface` column (named CHECK).
  - One definer write function, `record_account_agreement`, with EXECUTE for `vamos_checkout` only.
  - Phase 27 adds the sign-up grant. anon and authenticated never get EXECUTE.

## Signatures
- Signed by the owner (2026-09-30): discuss, UI-SPEC, and plans 01–08 (revision 2).
- **NOT yet signed:**
  - plans 09, 10 and 11;
  - the D-19 revision of plans 01/04/05/07.

  The decisions behind them are his, given through the question form. Show him the plan changes before building.

## Local database
- None started for 26.5.
- Plans use `supabase db reset --workdir "$TMPDIR/sb265"` and need their own port-shifted stack. Use a free range, e.g. 593xx if unused.
- Never use `vamos-taxi-mg2` (5832x) or `vamos-taxi-auth` (5732x). They belong to other sessions and were running at 03:00.

## Pictures
- None for 26.5 yet. UI-SPEC holds the design contract.

## Open items and facts a newcomer would get wrong
- **Migration range:** 26.5 owns `20261001100000`–`20261001190000`.
  - Planned files: `…100000_account_agreement_records`, `…110000_customer_hide_unpaid_bookings` (plan 10), `…120000_reminder_24h_paid_only` (plan 11).
  - Phase 27 owns `20261002…`, 28 owns `20261003`, 29 owns `20261004`, and 26.0 and later start at `20261005100000`.
  - Live is at `20260930210000` (control session; not re-verified).
- **Live exposure (planner trace on main, not tested on live):**
  - The policy `bookings_select_own` plus the column grant let a signed-in customer read their own UNPAID booking's reference, name and phone.
  - The claim function links pending bookings to the account.
  - Plan 10's migration closes this. The control session applies it at ship.
- **Plan 11 breaks an existing test:** `apps/web/lib/db/system-reads.local.test.ts:113-117` expects a reminder for a pending fixture booking. Plan 11 task 3 rewrites it.
- **asSystem limits:** asSystem (`vamos_system`) is definer-only. Raw table SQL through it fails with 42501 on live, so use SECURITY DEFINER functions.
- **Arrays:** the Worker pg client runs with `fetch_types:false`, so arrays need the types in `packages/db/src/pg-types.ts`. DB tests must run through the Worker client options.
- **Shared files:** `app/vamos-i18n-dict.js`, the 4 message files, the seed and `app/pages/privacy.dc.html` are shared with the Meta (27–29) session and the legal session.
  - Edit them append-only and keep the "Legal pages from vamostaxi.eu" block intact.
  - Regenerate the seed (`pnpm db:seed:gen`, `pnpm db:seed:check`). Never hand-edit it.
- **manage-booking:** 26.5 does NOT touch `app/pages/manage-booking.dc.html`, which belongs to the legal follow-up session.
- **Passed to Phase 27** (for HANDOVER): `apps/web/lib/auth/signup-consent.ts` writes a consent_log "reject_all" row on e-mail confirmation. With "latest row wins" this can overwrite a cookie choice. It is not fixed in 26.5 (note in plan 07).
- **Privacy page:** it lists "Vercel" as host and has two adviser placeholders. That is the owner's legal copy; flag it, never rewrite it. "Vercel→Cloudflare" and "10 years years" may already be fixed by the legal ship: not verified.
- **Accepted risk:** plan 04's "sign in first" e-mails a link carrying the trip (no contact data) to the typed address. This is accepted under D-16.
- **No staging exists.** The control session ships to vamostaxi.site. After a checkout deploy it makes one 4242 payment, then reads booking_payments.
- **Checks last run:** none for 26.5 (no code).

## Signatures added 2026-09-30 (build session, question form)
- Owner signed plans 09, 10 and 11, and the D-19 revision of plans 01, 04, 05 and 07. All 11 plans are signed.
- origin/main `49c51749` merged into the branch; ROADMAP conflict taken from main.
