# Dashboard connections — ops sign-in

**Screen:** `app/ops-login.dc.html`
**Status today:** `localStorage.setItem('vamosOpsAuth','1')` placeholder — every other `ops-*` screen checks this key on mount and redirects here if it's missing (see `design_handoff_file_architecture/README.md` §3)

## 1. What the screen shows

Email + password fields, a sign-in button, error state for bad credentials.

## 2. Real implementation

- Supabase Auth (email/password, or magic link — decide with the client) scoped to a `dispatcher` role/claim, not the same user pool as customer accounts.
- Replace the `localStorage` flag with a real session: every `ops-*` page's mount check becomes "is there a valid Supabase session with the dispatcher role", not "is this one key set."
- Add a proper sign-out that clears the Supabase session (today's sign-out likely just clears the flag).

## 3. Proposed data model

```
dispatchers          -- or a role claim on auth.users, if the team is small enough not to need a separate table
  id (= auth.users.id), name, email, active boolean
```

## 4. Open questions

- Table of named dispatchers with individual accounts (needed if per-action audit trail matters, per ops-detail §"open questions"), or one shared ops login for now?
- Password reset flow for dispatchers — same `ResetForm`/`PhoneVerify` components as the customer side, or out of scope for V1?
