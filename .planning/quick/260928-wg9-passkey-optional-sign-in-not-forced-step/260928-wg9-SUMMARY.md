---
quick_id: 260928-wg9
status: complete
date: 2026-09-28
---

# Summary

- Gate: a registered passkey no longer forces a step-up. Password, magic link, e-mail code and
  passkey each let the admin in. Authenticator-app aal2 rule unchanged. Passkeys are no longer
  listed on every request.
- Dashboard login now shows "Sign in with a passkey" (was hidden on ops). The passkey step-up
  screen is removed.
- Passkey add/remove re-auth gate unchanged.

Verified: tsc clean; vitest 195 files / 2116 tests pass. Not deployed.
