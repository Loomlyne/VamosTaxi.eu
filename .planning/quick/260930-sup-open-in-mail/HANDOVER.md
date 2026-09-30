# Support "Answer by e-mail" opens this ticket's own mail — hand-over

**Branch:** `fix/support-open-in-mail`, from origin/main, main merged. Not deployed. No migration, no new setting, no new secret.
Owner requirement (2026-09-30 14:27): the button opens the support e-mail of THAT customer in the
mail app he is signed in to, and his answer stays in that thread. "The admin will choose" the app.

## What was found (before the change)

- A ticket stores the Message-ID of every customer e-mail and of the acknowledgement the customer
  received. It stores no subject. The Message-ID of the copy in the admin's inbox is not stored.
- The admin's inbox only ever receives one mail per ticket: "New contact message — Vamos Taxi", sent
  to the Worker setting `CONTACT_SUPPORT_RECIPIENT`, from noreply@ **with no reply address**. Reply on
  it went to noreply. Customer e-mail replies go to the ticket address and are stored in Postgres
  only; no copy reaches his inbox.
- So no link can open "the customer's e-mail" in his mailbox: it is not there. What exists is
  listed under "Which mode keeps the thread".

## What changed

| File | Change |
|---|---|
| `apps/web/lib/ops/tickets-map.ts` | Each ticket gets `reply { to, subject, messageId, mailto, gmail }`, built only from that ticket's rows. Identity = newest customer message that has one. Bad or missing address = no link. |
| `apps/web/lib/ops/tickets.ts` | The staff query also selects `rfc_message_id`. |
| `packages/emails/src/contact.ts`, `packages/emails/package.json` | `contactCustomerSubject(locale)` and the `./contact` export, so the subject is the one the customer holds. |
| `app/ops/OpsSupportTicket.dc.html` | The button opens the ticket's own link. A small choice next to it: "This device's mail app" (default) or "Gmail in the browser", kept on the device (`vamosOpsMailApp`). Hint text corrected. en, de, fr, ar. No reply box, no preview. |
| `apps/web/app/api/contact/route.ts` | The support copy now carries `Reply-To: <the customer>`. |
| `apps/web/lib/ops/ticket-reply-link.test.ts` (new), `apps/web/tests/unit/ops-support-read-only.test.ts` | Tests. |

## Which mode keeps the thread

| Mode | What opens | Thread |
|---|---|---|
| This device's mail app (default) | A reply to the customer with "Re: <the subject they hold>" and `In-Reply-To` / `References` set to their latest message (RFC 6068). Opens in whatever app handles mail links: Apple Mail, Outlook, Thunderbird. | **Certain on the customer's side when the app keeps those two fields** (Apple Mail and Thunderbird do; Outlook desktop and webmail handlers drop them). Otherwise by subject: usually. |
| Gmail in the browser | A new Gmail message to the customer with the same "Re:" subject. Gmail's address cannot carry an identity. | By subject only: **usually**. |
| Reply on the "New contact message" mail in his inbox (new tickets from this ship on) | His normal Reply. It now goes to the customer. | **Certain in his own mailbox**, for the first message of a ticket. |

Not built, follow-up proposals: (1) copy every customer e-mail reply to his inbox, threaded, with the
customer as reply address, and store that copy's Message-ID: then a Gmail link can open the exact
mail (`#search/rfc822msgid:<id>`) and Reply keeps the thread for certain; needs one migration.
(2) An Outlook-on-the-web choice (compose deep link; differs for work and personal accounts).

## Checks on the final commit

typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env,
check:db-fences, db:seed:check, build: exit 0. Unit tests: 2499 pass, 1 skipped, 0 fail
(emails package 116 pass). No database change, so pgTAP, replay and types are untouched.

Two-ticket test (`ticket-reply-link.test.ts`, 6 tests): Mia (de) and Leo (en) each carry their own
address, subject and identity; no link of one contains the other; with five messages the latest
customer message wins over staff messages; a foreign ticket's message passed by mistake is ignored;
a bad address (`a@b.c?bcc=…`, line breaks) gives no link.

Browser: real `ops.dc.html` in headless Chromium with two fake tickets at 1440 and 390: button
enabled, choice shown, no reply box, file shown as a name, nothing scrolls sideways; in Gmail mode
Leo's button opened `…to=leo%40example.org&su=Re: We received your message — Vamos Taxi`.
Pictures in `screens/`.

## NOT verified

- Not on live, not signed in to the real dashboard.
- That Apple Mail / Outlook on his machines keep `In-Reply-To` from a mail link.
- The Reply-To on the support copy with a real mail (needs one contact-form message after deploy).

## Owner UAT after the Ship

1. vamostaxi.site/contact → send a message from a second address of yours. Expected: "New contact message — Vamos Taxi" arrives in your inbox.
2. Press Reply on that mail. Expected: the To field is your second address, not noreply.
3. Dashboard → Support → open that ticket → "Answer by e-mail". Expected: your mail app opens a message to that address, subject "Re: We received your message — Vamos Taxi".
4. Switch the choice to "Gmail in the browser", press the button. Expected: Gmail opens a new message to the same address and subject. Reload the dashboard: the choice is still Gmail.
5. Open a second ticket from another customer. Expected: the button leads to that customer's address, never the first one's.
