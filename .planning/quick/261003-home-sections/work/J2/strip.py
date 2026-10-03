import re
p='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/app/home/HowItWorks.dc.html'
L=open(p).read().split('\n')
def rng(a,b): return set(range(a,b+1))
dele=set()
dele|=rng(68,70)|rng(100,129)|rng(855,1049)|rng(1055,1059)|{1063}
dele|=rng(1445,1481)
for i,l in enumerate(L,1):
    if re.match(r"\s+(destEyebrow|destTitle|destLede|bookAirport|bookCity|meet|cityPickup|homeTown|namedRoute|book): ",l) and i>1480: dele.add(i)
s=next(i for i,l in enumerate(L,1) if l.startswith('/* Served airports'))
e=next(i for i,l in enumerate(L,1) if l.startswith('];') and i>s)
dele|=rng(s,e)
s=next(i for i,l in enumerate(L,1) if l.startswith('  metaFor('))
e=next(i for i,l in enumerate(L,1) if l.startswith('  renderVals()'))-1
dele|=rng(s,e)
out=[l for i,l in enumerate(L,1) if i not in dele]
t='\n'.join(out)
for a,b in [('[data-hiw],[data-dest]{','[data-hiw]{'),('[data-hiw][data-tone="dark"],[data-dest][data-tone="dark"]{','[data-hiw][data-tone="dark"]{'),('[data-hiw-wrap],[data-dest-wrap]{','[data-hiw-wrap]{'),('[data-hiw-head],[data-dest-head]{','[data-hiw-head]{'),('[data-hiw-title],[data-dest-title]{','[data-hiw-title]{'),('[data-hiw-lede],[data-dest-lede]{','[data-hiw-lede]{')]:
    assert a in t; t=t.replace(a,b)
t=t.replace("""    const rows = this.visibleRows().map((p) => this.paintPlace(p, t));
    const tiles = this.visibleTiles().map((p) => this.paintPlace(p, t));
""","")
t=re.sub(r"      destEyebrow: t.destEyebrow,\n      destTitle: t.destTitle,\n      destLede: t.destLede,\n      book: t.book,\n      showRows: .*\n      showTiles: .*\n      tiles: tiles,\n      rows: rows,\n","",t)
open(p,'w').write(t)
