---
quick_id: 261001-wwx
status: complete
branch: fix/main-green-3
handover: .planning/phases/26.0-main-green/26.0-HANDOVER-3.md
---

# 26.0 main green 3: summary

All six plan tasks done; the hand-over holds the detail, checks and findings.

- Linux `confirmation.spec.ts:130`: spec race fixed (hit counter reset after `goto`), plus a 180 s limit for its
  twelve visits.
- Mutation gate: re-marks the stack after every reset and gives Vitest its port; passed on an own stack and on
  GitHub. Schema job moved to a reusable `schema.yml`; green on runs 36918463781, 36934999073, 36937869518.
- Home reds: classified; stale and harness causes fixed in the specs; React-home pictures left for the owner.
- 48 SiteHeader picture diffs: cause proven (`51b851e3`, full-page menu); before/after pictures in
  `evidence/siteheader-48/`; not rebaselined.
- Other Linux reds fixed in the specs: FAQ, public-routes, about, currency, four account specs, terms,
  privacy/cookies, legal-notice, auth-flows name save.
- Gates green on the tested tree; E2E Linux run 36937869539: all 9 jobs inside the 30-minute limit.
- One real app finding: `/cookies` rail links to a missing `#legacy` section (`app/pages/cookies.dc.html:170`).

STATE.md not updated: job sessions do not edit it (`00-common-rules.md`).
