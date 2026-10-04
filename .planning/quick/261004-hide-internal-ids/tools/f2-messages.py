# F2 (reviewer, 2026-10-04): the React CookieBanner keys get the owner-approved COPY-DRAFT §3 wording.
# Run from the repo root.
import json

NEW = {
    "sheet-necessary-duration": {"en": "Up to 400 days", "de": "Bis zu 400 Tage", "fr": "Jusqu’à 400 jours", "ar": "حتى 400 يوم"},
    "sheet-analytics-providers": {
        "en": "Cloudflare Web Analytics (cookieless)",
        "de": "Cloudflare Web Analytics (ohne Cookies)",
        "fr": "Cloudflare Web Analytics (sans cookie)",
        "ar": "Cloudflare Web Analytics (بدون ملفات ارتباط)",
    },
    "sheet-not-used": {"en": "No cookie", "de": "Kein Cookie", "fr": "Aucun cookie", "ar": "لا يوجد ملف تعريف ارتباط"},
    "tells-us-which-step-of-a-booking-people-abandon": {
        "en": "Tells us which step of a booking people abandon.",
        "de": "Zeigt uns, bei welchem Schritt eine Buchung abgebrochen wird.",
        "fr": "Nous indique à quelle étape une réservation est abandonnée.",
        "ar": "يُخبرنا في أي خطوة من الحجز يتوقف الناس.",
    },
}
for lang in ["en", "de", "fr", "ar"]:
    p = f"apps/web/i18n/messages/{lang}.json"
    lines = open(p).read().split("\n")
    seen = set()
    for i, line in enumerate(lines):
        for key, vals in NEW.items():
            prefix = f'    "{key}": '
            if line.startswith(prefix):
                comma = "," if line.rstrip().endswith(",") else ""
                lines[i] = prefix + json.dumps(vals[lang], ensure_ascii=False) + comma
                seen.add(key)
        if line.startswith('    "error-diagnostics": '):
            lines[i] = None
    assert seen == set(NEW), (p, seen)
    s = "\n".join(x for x in lines if x is not None)
    if lang == "en":
        anchor = '      "cookies.meta-row": '
        assert s.count(anchor) == 1
        s = s.replace(
            anchor,
            '      "cookies.sheet-necessary-duration": "@supabase/ssr auth cookie Max-Age 400 days; owner-approved wording, .planning/decisions/2026-10-04-hide-internal-ids-copy.md",\n' + anchor,
        )
    json.loads(s)
    open(p, "w").write(s)

p = "apps/web/app/[locale]/privacy/page.tsx"
s = open(p).read()
old = '''          <ListRow
            title="Sentry"
            subtitle={
              <>
                {t("error-diagnostics")} <PendingSlot label="Sentry region" />
              </>
            }
          />
'''
assert s.count(old) == 1
s = s.replace(old, "")
open(p, "w").write(s)
print("ok")
