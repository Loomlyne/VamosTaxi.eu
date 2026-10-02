// Applies new-entries.js.txt to app/vamos-i18n-dict.js once:
// - the C6 line replaces the old "English or German" entry in place;
// - every other line goes in one block at the end of `strings`.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../../../../..');
const file = path.join(repo, 'app/vamos-i18n-dict.js');
const lines = fs.readFileSync(path.join(here, '../new-entries.js.txt'), 'utf8').trim().split('\n');
let src = fs.readFileSync(file, 'utf8');
if (src.includes('U08-11 legal lines')) throw new Error('already applied');

const c6 = lines.find((l) => l.includes('"Remembers which language you read the site in"'));
const rest = lines.filter((l) => l !== c6);

const oldC6 = /^ {6}'Remembers whether you read the site in English or German': .*\n/m;
if (!oldC6.test(src)) throw new Error('old C6 line not found');
src = src.replace(oldC6, `${c6}\n`);

const anchor = "      'Pages': { de: 'Seiten', fr: 'Pages', ar: 'الصفحات' },\n    },\n";
if (!src.includes(anchor)) throw new Error('end anchor not found');
const block =
  "      /* 26.2 audit U08-11 legal lines, owner-approved 2026-10-03\n" +
  "         (.planning/decisions/2026-10-03-legal-translations-approved.md), used verbatim.\n" +
  "         The register number (terms 01) and the figure 10 (privacy 06) sit in\n" +
  "         vt-dir-keep + data-vt-no-i18n spans, so their lines are keyed around them. */\n" +
  rest.join('\n') + '\n';
src = src.replace(anchor, anchor.replace('    },\n', '') + block + '    },\n');
fs.writeFileSync(file, src);
console.log('applied', rest.length, '+ C6 in place');
