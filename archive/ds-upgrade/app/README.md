# `app/` — the Vamos platform, as Design Components

This is the second architecture in the system, and the one to build on.

`components/core|forms|navigation|feedback|transfer|data/` are **primitives**: `Button`,
`Input`, `Card`, `StatusBadge`, `PriceSummary`. They ship compiled into `_ds_bundle.js`
and are mounted with `x-import`.

`app/` is the **product layer** built on top of them: 18 composed components and 23
screens, each a single `.dc.html` file that opens directly in a browser, streams as it
renders, and is imported by name. Nothing here duplicates a primitive — every one of
these files loads the bundle and composes it.

```html
<dc-import name="SiteHeader" variant="inverse" hint-size="100%,76px"></dc-import>
```

## What every file in here loads

Identical `<helmet>` in all 41 files — copy it verbatim when adding a new one:

```html
<link rel="stylesheet" href="../tokens/fonts.css">        <!-- …colors, typography, spacing, elevation, motion, base -->
<link rel="stylesheet" href="../styles.css">
<script src="../_ds_bundle.js"></script>
<link rel="stylesheet" href="../assets/lenis.css">
<script src="../assets/lenis.js"></script>
<script src="../assets/lenis-boot.js"></script>
<script src="vamos-i18n-dict.js"></script>
<script src="vamos-locale.js"></script>
<style>:root{--vt-icon-base:"../assets/icons/";--vt-logo-base:"../assets/logo/";--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:none;box-shadow:none}</style>
```

The last three lines are the house laws stated locally so a file behaves even outside
this tree. `tokens/laws.css` states the same thing system-wide.

## The runtime files

| File | What it owns |
|---|---|
| `support.js` | the Design Component runtime — never edit |
| `vamos-i18n-dict.js` | every visible string in `de` / `fr` / `ar`, plus `patterns` for strings the code builds |
| `vamos-locale.js` | `VamosLocale` — the single language + currency store, `setLang` / `setCur` / `onChange` / `money`, `dir="rtl"` for Arabic |

Never read `localStorage.vamosLang` directly and never reload a page to apply a choice.
`VamosLocale.setLang('de')` relabels the live DOM in place, including `placeholder`,
`aria-label`, `title` and `alt`, and re-runs on every React re-render.

---

## Components

### Chrome — mandatory on every public page

**`SiteHeader`** · `$preview 1400×96`
Sticky control row: logo, phone pill, language, currency, sign in, and the yellow
*Book a transfer* pill. Signed-in state swaps the pill for an avatar menu with
notifications and an unverified-email nudge.
`variant` `inverse|overlay` = `inverse` · `cta` bool = true · `signInLabel` text ·
`hideAccount` bool · `lang` `cur` `onLang` `onCur` (pass all four only when the page
relabels itself without reloading).
`overlay` is *only* for a page whose hero already carries a photograph.

**`SiteFooter`** · `$preview 1440×520`
Wordmark band, link columns, payment marks stated in type (no provider artwork — §7).
`wordmark` bool · `showChauffeurByHour` bool · `showPaymentMarks` bool. No other props.

### Home and marketing sections

**`Services`** — the service rail. `showChauffeurByHour` bool ·
`mediaTone` `grey|charcoal` · `scrollPerStep` range = 80.

**`ServiceCard`** · `$preview 460×400` — one service tile; cursor-proximity shine.
`href` · `titleId` · `icon` enum (8 Lucide names) · `tone` `grey|charcoal` ·
`accent` bool · `shineColor` color · `shineIntensity` range = 1.25 ·
`proximity` range = 280 · children.

**`WhyVamos`** — the pinned, scroll-driven proof section with cross-fading photography.
`showSupportText` bool · `scrollDriven` bool · `scrollPerStep` range = 52.

**`HowItWorks`** — three steps, book → priced → driver waiting.
`tone` `light|dark` · `revealOnScroll` bool.

