---
phase: 05-public-surfaces-customer-accounts
plan: 28-B8
status: shipped
completed: 2026-10-01
written_by: GSD bookkeeping job B10, 2026-10-01, from git history, the B8 hand-over and the control board
---

# 05-28-B8 summary: /contact close-out

**Outcome: live 2026-10-01 15:43 (+04).** Main `c5157913` "fix(contact): phone and e-mail stay left to right in Arabic; three missing de/fr/ar lines", Worker `fae3e473`. No migration.

- `app/pages/contact.dc.html`: phone, WhatsApp and e-mail values wrapped in `vt-dir-keep`; Arabic reads `+41 79 626 70 82`.
- `app/vamos-i18n-dict.js`: three new keys in de, fr, ar.
- `apps/web/lib/contact-source.test.ts`: guard for both changes.
- Checks on the branch (`b8575f41`): the 11 gates passed; web 3440 and emails 165 unit tests.

**Not verified:** no contact message sent on live; the Playwright contact suites were not run. The footer phone still reads reversed in Arabic (outside this plan; on the board as an Arabic fix).

**Sources:** `05-28-B8-HANDOVER.md`; `.planning/CONTROL-BOARD.md` "Shipped" row 10-01 15:43; `.planning/HANDOVER-2026-10-01.md` section 4.
