# Fresh review (Opus, not the builder), 2026-10-03 20:3x (+04): SHIP-WITH-NOTES

1. True no-op on live: body equals live's (the builder's live read, md5 39df856a...); signature, owner, grants,
   search_path and every trigger kept by CREATE OR REPLACE; no data read or changed. Controller reads back md5 at ship.
2. No app path edits a published book directly except `ops/pricing/[versionId]/actions.ts:265/276/306`, which already
   get 23001 on live and show `failure-frozen`; rate-book routes copy to a draft first (`rate-book/route.ts:464-484`).
   Only local/CI behaviour changes, and only for the seven named extras.
3. Tests correct: fixture extra created before publish; 23001 = restrict_violation; plan(15) holds.
4. Notes: merge origin/main (done); after ship the next free migration is 20261007260000; 20260911000002 stays in the
   repo and keeps showing in the live-vs-files compare (known).
