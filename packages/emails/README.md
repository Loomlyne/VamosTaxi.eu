# @vamos/emails

Auth transactional renderers for Vamos Taxi. Four languages in the same pass.

**No React Email toolchain in Phase 5.** `renderAuthEmail(type, locale, data)` is escaped template strings plus a table layout. Phase 7 can re-implement that function without changing callers.

Shared copy lives in `apps/web/i18n/messages/{en,de,fr,ar}.json` (`auth.email-*` keys). Do not duplicate strings here.
