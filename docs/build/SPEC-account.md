# Dashboard connections — customer account

**Screen:** `app/account.dc.html`
**Who uses it:** signed-in customer
**Status today:** static profile fixture, no persistence

## 1. What the screen shows

- Profile summary: name, email, phone, signed-in-as state (shared with `SiteHeader`'s account menu).
- Preferences: language + currency (already platform-wide via `VamosLocale`, this screen is likely just where they're surfaced as a settings pair rather than only the header pickers).
- "Email me a receipt after every transfer" toggle.
- Links out to `bookings.dc.html` (booking history) and `manage-booking`/`booking-detail` for a specific trip.

## 2. What a customer needs to edit here

- Name, email, phone (email change likely needs re-verification — see `PhoneVerify`/`AuthStates` components for the pattern already built).
- Receipt-email toggle.
- Password (via `ResetForm`) or sign-out.
- Delete account / data-export request — the privacy policy (§"Your rights") promises both; this is probably where they're triggered, even if fulfilment is a support-team process rather than instant.

## 3. Proposed data model

```
customers
  id (= auth.users.id), name, email, phone, receipt_email_enabled boolean,
  preferred_lang, preferred_currency,   -- mirrors VamosLocale choice server-side for emails/receipts
  created_at
```

Data-subject requests (access/delete) probably want a lightweight audit table rather than an instant destructive action:

```
data_requests
  id, customer_id fk, type (access|delete|restrict), status (open|done), requested_at, resolved_at
```

## 4. Proposed API / RPC surface

- `GET /api/account` / `PATCH /api/account` — profile fields.
- `POST /api/account/change-email` — issues a verification step before the change lands (reuse `PhoneVerify`'s OTP pattern for email if that's the intended UX).
- `POST /api/account/data-request` `{type}`.
- Everything else (bookings list, receipts) is read via the `bookings` table filtered to `customer_id = auth.uid()` under RLS.

## 5. Open questions

- Is phone-number change also OTP-verified (parity with email), or phone is collected once at first booking and fixed after?
- Account deletion — soft-delete keeping trip records for the Swiss archiving-law retention window (privacy policy §"we have to keep"), or a harder delete of everything except what's legally required?
