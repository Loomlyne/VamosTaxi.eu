# Owner decision: tracking before consent (2026-10-16, about 23:15 CET)

**Status: DECIDED by the owner. Wording ADOPTED 2026-10-16 ("Sign as written, then ship"); consent version 2026-10-17.** Relayed to this job session (`quick/google-advanced-consent`, quick task
261016-ov1) by the controller, T3 thread `0fbbf0c1`. The owner's answers below are copied verbatim from the
controller's message. The wording that goes with them is `2026-10-16-google-advanced-consent-wording.md`, adopted
in one screen on 2026-10-16 ("Sign as written, then ship").

## Legal risk: told first, accepted

The controller's record, verbatim: "He was told about the EDÖB §3.13.1 finding first and accepts the legal risk."

The finding he was told about: the EDÖB guide (FDPIC, "Guidelines on data processing using cookies and similar
technologies", v1.1, 06.10.2025), §3.13.1: "data processing must not be activated by default when the website is
accessed". It recommends a two-click solution for third-party services and tracking pixels. §1.1 counts pixels as
"similar technologies". Both changes below do what that section advises against. No lawyer has read them.

## His answers, verbatim (as relayed)

1. "**Google advanced mode: ship it.** Pings for everyone; nothing is stored in a cookie until Accept."
2. "**Meta pixel fires before consent:** init + PageView for every visitor, including those who refuse. This
   overrides his earlier "only after consent"."
   - "Server-side CAPI events and the legal gate stay as they are, unless the plan shows they must change."
   - "The adopted Meta wording (`2026-09-30-meta-wording.md`) must change too, so put old and new side by side in
     the wording draft."
3. "**Tag Manager ON:** `GTM_OPEN=true`. I verified the live container `GTM-KPKGT4VH` at 23:14: its published
   tags list is EMPTY (`"tags":[]`), so it can no longer double count."
   - "Keep its load rule as today, after Analytics + Marketing, unless the plan argues otherwise."
   - "Its adopted GTM wording is rendered again; check that it still fits."
4. "**Wording sign-off:** he signs in ONE screen, old and new lines side by side, for every surface: banner,
   cookies, privacy, Meta, GA4 and GTM texts, in EN/DE/FR/AR, plus the consent-version bump."

## What this replaces

- `2026-10-09-ad-tracking-wording.md` D2 ("Google's script is loaded only after Marketing is accepted") and the GA4
  fact "Loaded only after Analytics is accepted" (`2026-10-11-ga4-wording.md`): replaced by item 1.
- `2026-09-30-meta-wording.md` and Phase 28 D-04 (the pixel boots only after the server confirms Marketing): the
  page view part is replaced by item 2. Meta's other browser events and the server events stay consent-only.
- `2026-10-15-gtm-off.md`: replaced by item 3. The container rule from `2026-10-13-gtm-wording.md` still applies:
  only Google tags, no second GA4 or Ads tag, no Meta tag, and every published version is a wording check first.

## Settled by the signature (were open before it)

- The exact old→new texts on every surface in four languages, and the consent version bump.
- Whether Meta's `_fbp` cookie may be set before consent. His item 1 says "nothing is stored in a cookie until
  Accept" for Google, and item 2 does not say it for Meta. See the wording draft, choice M1.
