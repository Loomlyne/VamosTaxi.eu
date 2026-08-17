# Current site audit — vamostaxi.eu

**Date:** 2026-07-16  
**Scope:** Public surface only (headers, HTML, robots, DNS, legal pages, booking form, admin path status).  
**Not done:** Login attempts, credential testing, auth bypass, payload injection, or any exploit work.  
**Purpose:** Inform the full rebuild of the Vamos Taxi business platform.

---

## 1. Executive summary

**vamostaxi.eu is a Swiss airport-transfer / chauffeur business site built by Inware AG on Freshpage (PHP CMS), hosted on Inware infrastructure, with a custom booking form module, Stripe/PayPal/TWINT, Google Places, and a bookings admin instance (`buchungen`) behind HTTP Basic Auth plus a public Freshadmin login form.**

It is an **agency product CMS (Freshpage) with transfer-booking customization**, not a modern API-first taxi OS and not an unauthenticated data dump. Admin surfaces are **discoverable and classic**, which the rebuild should eliminate.

| Question | Answer |
|----------|--------|
| Template? | Yes — Inware **Freshpage** + custom booking modules |
| Custom code? | Partial — German CMS blocks + booking form/AJAX on Freshpage |
| Open booking leak? | Not observed without credentials |
| Admin exposure? | High discoverability; Basic Auth + public `/freshadmin` login |
| Rebuild direction | Greenfield Next.js + Supabase (already decided in DECISIONS.md) |

---

## 2. Business identity (from imprint + legal)

| Field | Value |
|-------|--------|
| Legal name | Vamos Taxi GmbH |
| Address | Bleicherstrasse 16, 8953 Dietikon (ZH) |
| Owner / MD | Ben Othman Houssein |
| Registry | CH-020.4.077.792-7 (Kanton Zürich) |
| Email | info@vamostaxi.eu |
| Phone | +41 79 626 70 82 |
| Secondary (T&Cs) | vamostaxizurich@gmail.com |
| Domain | vamostaxi.eu / www.vamostaxi.eu |
| Market | Zurich/Switzerland first; marketing claims Europe-wide routes |

### Product promise (public marketing)

- Airport pickups (ZRH, GVA, etc.) with meet & greet + flight tracking
- Local + long-distance transfers (ski routes: Zermatt, St. Moritz, Verbier, Chamonix…)
- Executive / chauffeur
- Fixed prices, no surge, free cancel up to 24h (marketing claim)
- Vehicle classes: Economy (3 pax / 3 bags), Van (8 pax / 8 bags); premium/luxury in copy
- Partner-driver acquisition (`/company/become-a-partner`)
- Payments advertised: Stripe (cards), PayPal, TWINT, cash, Apple Pay logos

### Business model (from T&Cs + site)

Not a pure “we own every car” Uber model. T&Cs describe:

1. Customer books online or by phone  
2. Company confirms reservation  
3. Service is vehicle + driver transfer; may use **Partners** (licensed carriers)  
4. Intermediary language appears (facilitate services / partner carriers)  
5. Fare agreed before trip  
6. Waiting: 60 minutes airport included  
7. Extras: child seats, luggage, multi-stop, city wait (T&Cs mention €15 / 15 min style language — currency may be inconsistent with CHF market)  
8. “My Reservation” account referenced in legal copy  
9. Swiss archiving: keep passenger + trip data for **10 years**  

### Social / app presence

- Instagram: `vamos.taxi`
- Facebook: VAMOSTAXISWITZERLAND
- YouTube: @vamostaxi
- Android: `com.app.vamostaxim` (separate surface from website stack)
- Trustpilot exists for domain (scrape blocked during audit)

---

## 3. Template vs custom

