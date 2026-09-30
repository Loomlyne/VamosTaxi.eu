# Vendored test-only runtime

D-25 as amended: the `.dc.html` mocks load React, ReactDOM and Babel from `unpkg.com` at
page-load time (`app/support.js`'s `src/cdn.ts` block). D-31 already bans that origin in
production; this phase extends the ban to the screenshot-diff job itself, so a CDN hiccup
cannot fail an unrelated PR (Open Question 3, `01-RESEARCH.md`). The three files below are
byte-identical copies of the exact versions `app/support.js` pins by SRI hash, downloaded
once and committed here.

**These files are test-only.** Nothing under `apps/web/app` or `apps/web/components` may
import them — `apps/web/tests/support/mock-harness.ts` is the only consumer, and it only
ever serves them to the mock side of a screenshot diff (`serveMock`) or the reference-bundle
side (`mountBundle`), never to the ported React application.

| File | Upstream URL | Version | Licence | SHA-384 (base64) |
|---|---|---|---|---|
| `react.production.min.js` | `https://unpkg.com/react@18.3.1/umd/react.production.min.js` | 18.3.1 | MIT | `DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z` |
| `react-dom.production.min.js` | `https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js` | 18.3.1 | MIT | `gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1` |
| `babel.min.js` | `https://unpkg.com/@babel/standalone@7.29.0/babel.min.js` | 7.29.0 | MIT | `m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y` |

Each SHA-384 above is the same digest `app/support.js`'s `src/cdn.ts` already carries as the
`integrity` attribute for that URL (`REACT_SRI`, `REACT_DOM_SRI`, `BABEL_SRI`) — verified by
downloading fresh from `unpkg.com` and hashing locally (`openssl dgst -sha384 -binary <file>
| openssl base64 -A`) during this plan's execution; the digests matched byte-for-byte, so
these are exactly the bytes the mocks already trust, just served from disk instead of a
third-party origin.

## How the swap works

Do **not** set `window.__resources` on a served mock. That flag makes `support.js` skip
`parseDcText()`, which is the only path that keeps camelCase `dc-import` attributes
(`onDay` / `onDay2`). The visual harness must follow the production parse path.

Instead, `mock-harness.ts` rewrites the three unpkg constants (`REACT_URL`, `REACT_DOM_URL`,
`BABEL_URL`) **on read** when it serves any `support.js` copy, pointing them at the vendored
files above. The runtime SRI hashes stay, so `cdnScriptFor()` still attaches `integrity`.
The file on disk is never written (D-03). Both `loadReactUmd()` and `ensureBabel()` then
load localhost copies, and a mock page served through the harness never requests `unpkg.com`.

## Updating a pinned version

If `app/support.js`'s `REACT_URL`/`REACT_DOM_URL`/`BABEL_URL`/`*_SRI` constants ever change
(a mock-tooling upgrade, out of this project's control), re-download the new version, verify
its SHA-384 matches the new `*_SRI` constant before trusting it, replace the file here, and
update this table. Never vendor a file whose hash does not match the mock runtime's own pin —
that would silently diff the port against different bytes than the mock itself trusts.

> F13 update: production now serves the same bytes from `/assets/vendor/` (see `assets/vendor/LICENSES.md`), so `support.js` no longer names unpkg. This harness copy stays for the visual tests and is byte-identical.
