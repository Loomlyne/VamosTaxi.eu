# Become a Partner

**Route (proposed):** `/become-a-partner`
**Nav path:** Public — linked from footer, and from the About page CTA ("Drive professionally in the Zurich area and want the work?")
**Status:** **Conditional / not built** — blocked on a scope decision (2026-08-04)
**Source:** Claude Design spec, relayed 2026-08-04 (not on the original Figma board)

## Status: build it or unlink it

Legal-checklist item **A12** is explicitly "build it or unlink it" — this page is not confirmed. It's also not in `docs/PROJECT-BRIEF.md` or `docs/SCOPE-OF-WORK.md` at all: the closest thing in the SOW's out-of-scope list is "Hotel / affiliate partner portals" (§5, item 9), which is about referral partnerships, not driver/fleet-owner recruitment — so this isn't a clean contradiction of a locked decision, just a genuinely open item. Until A12 resolves, don't build past a wireframe. If the decision is "unlink it," the footer and About-page links should be removed rather than left pointing at a dead page.

## Purpose (if built)

Lead-generation form for prospective drivers/fleet owners. Explicitly **not** a partner portal or dashboard — no login, no application-status tracking for the applicant.

## Entry points

- Footer link.
- About page CTA.

## Page flow (if built)

1. **Application form** — name, contact, city, vehicle type, licence/permit info.
2. **Consent checkboxes** — bound to Terms + Privacy.
3. **Informational copy** — mentions background check and vehicle inspection as next steps; these happen after submission, outside this form, not as additional form fields.
4. **Submit** → confirmation state. No dashboard, no follow-up self-serve flow.

## Data captured

| Field | Notes |
|---|---|
| Name, contact | Phone and/or email |
| City | Service-area check, likely Zurich-area per the About CTA copy |
| Vehicle type | Free text or a fixed list — not specified |
| Licence/permit info | Exact fields (licence number? upload?) not specified |
| Consent checkboxes | Terms + Privacy, required to submit |

## Exit points

- Submit → confirmation message. Dead end by design — this is intake, not an account.

## Edge cases

- Duplicate submissions from the same person → no dedup logic specified; treat as an ops/manual-review concern, not a build requirement.

## Constraints

- No driver login, no applicant-facing status tracking (explicit in the spec — "lead-gen form, not a partner portal").
- Background checks and vehicle inspections happen manually, outside the software.

## Open questions

- Build vs unlink — checklist item A12, still open (lives in Claude Design's workspace, not this repo).
- If built: where do submissions go? `docs/PROJECT-BRIEF.md`'s admin dashboard scope has no "driver applications" table today — needs either a new admin list or a plain notification email to ops.
- Exact vehicle-type and licence/permit fields aren't specified anywhere yet.