| Signal | Evidence |
|--------|----------|
| Agency | HTML comment + meta: **Developed by Inware AG – www.inware.ch** |
| CMS product | **Freshpage** (Inware Swiss SME CMS/shop, 3000+ installs) |
| Admin brand | `/freshadmin/` title **Freshadmin**, Freshpage logo, German UI |
| Hosting | DNS `ns1.inware.ch` / `ns2.inware.ch`, IP `94.126.22.215` |
| Webmail | `/webmail` → `webmail.3.inware.ch` (Roundcube) |
| Stack | PHP sessions (`PHPSESSID`), nginx, **scssphp 1.11.0**, jQuery 3.6, Froala |
| Content blocks | German modules: `Fahrzeugkategorien`, `Infografik`, `Dreispalter`, `Aufklapper`, `fpmain` / `fr-view` |
| Stock content | Adobe Stock images; generic marketing |
| Legal residue | T&Cs reference **“Connecto’s headquarters”** → white-label legal not fully customized |
| Not | WordPress, CodeCanyon taxi clone, React SPA, Next.js |

**Verdict:** Agency Freshpage site customized for transfers. Booking is a Freshpage-side module, not a separate modern app stack.

Inware (public): Swiss web agency since 2002; Freshpage is their productized CMS/shop for SMEs.

---

## 4. Site map (public)

| Path | Role | HTTP (audit) |
|------|------|--------------|
| `/` | 301 → `/book-transfer` | 301 |
| `/book-transfer` | Main funnel + marketing | 200 |
| `/booking` | Booking POST / continue | 200/301 depending on method |
| `/about-us` | CEO letter, trust claims | 200 |
| `/contact` | Contact form | 200 |
| `/company/terms-and-conditions` | Legal | 200 |
| `/company/become-a-partner` | Driver partner form | 200 |
| `/company/about-us` | 301 → `/about-us` | 301 |
| `/informations/faq` | FAQ | 200 |
| `/informations/data-protection` | Privacy | 200 |
| `/informations/imprint` | Impressum | 200 |

Footer IA: Airport Transfers · City Rides · Why Us · About · Terms · Partner · FAQ · Privacy · Imprint · chat CTA · socials · payment icons.

Elfsight widget id: `191397cf-6d68-4925-af59-8603bdba4aac` (reviews/chat/social proof style widget).

Google Site Verification meta present: `OVvvSca3PN34SFq6rxteKd4o2WG2QbZ59-tY1nZl6TU`.

---

## 5. Booking engine

### Step 1 — search form on `/book-transfer`

| Field | Type | Notes |
|-------|------|--------|
| `origin` | text + Places | Google Places autocomplete |
| `destination` | text + Places | Google Places autocomplete |
| `going_time` | datetime-local | min ~now, max ~+3 years |
| `return_time` | datetime-local | optional return |
| `passengers` | number 1–8 | default 2 |
| Submit | POST | action `/booking` |

### AJAX shell

- `BookingForm_reload_url = '/book-transfer?cmd=bookingForm'`
- Endpoint returns **JSON** `{ "success": true, "content": "<html fragment>" }`
- jQuery replaces form HTML and re-inits styled inputs + Places
- Empty POST to `/booking` serves booking shell (server-driven multi-step, not SPA)

### Maps

- Google Maps JS + Places library
- Client-side API key embedded in HTML (do not copy key into git; rotate/restrict on rebuild)
- Fields: `formatted_address`, `geometry`, `place_id`, `name`

### Implied later steps (marketing/FAQ/T&Cs)

Vehicle class → passenger details → extras → payment → voucher/email.

### Not publicly visible

- Live price matrix / open pricing API docs  
- Driver assignment UI  
- Flight-tracking provider name  
- Dispatch algorithm  
- Customer “My Reservation” login page (legal only)

---

## 6. Tech stack fingerprint

```text
Frontend:  server-rendered PHP HTML + jQuery + scssphp CSS
CMS:       Inware Freshpage / Freshadmin
Editor:    Froala (contentmanager admin assets under /temp/)
Server:    nginx + PHP sessions
Host:      Inware CH — 94.126.22.215
Mail:      mail.vamostaxi.eu + Inware Roundcube
Analytics: GTM-NB4LM5VQ + Google Analytics (privacy policy)
Stats:     AWStats mentioned in privacy; /awstats → 404 at audit time
Maps:      Google Places
Widgets:   Elfsight, Font Awesome kit
Payments:  Stripe, PayPal, TWINT (+ cash logo assets)
App:       Android com.app.vamostaxim (separate product surface)
```

### Security headers observed

