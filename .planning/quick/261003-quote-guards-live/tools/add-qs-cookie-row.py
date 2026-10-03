# One-off: adds the owner-approved vamos_qs row (2026-10-03) to the cookies page, its DC dictionary
# strings and the React twin's messages. Run from the repo root. Wording is verbatim from
# .planning/decisions/2026-10-03-vamos-qs-cookie-row.md.
import json, re

ROW_EN = "Keeps price requests fair between visitors and blocks automated abuse"
VALS = {
    "en": (ROW_EN, "24 hours"),
    "de": ("Verteilt Preisanfragen fair auf die Besucher und blockiert automatisierten Missbrauch", "24 Stunden"),
    "fr": ("Répartit équitablement les demandes de prix entre les visiteurs et bloque les abus automatisés", "24 heures"),
    "ar": ("يوزّع طلبات الأسعار بإنصاف بين الزوار ويمنع الاستخدام الآلي المسيء", "24 ساعة"),
}

p = "app/pages/cookies.dc.html"
s = open(p).read()
anchor = '<td data-l="Duration">as set by Cloudflare</td></tr>\n'
assert s.count(anchor) == 1 and "vamos_qs" not in s
row = ('<tr><td data-l="Name" data-vt-no-i18n="1">vamos_qs</td><td data-l="Purpose">' + ROW_EN +
       '</td><td data-l="Provider" data-vt-no-i18n="1">Vamos Taxi</td><td data-l="Duration">24 hours</td></tr>\n')
open(p, "w").write(s.replace(anchor, anchor + row))

p = "app/vamos-i18n-dict.js"
s = open(p).read()
lines = [l for l in s.split("\n") if l.strip().startswith("'Routes your request and keeps the site available'")]
assert len(lines) == 1
a = lines[0]
ind = a[: len(a) - len(a.lstrip())]
d = {k: v for k, v in VALS.items() if k != "en"}
new = (a + "\n" + ind + "'" + ROW_EN + "': { de: '" + d["de"][0] + "', fr: '" + d["fr"][0] + "', ar: '" + d["ar"][0] + "' },\n"
       + ind + "'24 hours': { de: '24 Stunden', fr: '24 heures', ar: '24 ساعة' },")
open(p, "w").write(s.replace(a, new, 1))

for lang, (purpose, duration) in VALS.items():
    p = f"apps/web/i18n/messages/{lang}.json"
    s = open(p).read()
    m = re.search(r'\n(\s*)"consent-subject-purpose": "[^\n]*",\n', s)
    assert m, lang
    line, ind = m.group(0), m.group(1)
    add = (line + f'{ind}"qs-cookie-purpose": {json.dumps(purpose, ensure_ascii=False)},\n'
           + f'{ind}"qs-cookie-duration": {json.dumps(duration, ensure_ascii=False)},\n')
    s = s.replace(line, add, 1)
    json.loads(s)
    open(p, "w").write(s)
print("ok")
