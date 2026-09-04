# Phase 5: Public Surfaces & Customer Accounts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-04
**Phase:** 05-public-surfaces-customer-accounts
**Areas discussed:** existing CONTEXT update, home reviews empty, flight field, partner backend, 05-24 auth hook

---

## Existing CONTEXT + 28 plans

| Option | Description | Selected |
|--------|-------------|----------|
| Update CONTEXT and replan remaining after | New no-mock close bar; 05-01…26 stay | ✓ |
| View existing CONTEXT first | | |
| Skip — keep old CONTEXT | | |

**User's choice:** Update CONTEXT and replan remaining after

---

## Home reviews when 0 published

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the reviews block | Section gone from layout | ✓ |
| Keep the carousel shell, honest empty | No fake quotes | |

**User's choice:** Hide the reviews block

---

## Flight field while AeroDataBox is 503

| Option | Description | Selected |
|--------|-------------|----------|
| No local samples — empty field + honest copy | | ✓ |
| Typeahead labels only — never a fake time/status | | |

**User's choice:** No local samples — empty field + honest copy

---

## Become-a-partner backend

| Option | Description | Selected |
|--------|-------------|----------|
| 404 the partner API routes too | | |
| Leave the dead table/API unused | | |
| Remove it entirely | Free-text stronger than 404 | ✓ |

**User's choice:** remove it entirely
**Notes:** Live page already 404. No DC file. No `/api/partner-application`. `partner_applications` table still in Postgres. i18n still has `Become a partner`. 05-19 never executed.

---

## 05-24 confirm-email + Send Email Hook

| Option | Description | Selected |
|--------|-------------|----------|
| Still an owner gate this phase | | |
| Skip — already live on staging | | |
| I don't know — check | First reply | |

Then after live check:

| Option | Description | Selected |
|--------|-------------|----------|
| Skip 05-24 — record facts, do not re-click dashboards | | ✓ |
| Keep it as an owner gate — one branded signup mail | | |

**User's choice:** Skip 05-24 — record facts, do not re-click dashboards
**Notes:** Hook GET 405, unsigned POST 401 empty. Confirm email ON hosted 2026-08-30. `05-OWNER-CHECKS.md` still says hook not registered (stale 2026-08-30). Auth mail is Cloudflare Email, not Resend.

---

## Claude's Discretion

- Public reviews route path and cache headers
- Reviews hide mechanism (must not leave empty carousel)
- Flight-field copy in four languages
- Partner `DROP TABLE` migration + unused i18n key deletion

## Deferred Ideas

- Cookie `consent_log` write — Phase 10
- Checkout / Stripe — Phase 7
- Live ops bookings — Phase 8
- Manage-booking + `/booking-detail` — Phase 9
- AeroDataBox — later
- Live DNS / `pricing_live` — Phase 11
- Branded signup inbox proof — not a Phase 5 gate
