# Become a partner — `become-a-partner.dc.html`

**Status:** drawn light, 5 Aug 2026 · **conditional on A12** · not confirmed for V1

A12 is "build it or unlink it" and it is still open. This page is therefore deliberately
under-invested: structure, fields and copy shape, on-brand chrome, **no photography and no
illustration**. If A12 comes back *unlink*, this file is deleted and the footer Company link plus
the About page CTA come out with it — nothing else in the site depends on it.

## 1. What it is, and is not

A public lead-gen page for drivers and fleet owners in the Zurich area. One form, one submit, one
confirmation, and then nothing. No applicant login, no dashboard, no status tracking, no document
upload, no admin view of submissions. The confirmation state is the end of the deliverable.

Entry points, both already live: the footer Company column on every page, and the drivers band on
About ("Drive professionally in the Zurich area and want the work?").

## 2. Layout

Standard public-page chrome: `SiteHeader variant="inverse"`, charcoal title band with breadcrumb,
eyebrow and checker mark, `SiteFooter`, `CookieBanner`. Body is the same two-column grid as
Contact — form at `1.34fr`, rail at `1fr` from 980px, single column below. Desktop, 1024, 768 and
390 all checked; nothing scrolls sideways and every control is at least 44px (54px on fields and
the submit).

The rail carries **After you send** — three numbered steps (we read it · background check ·
vehicle inspection), a charcoal *No portal, on purpose* card with the support number, and a dashed
slot for the eligibility requirements nobody has supplied.

## 3. Fields — six, and why each one

| Field | Control | Required | Note |
|---|---|---|---|
| Full name | text | yes | |
| Where you drive | text | yes | Hint says base, not desired routes |
| Phone | tel | one of two | `contactRequirement` tweak flips to both-required |
| Email | email | one of two | Format checked on whichever is filled |
| Vehicle type | **free text** | yes | Partner vehicle classes not agreed — `vehicleTypeControl` shows a provisional dropdown of body types for comparison. The list is not an answer. |
| Licence and permits | text, one line | yes | Words are enough. No upload, no permit-number format check — both speculative. |

Consent is two checkboxes, Terms and Privacy, both required, each linking its page.

Informational copy sits directly above the submit: the background check and the vehicle inspection
happen **after** this form, arranged by a person, documents requested then. That sets the
expectation without collecting anything the page has no right to yet.

## 4. Five states, all live

| State | Behaviour |
|---|---|
| Empty | Fields empty, submit disabled because consent is unticked. |
| Consent not ticked | Filled form, submit `disabled` at 42% opacity plus a neutral yellow-icon line: "Both boxes above are required before you can send this." It names the reason instead of failing silently. |
| Validation errors | Per-field 2px danger border and message, plus a summary `Alert` that takes focus. Touching a field clears its error; touching phone or email clears both, since they answer one requirement between them. |
| Sending | Every input disabled, submit replaced by a spinning `loader-circle` at 42%. |
| Confirmation | Dead end by design — first name, the contact we will use, reply-time token, and an explicit "no account, no login, no status page". Exits are Back to home and Contact us. |

A review-only state switcher sits in the charcoal band, and the bottom review scaffold lists the
flags. Both are behind `showReviewScaffold`.

## 5. Tokens — 3

`Partner reply time` (used twice, form and rail) · `Partner vehicle classes` ·
`Required permits`.

## 6. Open

- **A12** — build or unlink. Everything else is downstream of it.
- Partner vehicle classes; which permits are actually required.
- Phone or email, or both.
- Where a submission lands: no backend, no inbox, no ops screen. Out of scope for this brief.
- English only this cycle, like every other screen in it; strings are not in the dictionary yet, so
  a language switch relabels header and footer around English body copy. German lands with M004.
