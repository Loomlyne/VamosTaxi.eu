import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/apps/web/node_modules/@playwright/test/index.mjs';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const stub = require('./stub.js');
const OUT = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/.planning/quick/261003-site-polish/screens';
const exe = '/Users/koss/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const [,, variant='before', widths='1440', langs='en', mode='full', q='zur', state='list'] = process.argv;
const browser = await chromium.launch({ executablePath: exe });
for (const lang of langs.split(',')) for (const w of widths.split(',').map(Number)) {
  const ctx = await browser.newContext({ viewport:{ width:w, height: w<700?844:900 }, deviceScaleFactor:2, hasTouch: w<700 });
  await ctx.addInitScript((l)=>{ try{ localStorage.setItem('vamosLang', l); localStorage.setItem('vamosCookieConsent','{"v":1,"necessary":true}'); }catch(e){} }, lang);
  const page = await ctx.newPage();
  await stub(page, mode);
  await page.goto('http://localhost:4797/app/home/home.html', { waitUntil:'load' });
  await page.waitForTimeout(3500);
  await page.addStyleTag({ content:'[data-sc-name="CookieBanner"],[data-sc-name="ContactButton"]{display:none!important}' });
  const narrow = w < 1080;
  if (variant !== 'before') {
    await page.addStyleTag({ content: fs.readFileSync(new URL('./proposal.css', import.meta.url),'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(new URL('./proposal.js', import.meta.url),'utf8') });
  }
  if (!narrow) {
    const inp = page.locator('[data-bx="from"] input').first();
    await inp.scrollIntoViewIfNeeded(); await page.evaluate(()=>{const f=document.querySelector('[data-bx="from"]'); window.scrollBy(0, f.getBoundingClientRect().top-150);}); await page.waitForTimeout(300);
    await inp.click(); if (q) await inp.type(q, { delay: 40 });
  } else {
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForSelector('[data-bb][data-docked="0"]',{state:'attached',timeout:20000}); for (let t=0;t<4;t++){ if (!(await page.$('[data-bs]'))) await page.evaluate(()=>document.querySelector('[data-bb][data-docked="0"]').click()); try{ await page.waitForSelector('[data-bs] input[role=combobox]',{timeout:8000}); break;}catch(e){} }
    await page.waitForTimeout(800);
    const inp = page.locator('[data-bs] input[role=combobox]').first();
    await inp.click(); if (q) await inp.type(q, { delay: 40 });
  }
  await page.waitForTimeout(1300);
  if (state.startsWith('active')) { for (let i=0;i<=Number(state.split(':')[1]||0);i++) await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300); }
  if (variant !== 'before') await page.evaluate(([st,qq])=>window.__r21 && window.__r21(st,qq), [state, q]);
  if (state==='popular') await page.evaluate(()=>{ const i=document.querySelector('[data-bs] input[role=combobox]')||document.querySelector('[data-bx="from"] input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,''); });
  if (state==='hover') { await page.locator('[data-sug-row]').nth(2).hover(); await page.waitForTimeout(300); }
  await page.waitForTimeout(300);
  if(!narrow) console.log(await page.evaluate(()=>[...document.querySelectorAll('[data-sug-name]')].map(e=>JSON.stringify(e.textContent))));
  const name = `R2-1-${variant}-${state==='list'?'':state.split(':')[0]+'-'}${lang}-${w}.png`;
  // crop: dropdown + field
  const box = await page.evaluate((nar)=>{
    const r = (nar ? document.querySelector('[data-bs]') : document.querySelector('[data-bx="from"]'));
    if(!r) return null; const b=r.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height};
  }, narrow);
  if (narrow) await page.screenshot({ path:`${OUT}/${name}` });
  else {
    const sug = await page.evaluate(()=>{ const s=document.querySelector('[data-sug]'); const f=document.querySelector('[data-bx="from"]'); if(!s||!f) return null; const a=s.getBoundingClientRect(), b=f.getBoundingClientRect(); const x=Math.max(0,Math.min(a.x,b.x)-24), y=Math.max(0,Math.min(a.y,b.y)-24); return {x,y,width:Math.min(innerWidth-x, Math.max(a.right,b.right)-x+24),height:Math.min(innerHeight-y, Math.max(a.bottom,b.bottom)-y+24)}; });
    await page.screenshot({ path:`${OUT}/${name}`, clip: sug || undefined });
  }
  console.log(name, narrow?'':JSON.stringify(box));
  await ctx.close();
}
await browser.close();