**`Reviews`** · `$preview 1200×780` — testimonial carousel.
`autoplaySeconds` range = 2.5 · `slideMs` range = 480 · `showPendingNotice` bool
(turn on until real reviews land).

**`FAQ`** · `$preview 1200×640` — accordion.
`expandMs` range = 400 · `singleOpen` bool · `startOpen` bool.

### Booking and account

**`WhenPicker`** · `$preview 600×180`
Pickup date **and** time in one control, because "when" is one decision — and a second
leg when `range` is on. Locale-aware month and day names.
`label` · `value` `time` `day` · `range` bool · `value2` `time2` `day2` ·
`baseMonth` `YYYY-MM` · `locale` `en|de|fr|ar` · `timeTitle` `timeTitle2` ·
`savedLabel` · `hint` · `align` `start|end` · `times` `groups` `legLabels` arrays ·
`onDay` `onTime` `onDay2` `onTime2`.

**`StepCounter`** · `$preview 180×90` — passenger / luggage stepper, clamped.
`label` · `icon` · `value` `min` `max` int · `onChange`.

**`BrandSelect`** · `$preview 320×280` — the pill dropdown used for language and currency.
`options` array · `value` · `size` `compact|field` · `icon` `globe|banknote|user|settings` ·
`a11yLabel` · `onSelect`.

**`BookingRow`** · `$preview 900×180` — one booking, everywhere a booking is listed.
`state` `ready|loading` (loading is the real skeleton) · `status` enum (5 lifecycle
states) · `variant` `card|inset|grid` · `actions` bool · `showNote` bool ·
`date` `time` `rel` `route` `meta` `reference` `price` `note` `href` · `skRoute` `skMeta`.

### Auth

**`AuthForm`** · `$preview 420×640` — one component for the whole entry funnel.
`mode` `signin|signup|forgot` · `method` `password|magic` ·
`stage` `form|sent|verifying|returning` · `banner` `''|credentials|registered` ·
`email` `firstName` `lastName` · `frozen` bool · `onState`.

**`ResetForm`** · `$preview 420×640` — set a new password.
`stage` `form|saved|expired` · `email` · `onState`.

**`PhoneVerify`** · `$preview 720×300` — `stage` `add|code|verified` · `phone`.

**`AuthStates`** — the states gallery for the three above. No props; it exists so a
reviewer sees every auth state side by side instead of hunting for them.

### System

**`CookieBanner`** · `$preview 1200×560` — consent banner and the preferences panel.
`startState` `auto|banner|prefs|hidden`.

**`OpsSidebar`** · `$preview 236×860` — the fixed charcoal dispatch nav.
`active` enum (7 sections). Ops is the one surface that uses this instead of `SiteHeader`.

---

## Screens

**Public** — `home` · `about` · `contact` · `faq` · `become-a-partner`
**Funnel** — `checkout` · `confirmation`
**Account** — `sign-in` · `reset-password` · `account` · `bookings` · `booking-detail` ·
`manage-booking`
**Legal** — `terms` · `privacy` · `cookies` · `cancellation` · `imprint`
**Ops** — `ops-board` · `ops-detail` · `ops-pricing` · `ops-login` · `ops-coming-soon`

Each is a copy-to-start page. They link to each other by bare filename
(`href="bookings.dc.html"`), so the whole set moves as one folder.

## Adding to this folder

1. Copy the `<helmet>` above verbatim.
2. Open with `SiteHeader`, close with `SiteFooter` (ops uses `OpsSidebar`).
3. Write the copy in English in the markup, then add every visible string to
   `vamos-i18n-dict.js` with `de`, `fr` and `ar` — **in the same pass**. A surface with
   English-only strings is not finished.
4. Lay it out at 1440 / 1024 / 768 / 390 in that pass. Logical properties only
   (`margin-inline-start`, not `margin-left`) — Arabic flips the page.
5. If the pattern appears more than a couple of times, it is a component: give it props,
   build every state it will ever need, and add it to the gallery.
