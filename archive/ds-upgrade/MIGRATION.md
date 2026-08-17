# Migration — old architecture → new

Two architectures now live side by side. Neither is deprecated by accident; here is what
each is for and which is authoritative when they disagree.

## The three layers

| Layer | Where | Format | Use it for |
|---|---|---|---|
| **Primitives** | `components/<group>/` | `.jsx` compiled into `_ds_bundle.js` | `Button`, `Input`, `Card`, `Table`, `PriceSummary` — the vocabulary |
| **Product** | `app/` | `.dc.html` Design Components | composed components and real screens — **the layer to build on** |
| **Reference screens** | `ui_kits/`, `templates/` | `.jsx` + thin `index.html` | the original V1 mocks; still valid, no longer where the product lives |

The primitives did not change. The Design Components in `app/` load `_ds_bundle.js` and
compose them — every `Button`, `Icon`, `Logo`, `StatusBadge` on a Vamos screen is still
the bundle's.

## Which file supersedes which

| Original | Now built as | Note |
|---|---|---|
| `ui_kits/booking-website/home.html` | `app/home.dc.html` | hero, booking widget, services, why, how, reviews, FAQ, CTA — all sections are components now |
| `ui_kits/booking-website/quote.html` | *(not ported)* | the quote step folded into home + checkout |
| `ui_kits/booking-website/checkout.html` | `app/checkout.dc.html` | |
| `ui_kits/booking-website/confirmation.html` | `app/confirmation.dc.html` | |
| `ui_kits/ops-dashboard/bookings-board.html` | `app/ops-board.dc.html` | |
| `ui_kits/ops-dashboard/booking-detail.html` | `app/ops-detail.dc.html` | |
| `ui_kits/ops-dashboard/pricing-rules.html` | `app/ops-pricing.dc.html` | |
| `templates/booking-page/BookingPage.dc.html` | `app/home.dc.html` | the hand-authored DC template was the prototype for this whole layer |
| `templates/ops-dashboard/OpsDashboard.dc.html` | `app/ops-board.dc.html` + `app/OpsSidebar.dc.html` | the sidebar is a real component with an `active` prop |

Hand-rolled headers and footers in the old pages are replaced by `SiteHeader` /
`SiteFooter`, which are now **mandatory** — see readme §8.

## Behaviour that changed system-wide

Four corrections in `tokens/laws.css`. They apply to the primitives too, which is why the
import goes last in `styles.css`.

1. **`--vt-shadow-accent` is `none`.** The yellow glow under a hovered primary button is
   gone, and no coloured or blurred halo replaces it anywhere. readme §3 still describes
   the token; §8 states the law.
2. **The yellow tints are aliased to neutrals.** `--vt-yellow-50/100/200/300` resolve to
   white and grey; `--vt-yellow-600/700` resolve to charcoal. Components whose default is
   tinted — `Alert tone="accent"`, `ListRow icon=…`, `Badge tone="warning"` — degrade to a
   neutral surface instead of a cream panel. Prefer `tone="inverse"` / `tone="info"`.
3. **A focused text field shows the charcoal border only**, no ring. Every other control
   keeps `--vt-ring`.
4. **`[data-tok]` renders a pending client value** as a dashed pill with a `TBC` tag.

## Not affected

`components/mobile/` (the Rolic iOS kit) and `components/mobile/icons/` are untouched and
still must not be mixed into a Vamos surface.
