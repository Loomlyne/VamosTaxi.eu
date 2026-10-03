# SiteHeader test pictures: today's full-page menu is correct

Owner's answer in the controller session, question form, 2026-10-02 03:34 (+04), after seeing the before/after
pictures (inverse-open-en-390, overlay-open-en-768).

**Decision:** the 48 SiteHeader picture tests (`apps/web/tests/visual/shell.spec.ts`, "SiteHeader signed-in",
4 states x 3 widths x 4 languages) take today's header as the correct picture. Their only cause is the
owner-signed full-page phone menu (`51b851e3`, 2026-09-30); evidence in
`.planning/phases/26.0-main-green/evidence/siteheader-48/`. Rebaseline those 48 and nothing else.