| Header | Present |
|--------|---------|
| HSTS (`max-age=108864000; includeSubDomains; preload`) | Yes |
| `X-Frame-Options: SAMEORIGIN` | Yes |
| Cookie `Secure; HttpOnly; SameSite=Lax` | Yes |
| CSP | No |
| `X-Content-Type-Options` | No |
| `Referrer-Policy` | No |
| `Permissions-Policy` | No |

### Subdomains (all resolve to same IP)

`app`, `admin`, `api`, `booking`, `mail`, `webmail`, `cdn`, `static`, `m`, `www` → `94.126.22.215`  
Interpretation: catch-all / shared host, not separate modern services.

### Public assets pattern

- `/temp/scssphp_*` compiled CSS  
- `/temp/min_*` minified jQuery plugins (dropzone, fancybox, styledInput)  
- `/temp/min_contentmanager_admin_jslib_froala_*`  
- `/temp/resize_*` / `crop_*` image pipeline  
- `/assets/paymentmethods/{visa,mastercard,paypal,twint,applepay,barzahlung}.svg`

---

## 7. Admin / exposure audit

### URL pattern of interest

```text
/contentmanager/admin/index.html?instance=buchungen&pageid=entries&...
```

| Piece | Meaning |
|-------|---------|
| `/contentmanager/admin/` | Freshpage content manager backend |
| `instance=buchungen` | Content instance = **bookings** (German) |
| `pageid=entries` | List/edit entries |
| Froala on public site | Confirms rich-text CMS admin exists |

### Protection status (checked 2026-07-16)

| Surface | Result | Risk |
|---------|--------|------|
| `/contentmanager/admin/` | **401 Basic Auth** realm `Zugang zum Administrationsbereich` | Path known; Basic Auth is credential-stuffable if weak |
| `/freshadmin/` | **200 public login form** → `POST /freshadmin/login.php` | Primary CMS login internet-facing |
| `/admin` | 301 → `/freshadmin` | Easy discovery |
| `/webmail` | 302 → Roundcube on Inware | Mail admin surface |
| `/awstats`, `/seiten` | 404 now | Still listed in robots historically |
| `robots.txt` | Disallows admin paths | **Discloses recon map** |
| `.git/HEAD` | 403 | Not open |
| `.env`, `composer.json`, `phpinfo` | 404 | No casual dump |
| Google Maps API key | In HTML | Billing/quota abuse if unrestricted |
| PHPSESSID always set | Most responses | Session model classic PHP |

### robots.txt (verbatim)

```text
User-agent: *

Disallow: /admin
Disallow: /awstats
Disallow: /contentmanager
Disallow: /freshadmin
Disallow: /seiten
Disallow: /webmail
```

### Leak assessment

- **Not** an open unauthenticated bookings dump (Basic Auth on contentmanager at least).  
- **Is** a weak modern posture: dual login stacks, public Freshadmin, robots disclosure, client Maps key, agency multi-tenant hosting patterns.  
- No passwords tested. Do not store credentials in this repo.

### Severity table

| Finding | Severity | Notes |
|---------|----------|--------|
| Public Freshadmin login | High (exposure) | Internet login form |
| Contentmanager + `buchungen` name | Medium | 401 Basic Auth; purpose disclosed |
| robots.txt admin list | Low–Med | Helps recon |
| Google Maps key in HTML | Medium | Restrict by referrer/API on rebuild |
| Agency PHP monolith / vendor lock | Med (business) | Blocks full ownership of stack |
| Missing CSP / modern headers | Low–Med | Hardening gap |
| Open `.env` / `.git` | None found | Good |
| Unauthenticated booking data | Not observed | |

---

## 8. Capability map (what it is built for)

```text
Customer
  → Quote search (origin / dest / time / pax)
  → Vehicle selection
  → Passenger + flight + extras
  → Pay (Stripe / PayPal / TWINT)
  → Voucher / email confirmation
  → Airport meet & flight-aware pickup (claimed)

Ops / Admin (Buchungen + Freshpage)
  → Manage booking entries (contentmanager instance)
  → CMS pages/content
  → Partner applications
  → Pricing/config likely inside Freshpage modules (not public)

Supply
  → Freelance / partner drivers
  → Possibly subcontracted licensed carriers
  → Rider Android app (separate)

Marketing
  → SEO airport keywords
  → Trust (Trustpilot / Elfsight)
  → Social
  → Fixed-price positioning vs meter taxis / surge
```

