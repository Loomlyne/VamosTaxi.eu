// Writes coverage-summary.txt from coverage-before.json and coverage-after.json.
import fs from 'node:fs';
import path from 'node:path';

const ev = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const b = JSON.parse(fs.readFileSync(path.join(ev, 'coverage-before.json'), 'utf8'));
const a = JSON.parse(fs.readFileSync(path.join(ev, 'coverage-after.json'), 'utf8'));
let o = '';
for (const p of ['terms', 'privacy', 'cookies', 'cancellation', 'imprint']) {
  for (const l of ['de', 'fr', 'ar']) o += `${p} ${l}: before ${b[p][l].count}, after ${a[p][l].count}\n`;
  const same = ['fr', 'ar'].every((l) => JSON.stringify(a[p][l].strings) === JSON.stringify(a[p].de.strings));
  o += `  before list: ${JSON.stringify(b[p].de.strings)}\n`;
  o += `  after list (same in de/fr/ar: ${same}): ${JSON.stringify(a[p].de.strings)}\n`;
  o += `  data-tok after: ${JSON.stringify(a[p].de.dataTok)}\n`;
  o += `  390px scrollWidth/clientWidth: ar ${a[p].overflow390_ar.scrollWidth}/${a[p].overflow390_ar.clientWidth}, de ${a[p].overflow390_de.scrollWidth}/${a[p].overflow390_de.clientWidth}\n`;
}
fs.writeFileSync(path.join(ev, 'coverage-summary.txt'), o);
process.stdout.write(o);
