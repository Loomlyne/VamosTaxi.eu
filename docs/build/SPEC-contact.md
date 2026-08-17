# Contact — `contact.dc.html`

**Status:** built 4 Aug 2026 · **resolves conflict 4** · **exposes the live-chat scope question**

## 1. Deflection first

The terms route every cancellation, change, complaint and no-show through customer support, so
without a deflection this page becomes the queue for all of it.

A charcoal band sits **above** the form — the first thing under the title, before "Send us a
message": *Already have a booking?* with **Manage a booking** as the primary and **Read the FAQ**
as a ghost. The argument is the honest one, not a brush-off: *opening it is immediate; a message
here is not.*

## 2. The form

Fields: name · email · phone (optional) · booking reference (optional) · message. Pill inputs at
54px, textarea at 12px radius and 132px minimum, both full-width; name/email and phone/reference
pair up from 600px.

Hints explain **why**, per the brand's microcopy rule — "Faster than email if we need one detail
from you", "Top of your confirmation email. It puts your message straight on the right booking."

### Five states, all live

| State | Behaviour |
|---|---|
| Default | Empty, ready. Submit is a 54px primary. |
| Validation error | Per-field 2px danger border + message, **plus** a summary `Alert` that takes focus. Title counts: "One field needs your attention" / "3 fields…". |
| Sending | Every input `disabled`, submit replaced by a spinning `loader-circle` at 42% opacity. |
| Success | Replaces the form: green tick, the address it went to, a case reference, and the response-time token. Two exits — send another, or go home. |
| Send failed | Danger `Alert` above the form, **text preserved**. "Something on our side failed, not yours." |

Errors are instructions, never blame: "Tell us what to call you", "That address is missing
something — check it over", "A line or two more, so we can answer properly". A field's error
clears the moment it is touched, and when the last one goes the summary goes with it.

The form is genuinely interactive — submitting it empty reaches the error state on its own. The
five-way **state switcher** in the title band is review chrome behind `showReviewScaffold`; it
fills plausible content so each state is legible in isolation.

## 3. Direct channels

A single card, one row per channel, each a 44px yellow-50 tile that fills with `--vt-accent` on
hover: telephone · WhatsApp (same number, confirmed) · email · registered office. Each row says
when to use it — "Fastest for anything travelling today", "Good for a photo of an address",
"Everything that is not urgent".

The address row is **not** a link and is labelled *Post only — this is not a passenger office.*
Bleicherstrasse 16 is a registered seat, and somebody will otherwise turn up there with luggage.

No map: an embedded map of an office nobody should visit is a third-party script and a cookie for
no benefit.

## 4. Live chat — designed to be removed

The legacy footer and FAQ promise "Customer Service 24/7 · Start a Chat" and the old site ran a
widget. **Chat is not in the V1 scope of work.**

So the chat block is behind the `showLiveChat` tweak. Turn it off and the column closes up — no
gap, no orphaned heading, no "coming soon" placeholder, because a coming-soon channel is the same
broken promise in a politer font. Turn it on and it is a full block with its own hours token.

Decide it either way. If it is dropped, three FAQ answers and the footer change with it — that is
A11 on the blocking list.

## 5. Conflict 4, resolved by construction

Three addresses circulate in the archive: `info@vamostaxi.eu` (imprint, privacy),
`contact@vamostaxi.eu` (FAQ), and a personal gmail account (terms §2). This page renders
`{SUPPORT_EMAIL}`, and every legal page points at the same value.

**The gmail address does not survive.** A personal mailbox named in binding terms is a liability,
not a channel. That is stated on the page in the review scaffold so the client sees the reasoning,
not just the outcome.

## 6. Social and reviews

Four slots — Facebook, Instagram, YouTube, Trustpilot — as `text` props defaulting to `#`. A
Trustpilot profile exists for the domain but no URL was ever linked; an unlinked review badge is
worth less than none. Each drops out cleanly if the account does not exist.

## 7. Tokens — 6 · Slots — 4 (social) · Decisions — 3

`{SUPPORT_EMAIL}` `{RESPONSE_TIME}` `{SUPPORT_HOURS}` `{SUPPORT_LANGUAGES}` `{CHAT_HOURS}`, plus
`{SUPPORT_LANGUAGES}` shared with About.

Decisions: which address is real (A4) · chat in or out (A11) · where the form actually delivers —
Resend to a monitored inbox, or a ticketing system that issues the case reference the success
screen shows. Today that reference is generated in the browser for the mock.

## 8. Accessibility

`novalidate` so our own messages show rather than the browser's. `aria-invalid` per field,
`aria-describedby` to hint or error, the error summary is `role="alert"` and takes focus on
failed submit, success is `role="status" aria-live="polite"`. Every control ≥44px; inputs are 54px.