**Designed for:** prebooked private transfers (airport + ski), Swiss payments, small fleet / partner model, agency-maintained CMS.

**Not designed for (on this site):** real-time street hail, multi-tenant taxi SaaS for other fleets, modern API-first mobile backend as the core product.

---

## 9. Strengths / weaknesses for rebuild

### Keep as product requirements

- Booking-first homepage (conversion)
- Fixed price + Swiss methods (TWINT critical)
- Flight tracking + meet & greet story
- Partner-driver funnel
- Clear vehicle capacity rules
- 24h cancel story
- Local legal entity + imprint

### Leave behind

- Freshpage / Inware vendor lock
- Discoverable dual admin stacks
- Stock imagery + template legal residue (Connecto)
- Unverified marketing claims (e.g. “48,350+ routes”)
- Mixed brand emails (gmail in T&Cs)
- Missing CSP / modern headers
- Server-rendered jQuery booking UX
- Fake multi-subdomain architecture on one IP
- Split website vs Play app without shared API ownership

---

## 10. Privacy / processors (from data-protection page)

Named or implied processors:

- **Stripe** — card payments  
- **PayPal** — alternative checkout  
- **Twint AG** — Swiss mobile pay  
- **Google Analytics** — analytics  
- **AWStats** — self-hosted stats (privacy claims CH server)  
- Server logs — IP, UA, referrer  

GDPR controller: Vamos Taxi GmbH, Dietikon address.

---

## 11. Rebuild modules (aligned with PROJECT-BRIEF)

1. Catalog / pricing — fixed routes + distance rules, vehicle classes, extras  
2. Booking engine — multi-step quote → book → pay → voucher  
3. Flight fields (auto tracking optional V1+)  
4. Payments — Stripe + TWINT (+ PayPal if needed), webhooks, refunds  
5. Ops admin — bookings board, assign driver, status, notes  
6. Driver/partner — apply, docs, jobs  
7. Customer manage booking — secure link  
8. Thin marketing CMS/pages  
9. Notifications — email (Resend per decisions)  
10. Compliance — Swiss/GDPR, archive fields, clean Vamos-only T&Cs  

Stack already decided: Next.js, TypeScript, Tailwind, shadcn, Supabase, Vercel, Stripe, Google Places/Routes, Resend.

---

## 12. Raw technical notes

### DNS (audit)

```text
vamostaxi.eu A     → 94.126.22.215
www               → 94.126.22.215
NS                → ns1.inware.ch, ns2.inware.ch
MX                → mail.vamostaxi.eu
webmail.3.inware  → 94.126.22.215
```

### Booking form reload JSON shape

```json
{
  "content": "<div class=\"bookingForm\">...</div>",
  "success": true
}
```

### Freshadmin login flow (public JS)

1. Focus `#username`  
2. POST `/freshadmin/login.php` with username/password  
3. On numeric status &lt; 400, navigate to `/freshadmin/admin/index.html`  
4. German error strings for access denied / wrong security code  

### CMS block class names seen

`Fahrzeugkategorien__*`, `Infografik__*`, `Dreispalter__*`, `Aufklapper__*`, `Trennlinie__*`, `bookingForm__*`, `header__bookingForm`

### Payment asset alts

- Creditcard via Stripe (visa/mastercard SVGs)  
- PayPal  
- Twint  
- Apple Pay  
- Barzahlung (cash)

---

## 13. Sources used

- Live site: https://www.vamostaxi.eu/ and linked pages  
- robots.txt, response headers, DNS  
- Imprint, privacy, terms, about, partner, contact, book-transfer HTML  
- Inware public site (agency / Freshpage product context)  
- Public app store listing id (not deep-reviewed)  

No internal credentials, no paid vulnerability scanning, no authenticated admin access.

---

## 14. Follow-ups (optional)

- [ ] Browser walkthrough of full quote → vehicle → pay funnel with screenshots  
- [ ] Price probe matrix for common ZRH routes (public only)  
- [ ] Android app store listing feature dump  
- [ ] Competitor matrix (Swiss airport transfer players) beyond Transfeero  
- [ ] Data migration plan if client can export Buchungen from Freshpage  
