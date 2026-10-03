# Hand-over: e-mail change can finish (owner decision 2026-10-01, question form: "Fix it")

**Branch:** `fix/phase-20-email-change`, from origin/main, merged at `2302c238`. Not deployed. No migration, no new setting.

## What was wrong

Supabase's secure e-mail change (`double_confirm_changes = true`) needs a click from the old AND the new
address. The e-mail hook sent one link, to the old address only, so a change could never finish.
Older than Phase 20.

## What changes (commits `47e225cf`, `59ae1b7c`)

- The hook sends two mails: to the current address with `token_hash_new`, to the new address with
  `token_hash` (Supabase names them the other way round on purpose — confirmed from the Send Email
  Hook docs and on local GoTrue). Each link seals its own recipient in `e` (F12 confirm page).
- New mail template `email_change_current` for the old address ("a second link went to your new
  address"), en/de/fr/ar; the new address keeps "Confirm your new email".
- First click (either one): `{ok:true, pending:true}`, no session, e-mail unchanged; the confirm page
  says "Now open the link we sent to your other address." (en/de/fr/ar). Second click: the change
  completes and signs in as the new address.
- For `email_change` the confirm POST no longer signs out another signed-in session first, and on the
  second click the "address must be current or pending" check cannot fire (the old address is gone by
  then); it rests on the seal, which is bound to that token and made only by the hook.

## Checks on the branch (before the final main merge)

| Check | Result |
|---|---|
| All gates + build | exit 0 |
| Unit tests | 3307 pass, 0 fail; emails 155 pass |
| New tests | hook 3 red → green; callback 2 of 8 red → green |
| Local Worker + isolated Supabase (`email-change.e2e.mjs`, in run.sh) | 7/7: two mails, each page names its own recipient, first click pending, re-click expired, second click changes the e-mail and signs in, reversed order also works |
| Pending view in headless Chromium, en 1440/390, de 390, ar 390 | correct text, RTL in Arabic, no sideways scroll (pictures covered by the cookie banner, not kept) |

## NOT verified

Nothing live; the new mails in a real inbox; a stranger's seal in e2e (unit test only).

## Owner UAT after the Ship

1. Sign in on vamostaxi.site → Account → change your e-mail to a second address of yours. Expected: one mail in each inbox.
2. Open the link in the OLD inbox → confirm. Expected: "Now open the link we sent to your other address."
3. Open the link in the NEW inbox → confirm. Expected: signed in; Account shows the new address.
